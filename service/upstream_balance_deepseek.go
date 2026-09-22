package service

import (
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

const (
	// DeepSeek 官方余额接口
	deepSeekBalancePath = "/user/balance"
)

func init() {
	RegisterUpstreamBalanceQuerier(model.UpstreamAccountTypeDeepSeek, &DeepSeekBalanceQuerier{})
}

// DeepSeekBalanceQuerier DeepSeek 官方余额查询
//
//	GET {base_url}/user/balance
//	Authorization: Bearer {access_token}
//	→ {"is_available": true, "balance_infos": [
//	     {"currency": "CNY", "total_balance": "89.94", "granted_balance": "0.00", "topped_up_balance": "89.94"}]}
//
// 余额取第一条 balance_infos 的 total_balance（金额是字符串，按上游口径原样存储）。
// is_available 为 false 表示账户已无法调用 API，此时余额通常已耗尽；
// 这里仍按查询成功处理，好让低余额提醒照常触发。
type DeepSeekBalanceQuerier struct{}

type deepSeekBalanceInfo struct {
	Currency        string `json:"currency"`
	TotalBalance    string `json:"total_balance"`
	GrantedBalance  string `json:"granted_balance"`
	ToppedUpBalance string `json:"topped_up_balance"`
}

type deepSeekBalanceResponse struct {
	IsAvailable  *bool                 `json:"is_available"`
	BalanceInfos []deepSeekBalanceInfo `json:"balance_infos"`
	Error        *struct {
		Message string `json:"message"`
		Type    string `json:"type"`
	} `json:"error"`
}

func (querier *DeepSeekBalanceQuerier) Query(account *model.UpstreamAccount) (float64, error) {
	if account.AuthType != model.UpstreamAuthTypeAccessToken {
		return 0, errors.New("deepseek 暂只支持用访问令牌查询余额")
	}
	token := strings.TrimSpace(account.AccessToken)
	if token == "" {
		return 0, errors.New("缺少访问令牌")
	}
	baseUrl := strings.TrimRight(strings.TrimSpace(account.BaseUrl), "/")
	if baseUrl == "" {
		return 0, errors.New("缺少接口地址")
	}

	body, statusCode, err := upstreamGet(baseUrl+deepSeekBalancePath, map[string]string{
		"Authorization": "Bearer " + token,
	})
	if err != nil {
		return 0, err
	}

	payload := deepSeekBalanceResponse{}
	parseErr := common.Unmarshal(body, &payload)

	if statusCode != http.StatusOK {
		if parseErr == nil && payload.Error != nil && payload.Error.Message != "" {
			return 0, errors.New(payload.Error.Message)
		}
		return 0, fmt.Errorf("上游返回 HTTP %d", statusCode)
	}
	if parseErr != nil {
		return 0, errors.New("上游返回无法解析的数据")
	}
	if len(payload.BalanceInfos) == 0 {
		return 0, errors.New("上游返回数据缺少 balance_infos")
	}

	totalBalance, err := strconv.ParseFloat(strings.TrimSpace(payload.BalanceInfos[0].TotalBalance), 64)
	if err != nil {
		return 0, fmt.Errorf("上游返回的余额无法解析：%s", payload.BalanceInfos[0].TotalBalance)
	}
	return totalBalance, nil
}
