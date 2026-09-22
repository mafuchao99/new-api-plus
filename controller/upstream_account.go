package controller

import (
	"errors"
	"fmt"
	"net/mail"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
)

type UpstreamAccountRequest struct {
	Id                  int     `json:"id"`
	Name                string  `json:"name"`
	Type                string  `json:"type"`
	BaseUrl             string  `json:"base_url"`
	AuthType            string  `json:"auth_type"`
	AccessToken         string  `json:"access_token"`
	Username            string  `json:"username"`
	Password            string  `json:"password"`
	UpstreamUserId      int     `json:"upstream_user_id"`
	LowBalanceThreshold float64 `json:"low_balance_threshold"`
	Enabled             bool    `json:"enabled"`
	Remark              string  `json:"remark"`
}

const (
	upstreamAccountNameMaxLength    = 60
	upstreamAccountRemarkMaxLength  = 200
	upstreamAccountBaseUrlMaxLength = 255
)

func validateUpstreamAccountRequest(req *UpstreamAccountRequest) error {
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		return errors.New("账户名不能为空")
	}
	if utf8.RuneCountInString(req.Name) > upstreamAccountNameMaxLength {
		return errors.New("账户名长度不能超过 60 个字符")
	}
	req.Remark = strings.TrimSpace(req.Remark)
	if utf8.RuneCountInString(req.Remark) > upstreamAccountRemarkMaxLength {
		return errors.New("备注长度不能超过 200 个字符")
	}
	if !model.IsSupportedUpstreamAccountType(req.Type) {
		return errors.New("不支持的账号类型")
	}
	req.BaseUrl = strings.TrimSpace(req.BaseUrl)
	if req.BaseUrl == "" {
		return errors.New("接口地址不能为空")
	}
	if utf8.RuneCountInString(req.BaseUrl) > upstreamAccountBaseUrlMaxLength {
		return errors.New("接口地址过长")
	}
	if !strings.HasPrefix(req.BaseUrl, "http://") && !strings.HasPrefix(req.BaseUrl, "https://") {
		return errors.New("接口地址必须以 http:// 或 https:// 开头")
	}
	if req.LowBalanceThreshold < 0 {
		return errors.New("低余额阈值不能为负数")
	}
	if req.Type == model.UpstreamAccountTypeNewApi && req.UpstreamUserId <= 0 {
		return errors.New("new-api 类型需要填写上游用户 ID")
	}
	switch req.AuthType {
	case model.UpstreamAuthTypeAccessToken:
		req.AccessToken = strings.TrimSpace(req.AccessToken)
		if req.AccessToken == "" {
			return errors.New("请填写访问令牌")
		}
		req.Username = ""
		req.Password = ""
	case model.UpstreamAuthTypePassword:
		req.Username = strings.TrimSpace(req.Username)
		if req.Username == "" {
			return errors.New("请填写用户名")
		}
		if req.Password == "" {
			return errors.New("请填写密码")
		}
		req.AccessToken = ""
	default:
		return errors.New("不支持的认证方式")
	}
	return nil
}

func (req *UpstreamAccountRequest) toUpstreamAccount() *model.UpstreamAccount {
	return &model.UpstreamAccount{
		Id:                  req.Id,
		Name:                req.Name,
		Type:                req.Type,
		BaseUrl:             req.BaseUrl,
		AuthType:            req.AuthType,
		AccessToken:         req.AccessToken,
		Username:            req.Username,
		Password:            req.Password,
		UpstreamUserId:      req.UpstreamUserId,
		LowBalanceThreshold: req.LowBalanceThreshold,
		Enabled:             req.Enabled,
		Remark:              req.Remark,
	}
}

func GetAllUpstreamAccounts(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	accounts, total, err := model.GetAllUpstreamAccounts(pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(accounts)
	common.ApiSuccess(c, pageInfo)
}

func SearchUpstreamAccounts(c *gin.Context) {
	keyword := strings.TrimSpace(c.Query("keyword"))
	pageInfo := common.GetPageQuery(c)
	if keyword == "" {
		accounts, total, err := model.GetAllUpstreamAccounts(pageInfo.GetStartIdx(), pageInfo.GetPageSize())
		if err != nil {
			common.ApiError(c, err)
			return
		}
		pageInfo.SetTotal(int(total))
		pageInfo.SetItems(accounts)
		common.ApiSuccess(c, pageInfo)
		return
	}
	accounts, total, err := model.SearchUpstreamAccounts(keyword, pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(accounts)
	common.ApiSuccess(c, pageInfo)
}

func GetUpstreamAccount(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiErrorMsg(c, "无效的账号 ID")
		return
	}
	account, err := model.GetUpstreamAccountById(id)
	if err != nil {
		common.ApiErrorMsg(c, "账号不存在")
		return
	}
	// 单条查询返回完整凭据，供管理员在编辑表单中回填
	common.ApiSuccess(c, account)
}

func AddUpstreamAccount(c *gin.Context) {
	var req UpstreamAccountRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, err)
		return
	}
	if err := validateUpstreamAccountRequest(&req); err != nil {
		common.ApiError(c, err)
		return
	}
	account := req.toUpstreamAccount()
	if err := model.CreateUpstreamAccount(account); err != nil {
		common.ApiError(c, err)
		return
	}
	recordManageAudit(c, "upstream.create", map[string]interface{}{
		"id":   account.Id,
		"name": account.Name,
		"type": account.Type,
	})
	account.Clean()
	common.ApiSuccess(c, account)
}

func UpdateUpstreamAccount(c *gin.Context) {
	var req UpstreamAccountRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, err)
		return
	}
	if req.Id == 0 {
		common.ApiErrorMsg(c, "缺少账号 ID")
		return
	}

	if c.Query("status_only") == "true" {
		if err := model.UpdateUpstreamAccountStatus(req.Id, req.Enabled); err != nil {
			common.ApiError(c, err)
			return
		}
		account, err := model.GetUpstreamAccountById(req.Id)
		if err != nil {
			common.ApiErrorMsg(c, "账号不存在")
			return
		}
		recordManageAudit(c, "upstream.status", map[string]interface{}{
			"id":      account.Id,
			"name":    account.Name,
			"enabled": req.Enabled,
		})
		account.Clean()
		common.ApiSuccess(c, account)
		return
	}

	if err := validateUpstreamAccountRequest(&req); err != nil {
		common.ApiError(c, err)
		return
	}
	account, err := model.UpdateUpstreamAccount(req.toUpstreamAccount())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	recordManageAudit(c, "upstream.update", map[string]interface{}{
		"id":   account.Id,
		"name": account.Name,
	})
	account.Clean()
	common.ApiSuccess(c, account)
}

func DeleteUpstreamAccount(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiErrorMsg(c, "无效的账号 ID")
		return
	}
	account, err := model.GetUpstreamAccountById(id)
	if err != nil {
		common.ApiErrorMsg(c, "账号不存在")
		return
	}
	if err := model.DeleteUpstreamAccountById(id); err != nil {
		common.ApiError(c, err)
		return
	}
	recordManageAudit(c, "upstream.delete", map[string]interface{}{
		"id":   account.Id,
		"name": account.Name,
	})
	common.ApiSuccess(c, nil)
}

// UpdateUpstreamAccountBalance 查询单个上游账号余额
func UpdateUpstreamAccountBalance(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiErrorMsg(c, "无效的账号 ID")
		return
	}
	account, err := model.GetUpstreamAccountById(id)
	if err != nil {
		common.ApiErrorMsg(c, "账号不存在")
		return
	}
	common.ApiSuccess(c, service.QueryUpstreamAccountBalance(account))
}

// UpdateUpstreamAccountsBalance 批量查询上游账号余额（?ids=1,2,3）
func UpdateUpstreamAccountsBalance(c *gin.Context) {
	ids, err := parseUpstreamAccountIds(c.Query("ids"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	accounts, err := model.GetUpstreamAccountsByIds(ids)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	results := service.QueryUpstreamAccountsBalance(c.Request.Context(), accounts)
	successCount := 0
	for _, result := range results {
		if result.Success {
			successCount++
		}
	}
	common.ApiSuccess(c, gin.H{
		"success_count": successCount,
		"failed_count":  len(results) - successCount,
		"items":         results,
	})
}

const upstreamAccountMaxBatchQuery = 100

func parseUpstreamAccountIds(raw string) ([]int, error) {
	parts := strings.Split(raw, ",")
	ids := make([]int, 0, len(parts))
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		id, err := strconv.Atoi(part)
		if err != nil || id <= 0 {
			return nil, fmt.Errorf("无效的账号 ID：%s", part)
		}
		ids = append(ids, id)
	}
	if len(ids) == 0 {
		return nil, errors.New("缺少账号 ID")
	}
	if len(ids) > upstreamAccountMaxBatchQuery {
		return nil, fmt.Errorf("单次最多查询 %d 个账号", upstreamAccountMaxBatchQuery)
	}
	return ids, nil
}

// SendUpstreamAlertTestEmail 发送测试邮件验证提醒配置（可选携带某个账号的信息）
func SendUpstreamAlertTestEmail(c *gin.Context) {
	var req struct {
		Id int `json:"id"`
	}
	// 请求体可省略，解析失败按未指定账号处理
	_ = c.ShouldBindJSON(&req)

	var account *model.UpstreamAccount
	if req.Id > 0 {
		loaded, err := model.GetUpstreamAccountById(req.Id)
		if err != nil {
			common.ApiErrorMsg(c, "账号不存在")
			return
		}
		account = loaded
	}
	if err := service.SendUpstreamAlertTestEmail(account); err != nil {
		common.ApiError(c, err)
		return
	}
	recordManageAudit(c, "upstream.test_email", map[string]interface{}{
		"id": req.Id,
	})
	common.ApiSuccess(c, nil)
}

func GetUpstreamAlertSettings(c *gin.Context) {
	setting := operation_setting.GetUpstreamAlertSetting()
	common.ApiSuccess(c, gin.H{
		"email_enabled":      setting.EmailEnabled,
		"notification_email": setting.NotificationEmail,
	})
}

func UpdateUpstreamAlertSettings(c *gin.Context) {
	var req struct {
		EmailEnabled      bool   `json:"email_enabled"`
		NotificationEmail string `json:"notification_email"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, err)
		return
	}
	req.NotificationEmail = strings.TrimSpace(req.NotificationEmail)
	if err := validateNotificationEmails(req.EmailEnabled, req.NotificationEmail); err != nil {
		common.ApiError(c, err)
		return
	}
	err := model.UpdateOptionsBulk(map[string]string{
		"upstream_alert_setting.email_enabled":      strconv.FormatBool(req.EmailEnabled),
		"upstream_alert_setting.notification_email": req.NotificationEmail,
	})
	if err != nil {
		common.ApiError(c, err)
		return
	}
	recordManageAudit(c, "upstream.alert_settings", map[string]interface{}{
		"email_enabled": req.EmailEnabled,
	})
	common.ApiSuccess(c, gin.H{
		"email_enabled":      req.EmailEnabled,
		"notification_email": req.NotificationEmail,
	})
}

func GetUpstreamMonitorSettings(c *gin.Context) {
	common.ApiSuccess(c, buildUpstreamMonitorSettingsResponse())
}

type upstreamMonitorSettingsRequest struct {
	Enabled         bool `json:"enabled"`
	PeakStartHour   int  `json:"peak_start_hour"`
	PeakEndHour     int  `json:"peak_end_hour"`
	PeakInterval    int  `json:"peak_interval"`
	OffPeakInterval int  `json:"off_peak_interval"`
}

func buildUpstreamMonitorSettingsResponse() gin.H {
	setting := operation_setting.GetUpstreamMonitorSetting()
	return gin.H{
		"enabled":           setting.Enabled,
		"peak_start_hour":   setting.PeakStartHour,
		"peak_end_hour":     setting.PeakEndHour,
		"peak_interval":     setting.PeakInterval,
		"off_peak_interval": setting.OffPeakInterval,
		// 当前时段实际生效的间隔，供前端展示
		"current_interval": setting.CurrentIntervalMinutes(time.Now()),
	}
}

func UpdateUpstreamMonitorSettings(c *gin.Context) {
	var req upstreamMonitorSettingsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, err)
		return
	}
	if err := validateUpstreamMonitorSettings(&req); err != nil {
		common.ApiError(c, err)
		return
	}

	err := model.UpdateOptionsBulk(map[string]string{
		"upstream_monitor_setting.enabled":           strconv.FormatBool(req.Enabled),
		"upstream_monitor_setting.peak_start_hour":   strconv.Itoa(req.PeakStartHour),
		"upstream_monitor_setting.peak_end_hour":     strconv.Itoa(req.PeakEndHour),
		"upstream_monitor_setting.peak_interval":     strconv.Itoa(req.PeakInterval),
		"upstream_monitor_setting.off_peak_interval": strconv.Itoa(req.OffPeakInterval),
	})
	if err != nil {
		common.ApiError(c, err)
		return
	}
	recordManageAudit(c, "upstream.monitor_settings", map[string]interface{}{
		"enabled":           req.Enabled,
		"peak_start_hour":   req.PeakStartHour,
		"peak_end_hour":     req.PeakEndHour,
		"peak_interval":     req.PeakInterval,
		"off_peak_interval": req.OffPeakInterval,
	})
	common.ApiSuccess(c, buildUpstreamMonitorSettingsResponse())
}

func validateUpstreamMonitorSettings(req *upstreamMonitorSettingsRequest) error {
	minInterval := operation_setting.UpstreamMonitorMinIntervalMinutes
	maxInterval := operation_setting.UpstreamMonitorMaxIntervalMinutes
	if req.PeakStartHour < 0 || req.PeakStartHour > 23 || req.PeakEndHour < 0 || req.PeakEndHour > 23 {
		return errors.New("高峰时段需在 0-23 点之间")
	}
	if req.PeakInterval < minInterval || req.PeakInterval > maxInterval {
		return fmt.Errorf("高峰时段间隔需在 %d-%d 分钟之间", minInterval, maxInterval)
	}
	if req.OffPeakInterval < minInterval || req.OffPeakInterval > maxInterval {
		return fmt.Errorf("低谷时段间隔需在 %d-%d 分钟之间", minInterval, maxInterval)
	}
	return nil
}

func validateNotificationEmails(emailEnabled bool, notificationEmail string) error {
	if !emailEnabled {
		return nil
	}
	if notificationEmail == "" {
		return errors.New("开启邮件提醒时必须填写通知邮箱")
	}
	for _, address := range strings.Split(notificationEmail, ",") {
		address = strings.TrimSpace(address)
		if address == "" {
			continue
		}
		if _, err := mail.ParseAddress(address); err != nil {
			return errors.New("通知邮箱格式不正确：" + address)
		}
	}
	return nil
}
