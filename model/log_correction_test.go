package model

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupLogCorrectionTest(t *testing.T, separate bool) (*Log, *LogCorrectionBatch) {
	t.Helper()
	oldDB, oldLogDB := DB, LOG_DB
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	DB, LOG_DB = db, db
	require.NoError(t, DB.AutoMigrate(&User{}, &Token{}, &Channel{}, &QuotaData{}, &UserMonthlyUsage{}, &LogCorrectionReceipt{}, &Log{}, &LogCorrectionSnapshot{}))
	if separate {
		logDB, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
		require.NoError(t, err)
		LOG_DB = logDB
		require.NoError(t, LOG_DB.AutoMigrate(&Log{}, &LogCorrectionSnapshot{}))
	}
	t.Cleanup(func() {
		for _, db := range []*gorm.DB{DB, LOG_DB} {
			sqlDB, err := db.DB()
			if err == nil {
				_ = sqlDB.Close()
			}
		}
		DB, LOG_DB = oldDB, oldLogDB
	})
	user := User{Username: "correction-user", Quota: 9000, UsedQuota: 5000, RequestCount: 7}
	token := Token{UserId: 1, Key: "correction-token", RemainQuota: 8000, UsedQuota: 4000}
	channel := Channel{UsedQuota: 6000}
	require.NoError(t, DB.Create(&user).Error)
	token.UserId = user.Id
	require.NoError(t, DB.Create(&token).Error)
	require.NoError(t, DB.Create(&channel).Error)
	at := time.Date(2026, 1, 31, 15, 30, 0, 0, time.UTC).Unix()
	log := &Log{UserId: user.Id, Username: user.Username, Type: LogTypeConsume, ModelName: "test-model", CreatedAt: at,
		Quota: 1000, PromptTokens: 100, CompletionTokens: 20, TokenId: token.Id, ChannelId: channel.Id, Group: "vip", Other: `{"cache_ratio":1.25,"request_body":"preserved"}`}
	require.NoError(t, LOG_DB.Create(log).Error)
	require.NoError(t, DB.Create(&QuotaData{UserID: user.Id, Username: user.Username, ModelName: log.ModelName, CreatedAt: at - at%3600,
		UseGroup: log.Group, TokenID: token.Id, ChannelID: channel.Id, NodeName: "node-a", Count: 1, Quota: 1000, TokenUsed: 120}).Error)
	require.NoError(t, DB.Create(&UserMonthlyUsage{UserId: user.Id, Period: "2026-01", Timezone: "UTC",
		PeriodStart: time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC).Unix(), PeriodEnd: time.Date(2026, 2, 1, 0, 0, 0, 0, time.UTC).Unix(),
		WalletConsumedQuota: 1000, NetConsumedQuota: 1000, RequestCount: 1}).Error)
	return log, &LogCorrectionBatch{ID: "batch-a", UserID: user.Id, ModelName: log.ModelName, StartTime: at - 10, EndTime: at + 10, MaxLogID: log.Id, OperatorID: 99, Reason: "cache correction"}
}

func TestLogCorrectionChangesOnlyConsumptionAndKeepsSnapshot(t *testing.T) {
	log, batch := setupLogCorrectionTest(t, false)
	stats, err := ResolveLogCorrectionStatistics(context.Background(), log, 300, "", false)
	require.NoError(t, err)
	require.NoError(t, ApplyLogCorrection(context.Background(), batch, log, 700, `{"cache_ratio":0.1,"request_body":"preserved"}`, stats))
	// Retrying the same change must reuse its snapshot and receipt.
	require.NoError(t, ApplyLogCorrection(context.Background(), batch, log, 700, `{"cache_ratio":0.1,"request_body":"preserved"}`, stats))
	var user User
	var token Token
	var channel Channel
	var bucket QuotaData
	var month UserMonthlyUsage
	var current Log
	require.NoError(t, DB.First(&user, log.UserId).Error)
	require.NoError(t, DB.First(&token, log.TokenId).Error)
	require.NoError(t, DB.First(&channel, log.ChannelId).Error)
	require.NoError(t, DB.First(&bucket, stats.QuotaDataID).Error)
	require.NoError(t, DB.First(&month, stats.MonthlyID).Error)
	require.NoError(t, LOG_DB.First(&current, log.Id).Error)
	assert.Equal(t, 9000, user.Quota)
	assert.Equal(t, 4700, user.UsedQuota)
	assert.Equal(t, 7, user.RequestCount)
	assert.Equal(t, 8000, token.RemainQuota)
	assert.Equal(t, 3700, token.UsedQuota)
	assert.Equal(t, int64(5700), channel.UsedQuota)
	assert.Equal(t, 700, bucket.Quota)
	assert.Equal(t, 1, bucket.Count)
	assert.Equal(t, 120, bucket.TokenUsed)
	assert.Equal(t, int64(700), month.WalletConsumedQuota)
	assert.Equal(t, int64(700), month.NetConsumedQuota)
	assert.Zero(t, month.RefundQuota)
	assert.Equal(t, int64(1), month.RequestCount)
	assert.Equal(t, 700, current.Quota)
	assert.Equal(t, log.CreatedAt, current.CreatedAt)
	var snapshots []LogCorrectionSnapshot
	require.NoError(t, LOG_DB.Find(&snapshots).Error)
	require.Len(t, snapshots, 1)
	assert.Equal(t, "synced", snapshots[0].SyncStatus)
	assert.JSONEq(t, `{"cache_ratio":0.1}`, snapshots[0].CorrectedOther)
	var original Log
	require.NoError(t, common.UnmarshalJsonStr(string(snapshots[0].Original), &original))
	assert.Equal(t, *log, original)
}

func TestLogCorrectionRollsBackLogAndSnapshotOnStatisticsFailure(t *testing.T) {
	log, batch := setupLogCorrectionTest(t, false)
	stats, err := ResolveLogCorrectionStatistics(context.Background(), log, 300, "", false)
	require.NoError(t, err)
	require.NoError(t, DB.Model(&Token{}).Where("id = ?", log.TokenId).Update("used_quota", 100).Error)
	require.Error(t, ApplyLogCorrection(context.Background(), batch, log, 700, `{}`, stats))
	var current Log
	require.NoError(t, LOG_DB.First(&current, log.Id).Error)
	assert.Equal(t, 1000, current.Quota)
	for _, target := range []any{&LogCorrectionSnapshot{}, &LogCorrectionReceipt{}} {
		var count int64
		require.NoError(t, DB.Model(target).Count(&count).Error)
		assert.Zero(t, count)
	}
	var user User
	require.NoError(t, DB.First(&user, log.UserId).Error)
	assert.Equal(t, 5000, user.UsedQuota)
}

func TestLogCorrectionOutboxRecoversWithoutDuplicateStatistics(t *testing.T) {
	log, batch := setupLogCorrectionTest(t, true)
	stats, err := ResolveLogCorrectionStatistics(context.Background(), log, 300, "", false)
	require.NoError(t, err)
	require.NoError(t, DB.Model(&User{}).Where("id = ?", log.UserId).Update("used_quota", 100).Error)
	require.Error(t, ApplyLogCorrection(context.Background(), batch, log, 700, `{}`, stats))
	var snapshot LogCorrectionSnapshot
	require.NoError(t, LOG_DB.First(&snapshot).Error)
	assert.Equal(t, "pending", snapshot.SyncStatus)
	require.NoError(t, DB.Model(&User{}).Where("id = ?", log.UserId).Update("used_quota", 5000).Error)
	// Simulate a crash after main-DB commit but before the log-DB acknowledgement.
	require.NoError(t, DB.Transaction(func(tx *gorm.DB) error { return ApplyLogCorrectionStatistics(tx, &snapshot) }))
	require.NoError(t, SyncLogCorrectionSnapshot(context.Background(), &snapshot))
	require.NoError(t, SyncLogCorrectionSnapshot(context.Background(), &snapshot))
	var user User
	require.NoError(t, DB.First(&user, log.UserId).Error)
	assert.Equal(t, 4700, user.UsedQuota)
	assert.Equal(t, 9000, user.Quota)
	require.NoError(t, LOG_DB.First(&snapshot, snapshot.ID).Error)
	assert.Equal(t, "synced", snapshot.SyncStatus)
	var count int64
	require.NoError(t, DB.Model(&LogCorrectionReceipt{}).Count(&count).Error)
	assert.Equal(t, int64(1), count)
}

func TestLogCorrectionRejectsAmbiguousAndUnflushedDashboardData(t *testing.T) {
	log, _ := setupLogCorrectionTest(t, false)
	var bucket QuotaData
	require.NoError(t, DB.First(&bucket).Error)
	bucket.Id = 0
	bucket.NodeName = "node-b"
	require.NoError(t, DB.Create(&bucket).Error)
	_, err := ResolveLogCorrectionStatistics(context.Background(), log, 300, "", false)
	require.ErrorContains(t, err, "ambiguous")
	require.NoError(t, DB.Where("node_name = ?", "node-b").Delete(&QuotaData{}).Error)
	CacheQuotaDataLock.Lock()
	oldCache := CacheQuotaData
	CacheQuotaData = map[string]*QuotaData{"pending": {UserID: log.UserId, ModelName: log.ModelName, CreatedAt: log.CreatedAt - log.CreatedAt%3600}}
	CacheQuotaDataLock.Unlock()
	t.Cleanup(func() { CacheQuotaDataLock.Lock(); CacheQuotaData = oldCache; CacheQuotaDataLock.Unlock() })
	_, err = ResolveLogCorrectionStatistics(context.Background(), log, 300, "", false)
	require.ErrorContains(t, err, "pending cached usage")
}

func TestLogCorrectionRejectsChangedLogAndSelectionMismatch(t *testing.T) {
	log, batch := setupLogCorrectionTest(t, false)
	stats, err := ResolveLogCorrectionStatistics(context.Background(), log, 300, "", false)
	require.NoError(t, err)
	require.NoError(t, LOG_DB.Model(log).Update("content", "changed concurrently").Error)
	// Update mutates the local model as well; use the original preimage.
	log.Content = ""
	require.ErrorContains(t, ApplyLogCorrection(context.Background(), batch, log, 700, `{}`, stats), "changed after preview")
	batch.UserID++
	require.ErrorContains(t, ApplyLogCorrection(context.Background(), batch, log, 700, `{}`, stats), "selection")
	var count int64
	require.NoError(t, LOG_DB.Model(&LogCorrectionSnapshot{}).Count(&count).Error)
	assert.Zero(t, count)
}

func TestLogCorrectionMissingAggregatesAndDeletedAssociationsAreNotCreated(t *testing.T) {
	log, batch := setupLogCorrectionTest(t, false)
	require.NoError(t, DB.Where("1 = 1").Delete(&QuotaData{}).Error)
	require.NoError(t, DB.Where("1 = 1").Delete(&UserMonthlyUsage{}).Error)
	require.NoError(t, DB.Unscoped().Where("id = ?", log.TokenId).Delete(&Token{}).Error)
	require.NoError(t, DB.Where("id = ?", log.ChannelId).Delete(&Channel{}).Error)
	stats, err := ResolveLogCorrectionStatistics(context.Background(), log, 300, "", false)
	require.NoError(t, err)
	assert.Zero(t, stats.QuotaDataID)
	assert.Zero(t, stats.MonthlyID)
	assert.Zero(t, stats.TokenID)
	assert.Zero(t, stats.ChannelID)
	assert.Len(t, stats.Warnings, 4)
	require.NoError(t, ApplyLogCorrection(context.Background(), batch, log, 700, `{}`, stats))
	var count int64
	require.NoError(t, DB.Model(&QuotaData{}).Count(&count).Error)
	assert.Zero(t, count)
}

func TestLogCorrectionRejectsAggregateAppearingAfterPreview(t *testing.T) {
	log, batch := setupLogCorrectionTest(t, false)
	var bucket QuotaData
	require.NoError(t, DB.First(&bucket).Error)
	require.NoError(t, DB.Delete(&bucket).Error)
	stats, err := ResolveLogCorrectionStatistics(context.Background(), log, 300, "", false)
	require.NoError(t, err)
	assert.Zero(t, stats.QuotaDataID)
	require.NoError(t, DB.Create(&bucket).Error)
	require.ErrorContains(t, ApplyLogCorrectionFast(context.Background(), batch, log, 700, log.Other, stats), "changed after preview")
	var current Log
	require.NoError(t, LOG_DB.First(&current, log.Id).Error)
	assert.Equal(t, 1000, current.Quota)
}

func TestLogCorrectionIgnoresZeroUsageLogsInMonthlyRequestCount(t *testing.T) {
	log, _ := setupLogCorrectionTest(t, false)
	zeroUsage := *log
	zeroUsage.Id = 0
	zeroUsage.Quota = 0
	zeroUsage.PromptTokens = 0
	zeroUsage.CompletionTokens = 0
	require.NoError(t, LOG_DB.Create(&zeroUsage).Error)
	var bucket QuotaData
	require.NoError(t, DB.First(&bucket).Error)
	require.NoError(t, DB.Model(&bucket).Update("count", 2).Error)
	_, err := ResolveLogCorrectionStatistics(context.Background(), log, 300, "", false)
	require.NoError(t, err)
}

func TestLogCorrectionSubscriptionUsesOriginalMonthWithoutRefunding(t *testing.T) {
	log, batch := setupLogCorrectionTest(t, false)
	require.NoError(t, DB.Model(&UserMonthlyUsage{}).Where("user_id = ?", log.UserId).
		Updates(map[string]any{"wallet_consumed_quota": 0, "subscription_consumed_quota": 1000}).Error)
	require.NoError(t, LOG_DB.Model(log).Update("other", `{"billing_source":"subscription"}`).Error)
	log.Other = `{"billing_source":"subscription"}`
	stats, err := ResolveLogCorrectionStatistics(context.Background(), log, 300, "", true)
	require.NoError(t, err)
	require.NoError(t, ApplyLogCorrection(context.Background(), batch, log, 700, `{"billing_source":"subscription"}`, stats))
	var month UserMonthlyUsage
	require.NoError(t, DB.First(&month, stats.MonthlyID).Error)
	assert.Equal(t, "2026-01", month.Period)
	assert.Equal(t, int64(700), month.SubscriptionConsumedQuota)
	assert.Zero(t, month.WalletConsumedQuota)
	assert.Zero(t, month.RefundQuota)
}

func TestLogCorrectionResolvesRecordedNodesIndependently(t *testing.T) {
	log, _ := setupLogCorrectionTest(t, false)
	require.NoError(t, LOG_DB.Model(log).Update("other", `{"node_name":"node-a"}`).Error)
	log.Other = `{"node_name":"node-a"}`
	other := *log
	other.Id = 0
	other.Quota = 1500
	other.Other = `{"node_name":"node-b"}`
	require.NoError(t, LOG_DB.Create(&other).Error)
	require.NoError(t, DB.Model(&UserMonthlyUsage{}).Where("user_id = ?", log.UserId).
		Updates(map[string]any{"wallet_consumed_quota": 2500, "net_consumed_quota": 2500, "request_count": 2}).Error)
	var bucket QuotaData
	require.NoError(t, DB.First(&bucket).Error)
	bucket.Id = 0
	bucket.NodeName, bucket.Quota = "node-b", 1500
	require.NoError(t, DB.Create(&bucket).Error)
	stats, err := ResolveLogCorrectionStatistics(context.Background(), log, 300, "node-a", false)
	require.NoError(t, err)
	assert.NotEqual(t, bucket.Id, stats.QuotaDataID)
	_, err = ResolveLogCorrectionStatistics(context.Background(), log, 300, "", false)
	require.ErrorContains(t, err, "ambiguous")
}

func TestLogCorrectionDoesNotTouchOtherLogsInTheSameHourBucket(t *testing.T) {
	log, batch := setupLogCorrectionTest(t, false)
	other := *log
	other.Id, other.Quota = 0, 500
	require.NoError(t, LOG_DB.Create(&other).Error)
	require.NoError(t, DB.Model(&UserMonthlyUsage{}).Where("user_id = ?", log.UserId).
		Updates(map[string]any{"wallet_consumed_quota": 1500, "net_consumed_quota": 1500, "request_count": 2}).Error)
	require.NoError(t, DB.Model(&QuotaData{}).Where("user_id = ?", log.UserId).
		Updates(map[string]any{"quota": 1500, "count": 2, "token_used": 240}).Error)
	stats, err := ResolveLogCorrectionStatistics(context.Background(), log, 300, "", false)
	require.NoError(t, err)
	require.NoError(t, ApplyLogCorrection(context.Background(), batch, log, 700, `{}`, stats))
	var bucket QuotaData
	require.NoError(t, DB.First(&bucket, stats.QuotaDataID).Error)
	assert.Equal(t, 1200, bucket.Quota)
	assert.Equal(t, 2, bucket.Count)
	assert.Equal(t, 240, bucket.TokenUsed)
	require.NoError(t, LOG_DB.First(&other, other.Id).Error)
	assert.Equal(t, 500, other.Quota)
}

func TestLogCorrectionRejectsInconsistentMonthlyUsage(t *testing.T) {
	log, _ := setupLogCorrectionTest(t, false)
	require.NoError(t, DB.Model(&UserMonthlyUsage{}).Where("user_id = ?", log.UserId).
		Updates(map[string]any{"wallet_consumed_quota": 2000, "net_consumed_quota": 2000}).Error)
	_, err := ResolveLogCorrectionStatistics(context.Background(), log, 300, "", false)
	require.ErrorContains(t, err, "monthly aggregate does not match")
}

func TestLogCorrectionRechecksAggregatesAtCommit(t *testing.T) {
	log, batch := setupLogCorrectionTest(t, false)
	stats, err := ResolveLogCorrectionStatistics(context.Background(), log, 300, "", false)
	require.NoError(t, err)
	require.NoError(t, DB.Model(&QuotaData{}).Where("id = ?", stats.QuotaDataID).Update("quota", 1100).Error)
	require.ErrorContains(t, ApplyLogCorrection(context.Background(), batch, log, 700, `{}`, stats), "does not match")
	var current Log
	require.NoError(t, LOG_DB.First(&current, log.Id).Error)
	assert.Equal(t, 1000, current.Quota)
	var count int64
	require.NoError(t, LOG_DB.Model(&LogCorrectionSnapshot{}).Count(&count).Error)
	assert.Zero(t, count)
}

func TestLogCorrectionAcrossHoursAndMonthsKeepsOtherPeriods(t *testing.T) {
	log, batch := setupLogCorrectionTest(t, false)
	second := *log
	second.Id = 0
	second.CreatedAt = time.Date(2026, 2, 1, 0, 15, 0, 0, time.UTC).Unix()
	require.NoError(t, LOG_DB.Create(&second).Error)
	secondBucket := QuotaData{UserID: log.UserId, Username: log.Username, ModelName: log.ModelName,
		CreatedAt: second.CreatedAt - second.CreatedAt%3600, UseGroup: log.Group,
		TokenID: log.TokenId, ChannelID: log.ChannelId, Count: 1, Quota: 1000, TokenUsed: 120}
	require.NoError(t, DB.Create(&secondBucket).Error)
	february := UserMonthlyUsage{UserId: log.UserId, Period: "2026-02", Timezone: "UTC",
		PeriodStart:         time.Date(2026, 2, 1, 0, 0, 0, 0, time.UTC).Unix(),
		PeriodEnd:           time.Date(2026, 3, 1, 0, 0, 0, 0, time.UTC).Unix(),
		WalletConsumedQuota: 1000, NetConsumedQuota: 1000, RequestCount: 1}
	require.NoError(t, DB.Create(&february).Error)
	batch.EndTime, batch.MaxLogID = second.CreatedAt+1, second.Id
	firstStats, err := ResolveLogCorrectionStatistics(context.Background(), log, 300, "", false)
	require.NoError(t, err)
	secondStats, err := ResolveLogCorrectionStatistics(context.Background(), &second, 300, "", false)
	require.NoError(t, err)
	assert.NotEqual(t, firstStats.QuotaDataID, secondStats.QuotaDataID)
	assert.NotEqual(t, firstStats.MonthlyID, secondStats.MonthlyID)
	require.NoError(t, ApplyLogCorrection(context.Background(), batch, log, 700, log.Other, firstStats))
	require.NoError(t, ApplyLogCorrection(context.Background(), batch, &second, 700, second.Other, secondStats))
	var periods []UserMonthlyUsage
	require.NoError(t, DB.Order("period").Find(&periods).Error)
	require.Len(t, periods, 2)
	for _, period := range periods {
		assert.Equal(t, int64(700), period.WalletConsumedQuota)
		assert.Equal(t, int64(700), period.NetConsumedQuota)
		assert.Equal(t, int64(1), period.RequestCount)
		assert.Zero(t, period.RefundQuota)
	}
	var user User
	require.NoError(t, DB.First(&user, log.UserId).Error)
	assert.Equal(t, 4400, user.UsedQuota)
	assert.Equal(t, 9000, user.Quota)
}

func TestLogCorrectionPreservesConcurrentCounterIncrementsAndSurvivesCleanup(t *testing.T) {
	log, batch := setupLogCorrectionTest(t, false)
	stats, err := ResolveLogCorrectionStatistics(context.Background(), log, 300, "", false)
	require.NoError(t, err)
	// New settled traffic can increase counters between preview and execution.
	for _, target := range []struct {
		row any
		id  int
	}{
		{&User{}, log.UserId}, {&Token{}, log.TokenId}, {&Channel{}, log.ChannelId},
	} {
		require.NoError(t, DB.Model(target.row).Where("id = ?", target.id).Update("used_quota", gorm.Expr("used_quota + ?", 200)).Error)
	}
	require.NoError(t, ApplyLogCorrection(context.Background(), batch, log, 700, log.Other, stats))
	var user User
	var token Token
	var channel Channel
	require.NoError(t, DB.First(&user, log.UserId).Error)
	require.NoError(t, DB.First(&token, log.TokenId).Error)
	require.NoError(t, DB.First(&channel, log.ChannelId).Error)
	assert.Equal(t, 4900, user.UsedQuota)
	assert.Equal(t, 3900, token.UsedQuota)
	assert.Equal(t, int64(5900), channel.UsedQuota)
	assert.Equal(t, 9000, user.Quota)
	assert.Equal(t, 8000, token.RemainQuota)
	deleted, err := DeleteOldLogBatch(context.Background(), log.CreatedAt+1, 100)
	require.NoError(t, err)
	assert.Equal(t, int64(1), deleted)
	var count int64
	require.NoError(t, LOG_DB.Model(&LogCorrectionSnapshot{}).Count(&count).Error)
	assert.Equal(t, int64(1), count)
}

func TestLogCorrectionKeepsCompleteLargeOriginalEvidence(t *testing.T) {
	log, batch := setupLogCorrectionTest(t, false)
	body := strings.Repeat(`"`, 20*1024)
	before, err := common.Marshal(map[string]any{"cache_ratio": 1.25, "request_body": body})
	require.NoError(t, err)
	after, err := common.Marshal(map[string]any{"cache_ratio": 0.1, "request_body": body})
	require.NoError(t, err)
	log.Other = string(before)
	require.NoError(t, LOG_DB.Model(log).Update("other", log.Other).Error)
	stats, err := ResolveLogCorrectionStatistics(context.Background(), log, 300, "", false)
	require.NoError(t, err)
	require.NoError(t, ApplyLogCorrection(context.Background(), batch, log, 700, string(after), stats))
	var snapshot LogCorrectionSnapshot
	require.NoError(t, LOG_DB.First(&snapshot).Error)
	assert.Greater(t, len(snapshot.Original), 65535)
	var original Log
	require.NoError(t, common.UnmarshalJsonStr(string(snapshot.Original), &original))
	assert.Equal(t, *log, original)
	assert.JSONEq(t, `{"cache_ratio":0.1}`, snapshot.CorrectedOther)
}
