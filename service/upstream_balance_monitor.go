package service

import (
	"context"
	"fmt"

	"github.com/QuantumNous/new-api/model"
)

// RunUpstreamBalanceMonitorTask 定时任务入口：查询所有启用账号的余额。
// 低余额邮件提醒由查询流程内部触发（NotifyUpstreamLowBalanceIfNeeded）。
func RunUpstreamBalanceMonitorTask(ctx context.Context) (string, error) {
	accounts, err := model.GetEnabledUpstreamAccounts()
	if err != nil {
		return "", err
	}
	if len(accounts) == 0 {
		return "没有启用的上游账号，跳过本次查询", nil
	}

	results := QueryUpstreamAccountsBalance(ctx, accounts)
	successCount := 0
	for _, result := range results {
		if result.Success {
			successCount++
		}
	}

	return fmt.Sprintf("查询 %d 个上游账号：成功 %d，失败 %d",
		len(results), successCount, len(results)-successCount), nil
}
