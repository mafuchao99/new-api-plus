package service

import (
	"context"
	"encoding/base64"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestRecalculateLogCorrectionUsesHistoricalPricesAndTokenSemantics(t *testing.T) {
	read, write, write5m, write1h := 0.1, 1.25, 1.25, 2.0
	params := LogCorrectionParameters{CacheRead: &read, CacheWrite: &write, CacheWrite5m: &write5m, CacheWrite1h: &write1h}
	for _, tc := range []struct {
		name, other                 string
		prompt, original, corrected int
	}{
		{"openai", `{"model_ratio":1,"group_ratio":1,"completion_ratio":2,"model_price":-1,"cache_tokens":800,"cache_ratio":1.25,"cache_creation_tokens":100,"cache_creation_ratio":0.1}`, 1000, 1310, 505},
		{"anthropic", `{"model_ratio":1,"group_ratio":1,"completion_ratio":2,"model_price":-1,"claude":true,"usage_semantic":"anthropic","cache_tokens":800,"cache_ratio":1.25,"cache_creation_tokens":100,"cache_creation_ratio":0.1,"cache_creation_tokens_5m":60,"cache_creation_ratio_5m":0.1,"cache_creation_tokens_1h":40,"cache_creation_ratio_1h":0.16}`, 100, 1312, 535},
		{"historical group and rounding", `{"model_ratio":1,"group_ratio":0.75,"completion_ratio":2,"model_price":-1,"cache_tokens":800,"cache_ratio":1.25,"cache_creation_tokens":100,"cache_creation_ratio":0.1}`, 1000, 983, 379},
		{"overlapping prefixes", `{"model_ratio":1,"group_ratio":1,"completion_ratio":2,"model_price":-1,"cache_tokens":800,"cache_ratio":1.25,"cache_creation_tokens":400,"cache_creation_ratio":0.1}`, 1000, 1240, 780},
	} {
		t.Run(tc.name, func(t *testing.T) {
			log := model.Log{ModelName: "historical-model", PromptTokens: tc.prompt, CompletionTokens: 100, Quota: tc.original, Other: tc.other}
			quota, other, _, err := RecalculateLogCorrection(&log, params)
			require.NoError(t, err)
			assert.Equal(t, tc.corrected, quota)
			var updated map[string]interface{}
			require.NoError(t, common.UnmarshalJsonStr(other, &updated))
			assert.Equal(t, read, updated["cache_ratio"])
			assert.Equal(t, write, updated["cache_creation_ratio"])
		})
	}
}

func TestRecalculateLogCorrectionReplaysTieredCachePriceCorrection(t *testing.T) {
	read, write := 0.1, 2.5
	expr := `len <= 272000 ? tier("standard", p * 2 + c * 10 + cr * 2.5) : tier("long_context", p * 4 + c * 20 + cr * 5)`
	other := map[string]any{
		"billing_mode":            "tiered_expr",
		"expr_b64":                base64.StdEncoding.EncodeToString([]byte(expr)),
		"matched_tier":            "standard",
		"group_ratio":             1.0,
		"cache_tokens":            4096,
		"route_line_billing_mode": "ratio",
		"route_line_ratio":        0.3,
	}
	data, err := common.Marshal(other)
	require.NoError(t, err)
	log := model.Log{ModelName: "gpt-6.1-sol", PromptTokens: 184351, CompletionTokens: 1732, Quota: 58211, Other: string(data)}
	quota, correctedOther, _, err := RecalculateLogCorrection(&log, LogCorrectionParameters{CacheRead: &read, CacheWrite: &write})
	require.NoError(t, err)
	assert.Equal(t, 56736, quota)
	assert.Equal(t, 1475, log.Quota-quota)
	var corrected map[string]any
	require.NoError(t, common.UnmarshalJsonStr(correctedOther, &corrected))
	correctedExprBytes, err := base64.StdEncoding.DecodeString(corrected["expr_b64"].(string))
	require.NoError(t, err)
	assert.Contains(t, string(correctedExprBytes), "cr * 0.1")
	assert.NotContains(t, string(correctedExprBytes), "cr * 2.5")
}

func TestRecalculateLogCorrectionRejectsUnreplayableLogs(t *testing.T) {
	read, write := 0.1, 1.25
	params := LogCorrectionParameters{CacheRead: &read, CacheWrite: &write}
	base := map[string]interface{}{"model_ratio": 1, "group_ratio": 1, "completion_ratio": 2, "model_price": -1, "cache_tokens": 800, "cache_ratio": 1.25, "cache_creation_tokens": 100, "cache_creation_ratio": 0.1}
	for _, tc := range []struct {
		key   string
		value interface{}
		quota int
	}{
		{"model_ratio", nil, 1310}, {"billing_mode", "tiered_expr", 1310},
		{"web_search", true, 1310}, {"usage_semantic", "unknown", 1310},
		{"cache_creation_tokens_1h", 50, 1310}, {"cache_tokens", -1, 1310},
		{"cache_ratio", 1.25, 1309},
	} {
		t.Run(tc.key, func(t *testing.T) {
			copy := map[string]interface{}{}
			for key, value := range base {
				copy[key] = value
			}
			copy[tc.key] = tc.value
			data, err := common.Marshal(copy)
			require.NoError(t, err)
			_, _, _, err = RecalculateLogCorrection(&model.Log{PromptTokens: 1000, CompletionTokens: 100, Quota: tc.quota, Other: string(data)}, params)
			require.Error(t, err)
		})
	}
}

func TestCorrectionPreservesUnrelatedJSONAndSubscriptionAllowances(t *testing.T) {
	read, write := 0.1, 1.25
	log := model.Log{ModelName: "test", PromptTokens: 1000, CompletionTokens: 100, Quota: 1310,
		Other: `{"model_ratio":1,"group_ratio":1,"completion_ratio":2,"model_price":-1,"cache_tokens":800,"cache_ratio":1.25,"cache_creation_tokens":100,"cache_creation_ratio":0.1,"billing_source":"subscription","subscription_consumed":1310,"subscription_used":9000,"subscription_remain":1000,"request_body":{"id":9007199254740993}}`}
	quota, other, _, err := RecalculateLogCorrection(&log, LogCorrectionParameters{CacheRead: &read, CacheWrite: &write})
	require.NoError(t, err)
	assert.Equal(t, 505, quota)
	assert.Contains(t, other, `"id":9007199254740993`)
	assert.Contains(t, other, `"subscription_consumed":505`)
	assert.Contains(t, other, `"subscription_used":9000`)
	assert.Contains(t, other, `"subscription_remain":1000`)
}

func setupCorrectionServiceTest(t *testing.T) (LogCorrectionParameters, *model.Log) {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	oldDB, oldLOG := model.DB, model.LOG_DB
	model.DB, model.LOG_DB = db, db
	t.Cleanup(func() { model.DB, model.LOG_DB = oldDB, oldLOG; sql, _ := db.DB(); _ = sql.Close() })
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.Token{}, &model.Channel{}, &model.Log{}, &model.QuotaData{},
		&model.UserMonthlyUsage{}, &model.LogCorrectionBatch{}, &model.LogCorrectionSnapshot{}, &model.LogCorrectionReceipt{}, &model.SystemTask{}, &model.SystemTaskLock{}))
	user := model.User{Username: "correction-test", UsedQuota: 5000, Quota: 10000}
	require.NoError(t, db.Create(&user).Error)
	at := time.Date(2026, 1, 10, 12, 30, 0, 0, time.UTC).Unix()
	log := &model.Log{UserId: user.Id, Username: user.Username, Type: model.LogTypeConsume, ModelName: "test", CreatedAt: at,
		PromptTokens: 1000, CompletionTokens: 100, Quota: 1310,
		Other: `{"model_ratio":1,"group_ratio":1,"completion_ratio":2,"model_price":-1,"cache_tokens":800,"cache_ratio":1.25,"cache_creation_tokens":100,"cache_creation_ratio":0.1}`}
	require.NoError(t, db.Create(log).Error)
	read, write := 0.1, 1.25
	return LogCorrectionParameters{UserID: user.Id, ModelName: log.ModelName, StartTime: at - 1, EndTime: at + 1, CacheRead: &read, CacheWrite: &write}, log
}

func runCorrectionTaskTest(t *testing.T, batch *model.LogCorrectionBatch) {
	t.Helper()
	fresh, err := model.GetLogCorrectionBatch(batch.ID)
	require.NoError(t, err)
	task, err := model.GetSystemTaskByTaskID(fresh.TaskID)
	require.NoError(t, err)
	claimed, ok, err := model.ClaimSystemTask(task.ID, model.SystemTaskTypeLogCorrection, "test-runner", time.Now().Unix()+60)
	require.NoError(t, err)
	require.True(t, ok)
	logCorrectionHandler{}.Run(context.Background(), claimed, "test-runner")
}

func TestCorrectionPreviewApplyAndRepeatedPreviewAreSafe(t *testing.T) {
	params, log := setupCorrectionServiceTest(t)
	// Different user, model, type and end-boundary logs are outside the selection.
	for _, excluded := range []model.Log{
		{UserId: log.UserId + 1, ModelName: log.ModelName, Type: log.Type, CreatedAt: log.CreatedAt},
		{UserId: log.UserId, ModelName: "other", Type: log.Type, CreatedAt: log.CreatedAt},
		{UserId: log.UserId, ModelName: log.ModelName, Type: model.LogTypeRefund, CreatedAt: log.CreatedAt},
		{UserId: log.UserId, ModelName: log.ModelName, Type: log.Type, CreatedAt: params.EndTime},
	} {
		require.NoError(t, model.DB.Create(&excluded).Error)
	}
	batch, err := StartLogCorrection(params, 99)
	require.NoError(t, err)
	runCorrectionTaskTest(t, batch)
	batch, err = model.GetLogCorrectionBatch(batch.ID)
	require.NoError(t, err)
	assert.Equal(t, "ready", batch.Status)
	var summary LogCorrectionSummary
	require.NoError(t, common.UnmarshalJsonStr(batch.Summary, &summary))
	assert.Equal(t, 1, summary.Matched)
	assert.Equal(t, int64(805), summary.Delta)
	var count int64
	require.NoError(t, model.DB.Model(&model.LogCorrectionSnapshot{}).Count(&count).Error)
	assert.Zero(t, count)
	require.NoError(t, ConfirmLogCorrection(batch, "prices corrected; wallet already restored", 99))
	runCorrectionTaskTest(t, batch)
	batch, err = model.GetLogCorrectionBatch(batch.ID)
	require.NoError(t, err)
	assert.Equal(t, "completed", batch.Status, batch.Error)
	var user model.User
	require.NoError(t, model.DB.First(&user, log.UserId).Error)
	assert.Equal(t, 10000, user.Quota)
	assert.Equal(t, 4195, user.UsedQuota)
	require.NoError(t, model.DB.Model(&model.LogCorrectionSnapshot{}).Count(&count).Error)
	assert.Equal(t, int64(1), count)
	repeated, err := StartLogCorrection(params, 99)
	require.NoError(t, err)
	runCorrectionTaskTest(t, repeated)
	repeated, err = model.GetLogCorrectionBatch(repeated.ID)
	require.NoError(t, err)
	require.NoError(t, common.UnmarshalJsonStr(repeated.Summary, &summary))
	assert.Zero(t, summary.Changes)
	require.NoError(t, model.DB.Model(&model.LogCorrectionSnapshot{}).Count(&count).Error)
	assert.Equal(t, int64(1), count)
}

func TestCorrectionConfirmationRejectsChangesSincePreview(t *testing.T) {
	params, log := setupCorrectionServiceTest(t)
	batch, err := StartLogCorrection(params, 99)
	require.NoError(t, err)
	runCorrectionTaskTest(t, batch)
	batch, err = model.GetLogCorrectionBatch(batch.ID)
	require.NoError(t, err)
	require.NoError(t, model.DB.Model(log).Update("content", "concurrent modification").Error)
	require.NoError(t, ConfirmLogCorrection(batch, "correction", 99))
	runCorrectionTaskTest(t, batch)
	batch, err = model.GetLogCorrectionBatch(batch.ID)
	require.NoError(t, err)
	assert.Equal(t, "failed", batch.Status)
	assert.Contains(t, batch.Error, "preview changed")
	var count int64
	require.NoError(t, model.DB.Model(&model.LogCorrectionSnapshot{}).Count(&count).Error)
	assert.Zero(t, count)
}

func TestCorrectionDoesNotIncreaseUnderchargedLog(t *testing.T) {
	params, log := setupCorrectionServiceTest(t)
	read := 2.0
	params.CacheRead = &read
	entry, _ := EvaluateLogCorrection(context.Background(), log, params)
	assert.Equal(t, "unchanged", entry.Status)
	assert.Greater(t, entry.Corrected, log.Quota)
	assert.Zero(t, entry.Delta)
}

func TestCorrectionRejectsInsufficientWholeBatchBeforeWriting(t *testing.T) {
	params, log := setupCorrectionServiceTest(t)
	second := *log
	second.Id = 0
	require.NoError(t, model.DB.Create(&second).Error)
	require.NoError(t, model.DB.Model(&model.User{}).Where("id = ?", log.UserId).Update("used_quota", 1500).Error)
	batch, err := StartLogCorrection(params, 99)
	require.NoError(t, err)
	runCorrectionTaskTest(t, batch)
	batch, err = model.GetLogCorrectionBatch(batch.ID)
	require.NoError(t, err)
	assert.Equal(t, "failed", batch.Status)
	assert.Contains(t, batch.Error, "complete correction batch")
	var count int64
	require.NoError(t, model.DB.Model(&model.LogCorrectionSnapshot{}).Count(&count).Error)
	assert.Zero(t, count)
}

func TestCorrectionResumesPartiallyCommittedApprovedBatch(t *testing.T) {
	params, log := setupCorrectionServiceTest(t)
	second := *log
	second.Id = 0
	require.NoError(t, model.DB.Create(&second).Error)
	batch, err := StartLogCorrection(params, 99)
	require.NoError(t, err)
	runCorrectionTaskTest(t, batch)
	batch, err = model.GetLogCorrectionBatch(batch.ID)
	require.NoError(t, err)
	entry, correctedOther := EvaluateLogCorrection(context.Background(), log, params)
	require.Equal(t, "change", entry.Status)
	batch.Reason = "interrupted batch"
	require.NoError(t, model.ApplyLogCorrection(context.Background(), batch, log, entry.Corrected, correctedOther, entry.Statistics))
	require.NoError(t, model.DB.Model(batch).Updates(map[string]interface{}{"apply_started": true, "status": "failed"}).Error)
	batch.ApplyStarted, batch.Status = true, "failed"
	require.NoError(t, ConfirmLogCorrection(batch, "resume interrupted batch", 99))
	runCorrectionTaskTest(t, batch)
	batch, err = model.GetLogCorrectionBatch(batch.ID)
	require.NoError(t, err)
	assert.Equal(t, "completed", batch.Status, batch.Error)
	var count int64
	require.NoError(t, model.DB.Model(&model.LogCorrectionSnapshot{}).Count(&count).Error)
	assert.Equal(t, int64(2), count)
	var user model.User
	require.NoError(t, model.DB.First(&user, log.UserId).Error)
	assert.Equal(t, 5000-805*2, user.UsedQuota)
	assert.Equal(t, 10000, user.Quota)
}
