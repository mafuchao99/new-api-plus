package service

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

// ----------------------------------------------------------------------------
// 共用 HTTP 请求
// ----------------------------------------------------------------------------

const (
	upstreamBalanceRequestTimeout = 20 * time.Second
	upstreamBalanceMaxBodyBytes   = 1 << 20
)

// 复用同一个客户端以复用连接；默认 Transport 会自动读取 HTTP(S)_PROXY 环境变量
var upstreamBalanceHttpClient = &http.Client{
	Timeout: upstreamBalanceRequestTimeout,
}

// upstreamGet 发起带自定义请求头的 GET，返回响应体与状态码
func upstreamGet(url string, headers map[string]string) ([]byte, int, error) {
	request, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return nil, 0, fmt.Errorf("接口地址无效: %w", err)
	}
	request.Header.Set("Accept", "application/json")
	for key, value := range headers {
		if value != "" {
			request.Header.Set(key, value)
		}
	}
	response, err := upstreamBalanceHttpClient.Do(request)
	if err != nil {
		return nil, 0, fmt.Errorf("请求上游失败: %w", err)
	}
	defer response.Body.Close()
	body, err := io.ReadAll(io.LimitReader(response.Body, upstreamBalanceMaxBodyBytes))
	if err != nil {
		return nil, response.StatusCode, fmt.Errorf("读取上游响应失败: %w", err)
	}
	return body, response.StatusCode, nil
}

// ----------------------------------------------------------------------------
// 上游账号余额查询调度
// ----------------------------------------------------------------------------
//
// 每种上游类型实现 UpstreamBalanceQuerier 并在 init() 中注册（见
// upstream_balance_sub2api.go），新增类型只需加一个实现文件 + 一行注册。
//
// 约定：
//   - 余额按上游面板返回的原始数值存储，不做汇率/单位换算（站长约定：一律视作本站货币）
//   - 查询失败时保留上一次成功的余额与时间，只更新查询状态与错误信息
//   - 后续的定时任务直接复用 QueryUpstreamAccountBalance / QueryUpstreamAccountsBalance

// UpstreamBalanceQuerier 上游账号余额查询器
type UpstreamBalanceQuerier interface {
	// Query 返回上游面板口径的余额；失败时返回 error（错误信息展示给管理员）
	Query(account *model.UpstreamAccount) (float64, error)
}

var (
	upstreamBalanceQueriers   = make(map[string]UpstreamBalanceQuerier)
	upstreamBalanceQueriersMu sync.RWMutex
)

// RegisterUpstreamBalanceQuerier 注册某类型上游的余额查询器
func RegisterUpstreamBalanceQuerier(accountType string, querier UpstreamBalanceQuerier) {
	upstreamBalanceQueriersMu.Lock()
	defer upstreamBalanceQueriersMu.Unlock()
	upstreamBalanceQueriers[accountType] = querier
}

// GetUpstreamBalanceQuerier 是否已支持某类型上游的余额查询
func GetUpstreamBalanceQuerier(accountType string) (UpstreamBalanceQuerier, bool) {
	upstreamBalanceQueriersMu.RLock()
	defer upstreamBalanceQueriersMu.RUnlock()
	querier, ok := upstreamBalanceQueriers[accountType]
	return querier, ok
}

// UpstreamBalanceQueryResult 单个账号的查询结果（返回给前端）
type UpstreamBalanceQueryResult struct {
	Id                 int     `json:"id"`
	Success            bool    `json:"success"`
	Balance            float64 `json:"balance"`
	BalanceUpdatedTime int64   `json:"balance_updated_time"`
	QueryStatus        int     `json:"query_status"`
	Message            string  `json:"message"`
}

// QueryUpstreamAccountBalance 查询单个账号余额并落库
func QueryUpstreamAccountBalance(account *model.UpstreamAccount) UpstreamBalanceQueryResult {
	querier, ok := GetUpstreamBalanceQuerier(account.Type)
	if !ok {
		return failUpstreamAccountQuery(account, fmt.Errorf("暂不支持 %s 类型上游的余额查询", account.Type))
	}

	balance, err := querier.Query(account)
	if err != nil {
		return failUpstreamAccountQuery(account, err)
	}

	if err := account.UpdateQuerySuccess(balance); err != nil {
		common.SysError("failed to persist upstream account balance: " + err.Error())
		return failUpstreamAccountQuery(account, fmt.Errorf("保存余额失败: %w", err))
	}

	NotifyUpstreamLowBalanceIfNeeded(account)

	return UpstreamBalanceQueryResult{
		Id:                 account.Id,
		Success:            true,
		Balance:            account.Balance,
		BalanceUpdatedTime: account.BalanceUpdatedTime,
		QueryStatus:        account.QueryStatus,
		Message:            "",
	}
}

func failUpstreamAccountQuery(account *model.UpstreamAccount, queryErr error) UpstreamBalanceQueryResult {
	message := queryErr.Error()
	if err := account.UpdateQueryFailure(message); err != nil {
		common.SysError("failed to persist upstream account query failure: " + err.Error())
	}
	return UpstreamBalanceQueryResult{
		Id:                 account.Id,
		Success:            false,
		Balance:            account.Balance,
		BalanceUpdatedTime: account.BalanceUpdatedTime,
		QueryStatus:        account.QueryStatus,
		Message:            message,
	}
}

// 批量查询的并发上限，避免同时打爆多个上游面板
const upstreamBalanceQueryConcurrency = 4

// QueryUpstreamAccountsBalance 批量查询（受限并发），返回顺序与入参一致。
// ctx 取消后不再发起新的查询，未执行的账号返回「任务已取消」且不改动其状态。
func QueryUpstreamAccountsBalance(ctx context.Context, accounts []*model.UpstreamAccount) []UpstreamBalanceQueryResult {
	results := make([]UpstreamBalanceQueryResult, len(accounts))
	semaphore := make(chan struct{}, upstreamBalanceQueryConcurrency)
	var waitGroup sync.WaitGroup

	for index, account := range accounts {
		if ctx.Err() != nil {
			results[index] = canceledUpstreamAccountQuery(account, ctx.Err())
			continue
		}
		waitGroup.Add(1)
		go func(resultIndex int, target *model.UpstreamAccount) {
			defer waitGroup.Done()
			semaphore <- struct{}{}
			defer func() { <-semaphore }()
			if ctx.Err() != nil {
				results[resultIndex] = canceledUpstreamAccountQuery(target, ctx.Err())
				return
			}
			results[resultIndex] = QueryUpstreamAccountBalance(target)
		}(index, account)
	}

	waitGroup.Wait()
	return results
}

func canceledUpstreamAccountQuery(account *model.UpstreamAccount, cause error) UpstreamBalanceQueryResult {
	return UpstreamBalanceQueryResult{
		Id:                 account.Id,
		Success:            false,
		Balance:            account.Balance,
		BalanceUpdatedTime: account.BalanceUpdatedTime,
		QueryStatus:        account.QueryStatus,
		Message:            "任务已取消: " + cause.Error(),
	}
}
