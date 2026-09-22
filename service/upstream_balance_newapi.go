package service

import (
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

const (
	// new-api 系的余额接口与公开配置接口
	newApiSelfPath   = "/api/user/self"
	newApiStatusPath = "/api/status"

	// 上游未暴露 quota_per_unit 时的兜底值（new-api 默认 500000 = $1）
	defaultNewApiQuotaPerUnit = 500000
	newApiQuotaPerUnitTTL     = 6 * time.Hour
)

func init() {
	RegisterUpstreamBalanceQuerier(model.UpstreamAccountTypeNewApi, &NewApiBalanceQuerier{})
}

// NewApiBalanceQuerier new-api 系上游余额查询
//
//	GET {base_url}/api/user/self
//	Authorization: {access_token}
//	New-Api-User: {upstream_user_id}
//	→ {"success": true, "data": {"quota": 8069102, "used_quota": 96930900, ...}}
//
// quota 是内部额度单位，余额 = quota / QuotaPerUnit；QuotaPerUnit 取上游公开的
// /api/status（带 TTL 缓存，取不到时回退默认 500000）。
type NewApiBalanceQuerier struct{}

type newApiSelfResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
	Data    *struct {
		Id    int      `json:"id"`
		Quota *float64 `json:"quota"`
	} `json:"data"`
}

type newApiStatusResponse struct {
	Data *struct {
		QuotaPerUnit float64 `json:"quota_per_unit"`
	} `json:"data"`
}

type newApiQuotaPerUnitEntry struct {
	value     float64
	fetchedAt time.Time
}

var (
	newApiQuotaPerUnitCache   = map[string]newApiQuotaPerUnitEntry{}
	newApiQuotaPerUnitCacheMu sync.RWMutex
)

func (querier *NewApiBalanceQuerier) Query(account *model.UpstreamAccount) (float64, error) {
	if account.AuthType != model.UpstreamAuthTypeAccessToken {
		return 0, errors.New("new-api 暂只支持用访问令牌查询余额")
	}
	token := strings.TrimSpace(account.AccessToken)
	if token == "" {
		return 0, errors.New("缺少访问令牌")
	}
	if account.UpstreamUserId <= 0 {
		return 0, errors.New("缺少上游用户 ID，请在账号配置中填写")
	}
	baseUrl := strings.TrimRight(strings.TrimSpace(account.BaseUrl), "/")
	if baseUrl == "" {
		return 0, errors.New("缺少接口地址")
	}

	body, statusCode, err := upstreamGet(baseUrl+newApiSelfPath, map[string]string{
		"Authorization": token,
		"New-Api-User":  strconv.Itoa(account.UpstreamUserId),
	})
	if err != nil {
		return 0, err
	}

	payload := newApiSelfResponse{}
	parseErr := common.Unmarshal(body, &payload)
	if statusCode != http.StatusOK {
		if parseErr == nil && payload.Message != "" {
			return 0, errors.New(payload.Message)
		}
		return 0, fmt.Errorf("上游返回 HTTP %d", statusCode)
	}
	if parseErr != nil {
		return 0, errors.New("上游返回无法解析的数据")
	}
	if !payload.Success {
		if payload.Message != "" {
			return 0, errors.New(payload.Message)
		}
		return 0, errors.New("上游查询失败")
	}
	if payload.Data == nil || payload.Data.Quota == nil {
		return 0, errors.New("上游返回数据缺少 quota 字段")
	}

	quotaPerUnit := querier.getQuotaPerUnit(baseUrl)
	if quotaPerUnit <= 0 {
		quotaPerUnit = defaultNewApiQuotaPerUnit
	}
	return *payload.Data.Quota / quotaPerUnit, nil
}

// getQuotaPerUnit 读取上游公开配置里的 QuotaPerUnit（带 TTL 缓存），
// 上游自定义了换算比例时也能拿到正确金额；取不到时回退默认值。
func (querier *NewApiBalanceQuerier) getQuotaPerUnit(baseUrl string) float64 {
	now := time.Now()
	newApiQuotaPerUnitCacheMu.RLock()
	entry, cached := newApiQuotaPerUnitCache[baseUrl]
	newApiQuotaPerUnitCacheMu.RUnlock()
	if cached && now.Sub(entry.fetchedAt) < newApiQuotaPerUnitTTL {
		return entry.value
	}

	value := float64(defaultNewApiQuotaPerUnit)
	body, statusCode, err := upstreamGet(baseUrl+newApiStatusPath, nil)
	if err == nil && statusCode == http.StatusOK {
		payload := newApiStatusResponse{}
		if common.Unmarshal(body, &payload) == nil &&
			payload.Data != nil &&
			payload.Data.QuotaPerUnit > 0 {
			value = payload.Data.QuotaPerUnit
		}
	}

	newApiQuotaPerUnitCacheMu.Lock()
	newApiQuotaPerUnitCache[baseUrl] = newApiQuotaPerUnitEntry{value: value, fetchedAt: now}
	newApiQuotaPerUnitCacheMu.Unlock()
	return value
}
