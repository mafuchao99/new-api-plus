package service

import (
	"fmt"
	"html"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"
)

// NotifyUpstreamLowBalanceIfNeeded 余额查询成功后调用：余额低于阈值时按配置发送提醒邮件
//
// 提醒策略：每次「余额低于阈值」只提醒一次，并把提醒时间写入 last_alert_time 作为标记；
// 余额回升到阈值及以上时清除标记，之后再次低于阈值才会重新提醒。
func NotifyUpstreamLowBalanceIfNeeded(account *model.UpstreamAccount) {
	if account.QueryStatus != model.UpstreamQueryStatusSuccess {
		return
	}

	if account.Balance >= account.LowBalanceThreshold {
		// 余额已恢复：清除提醒标记，下次再降下来可以重新提醒
		if account.LastAlertTime != 0 {
			if err := account.UpdateLastAlertTime(0); err != nil {
				common.SysError("failed to reset upstream account alert mark: " + err.Error())
			}
		}
		return
	}

	if !account.Enabled {
		return
	}
	// 已经提醒过且尚未恢复：不再重复发送
	if account.LastAlertTime != 0 {
		return
	}

	alertSetting := operation_setting.GetUpstreamAlertSetting()
	if !alertSetting.EmailEnabled {
		return
	}
	recipients := ParseUpstreamAlertRecipients(alertSetting.NotificationEmail)
	if len(recipients) == 0 {
		return
	}

	// 先写标记再发信：发信放到后台协程，SMTP 慢或异常都不会拖住查询流程；
	// 标记先行可保证同一轮低余额不会被下一轮重复提醒
	if err := account.UpdateLastAlertTime(common.GetTimestamp()); err != nil {
		common.SysError("failed to persist upstream account alert mark: " + err.Error())
		return
	}
	// 传值拷贝，避免后台协程与查询流程共享同一个结构体
	accountSnapshot := *account
	go sendUpstreamLowBalanceAlert(accountSnapshot, recipients)
}

// sendUpstreamLowBalanceAlert 后台发送低余额提醒；发送失败时清除标记，让下一轮可以重试
func sendUpstreamLowBalanceAlert(account model.UpstreamAccount, recipients []string) {
	defer func() {
		if err := recover(); err != nil {
			common.SysError(fmt.Sprintf("panic while sending upstream low balance alert: %v", err))
		}
	}()

	if err := sendUpstreamBalanceAlertMail(&account, recipients); err != nil {
		common.SysError(fmt.Sprintf(
			"failed to send upstream low balance alert for account %d: %v", account.Id, err))
		if resetErr := model.SetUpstreamAccountLastAlertTime(account.Id, 0); resetErr != nil {
			common.SysError("failed to reset upstream account alert mark: " + resetErr.Error())
		}
		return
	}
	common.SysLog(fmt.Sprintf(
		"upstream low balance alert sent for account %d (%s), balance %.2f, threshold %.2f",
		account.Id, account.Name, account.Balance, account.LowBalanceThreshold))
}

// SendUpstreamAlertTestEmail 发送测试邮件，用于验证邮件提醒配置（account 可为空）
func SendUpstreamAlertTestEmail(account *model.UpstreamAccount) error {
	alertSetting := operation_setting.GetUpstreamAlertSetting()
	recipients := ParseUpstreamAlertRecipients(alertSetting.NotificationEmail)
	if len(recipients) == 0 {
		return fmt.Errorf("请先在邮件提醒设置中填写通知邮箱")
	}
	subject := fmt.Sprintf("[%s] 上游余额提醒测试邮件", common.SystemName)
	return sendUpstreamMail(recipients, subject, buildUpstreamBalanceMailBody(true, account))
}

// ParseUpstreamAlertRecipients 解析逗号分隔的通知邮箱
func ParseUpstreamAlertRecipients(raw string) []string {
	parts := strings.Split(raw, ",")
	recipients := make([]string, 0, len(parts))
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part != "" {
			recipients = append(recipients, part)
		}
	}
	return recipients
}

func sendUpstreamBalanceAlertMail(account *model.UpstreamAccount, recipients []string) error {
	subject := fmt.Sprintf("[%s] 上游账号余额不足：%s", common.SystemName, account.Name)
	return sendUpstreamMail(recipients, subject, buildUpstreamBalanceMailBody(false, account))
}

func sendUpstreamMail(recipients []string, subject string, body string) error {
	// common.SendEmail 以分号分隔多个收件人
	return common.SendEmail(subject, strings.Join(recipients, ";"), body)
}

func buildUpstreamBalanceMailBody(isTest bool, account *model.UpstreamAccount) string {
	var builder strings.Builder
	builder.WriteString(`<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;color:#24292f;line-height:1.6">`)

	if isTest {
		builder.WriteString("<p>这是一封测试邮件，用于验证上游账号余额提醒的邮件配置。</p>")
	} else {
		builder.WriteString("<p>以下上游账号的余额已低于提醒阈值：</p>")
	}

	if account == nil {
		builder.WriteString("<p>（未指定上游账号）</p>")
	} else {
		lastQueried := "尚未查询"
		if account.BalanceUpdatedTime > 0 {
			lastQueried = time.Unix(account.BalanceUpdatedTime, 0).Format("2006-01-02 15:04:05")
		}
		rows := [][2]string{
			{"账号名称", account.Name},
			{"账号类型", account.Type},
			{"接口地址", account.BaseUrl},
			{"当前余额", fmt.Sprintf("%.2f", account.Balance)},
			{"提醒阈值", fmt.Sprintf("%.2f", account.LowBalanceThreshold)},
			{"最近查询", lastQueried},
		}
		builder.WriteString(`<table cellpadding="6" cellspacing="0" border="0" style="border-collapse:collapse">`)
		for _, row := range rows {
			builder.WriteString(`<tr>`)
			builder.WriteString(fmt.Sprintf(
				`<td style="color:#57606a;white-space:nowrap">%s</td><td>%s</td>`,
				html.EscapeString(row[0]), html.EscapeString(row[1])))
			builder.WriteString(`</tr>`)
		}
		builder.WriteString(`</table>`)
	}

	builder.WriteString(`<hr style="border:none;border-top:1px solid #d0d7de;margin:16px 0">`)
	builder.WriteString(`<p style="color:#8b949e;font-size:12px">本邮件由上游账号余额监控自动发送；余额回升到阈值以上后，若再次低于阈值会重新提醒。可在「余额提醒」页面调整提醒设置。</p>`)
	builder.WriteString(`</div>`)
	return builder.String()
}
