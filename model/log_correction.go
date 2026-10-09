package model

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"gorm.io/gorm/schema"
)

const SystemTaskTypeLogCorrection = "log_correction"

type logCorrectionText string

func (logCorrectionText) GormDBDataType(db *gorm.DB, _ *schema.Field) string {
	if db.Dialector.Name() == "mysql" {
		return "longtext"
	}
	return "text"
}

type LogCorrectionBatch struct {
	ID           string            `json:"id" gorm:"type:varchar(64);primaryKey"`
	UserID       int               `json:"user_id" gorm:"index"`
	ModelName    string            `json:"model_name" gorm:"type:varchar(255)"`
	StartTime    int64             `json:"start_time"`
	EndTime      int64             `json:"end_time"`
	MaxLogID     int               `json:"max_log_id"`
	Parameters   string            `json:"parameters" gorm:"type:text"`
	Status       string            `json:"status" gorm:"type:varchar(24);index"`
	TaskID       string            `json:"task_id" gorm:"type:varchar(64)"`
	Summary      string            `json:"summary" gorm:"type:text"`
	Fingerprint  string            `json:"fingerprint" gorm:"type:varchar(64)"`
	Approval     logCorrectionText `json:"-"`
	Reason       string            `json:"reason" gorm:"type:text"`
	Error        string            `json:"error" gorm:"type:text"`
	OperatorID   int               `json:"operator_id"`
	ApplyStarted bool              `json:"apply_started"`
	CreatedAt    int64             `json:"created_at" gorm:"autoCreateTime"`
	UpdatedAt    int64             `json:"updated_at" gorm:"autoUpdateTime"`
}

type LogCorrectionSnapshot struct {
	ID             int64             `json:"id"`
	BatchID        string            `json:"batch_id" gorm:"type:varchar(64);uniqueIndex:idx_log_correction_batch_log,priority:1;index"`
	LogID          int               `json:"log_id" gorm:"uniqueIndex:idx_log_correction_batch_log,priority:2;index"`
	UserID         int               `json:"user_id" gorm:"index"`
	ModelName      string            `json:"model_name" gorm:"type:varchar(255)"`
	LogCreatedAt   int64             `json:"log_created_at" gorm:"index"`
	Original       logCorrectionText `json:"original"`
	CorrectedQuota int               `json:"corrected_quota"`
	CorrectedOther string            `json:"corrected_other" gorm:"type:text"`
	Delta          int               `json:"delta"`
	Statistics     string            `json:"statistics" gorm:"type:text"`
	SyncStatus     string            `json:"sync_status" gorm:"type:varchar(24);index"`
	OperatorID     int               `json:"operator_id"`
	Reason         string            `json:"reason" gorm:"type:text"`
	CreatedAt      int64             `json:"created_at" gorm:"autoCreateTime"`
}

// A small main-database receipt makes replaying a log-database outbox idempotent.
type LogCorrectionReceipt struct {
	ID        int64
	BatchID   string `gorm:"type:varchar(64);uniqueIndex:idx_log_correction_receipt,priority:1"`
	LogID     int    `gorm:"uniqueIndex:idx_log_correction_receipt,priority:2"`
	CreatedAt int64  `gorm:"autoCreateTime"`
}

type LogCorrectionStatistics struct {
	UserID       int      `json:"user_id"`
	TokenID      int      `json:"token_id"`
	ChannelID    int      `json:"channel_id"`
	QuotaDataID  int      `json:"quota_data_id"`
	MonthlyID    int64    `json:"monthly_id"`
	Subscription bool     `json:"subscription"`
	Delta        int      `json:"delta"`
	Warnings     []string `json:"warnings,omitempty"`
}

func LogCorrectionQuery(db *gorm.DB, batch *LogCorrectionBatch) *gorm.DB {
	query := db.Model(&Log{}).Where("user_id = ? AND type = ? AND created_at >= ? AND created_at < ? AND id <= ?",
		batch.UserID, LogTypeConsume, batch.StartTime, batch.EndTime, batch.MaxLogID)
	if common.UsingLogDatabase(common.DatabaseTypeMySQL) {
		return query.Where("BINARY model_name = BINARY ?", batch.ModelName)
	}
	return query.Where("model_name = ?", batch.ModelName)
}

func GetLogCorrectionBatch(id string) (*LogCorrectionBatch, error) {
	var batch LogCorrectionBatch
	err := DB.Where("id = ?", id).First(&batch).Error
	return &batch, err
}

func QueueLogCorrection(batch *LogCorrectionBatch, action string) error {
	payload, err := common.Marshal(map[string]string{"batch_id": batch.ID, "action": action})
	if err != nil {
		return err
	}
	taskID, err := GenerateSystemTaskID()
	if err != nil {
		return err
	}
	return DB.Transaction(func(tx *gorm.DB) error {
		activeKey := SystemTaskTypeLogCorrection
		task := SystemTask{
			TaskID: taskID, Type: activeKey, Status: SystemTaskStatusPending,
			ActiveKey: &activeKey, Payload: string(payload), State: "null", Result: "null",
		}
		if err := tx.Create(&task).Error; err != nil {
			return errors.New("another log correction task is active")
		}
		if action == "preview" {
			batch.TaskID = taskID
			batch.Status = "previewing"
			return tx.Create(batch).Error
		}
		result := tx.Model(&LogCorrectionBatch{}).
			Where("id = ? AND status IN ?", batch.ID, []string{"ready", "failed"}).
			Updates(map[string]any{"task_id": taskID, "status": "applying", "error": "", "reason": batch.Reason, "operator_id": batch.OperatorID})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return errors.New("correction batch is not ready")
		}
		return nil
	})
}

// Resolve historical aggregates without inventing missing rows or guessing a node.
func ResolveLogCorrectionStatistics(ctx context.Context, log *Log, delta int, node string, subscription bool) (LogCorrectionStatistics, error) {
	stats := LogCorrectionStatistics{UserID: log.UserId, TokenID: log.TokenId, ChannelID: log.ChannelId, Delta: delta, Subscription: subscription}
	hour := log.CreatedAt - log.CreatedAt%3600
	if hour >= time.Now().Unix()-time.Now().Unix()%3600 {
		return stats, errors.New("current hour has not finished")
	}
	CacheQuotaDataLock.Lock()
	pending := false
	for _, bucket := range CacheQuotaData {
		if bucket.UserID == log.UserId && bucket.ModelName == log.ModelName && bucket.CreatedAt == hour {
			pending = true
			break
		}
	}
	CacheQuotaDataLock.Unlock()
	if pending {
		return stats, errors.New("dashboard bucket has pending cached usage")
	}
	query := DB.WithContext(ctx).Where("user_id = ? AND username = ? AND model_name = ? AND created_at = ? AND use_group = ? AND token_id = ? AND channel_id = ?",
		log.UserId, log.Username, log.ModelName, hour, log.Group, log.TokenId, log.ChannelId)
	if node != "" {
		query = query.Where("node_name = ?", node)
	}
	var buckets []QuotaData
	if err := query.Find(&buckets).Error; err != nil {
		return stats, err
	}
	if len(buckets) > 1 {
		return stats, errors.New("dashboard bucket is ambiguous")
	}
	if len(buckets) == 0 {
		// A legacy bucket with fewer dimensions must not be mistaken for no data.
		var count int64
		if err := DB.WithContext(ctx).Model(&QuotaData{}).
			Where("user_id = ? AND model_name = ? AND created_at = ?", log.UserId, log.ModelName, hour).
			Count(&count).Error; err != nil {
			return stats, err
		}
		if count > 0 {
			return stats, errors.New("dashboard dimensions do not match the log")
		}
		stats.Warnings = append(stats.Warnings, "dashboard aggregate is absent")
	} else {
		bucket := buckets[0]
		if err := validateLogCorrectionDashboard(ctx, DB, LOG_DB, log, &bucket, node); err != nil {
			return stats, err
		}
		if bucket.Quota < delta {
			return stats, errors.New("dashboard quota would become negative")
		}
		stats.QuotaDataID = bucket.Id
	}

	var periods []UserMonthlyUsage
	if err := DB.WithContext(ctx).Where("user_id = ? AND period_start <= ? AND period_end > ?", log.UserId, log.CreatedAt, log.CreatedAt).Find(&periods).Error; err != nil {
		return stats, err
	}
	if len(periods) > 1 {
		return stats, errors.New("monthly accounting period is ambiguous")
	}
	if len(periods) == 0 {
		stats.Warnings = append(stats.Warnings, "monthly aggregate is absent")
	} else {
		period := periods[0]
		if err := validateLogCorrectionMonth(ctx, DB, LOG_DB, &period); err != nil {
			return stats, err
		}
		consumed := period.WalletConsumedQuota
		if subscription {
			consumed = period.SubscriptionConsumedQuota
		}
		if consumed < int64(delta) || period.NetConsumedQuota < int64(delta) {
			return stats, errors.New("monthly consumed quota is insufficient")
		}
		stats.MonthlyID = period.Id
	}
	for _, target := range []struct {
		model any
		id    int
		label string
	}{
		{&User{}, stats.UserID, "user"}, {&Token{}, stats.TokenID, "token"}, {&Channel{}, stats.ChannelID, "channel"},
	} {
		if target.id == 0 {
			continue
		}
		var row struct{ UsedQuota int64 }
		result := DB.WithContext(ctx).Model(target.model).Where("id = ?", target.id).Select("used_quota").Scan(&row)
		if result.Error != nil {
			return stats, result.Error
		}
		if result.RowsAffected == 0 {
			if target.label == "user" {
				return stats, errors.New("user does not exist")
			}
			stats.Warnings = append(stats.Warnings, target.label+" was deleted")
			if target.label == "token" {
				stats.TokenID = 0
			} else {
				stats.ChannelID = 0
			}
			continue
		}
		if row.UsedQuota < int64(delta) {
			return stats, fmt.Errorf("%s consumed quota is insufficient", target.label)
		}
	}
	return stats, nil
}

type logCorrectionPendingTotals struct {
	Dashboard, Wallet, Subscription int64
}

type logCorrectionVerificationKey struct{}

type logCorrectionDashboardKey struct {
	Bucket QuotaData
	Node   string
}

type logCorrectionVerificationCache struct {
	Dashboard map[logCorrectionDashboardKey]error
	Monthly   map[UserMonthlyUsage]error
}

// Scope aggregate verification to one read-only scan. Execution transactions
// never reuse it, and changed aggregate values select a different cache entry.
func WithLogCorrectionVerificationCache(ctx context.Context) context.Context {
	return context.WithValue(ctx, logCorrectionVerificationKey{}, &logCorrectionVerificationCache{
		Dashboard: make(map[logCorrectionDashboardKey]error),
		Monthly:   make(map[UserMonthlyUsage]error),
	})
}

// Unacknowledged outbox rows already changed logs. Add only deltas without a
// main-database receipt when comparing those logs to unsynchronized aggregates.
func logCorrectionPendingStatistics(ctx context.Context, mainDB, logDB *gorm.DB, userID int, start, end int64, dashboardID int, monthlyID int64) (logCorrectionPendingTotals, error) {
	var totals logCorrectionPendingTotals
	lastID := int64(0)
	for {
		var snapshots []LogCorrectionSnapshot
		if err := logDB.WithContext(ctx).Select("id", "batch_id", "log_id", "statistics").
			Where("user_id = ? AND log_created_at >= ? AND log_created_at < ? AND sync_status = ? AND id > ?", userID, start, end, "pending", lastID).
			Order("id").Limit(250).Find(&snapshots).Error; err != nil {
			return totals, err
		}
		if len(snapshots) == 0 {
			return totals, nil
		}
		for _, snapshot := range snapshots {
			lastID = snapshot.ID
			var receipt LogCorrectionReceipt
			result := mainDB.WithContext(ctx).Where("batch_id = ? AND log_id = ?", snapshot.BatchID, snapshot.LogID).Limit(1).Find(&receipt)
			if result.Error != nil {
				return totals, result.Error
			}
			if result.RowsAffected != 0 {
				continue
			}
			var stats LogCorrectionStatistics
			if err := common.UnmarshalJsonStr(snapshot.Statistics, &stats); err != nil {
				return totals, err
			}
			if dashboardID != 0 && stats.QuotaDataID == dashboardID {
				totals.Dashboard += int64(stats.Delta)
			}
			if monthlyID != 0 && stats.MonthlyID == monthlyID {
				if stats.Subscription {
					totals.Subscription += int64(stats.Delta)
				} else {
					totals.Wallet += int64(stats.Delta)
				}
			}
		}
	}
}

func validateLogCorrectionDashboardIdentity(log *Log, bucket *QuotaData, node string) error {
	hour := log.CreatedAt - log.CreatedAt%3600
	if bucket.UserID != log.UserId || bucket.Username != log.Username || bucket.ModelName != log.ModelName ||
		bucket.CreatedAt != hour || bucket.UseGroup != log.Group || bucket.TokenID != log.TokenId || bucket.ChannelID != log.ChannelId ||
		(node != "" && bucket.NodeName != node) {
		return errors.New("dashboard dimensions do not match the log")
	}
	return nil
}

func validateLogCorrectionDashboard(ctx context.Context, mainDB, logDB *gorm.DB, log *Log, bucket *QuotaData, node string) (err error) {
	hour := log.CreatedAt - log.CreatedAt%3600
	if err := validateLogCorrectionDashboardIdentity(log, bucket, node); err != nil {
		return err
	}
	query := mainDB.WithContext(ctx).Model(&QuotaData{}).
		Where("user_id = ? AND username = ? AND model_name = ? AND created_at = ? AND use_group = ? AND token_id = ? AND channel_id = ?",
			log.UserId, log.Username, log.ModelName, hour, log.Group, log.TokenId, log.ChannelId)
	if node != "" {
		query = query.Where("node_name = ?", node)
	}
	var buckets int64
	if err := query.Count(&buckets).Error; err != nil {
		return err
	}
	if buckets != 1 {
		return errors.New("dashboard bucket is ambiguous")
	}
	if cache, ok := ctx.Value(logCorrectionVerificationKey{}).(*logCorrectionVerificationCache); ok {
		key := logCorrectionDashboardKey{Bucket: *bucket, Node: node}
		if cached, exists := cache.Dashboard[key]; exists {
			return cached
		}
		defer func() { cache.Dashboard[key] = err }()
	}
	var quota, count, tokens int64
	lastID := 0
	for {
		var logs []Log
		query := logDB.WithContext(ctx).Model(&Log{}).
			Where("user_id = ? AND username = ? AND model_name = ? AND type = ? AND created_at >= ? AND created_at < ? AND token_id = ? AND channel_id = ? AND id > ?",
				log.UserId, log.Username, log.ModelName, LogTypeConsume, hour, hour+3600, log.TokenId, log.ChannelId, lastID).
			Where(map[string]any{"group": log.Group})
		if err := query.Select("id", "quota", "prompt_tokens", "completion_tokens", "other").Order("id").Limit(250).Find(&logs).Error; err != nil {
			return err
		}
		if len(logs) == 0 {
			break
		}
		for _, item := range logs {
			lastID = item.Id
			if node != "" {
				var origin struct {
					NodeName string `json:"node_name"`
				}
				if err := common.UnmarshalJsonStr(item.Other, &origin); err != nil {
					return err
				}
				if origin.NodeName == "" {
					return errors.New("dashboard node is missing from historical logs")
				}
				if origin.NodeName != node {
					continue
				}
			}
			quota += int64(item.Quota)
			count++
			tokens += int64(item.PromptTokens) + int64(item.CompletionTokens)
		}
	}
	pending, err := logCorrectionPendingStatistics(ctx, mainDB, logDB, log.UserId, hour, hour+3600, bucket.Id, 0)
	if err != nil {
		return err
	}
	if quota+pending.Dashboard != int64(bucket.Quota) || count != int64(bucket.Count) || tokens != int64(bucket.TokenUsed) {
		return errors.New("dashboard aggregate does not match persisted logs")
	}
	return nil
}

func validateLogCorrectionMonth(ctx context.Context, mainDB, logDB *gorm.DB, period *UserMonthlyUsage) (err error) {
	if cache, ok := ctx.Value(logCorrectionVerificationKey{}).(*logCorrectionVerificationCache); ok {
		if cached, exists := cache.Monthly[*period]; exists {
			return cached
		}
		defer func() { cache.Monthly[*period] = err }()
	}
	var wallet, subscription, requests int64
	lastID := 0
	for {
		var logs []Log
		if err := logDB.WithContext(ctx).Select("id", "quota", "other").
			Where("user_id = ? AND type = ? AND created_at >= ? AND created_at < ? AND id > ?", period.UserId, LogTypeConsume, period.PeriodStart, period.PeriodEnd, lastID).
			Order("id").Limit(250).Find(&logs).Error; err != nil {
			return err
		}
		if len(logs) == 0 {
			break
		}
		for _, log := range logs {
			lastID = log.Id
			// The production settlement path does not record zero-usage
			// requests in monthly accounting, although it keeps the log.
			if log.Quota == 0 {
				continue
			}
			var pricing struct {
				Source string `json:"billing_source"`
			}
			if err := common.UnmarshalJsonStr(log.Other, &pricing); err != nil {
				return errors.New("monthly aggregate cannot be verified")
			}
			switch pricing.Source {
			case "", "wallet":
				wallet += int64(log.Quota)
			case "subscription":
				subscription += int64(log.Quota)
			default:
				return errors.New("monthly aggregate cannot be verified")
			}
			requests++
		}
	}
	pending, err := logCorrectionPendingStatistics(ctx, mainDB, logDB, period.UserId, period.PeriodStart, period.PeriodEnd, 0, period.Id)
	if err != nil {
		return err
	}
	if wallet+pending.Wallet != period.WalletConsumedQuota || subscription+pending.Subscription != period.SubscriptionConsumedQuota ||
		requests != period.RequestCount || period.WalletConsumedQuota+period.SubscriptionConsumedQuota-period.RefundQuota != period.NetConsumedQuota {
		return errors.New("monthly aggregate does not match persisted logs")
	}
	return nil
}

func ValidateLogCorrectionTotals(ctx context.Context, totals map[string]map[int64]int64) error {
	targets := map[string]struct {
		model  any
		column string
	}{
		"user": {&User{}, "used_quota"}, "token": {&Token{}, "used_quota"},
		"channel": {&Channel{}, "used_quota"}, "dashboard": {&QuotaData{}, "quota"},
		"monthly_wallet":       {&UserMonthlyUsage{}, "wallet_consumed_quota"},
		"monthly_subscription": {&UserMonthlyUsage{}, "subscription_consumed_quota"},
		"monthly_net":          {&UserMonthlyUsage{}, "net_consumed_quota"},
	}
	for kind, rows := range totals {
		target := targets[kind]
		for id, delta := range rows {
			var count int64
			if err := DB.WithContext(ctx).Model(target.model).Where("id = ? AND "+target.column+" >= ?", id, delta).Count(&count).Error; err != nil {
				return err
			}
			if count != 1 {
				return fmt.Errorf("%s aggregate is insufficient for the complete correction batch", kind)
			}
		}
	}
	return nil
}

func ApplyLogCorrectionStatistics(tx *gorm.DB, snapshot *LogCorrectionSnapshot) error {
	return applyLogCorrectionStatistics(tx, snapshot, true)
}

// ApplyLogCorrectionStatisticsFast is used after the complete batch has been
// rescanned and its aggregate targets have been verified. It keeps the
// per-row locks and nonnegative checks but avoids rescanning the same hour or
// month for every corrected log.
func ApplyLogCorrectionStatisticsFast(tx *gorm.DB, snapshot *LogCorrectionSnapshot) error {
	return applyLogCorrectionStatistics(tx, snapshot, false)
}

func applyLogCorrectionStatistics(tx *gorm.DB, snapshot *LogCorrectionSnapshot, validateAggregates bool) error {
	var stats LogCorrectionStatistics
	if err := common.UnmarshalJsonStr(snapshot.Statistics, &stats); err != nil {
		return err
	}
	if stats.Delta <= 0 || stats.Delta != snapshot.Delta || stats.UserID != snapshot.UserID {
		return errors.New("invalid correction statistics")
	}
	receipt := LogCorrectionReceipt{BatchID: snapshot.BatchID, LogID: snapshot.LogID}
	var existing LogCorrectionReceipt
	result := tx.Where("batch_id = ? AND log_id = ?", snapshot.BatchID, snapshot.LogID).Limit(1).Find(&existing)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected != 0 {
		return nil
	}
	// Serialize receipts by user, including MySQL connections using clientFoundRows.
	var user User
	if err := lockForUpdate(tx).Where("id = ?", stats.UserID).First(&user).Error; err != nil {
		return err
	}
	result = lockForUpdate(tx).Where("batch_id = ? AND log_id = ?", snapshot.BatchID, snapshot.LogID).Limit(1).Find(&existing)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected != 0 {
		return nil
	}
	var original Log
	if err := common.UnmarshalJsonStr(string(snapshot.Original), &original); err != nil {
		return err
	}
	logDB := LOG_DB
	if LOG_DB == DB {
		logDB = tx
	}
	if stats.QuotaDataID != 0 {
		var bucket QuotaData
		if err := lockForUpdate(tx).First(&bucket, stats.QuotaDataID).Error; err != nil {
			return err
		}
		var origin struct {
			NodeName string `json:"node_name"`
		}
		if err := common.UnmarshalJsonStr(original.Other, &origin); err != nil {
			return err
		}
		if err := validateLogCorrectionDashboardIdentity(&original, &bucket, origin.NodeName); err != nil {
			return err
		}
		if validateAggregates {
			if err := validateLogCorrectionDashboard(tx.Statement.Context, tx, logDB, &original, &bucket, origin.NodeName); err != nil {
				return err
			}
		}
	} else {
		if err := rejectAppearedLogCorrectionDashboard(tx, &original); err != nil {
			return err
		}
	}
	if stats.MonthlyID != 0 {
		var period UserMonthlyUsage
		if err := lockForUpdate(tx).First(&period, stats.MonthlyID).Error; err != nil {
			return err
		}
		if period.UserId != stats.UserID || original.CreatedAt < period.PeriodStart || original.CreatedAt >= period.PeriodEnd {
			return errors.New("monthly accounting period is ambiguous")
		}
		if validateAggregates {
			if err := validateLogCorrectionMonth(tx.Statement.Context, tx, logDB, &period); err != nil {
				return err
			}
		}
	} else if err := rejectAppearedLogCorrectionMonth(tx, &original); err != nil {
		return err
	}
	for _, target := range []struct {
		model any
		id    int
	}{
		{&User{}, stats.UserID}, {&Token{}, stats.TokenID}, {&Channel{}, stats.ChannelID},
	} {
		if target.id == 0 {
			continue
		}
		result := tx.Model(target.model).Where("id = ? AND used_quota >= ?", target.id, stats.Delta).
			Update("used_quota", gorm.Expr("used_quota - ?", stats.Delta))
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			if _, ok := target.model.(*User); !ok {
				var count int64
				if err := tx.Model(target.model).Where("id = ?", target.id).Count(&count).Error; err != nil {
					return err
				}
				if count == 0 {
					continue
				}
			}
			return errors.New("consumption counter changed or is insufficient")
		}
	}
	if stats.QuotaDataID != 0 {
		result := tx.Model(&QuotaData{}).Where("id = ? AND quota >= ?", stats.QuotaDataID, stats.Delta).
			Update("quota", gorm.Expr("quota - ?", stats.Delta))
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return errors.New("dashboard aggregate changed or is insufficient")
		}
	}
	if stats.MonthlyID != 0 {
		column := "wallet_consumed_quota"
		if stats.Subscription {
			column = "subscription_consumed_quota"
		}
		result := tx.Model(&UserMonthlyUsage{}).Where("id = ? AND "+column+" >= ? AND net_consumed_quota >= ?", stats.MonthlyID, stats.Delta, stats.Delta).
			Updates(map[string]any{column: gorm.Expr(column+" - ?", stats.Delta), "net_consumed_quota": gorm.Expr("net_consumed_quota - ?", stats.Delta)})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return errors.New("monthly aggregate changed or is insufficient")
		}
	}
	return tx.Create(&receipt).Error
}

func rejectAppearedLogCorrectionDashboard(tx *gorm.DB, log *Log) error {
	var origin struct {
		NodeName string `json:"node_name"`
	}
	if err := common.UnmarshalJsonStr(log.Other, &origin); err != nil {
		return err
	}
	hour := log.CreatedAt - log.CreatedAt%3600
	query := tx.Model(&QuotaData{}).
		Where("user_id = ? AND username = ? AND model_name = ? AND created_at = ? AND use_group = ? AND token_id = ? AND channel_id = ?",
			log.UserId, log.Username, log.ModelName, hour, log.Group, log.TokenId, log.ChannelId)
	if origin.NodeName != "" {
		query = query.Where("node_name = ?", origin.NodeName)
	}
	var count int64
	if err := query.Count(&count).Error; err != nil {
		return err
	}
	if count > 0 {
		return errors.New("dashboard aggregate changed after preview")
	}
	return nil
}

func rejectAppearedLogCorrectionMonth(tx *gorm.DB, log *Log) error {
	var count int64
	if err := tx.Model(&UserMonthlyUsage{}).
		Where("user_id = ? AND period_start <= ? AND period_end > ?", log.UserId, log.CreatedAt, log.CreatedAt).
		Count(&count).Error; err != nil {
		return err
	}
	if count > 0 {
		return errors.New("monthly aggregate changed after preview")
	}
	return nil
}

func ApplyLogCorrection(ctx context.Context, batch *LogCorrectionBatch, original *Log, correctedQuota int, correctedOther string, stats LogCorrectionStatistics) error {
	return applyLogCorrection(ctx, batch, original, correctedQuota, correctedOther, stats, true)
}

// ApplyLogCorrectionFast is used by the system-task apply path after it has
// rescanned and verified the complete batch.
func ApplyLogCorrectionFast(ctx context.Context, batch *LogCorrectionBatch, original *Log, correctedQuota int, correctedOther string, stats LogCorrectionStatistics) error {
	return applyLogCorrection(ctx, batch, original, correctedQuota, correctedOther, stats, false)
}

func applyLogCorrection(ctx context.Context, batch *LogCorrectionBatch, original *Log, correctedQuota int, correctedOther string, stats LogCorrectionStatistics, validateAggregates bool) error {
	if correctedQuota < 0 || correctedQuota >= original.Quota {
		return errors.New("only overcharged logs can be corrected")
	}
	if original.UserId != batch.UserID || original.ModelName != batch.ModelName || original.Type != LogTypeConsume ||
		original.CreatedAt < batch.StartTime || original.CreatedAt >= batch.EndTime || original.Id > batch.MaxLogID ||
		stats.Delta != original.Quota-correctedQuota || stats.UserID != original.UserId {
		return errors.New("correction does not match the approved selection")
	}
	encodedLog, err := common.Marshal(original)
	if err != nil {
		return err
	}
	encodedStats, err := common.Marshal(stats)
	if err != nil {
		return err
	}
	var before, after map[string]json.RawMessage
	if err := common.UnmarshalJsonStr(original.Other, &before); err != nil {
		return err
	}
	if err := common.UnmarshalJsonStr(correctedOther, &after); err != nil {
		return err
	}
	changedFields := make(map[string]json.RawMessage)
	for key, value := range after {
		originalValue, err := common.Marshal(before[key])
		if err != nil {
			return err
		}
		newValue, err := common.Marshal(value)
		if err != nil {
			return err
		}
		if string(originalValue) != string(newValue) {
			changedFields[key] = value
		}
	}
	correctedFields, err := common.Marshal(changedFields)
	if err != nil {
		return err
	}
	snapshot := LogCorrectionSnapshot{
		BatchID: batch.ID, LogID: original.Id, UserID: original.UserId, ModelName: original.ModelName,
		LogCreatedAt: original.CreatedAt, Original: logCorrectionText(encodedLog), CorrectedQuota: correctedQuota,
		CorrectedOther: string(correctedFields), Delta: original.Quota - correctedQuota, Statistics: string(encodedStats),
		SyncStatus: "pending", OperatorID: batch.OperatorID, Reason: batch.Reason,
	}
	err = LOG_DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var existing LogCorrectionSnapshot
		result := tx.Where("batch_id = ? AND log_id = ?", batch.ID, original.Id).Limit(1).Find(&existing)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected > 0 {
			snapshot = existing
			return nil
		}
		var pending int64
		if err := tx.Model(&LogCorrectionSnapshot{}).Where("log_id = ? AND sync_status = ?", original.Id, "pending").Count(&pending).Error; err != nil {
			return err
		}
		if pending != 0 {
			return errors.New("log has an unsynchronized correction")
		}
		// Lock the real row and compare the entire persisted preimage, not a display ID.
		var current Log
		logTx := tx
		if !common.UsingLogDatabase(common.DatabaseTypeSQLite) {
			logTx = tx.Clauses(clause.Locking{Strength: "UPDATE"})
		}
		if err := logTx.Where("id = ?", original.Id).First(&current).Error; err != nil {
			return err
		}
		currentJSON, err := common.Marshal(&current)
		if err != nil {
			return err
		}
		if string(currentJSON) != string(encodedLog) {
			return errors.New("log changed after preview")
		}
		if err := tx.Create(&snapshot).Error; err != nil {
			return err
		}
		result = tx.Model(&Log{}).Where("id = ? AND quota = ? AND other = ?", original.Id, original.Quota, original.Other).
			Updates(map[string]any{"quota": correctedQuota, "other": correctedOther})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return errors.New("log changed during correction")
		}
		if LOG_DB == DB {
			applyStatistics := ApplyLogCorrectionStatistics
			if !validateAggregates {
				applyStatistics = ApplyLogCorrectionStatisticsFast
			}
			if err := applyStatistics(tx, &snapshot); err != nil {
				return err
			}
			return tx.Model(&snapshot).Update("sync_status", "synced").Error
		}
		return nil
	})
	if err != nil || LOG_DB == DB {
		return err
	}
	if validateAggregates {
		return SyncLogCorrectionSnapshot(ctx, &snapshot)
	}
	return SyncLogCorrectionSnapshotFast(ctx, &snapshot)
}

func SyncLogCorrectionSnapshot(ctx context.Context, snapshot *LogCorrectionSnapshot) error {
	return syncLogCorrectionSnapshot(ctx, snapshot, true)
}

// SyncLogCorrectionSnapshotFast is used by an already verified apply batch.
func SyncLogCorrectionSnapshotFast(ctx context.Context, snapshot *LogCorrectionSnapshot) error {
	return syncLogCorrectionSnapshot(ctx, snapshot, false)
}

func syncLogCorrectionSnapshot(ctx context.Context, snapshot *LogCorrectionSnapshot, validateAggregates bool) error {
	if snapshot.SyncStatus == "synced" {
		return nil
	}
	if err := DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if validateAggregates {
			return ApplyLogCorrectionStatistics(tx, snapshot)
		}
		return ApplyLogCorrectionStatisticsFast(tx, snapshot)
	}); err != nil {
		return err
	}
	return LOG_DB.WithContext(ctx).Model(snapshot).Update("sync_status", "synced").Error
}

func RefreshLogCorrectionConsumptionCaches(ctx context.Context, batchID string) error {
	tokenIDs, channelIDs := map[int]bool{}, map[int]bool{}
	lastID := int64(0)
	for {
		var snapshots []LogCorrectionSnapshot
		if err := LOG_DB.WithContext(ctx).Select("id", "statistics").
			Where("batch_id = ? AND id > ?", batchID, lastID).Order("id").Limit(250).Find(&snapshots).Error; err != nil {
			return err
		}
		if len(snapshots) == 0 {
			break
		}
		for _, snapshot := range snapshots {
			var stats LogCorrectionStatistics
			if err := common.UnmarshalJsonStr(snapshot.Statistics, &stats); err != nil {
				return err
			}
			if stats.TokenID != 0 {
				tokenIDs[stats.TokenID] = true
			}
			if stats.ChannelID != 0 {
				channelIDs[stats.ChannelID] = true
			}
			lastID = snapshot.ID
		}
	}
	if common.RedisEnabled {
		for id := range tokenIDs {
			var token Token
			result := DB.WithContext(ctx).Select("key", "used_quota").Where("id = ?", id).Limit(1).Find(&token)
			if result.Error != nil {
				return result.Error
			}
			if result.RowsAffected == 0 {
				continue
			}
			cacheCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
			// Do not rebuild a token hash or touch its independently maintained balance.
			err := common.RDB.Eval(cacheCtx,
				`if redis.call("HEXISTS", KEYS[1], "UsedQuota") == 1 then return redis.call("HSET", KEYS[1], "UsedQuota", ARGV[1]) end return 0`,
				[]string{"token:" + common.GenerateHMAC(token.Key)}, token.UsedQuota).Err()
			cancel()
			if err != nil {
				return err
			}
		}
	}
	if common.MemoryCacheEnabled {
		for id := range channelIDs {
			var channel Channel
			result := DB.WithContext(ctx).Select("used_quota").Where("id = ?", id).Limit(1).Find(&channel)
			if result.Error != nil {
				return result.Error
			}
			if result.RowsAffected == 0 {
				continue
			}
			channelSyncLock.Lock()
			if cached := channelsIDM[id]; cached != nil {
				updated := *cached
				updated.UsedQuota = channel.UsedQuota
				channelsIDM[id] = &updated
			}
			channelSyncLock.Unlock()
		}
	}
	return nil
}
