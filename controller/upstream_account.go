package controller

import (
	"errors"
	"net/mail"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
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
	if req.Type != model.UpstreamAccountTypeNewApi && req.Type != model.UpstreamAccountTypeSub2Api {
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
// TODO: 待 new-api / sub2api 的上游接口协议确定后实现
func UpdateUpstreamAccountBalance(c *gin.Context) {
	common.ApiErrorMsg(c, "上游余额查询尚未实现")
}

// UpdateUpstreamAccountsBalance 批量查询上游账号余额（?ids=1,2,3）
// TODO: 待 new-api / sub2api 的上游接口协议确定后实现
func UpdateUpstreamAccountsBalance(c *gin.Context) {
	common.ApiErrorMsg(c, "上游余额查询尚未实现")
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
