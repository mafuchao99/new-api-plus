package model

import (
	"errors"
	"strings"

	"github.com/QuantumNous/new-api/common"
)

// 上游账号类型
const (
	UpstreamAccountTypeNewApi   = "new-api"
	UpstreamAccountTypeSub2Api  = "sub2api"
	UpstreamAccountTypeDeepSeek = "deepseek"
)

// IsSupportedUpstreamAccountType 是否为支持的账号类型（新增类型时同时实现余额查询器）
func IsSupportedUpstreamAccountType(accountType string) bool {
	switch accountType {
	case UpstreamAccountTypeNewApi, UpstreamAccountTypeSub2Api, UpstreamAccountTypeDeepSeek:
		return true
	default:
		return false
	}
}

// 认证方式
const (
	UpstreamAuthTypeAccessToken = "access_token"
	UpstreamAuthTypePassword    = "password"
)

// 余额查询状态
const (
	UpstreamQueryStatusNever   = 0
	UpstreamQueryStatusSuccess = 1
	UpstreamQueryStatusFailed  = 2
)

// UpstreamAccount 上游账号（余额监控）
//
// 凭据字段与渠道密钥一样按明文存储（余额查询需要原文），列表与搜索结果会清空
// 这两个字段，只有单条查询接口会返回完整凭据供管理员编辑。
type UpstreamAccount struct {
	Id          int    `json:"id"`
	Name        string `json:"name" gorm:"type:varchar(64);index"`
	Type        string `json:"type" gorm:"type:varchar(20);index"`
	BaseUrl     string `json:"base_url" gorm:"type:varchar(255)"`
	AuthType    string `json:"auth_type" gorm:"type:varchar(20)"`
	AccessToken string `json:"access_token" gorm:"type:text"`
	Username    string `json:"username" gorm:"type:varchar(128)"`
	Password    string `json:"password" gorm:"type:text"`
	// new-api 系上游查询余额需要访问令牌所属的用户 ID（New-Api-User 请求头）
	UpstreamUserId      int     `json:"upstream_user_id"`
	LowBalanceThreshold float64 `json:"low_balance_threshold"`
	Enabled             bool    `json:"enabled" gorm:"index"`
	Remark              string  `json:"remark" gorm:"type:varchar(255)"`
	// 余额快照，由余额查询任务写入（按上游面板口径原样存储，不做单位换算）
	Balance            float64 `json:"balance"`
	BalanceUpdatedTime int64   `json:"balance_updated_time" gorm:"bigint"`
	QueryStatus        int     `json:"query_status"`
	LastError          string  `json:"last_error" gorm:"type:text"`
	// 最近一次低余额提醒时间，0 表示未提醒过（余额恢复后会被清空）
	LastAlertTime int64 `json:"last_alert_time" gorm:"bigint"`
	CreatedTime   int64 `json:"created_time" gorm:"bigint"`
	UpdatedTime   int64 `json:"updated_time" gorm:"bigint"`
}

// Clean 清空凭据字段，用于列表等无需返回密钥的响应
func (account *UpstreamAccount) Clean() {
	account.AccessToken = ""
	account.Password = ""
}

func GetUpstreamAccountById(id int) (*UpstreamAccount, error) {
	if id == 0 {
		return nil, errors.New("id 为空！")
	}
	account := UpstreamAccount{Id: id}
	err := DB.First(&account, "id = ?", id).Error
	return &account, err
}

// GetEnabledUpstreamAccounts 供定时任务使用：取出所有启用的账号
func GetEnabledUpstreamAccounts() ([]*UpstreamAccount, error) {
	var accounts []*UpstreamAccount
	err := DB.Where("enabled = ?", true).Order("id asc").Find(&accounts).Error
	return accounts, err
}

func GetUpstreamAccountsByIds(ids []int) ([]*UpstreamAccount, error) {
	if len(ids) == 0 {
		return nil, errors.New("ids 为空！")
	}
	var accounts []*UpstreamAccount
	err := DB.Where("id IN ?", ids).Order("id desc").Find(&accounts).Error
	return accounts, err
}

// UpdateQuerySuccess 写入查询成功结果
func (account *UpstreamAccount) UpdateQuerySuccess(balance float64) error {
	now := common.GetTimestamp()
	err := DB.Model(&UpstreamAccount{}).
		Where("id = ?", account.Id).
		Updates(map[string]interface{}{
			"balance":              balance,
			"balance_updated_time": now,
			"query_status":         UpstreamQueryStatusSuccess,
			"last_error":           "",
			"updated_time":         now,
		}).Error
	if err != nil {
		return err
	}
	account.Balance = balance
	account.BalanceUpdatedTime = now
	account.QueryStatus = UpstreamQueryStatusSuccess
	account.LastError = ""
	account.UpdatedTime = now
	return nil
}

// UpdateQueryFailure 记录查询失败，保留上一次成功的余额与查询时间
func (account *UpstreamAccount) UpdateQueryFailure(lastError string) error {
	now := common.GetTimestamp()
	err := DB.Model(&UpstreamAccount{}).
		Where("id = ?", account.Id).
		Updates(map[string]interface{}{
			"query_status": UpstreamQueryStatusFailed,
			"last_error":   lastError,
			"updated_time": now,
		}).Error
	if err != nil {
		return err
	}
	account.QueryStatus = UpstreamQueryStatusFailed
	account.LastError = lastError
	account.UpdatedTime = now
	return nil
}

func GetAllUpstreamAccounts(startIdx int, num int) ([]*UpstreamAccount, int64, error) {
	var accounts []*UpstreamAccount
	var total int64
	query := DB.Model(&UpstreamAccount{})
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	err := query.
		Omit("access_token", "password").
		Order("id desc").
		Limit(num).
		Offset(startIdx).
		Find(&accounts).Error
	return accounts, total, err
}

func SearchUpstreamAccounts(keyword string, startIdx int, num int) ([]*UpstreamAccount, int64, error) {
	var accounts []*UpstreamAccount
	var total int64
	pattern := upstreamLikePattern(keyword)
	query := DB.Model(&UpstreamAccount{}).Where(
		"name LIKE ? ESCAPE '!' OR base_url LIKE ? ESCAPE '!' OR remark LIKE ? ESCAPE '!'",
		pattern, pattern, pattern,
	)
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	err := query.
		Omit("access_token", "password").
		Order("id desc").
		Limit(num).
		Offset(startIdx).
		Find(&accounts).Error
	return accounts, total, err
}

// upstreamLikePattern 把关键字转成子串匹配模式，并转义 LIKE 元字符（ESC 字符为 !）
func upstreamLikePattern(keyword string) string {
	replacer := strings.NewReplacer("!", "!!", "_", "!_", "%", "!%")
	return "%" + replacer.Replace(keyword) + "%"
}

func CreateUpstreamAccount(account *UpstreamAccount) error {
	account.Id = 0
	now := common.GetTimestamp()
	account.CreatedTime = now
	account.UpdatedTime = now
	account.QueryStatus = UpstreamQueryStatusNever
	account.LastError = ""
	return DB.Create(account).Error
}

// UpdateUpstreamAccount 更新账号配置，余额快照由查询任务维护，不在此覆盖
func UpdateUpstreamAccount(account *UpstreamAccount) (*UpstreamAccount, error) {
	existing, err := GetUpstreamAccountById(account.Id)
	if err != nil {
		return nil, err
	}
	existing.Name = account.Name
	existing.Type = account.Type
	existing.BaseUrl = account.BaseUrl
	existing.AuthType = account.AuthType
	existing.AccessToken = account.AccessToken
	existing.Username = account.Username
	existing.Password = account.Password
	existing.UpstreamUserId = account.UpstreamUserId
	existing.LowBalanceThreshold = account.LowBalanceThreshold
	existing.Enabled = account.Enabled
	existing.Remark = account.Remark
	existing.UpdatedTime = common.GetTimestamp()
	if err := DB.Save(existing).Error; err != nil {
		return nil, err
	}
	return existing, nil
}

func UpdateUpstreamAccountStatus(id int, enabled bool) error {
	if id == 0 {
		return errors.New("id 为空！")
	}
	return DB.Model(&UpstreamAccount{}).
		Where("id = ?", id).
		Updates(map[string]interface{}{
			"enabled":      enabled,
			"updated_time": common.GetTimestamp(),
		}).Error
}

// UpdateLastAlertTime 记录/清空最近一次低余额提醒时间（0 表示未提醒过）
func (account *UpstreamAccount) UpdateLastAlertTime(lastAlertTime int64) error {
	err := DB.Model(&UpstreamAccount{}).
		Where("id = ?", account.Id).
		Update("last_alert_time", lastAlertTime).Error
	if err != nil {
		return err
	}
	account.LastAlertTime = lastAlertTime
	return nil
}

// SetUpstreamAccountLastAlertTime 按 id 更新提醒标记（不经过结构体，供后台协程使用）
func SetUpstreamAccountLastAlertTime(id int, lastAlertTime int64) error {
	if id == 0 {
		return errors.New("id 为空！")
	}
	return DB.Model(&UpstreamAccount{}).
		Where("id = ?", id).
		Update("last_alert_time", lastAlertTime).Error
}

func DeleteUpstreamAccountById(id int) error {
	if id == 0 {
		return errors.New("id 为空！")
	}
	return DB.Where("id = ?", id).Delete(&UpstreamAccount{}).Error
}
