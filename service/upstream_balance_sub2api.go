package service

import (
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

const (
	// sub2api 面板的余额/用量接口
	sub2ApiUsagePath = "/v1/usage"
)

func init() {
	RegisterUpstreamBalanceQuerier(model.UpstreamAccountTypeSub2Api, &Sub2ApiBalanceQuerier{})
}

// Sub2ApiBalanceQuerier sub2api 面板余额查询
//
//	GET {base_url}/v1/usage
//	Authorization: Bearer {access_token}
//	→ {"balance": 178.7, "remaining": 178.7, "isValid": true, "unit": "USD", ...}
type Sub2ApiBalanceQuerier struct{}

type sub2ApiUsageResponse struct {
	Code      string  `json:"code"`
	Message   string  `json:"message"`
	IsValid   *bool   `json:"isValid"`
	Balance   float64 `json:"balance"`
	Remaining float64 `json:"remaining"`
	Unit      string  `json:"unit"`
	Mode      string  `json:"mode"`
	PlanName  string  `json:"planName"`
}

func (querier *Sub2ApiBalanceQuerier) Query(account *model.UpstreamAccount) (float64, error) {
	if account.AuthType != model.UpstreamAuthTypeAccessToken {
		return 0, errors.New("sub2api 暂只支持用访问令牌查询余额")
	}
	token := strings.TrimSpace(account.AccessToken)
	if token == "" {
		return 0, errors.New("缺少访问令牌")
	}
	baseUrl := strings.TrimRight(strings.TrimSpace(account.BaseUrl), "/")
	if baseUrl == "" {
		return 0, errors.New("缺少接口地址")
	}

	body, statusCode, err := upstreamGet(baseUrl+sub2ApiUsagePath, map[string]string{
		"Authorization": "Bearer " + token,
	})
	if err != nil {
		return 0, err
	}

	payload := sub2ApiUsageResponse{}
	parseErr := common.Unmarshal(body, &payload)

	if statusCode != http.StatusOK {
		if parseErr == nil {
			if payload.Message != "" {
				return 0, errors.New(payload.Message)
			}
			if payload.Code != "" {
				return 0, errors.New(payload.Code)
			}
		}
		return 0, fmt.Errorf("上游返回 HTTP %d", statusCode)
	}
	if parseErr != nil {
		return 0, errors.New("上游返回无法解析的数据")
	}
	if payload.IsValid != nil && !*payload.IsValid {
		if payload.Message != "" {
			return 0, errors.New(payload.Message)
		}
		return 0, errors.New("上游返回令牌无效")
	}

	// 面板以 remaining 为准；部分面板只返回 balance，这里做兜底
	if payload.Remaining == 0 && payload.Balance != 0 {
		return payload.Balance, nil
	}
	return payload.Remaining, nil
}
