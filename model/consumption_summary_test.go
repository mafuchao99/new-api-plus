package model

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestConsumptionSummaryReconcilesTotalsAndUserBreakdowns(t *testing.T) {
	truncateTables(t)
	require.NoError(t, LOG_DB.Create(&[]Log{
		{UserId: 1, Username: "alice-old", Type: LogTypeConsume, ModelName: "chat", CreatedAt: 100, Quota: 100, PromptTokens: 10, CompletionTokens: 20},
		{UserId: 1, Username: "alice", Type: LogTypeConsume, ModelName: "chat", CreatedAt: 199, Quota: 50, PromptTokens: 5, CompletionTokens: 5},
		{UserId: 2, Username: "bob", Type: LogTypeConsume, ModelName: "chat", CreatedAt: 150, Quota: 300, PromptTokens: 30, CompletionTokens: 40},
		{UserId: 1, Username: "alice", Type: LogTypeConsume, ModelName: "image", CreatedAt: 150, Quota: 100},
		{UserId: 3, Username: "deleted-user", Type: LogTypeConsume, ModelName: "free", CreatedAt: 150, PromptTokens: 40},
		{Type: LogTypeConsume, ModelName: "chat", CreatedAt: 99, Quota: 999},
		{Type: LogTypeConsume, ModelName: "chat", CreatedAt: 200, Quota: 999},
		{Type: LogTypeError, ModelName: "chat", CreatedAt: 150, Quota: 999},
		{Type: LogTypeTopup, ModelName: "chat", CreatedAt: 150, Quota: 999},
		{UserId: 1, Username: "alice", Type: LogTypeRefund, ModelName: "image", CreatedAt: 150, Quota: 50},
	}).Error)
	query := ConsumptionSummaryQuery{StartTimestamp: 100, EndTimestamp: 200}
	summary, err := GetConsumptionSummary(context.Background(), query)
	require.NoError(t, err)
	assert.Equal(t, ConsumptionSummaryTotals{Quota: 500, Requests: 5, Tokens: 150, Models: 3}, summary.Totals)
	require.Len(t, summary.Rows, 3)
	assert.Equal(t, "chat", summary.Rows[0].ID)
	assert.EqualValues(t, 450, summary.Rows[0].Quota)
	assert.Equal(t, 150.0, summary.Rows[0].AverageQuota)
	assert.InDelta(t, 90.0, summary.Rows[0].Share, 0.000001)
	assert.Equal(t, "image", summary.Rows[1].ID)
	assert.EqualValues(t, 50, summary.Rows[1].Quota)
	assert.Zero(t, summary.Rows[1].Tokens)
	assert.Equal(t, "free", summary.Rows[2].ID)
	assert.Zero(t, summary.Rows[2].Share)
	assert.Zero(t, summary.Rows[2].AverageQuota)

	modelName := "chat"
	query.ExactModel = &modelName
	users, err := GetConsumptionSummary(context.Background(), query)
	require.NoError(t, err)
	require.Len(t, users.Rows, 2)
	assert.Equal(t, ConsumptionSummaryTotals{Quota: 450, Requests: 3, Tokens: 110, Models: 1}, users.Totals)
	assert.Equal(t, "2", users.Rows[0].ID)
	assert.Equal(t, "bob", users.Rows[0].Name)
	assert.InDelta(t, 300.0/450*100, users.Rows[0].Share, 0.000001)
	assert.Equal(t, "1", users.Rows[1].ID)
	assert.Equal(t, "alice", users.Rows[1].Name)
	assert.EqualValues(t, 150, users.Rows[1].Quota)
	query.UserID = 1
	filtered, err := GetConsumptionSummary(context.Background(), query)
	require.NoError(t, err)
	require.Len(t, filtered.Rows, 1)
	assert.Equal(t, 100.0, filtered.Rows[0].Share)
	assert.EqualValues(t, 150, filtered.Totals.Quota)

	freeModel := "free"
	free, err := GetConsumptionSummary(context.Background(), ConsumptionSummaryQuery{
		StartTimestamp: 100, EndTimestamp: 200, ExactModel: &freeModel,
	})
	require.NoError(t, err)
	require.Len(t, free.Rows, 1)
	assert.Equal(t, "3", free.Rows[0].ID)
	assert.Equal(t, "deleted-user", free.Rows[0].Name)
	assert.Zero(t, free.Totals.Quota)
	assert.EqualValues(t, 1, free.Totals.Requests)
	assert.Zero(t, free.Rows[0].Share)
	assert.Zero(t, free.Rows[0].AverageQuota)
}

func TestConsumptionSummaryTreatsSearchCharactersLiterally(t *testing.T) {
	truncateTables(t)
	require.NoError(t, LOG_DB.Create(&[]Log{
		{Type: LogTypeConsume, ModelName: "Custom_50%!Model", CreatedAt: 100, Quota: 50},
		{Type: LogTypeConsume, ModelName: "customX50otherModel", CreatedAt: 100, Quota: 100},
	}).Error)
	for _, search := range []string{" custom_50%!model ", "_", "%", "!"} {
		summary, err := GetConsumptionSummary(context.Background(), ConsumptionSummaryQuery{StartTimestamp: 100, EndTimestamp: 101, ModelSearch: search})
		require.NoError(t, err)
		require.Len(t, summary.Rows, 1)
		assert.Equal(t, "Custom_50%!Model", summary.Rows[0].Name)
	}
}

func TestConsumptionSummaryPreservesLargeQuotasAndEmptyResults(t *testing.T) {
	truncateTables(t)
	require.NoError(t, LOG_DB.Create(&[]Log{
		{Type: LogTypeConsume, CreatedAt: 100, ModelName: "", UserId: 4, Username: "retained", Quota: 1800000000},
		{Type: LogTypeConsume, CreatedAt: 100, ModelName: "", UserId: 4, Username: "retained", Quota: 1800000000},
	}).Error)
	summary, err := GetConsumptionSummary(context.Background(), ConsumptionSummaryQuery{StartTimestamp: 100, EndTimestamp: 101})
	require.NoError(t, err)
	assert.EqualValues(t, 3600000000, summary.Totals.Quota)
	emptyModel := ""
	users, err := GetConsumptionSummary(context.Background(), ConsumptionSummaryQuery{StartTimestamp: 100, EndTimestamp: 101, ExactModel: &emptyModel})
	require.NoError(t, err)
	require.Len(t, users.Rows, 1)
	assert.Equal(t, "4", users.Rows[0].ID)
	summary, err = GetConsumptionSummary(context.Background(), ConsumptionSummaryQuery{StartTimestamp: 101, EndTimestamp: 102})
	require.NoError(t, err)
	assert.Equal(t, ConsumptionSummaryTotals{}, summary.Totals)
	assert.NotNil(t, summary.Rows)
	assert.Empty(t, summary.Rows)
}

func TestConsumptionSummaryNetSpendingAndSettlementRequestCounts(t *testing.T) {
	truncateTables(t)
	require.NoError(t, LOG_DB.Create(&[]Log{
		{UserId: 1, Username: "alice", Type: LogTypeConsume, ModelName: "failed", CreatedAt: 100, Quota: 5000, Other: `{"is_task":true}`},
		{UserId: 1, Username: "alice", Type: LogTypeRefund, ModelName: "failed", CreatedAt: 101, Quota: 5000},
		{UserId: 1, Username: "alice", Type: LogTypeConsume, ModelName: "adjusted", CreatedAt: 100, Quota: 5000, Other: `{"is_task":true}`},
		{UserId: 1, Username: "alice", Type: LogTypeConsume, ModelName: "adjusted", CreatedAt: 101, Quota: 3000, Other: `{"task_id":"t1", "pre_consumed_quota":5000, "actual_quota":8000}`},
		{UserId: 2, Username: "bob", Type: LogTypeConsume, ModelName: "adjusted", CreatedAt: 100, Quota: 5000, Other: `{"is_task":true}`},
		{UserId: 2, Username: "bob", Type: LogTypeRefund, ModelName: "adjusted", CreatedAt: 101, Quota: 2000},
		{UserId: 1, Username: "alice", Type: LogTypeRefund, ModelName: "earlier-task", CreatedAt: 100, Quota: 2000},
		{UserId: 1, Username: "alice", Type: LogTypeConsume, ModelName: "earlier-task", CreatedAt: 99, Quota: 5000},
		{UserId: 1, Username: "alice", Type: LogTypeRefund, ModelName: "adjusted", CreatedAt: 102, Quota: 999},
	}).Error)
	query := ConsumptionSummaryQuery{StartTimestamp: 100, EndTimestamp: 102}
	summary, err := GetConsumptionSummary(context.Background(), query)
	require.NoError(t, err)
	assert.Equal(t, ConsumptionSummaryTotals{Quota: 9000, Requests: 3, Tokens: 0, Models: 2}, summary.Totals)
	require.Len(t, summary.Rows, 3)
	assert.Equal(t, ConsumptionSummaryRow{ID: "adjusted", Name: "adjusted", Quota: 11000, Requests: 2, Share: 11000.0 / 9000 * 100, AverageQuota: 5500}, summary.Rows[0])
	assert.Equal(t, ConsumptionSummaryRow{ID: "failed", Name: "failed", Requests: 1}, summary.Rows[1])
	assert.Equal(t, ConsumptionSummaryRow{ID: "earlier-task", Name: "earlier-task", Quota: -2000, Share: -2000.0 / 9000 * 100}, summary.Rows[2])
	modelName := "adjusted"
	query.ExactModel = &modelName
	detail, err := GetConsumptionSummary(context.Background(), query)
	require.NoError(t, err)
	assert.Equal(t, ConsumptionSummaryTotals{Quota: 11000, Requests: 2, Models: 1}, detail.Totals)
	require.Len(t, detail.Rows, 2)
	assert.EqualValues(t, 8000, detail.Rows[0].Quota)
	assert.EqualValues(t, 1, detail.Rows[0].Requests)
	assert.Equal(t, 8000.0, detail.Rows[0].AverageQuota)
	assert.InDelta(t, 8000.0/11000*100, detail.Rows[0].Share, 0.000001)
	assert.EqualValues(t, 3000, detail.Rows[1].Quota)
	query.UserID = 1
	filtered, err := GetConsumptionSummary(context.Background(), query)
	require.NoError(t, err)
	require.Len(t, filtered.Rows, 1)
	assert.EqualValues(t, 8000, filtered.Totals.Quota)
	assert.Equal(t, 100.0, filtered.Rows[0].Share)
	query.ExactModel = nil
	query.UserID = 0
	query.StartTimestamp = 101
	refundsAndSettlement, err := GetConsumptionSummary(context.Background(), query)
	require.NoError(t, err)
	assert.Equal(t, ConsumptionSummaryTotals{Quota: -4000, Requests: 0, Models: 0}, refundsAndSettlement.Totals)
	for _, row := range refundsAndSettlement.Rows {
		assert.Zero(t, row.AverageQuota)
		assert.Zero(t, row.Share)
	}
}

func TestConsumptionSummaryRetainsOrdinaryCallsWithSettlementLikeMetadata(t *testing.T) {
	truncateTables(t)
	require.NoError(t, LOG_DB.Create(&[]Log{
		{Type: LogTypeConsume, CreatedAt: 100, ModelName: "chat", Quota: 10, PromptTokens: 3, Other: `{"request_body":{"task_id":"client","pre_consumed_quota":1,"actual_quota":2}}`},
		{Type: LogTypeConsume, CreatedAt: 100, ModelName: "chat", PromptTokens: 7, Other: `{"task_id":"client","pre_consumed_quota":null,"actual_quota":2}`},
		{Type: LogTypeConsume, CreatedAt: 100, ModelName: "chat", Quota: 20, CompletionTokens: 5, Other: `{"task_id":"broken","pre_consumed_quota":1,"actual_quota":2`},
		{Type: LogTypeConsume, CreatedAt: 100, ModelName: "chat", CompletionTokens: 2},
	}).Error)
	require.NoError(t, LOG_DB.Model(&Log{}).Where("model_name = ? AND completion_tokens = ?", "chat", 2).Update("prompt_tokens", nil).Error)
	summary, err := GetConsumptionSummary(context.Background(), ConsumptionSummaryQuery{StartTimestamp: 100, EndTimestamp: 101})
	require.NoError(t, err)
	assert.Equal(t, ConsumptionSummaryTotals{Quota: 30, Requests: 4, Tokens: 17, Models: 1}, summary.Totals)
}

func TestConsumptionSummaryUsesCurrentUsersAndLatestDeletedUserNames(t *testing.T) {
	truncateTables(t)
	require.NoError(t, DB.Create(&[]User{
		{Id: 1, Username: "current-name", AffCode: "summary-active"},
		{Id: 2, Username: "deleted-current-name", AffCode: "summary-deleted"},
	}).Error)
	require.NoError(t, DB.Delete(&User{}, 2).Error)
	require.NoError(t, LOG_DB.Create(&[]Log{
		{UserId: 1, Username: "z-old-name", Type: LogTypeConsume, CreatedAt: 100, ModelName: "chat", Quota: 50},
		{UserId: 2, Username: "z-old-deleted-name", Type: LogTypeConsume, CreatedAt: 100, ModelName: "chat", Quota: 30},
		{UserId: 2, Username: "a-latest-deleted-name", Type: LogTypeConsume, CreatedAt: 101, ModelName: "chat", Quota: 20},
		{UserId: 2, Username: "outside-period-name", Type: LogTypeConsume, CreatedAt: 102, ModelName: "chat", Quota: 999},
	}).Error)
	name := "chat"
	summary, err := GetConsumptionSummary(context.Background(), ConsumptionSummaryQuery{StartTimestamp: 100, EndTimestamp: 102, ExactModel: &name})
	require.NoError(t, err)
	require.Len(t, summary.Rows, 2)
	assert.Equal(t, "current-name", summary.Rows[0].Name)
	assert.Equal(t, "a-latest-deleted-name", summary.Rows[1].Name)
	assert.EqualValues(t, 100, summary.Totals.Quota)
}
