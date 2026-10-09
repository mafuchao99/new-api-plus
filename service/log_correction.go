package service

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
)

type LogCorrectionParameters struct {
	UserID       int      `json:"user_id"`
	ModelName    string   `json:"model_name"`
	StartTime    int64    `json:"start_time"`
	EndTime      int64    `json:"end_time"`
	CacheRead    *float64 `json:"cache_read_ratio"`
	CacheWrite   *float64 `json:"cache_write_ratio"`
	CacheWrite5m *float64 `json:"cache_write_5m_ratio,omitempty"`
	CacheWrite1h *float64 `json:"cache_write_1h_ratio,omitempty"`
}

type logCorrectionPricing struct {
	ModelRatio      *float64 `json:"model_ratio"`
	GroupRatio      *float64 `json:"group_ratio"`
	CompletionRatio *float64 `json:"completion_ratio"`
	ModelPrice      *float64 `json:"model_price"`
	CacheTokens     *int     `json:"cache_tokens"`
	CacheRatio      *float64 `json:"cache_ratio"`
	WriteTokens     int      `json:"cache_creation_tokens"`
	WriteRatio      *float64 `json:"cache_creation_ratio"`
	Write5mTokens   int      `json:"cache_creation_tokens_5m"`
	Write5mRatio    *float64 `json:"cache_creation_ratio_5m"`
	Write1hTokens   int      `json:"cache_creation_tokens_1h"`
	Write1hRatio    *float64 `json:"cache_creation_ratio_1h"`
	Claude          bool     `json:"claude"`
	UsageSemantic   string   `json:"usage_semantic"`
	BillingMode     string   `json:"billing_mode"`
	BillingSource   string   `json:"billing_source"`
	BillingCount    *float64 `json:"billing_count"`
	NodeName        string   `json:"node_name"`
}

type LogCorrectionEntry struct {
	LogID      int                           `json:"log_id"`
	CreatedAt  int64                         `json:"created_at"`
	Original   int                           `json:"original_quota"`
	Corrected  int                           `json:"corrected_quota"`
	Delta      int                           `json:"delta"`
	Status     string                        `json:"status"`
	Error      string                        `json:"error,omitempty"`
	Warnings   []string                      `json:"warnings,omitempty"`
	Statistics model.LogCorrectionStatistics `json:"statistics"`
}

type LogCorrectionSummary struct {
	Matched                  int   `json:"matched"`
	Changes                  int   `json:"changes"`
	Skipped                  int   `json:"skipped"`
	Unchanged                int   `json:"unchanged"`
	Warnings                 int   `json:"warnings"`
	OriginalQuota            int64 `json:"original_quota"`
	CorrectedQuota           int64 `json:"corrected_quota"`
	Delta                    int64 `json:"delta"`
	DashboardDelta           int64 `json:"dashboard_delta"`
	MonthlyDelta             int64 `json:"monthly_delta"`
	UserDelta                int64 `json:"user_delta"`
	TokenDelta               int64 `json:"token_delta"`
	ChannelDelta             int64 `json:"channel_delta"`
	MonthlyWalletDelta       int64 `json:"monthly_wallet_delta"`
	MonthlySubscriptionDelta int64 `json:"monthly_subscription_delta"`
}

type logCorrectionCandidate struct {
	LogID       int
	OriginalSHA string
	Quota       int
	Statistics  model.LogCorrectionStatistics
	Proof       string
}

func StartLogCorrection(params LogCorrectionParameters, operator int) (*model.LogCorrectionBatch, error) {
	if common.UsingLogDatabase(common.DatabaseTypeClickHouse) {
		return nil, errors.New("ClickHouse log correction is not supported")
	}
	hour := time.Now().Unix()
	hour -= hour % 3600
	if params.UserID <= 0 || strings.TrimSpace(params.ModelName) == "" || params.StartTime <= 0 || params.EndTime <= params.StartTime || params.EndTime > hour {
		return nil, errors.New("select a user, exact model and completed historical time range")
	}
	for _, ratio := range []*float64{params.CacheRead, params.CacheWrite, params.CacheWrite5m, params.CacheWrite1h} {
		if ratio != nil && (*ratio < 0 || math.IsNaN(*ratio) || math.IsInf(*ratio, 0)) {
			return nil, errors.New("cache ratios must be finite and nonnegative")
		}
	}
	if params.CacheRead == nil || params.CacheWrite == nil {
		return nil, errors.New("cache read and write ratios are required")
	}
	if _, err := model.GetUserById(params.UserID, false); err != nil {
		return nil, err
	}
	var pending int64
	if err := model.LOG_DB.Model(&model.LogCorrectionSnapshot{}).Where("user_id = ? AND sync_status = ?", params.UserID, "pending").Count(&pending).Error; err != nil {
		return nil, err
	}
	if pending != 0 {
		return nil, errors.New("resume the pending statistics synchronization first")
	}
	data, err := common.Marshal(params)
	if err != nil {
		return nil, err
	}
	batch := &model.LogCorrectionBatch{
		ID: common.NewRequestId(), UserID: params.UserID, ModelName: params.ModelName,
		StartTime: params.StartTime, EndTime: params.EndTime, Parameters: string(data), OperatorID: operator,
	}
	if err := model.LOG_DB.Model(&model.Log{}).Select("COALESCE(MAX(id), 0)").Scan(&batch.MaxLogID).Error; err != nil {
		return nil, err
	}
	if err := model.QueueLogCorrection(batch, "preview"); err != nil {
		return nil, err
	}
	notifySystemTaskRunner()
	return batch, nil
}

func ConfirmLogCorrection(batch *model.LogCorrectionBatch, reason string, operator int) error {
	if common.UsingLogDatabase(common.DatabaseTypeClickHouse) {
		return errors.New("ClickHouse log correction is not supported")
	}
	reason = strings.TrimSpace(reason)
	if reason == "" || len(reason) > 2000 {
		return errors.New("a correction reason of at most 2000 bytes is required")
	}
	if batch.Fingerprint == "" {
		return errors.New("a successful preview is required")
	}
	batch.Reason, batch.OperatorID = reason, operator
	if err := model.QueueLogCorrection(batch, "apply"); err != nil {
		return err
	}
	notifySystemTaskRunner()
	return nil
}

// Replay through production settlement; unsupported modalities are rejected
// rather than approximating surcharges or consulting today's price settings.
func RecalculateLogCorrection(log *model.Log, params LogCorrectionParameters) (int, string, logCorrectionPricing, error) {
	var pricing logCorrectionPricing
	if err := common.UnmarshalJsonStr(log.Other, &pricing); err != nil {
		return 0, "", pricing, err
	}
	var other map[string]json.RawMessage
	if err := common.UnmarshalJsonStr(log.Other, &other); err != nil {
		return 0, "", pricing, err
	}
	for _, key := range []string{"image", "audio", "ws", "web_search", "file_search", "image_generation_call", "audio_input_seperate_price", "fee_type", "quota_saturation"} {
		if value, exists := other[key]; exists && string(value) != "false" && string(value) != "null" {
			return 0, "", pricing, errors.New("unsupported modality, surcharge or saturated quota")
		}
	}
	if strings.HasSuffix(log.ModelName, "search-preview") {
		return 0, "", pricing, errors.New("unsupported modality, surcharge or saturated quota")
	}
	if raw := other["admin_info"]; len(raw) > 0 && string(raw) != "null" {
		var admin map[string]json.RawMessage
		if err := common.Unmarshal(raw, &admin); err != nil {
			return 0, "", pricing, err
		}
		if value := admin["quota_saturation"]; len(value) > 0 && string(value) != "null" {
			return 0, "", pricing, errors.New("saturated quota cannot be replayed")
		}
	}
	if pricing.BillingMode != "" && pricing.BillingMode != "ratio" {
		return 0, "", pricing, errors.New("only ordinary per-token billing is supported")
	}
	if raw := other["route_line_billing_mode"]; len(raw) > 0 {
		var mode string
		if err := common.Unmarshal(raw, &mode); err != nil {
			return 0, "", pricing, err
		}
		if mode != "" && mode != "ratio" {
			return 0, "", pricing, errors.New("unsupported route billing mode")
		}
	}
	if pricing.ModelRatio == nil || pricing.GroupRatio == nil || pricing.CompletionRatio == nil ||
		pricing.ModelPrice == nil || *pricing.ModelPrice >= 0 || pricing.CacheTokens == nil || pricing.CacheRatio == nil {
		return 0, "", pricing, errors.New("historical pricing fields are missing or billing is per-call")
	}
	if log.PromptTokens < 0 || log.CompletionTokens < 0 || *pricing.CacheTokens < 0 || pricing.WriteTokens < 0 || pricing.Write5mTokens < 0 || pricing.Write1hTokens < 0 {
		return 0, "", pricing, errors.New("invalid token counts")
	}
	if pricing.UsageSemantic != "" && pricing.UsageSemantic != "openai" && pricing.UsageSemantic != "anthropic" {
		return 0, "", pricing, errors.New("unknown token semantics")
	}
	if pricing.WriteTokens > 0 && pricing.WriteRatio == nil ||
		pricing.Write5mTokens > 0 && (pricing.Write5mRatio == nil || params.CacheWrite5m == nil) ||
		pricing.Write1hTokens > 0 && (pricing.Write1hRatio == nil || params.CacheWrite1h == nil) {
		return 0, "", pricing, errors.New("cache write TTL ratios are missing")
	}
	for _, ratio := range []*float64{pricing.ModelRatio, pricing.GroupRatio, pricing.CompletionRatio, pricing.CacheRatio, pricing.WriteRatio, pricing.Write5mRatio, pricing.Write1hRatio, pricing.BillingCount} {
		if ratio != nil && (*ratio < 0 || math.IsNaN(*ratio) || math.IsInf(*ratio, 0)) {
			return 0, "", pricing, errors.New("invalid historical ratio")
		}
	}
	if params.CacheRead == nil || params.CacheWrite == nil {
		return 0, "", pricing, errors.New("correct cache ratios are required")
	}
	price := types.PriceData{
		ModelRatio: *pricing.ModelRatio, CompletionRatio: *pricing.CompletionRatio, CacheRatio: *pricing.CacheRatio,
		ModelPrice: *pricing.ModelPrice, GroupRatioInfo: types.GroupRatioInfo{GroupRatio: *pricing.GroupRatio},
	}
	if pricing.WriteRatio != nil {
		price.CacheCreationRatio = *pricing.WriteRatio
	}
	if pricing.Write5mRatio != nil {
		price.CacheCreation5mRatio = *pricing.Write5mRatio
	}
	if pricing.Write1hRatio != nil {
		price.CacheCreation1hRatio = *pricing.Write1hRatio
	}
	if pricing.BillingCount != nil {
		price.OtherRatios = map[string]float64{"n": *pricing.BillingCount}
	}
	usage := &dto.Usage{
		PromptTokens: log.PromptTokens, CompletionTokens: log.CompletionTokens,
		PromptTokensDetails:         dto.InputTokenDetails{CachedTokens: *pricing.CacheTokens, CachedCreationTokens: pricing.WriteTokens},
		ClaudeCacheCreation5mTokens: pricing.Write5mTokens, ClaudeCacheCreation1hTokens: pricing.Write1hTokens,
		UsageSemantic: pricing.UsageSemantic,
	}
	if usage.UsageSemantic == "" {
		usage.UsageSemantic = "openai"
		if pricing.Claude {
			usage.UsageSemantic = "anthropic"
		}
	}
	info := &relaycommon.RelayInfo{OriginModelName: log.ModelName, StartTime: time.Unix(log.CreatedAt, 0), PriceData: price}
	ctx := &gin.Context{}
	original := calculateTextQuotaSummary(ctx, info, usage)
	if info.QuotaClamp != nil {
		return 0, "", pricing, errors.New("saturated quota cannot be replayed")
	}
	if original.Quota != log.Quota {
		return 0, "", pricing, fmt.Errorf("historical replay mismatch: expected %d, calculated %d", log.Quota, original.Quota)
	}
	info.PriceData.CacheRatio = *params.CacheRead
	info.PriceData.CacheCreationRatio = *params.CacheWrite
	if params.CacheWrite5m != nil {
		info.PriceData.CacheCreation5mRatio = *params.CacheWrite5m
	}
	if params.CacheWrite1h != nil {
		info.PriceData.CacheCreation1hRatio = *params.CacheWrite1h
	}
	corrected := calculateTextQuotaSummary(ctx, info, usage)
	if info.QuotaClamp != nil {
		return 0, "", pricing, errors.New("saturated quota cannot be replayed")
	}
	updates := map[string]any{"cache_ratio": *params.CacheRead}
	if pricing.BillingSource == BillingSourceSubscription {
		if _, exists := other["subscription_consumed"]; exists {
			updates["subscription_consumed"] = corrected.Quota
		}
	}
	if pricing.WriteTokens > 0 {
		updates["cache_creation_ratio"] = *params.CacheWrite
	}
	if pricing.Write5mTokens > 0 {
		updates["cache_creation_ratio_5m"] = *params.CacheWrite5m
	}
	if pricing.Write1hTokens > 0 {
		updates["cache_creation_ratio_1h"] = *params.CacheWrite1h
	}
	for key, value := range updates {
		encoded, err := common.Marshal(value)
		if err != nil {
			return 0, "", pricing, err
		}
		other[key] = encoded
	}
	encoded, err := common.Marshal(other)
	return corrected.Quota, string(encoded), pricing, err
}

func EvaluateLogCorrection(ctx context.Context, log *model.Log, params LogCorrectionParameters) (LogCorrectionEntry, string) {
	entry := LogCorrectionEntry{LogID: log.Id, CreatedAt: log.CreatedAt, Original: log.Quota, Corrected: log.Quota, Status: "unchanged"}
	quota, other, pricing, err := RecalculateLogCorrection(log, params)
	if err != nil {
		entry.Status, entry.Error = "skipped", err.Error()
		return entry, ""
	}
	entry.Corrected = quota
	if quota >= log.Quota {
		return entry, other
	}
	if pricing.BillingSource != "" && pricing.BillingSource != BillingSourceWallet && pricing.BillingSource != BillingSourceSubscription {
		entry.Status, entry.Error = "skipped", "unknown billing source"
		return entry, ""
	}
	entry.Delta = log.Quota - quota
	stats, err := model.ResolveLogCorrectionStatistics(ctx, log, entry.Delta, pricing.NodeName, pricing.BillingSource == BillingSourceSubscription)
	if err != nil {
		entry.Status, entry.Error, entry.Delta = "skipped", err.Error(), 0
		return entry, ""
	}
	entry.Status, entry.Statistics, entry.Warnings = "change", stats, stats.Warnings
	return entry, other
}

func scanLogCorrection(ctx context.Context, batch *model.LogCorrectionBatch, progress func(int) error) (LogCorrectionSummary, string, []logCorrectionCandidate, error) {
	ctx = model.WithLogCorrectionVerificationCache(ctx)
	var params LogCorrectionParameters
	if err := common.UnmarshalJsonStr(batch.Parameters, &params); err != nil {
		return LogCorrectionSummary{}, "", nil, err
	}
	var summary LogCorrectionSummary
	var candidates []logCorrectionCandidate
	hash := sha256.New()
	lastID := 0
	for {
		var logs []model.Log
		if err := model.LogCorrectionQuery(model.LOG_DB.WithContext(ctx), batch).Where("id > ?", lastID).Order("id").Limit(250).Find(&logs).Error; err != nil {
			return summary, "", candidates, err
		}
		if len(logs) == 0 {
			break
		}
		for _, log := range logs {
			if err := ctx.Err(); err != nil {
				return summary, "", candidates, err
			}
			data, err := common.Marshal(&log)
			if err != nil {
				return summary, "", candidates, err
			}
			hash.Write(data)
			entry, _ := EvaluateLogCorrection(ctx, &log, params)
			summary.Matched++
			switch entry.Status {
			case "skipped":
				summary.Skipped++
			case "unchanged":
				summary.Unchanged++
			case "change":
				summary.Changes++
				summary.OriginalQuota += int64(log.Quota)
				summary.CorrectedQuota += int64(entry.Corrected)
				summary.Delta += int64(entry.Delta)
				summary.UserDelta += int64(entry.Delta)
				if entry.Statistics.TokenID != 0 {
					summary.TokenDelta += int64(entry.Delta)
				}
				if entry.Statistics.ChannelID != 0 {
					summary.ChannelDelta += int64(entry.Delta)
				}
				if entry.Statistics.QuotaDataID != 0 {
					summary.DashboardDelta += int64(entry.Delta)
				}
				if entry.Statistics.MonthlyID != 0 {
					summary.MonthlyDelta += int64(entry.Delta)
					if entry.Statistics.Subscription {
						summary.MonthlySubscriptionDelta += int64(entry.Delta)
					} else {
						summary.MonthlyWalletDelta += int64(entry.Delta)
					}
				}
				if len(entry.Warnings) > 0 {
					summary.Warnings++
				}
			}
			// Include the eligibility decision and resolved target IDs in approval.
			decision, err := common.Marshal(entry)
			if err != nil {
				return summary, "", candidates, err
			}
			hash.Write(decision)
			if entry.Status == "change" {
				originalSHA := sha256.Sum256(data)
				proofData := append(data, decision...)
				proof := sha256.Sum256(proofData)
				candidates = append(candidates, logCorrectionCandidate{LogID: log.Id, OriginalSHA: fmt.Sprintf("%x", originalSHA), Quota: entry.Corrected, Statistics: entry.Statistics, Proof: fmt.Sprintf("%x", proof)})
			}
			lastID = log.Id
		}
		if progress != nil {
			if err := progress(summary.Matched); err != nil {
				return summary, "", candidates, err
			}
		}
	}
	totals := map[string]map[int64]int64{}
	for _, candidate := range candidates {
		stats := candidate.Statistics
		ids := map[string]int64{"user": int64(stats.UserID), "token": int64(stats.TokenID), "channel": int64(stats.ChannelID), "dashboard": int64(stats.QuotaDataID), "monthly_net": stats.MonthlyID}
		if stats.Subscription {
			ids["monthly_subscription"] = stats.MonthlyID
		} else {
			ids["monthly_wallet"] = stats.MonthlyID
		}
		for kind, id := range ids {
			if id == 0 {
				continue
			}
			if totals[kind] == nil {
				totals[kind] = map[int64]int64{}
			}
			totals[kind][id] += int64(stats.Delta)
		}
	}
	if err := model.ValidateLogCorrectionTotals(ctx, totals); err != nil {
		return summary, "", candidates, err
	}
	return summary, fmt.Sprintf("%x", hash.Sum(nil)), candidates, nil
}

type logCorrectionHandler struct{}

func (logCorrectionHandler) Type() string { return model.SystemTaskTypeLogCorrection }

func init() { RegisterSystemTaskHandler(logCorrectionHandler{}) }

func (logCorrectionHandler) Run(ctx context.Context, task *model.SystemTask, runner string) {
	var payload struct {
		BatchID string `json:"batch_id"`
		Action  string `json:"action"`
	}
	if err := task.DecodePayload(&payload); err != nil {
		failSystemTask(task, runner, err)
		return
	}
	batch, err := model.GetLogCorrectionBatch(payload.BatchID)
	if err != nil {
		failSystemTask(task, runner, err)
		return
	}
	if batch.TaskID != task.TaskID {
		failSystemTask(task, runner, errors.New("correction task is no longer current"))
		return
	}
	if common.UsingLogDatabase(common.DatabaseTypeClickHouse) {
		err = errors.New("ClickHouse log correction is not supported")
	} else {
		err = runLogCorrection(ctx, batch, payload.Action, task, runner)
	}
	status := model.SystemTaskStatusSucceeded
	if err != nil {
		status = model.SystemTaskStatusFailed
		_ = model.DB.Model(batch).Where("task_id = ?", task.TaskID).Updates(map[string]any{"status": "failed", "error": err.Error()}).Error
	}
	message := ""
	if err != nil {
		message = err.Error()
	}
	_ = model.FinishSystemTask(task.TaskID, runner, status, map[string]string{"batch_id": batch.ID}, message)
}

func runLogCorrection(ctx context.Context, batch *model.LogCorrectionBatch, action string, task *model.SystemTask, runner string) error {
	if action == "apply" {
		// Finish an interrupted cross-database outbox before reading aggregates.
		var pending []model.LogCorrectionSnapshot
		for {
			if err := model.LOG_DB.WithContext(ctx).Where("batch_id = ? AND sync_status = ?", batch.ID, "pending").Limit(250).Find(&pending).Error; err != nil {
				return err
			}
			if len(pending) == 0 {
				break
			}
			for i := range pending {
				if err := model.SyncLogCorrectionSnapshot(ctx, &pending[i]); err != nil {
					return err
				}
			}
		}
	}
	progress := func(processed int) error {
		return model.UpdateSystemTaskState(task.TaskID, runner, map[string]int{"processed": processed})
	}
	summary, fingerprint, candidates, err := scanLogCorrection(ctx, batch, progress)
	if err != nil {
		return err
	}
	if action == "preview" {
		data, err := common.Marshal(summary)
		if err != nil {
			return err
		}
		proofs := map[int]string{}
		for _, candidate := range candidates {
			proofs[candidate.LogID] = candidate.Proof
		}
		approval, err := common.Marshal(proofs)
		if err != nil {
			return err
		}
		if err := progress(summary.Matched); err != nil {
			return err
		}
		return model.DB.WithContext(ctx).Model(batch).Where("task_id = ?", task.TaskID).Updates(map[string]any{"summary": string(data), "approval": string(approval), "fingerprint": fingerprint, "status": "ready", "error": ""}).Error
	}
	if action != "apply" {
		return errors.New("unknown correction action")
	}
	if !batch.ApplyStarted && fingerprint != batch.Fingerprint {
		return errors.New("preview changed; create a new preview before applying")
	}
	var proofs map[int]string
	if err := common.UnmarshalJsonStr(string(batch.Approval), &proofs); err != nil {
		return err
	}
	for _, candidate := range candidates {
		if proofs[candidate.LogID] != candidate.Proof {
			return errors.New("a correction candidate changed after approval")
		}
	}
	if err := progress(0); err != nil {
		return err
	}
	if err := model.DB.WithContext(ctx).Model(batch).Where("task_id = ?", task.TaskID).Update("apply_started", true).Error; err != nil {
		return err
	}
	var params LogCorrectionParameters
	if err := common.UnmarshalJsonStr(batch.Parameters, &params); err != nil {
		return err
	}
	for i, candidate := range candidates {
		if err := ctx.Err(); err != nil {
			return err
		}
		if err := model.UpdateSystemTaskState(task.TaskID, runner, map[string]int{"processed": i, "total": len(candidates)}); err != nil {
			return err
		}
		var original model.Log
		if err := model.LOG_DB.WithContext(ctx).Where("id = ?", candidate.LogID).First(&original).Error; err != nil {
			return err
		}
		data, err := common.Marshal(&original)
		if err != nil {
			return err
		}
		hash := sha256.Sum256(data)
		if fmt.Sprintf("%x", hash) != candidate.OriginalSHA {
			return errors.New("log changed after preview")
		}
		quota, other, _, err := RecalculateLogCorrection(&original, params)
		if err != nil {
			return err
		}
		if quota != candidate.Quota {
			return errors.New("a correction candidate changed after approval")
		}
		if err := model.ApplyLogCorrectionFast(ctx, batch, &original, quota, other, candidate.Statistics); err != nil {
			return err
		}
	}
	var expected LogCorrectionSummary
	if err := common.UnmarshalJsonStr(batch.Summary, &expected); err != nil {
		return err
	}
	var applied struct {
		Count int64
		Delta int64
	}
	if err := model.LOG_DB.WithContext(ctx).Model(&model.LogCorrectionSnapshot{}).
		Select("COUNT(*) AS count, COALESCE(SUM(delta), 0) AS delta").
		Where("batch_id = ? AND sync_status = ?", batch.ID, "synced").Scan(&applied).Error; err != nil {
		return err
	}
	if applied.Count != int64(expected.Changes) || applied.Delta != expected.Delta {
		return errors.New("not all approved corrections were synchronized; inspect exceptions before retrying")
	}
	if err := model.RefreshLogCorrectionConsumptionCaches(ctx, batch.ID); err != nil {
		return err
	}
	if err := progress(len(candidates)); err != nil {
		return err
	}
	return model.DB.WithContext(ctx).Model(batch).Where("task_id = ?", task.TaskID).Updates(map[string]any{"status": "completed", "error": ""}).Error
}

func LogCorrectionDetails(ctx context.Context, batch *model.LogCorrectionBatch, offset, limit int) ([]LogCorrectionEntry, int64, error) {
	var params LogCorrectionParameters
	if err := common.UnmarshalJsonStr(batch.Parameters, &params); err != nil {
		return nil, 0, err
	}
	query := model.LogCorrectionQuery(model.LOG_DB.WithContext(ctx), batch)
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var logs []model.Log
	if err := query.Order("id").Offset(offset).Limit(limit).Find(&logs).Error; err != nil {
		return nil, 0, err
	}
	entries := make([]LogCorrectionEntry, 0, len(logs))
	for _, log := range logs {
		var snapshot model.LogCorrectionSnapshot
		result := model.LOG_DB.WithContext(ctx).Where("batch_id = ? AND log_id = ?", batch.ID, log.Id).Limit(1).Find(&snapshot)
		if result.Error != nil {
			return nil, 0, result.Error
		}
		if result.RowsAffected > 0 {
			entry := LogCorrectionEntry{LogID: log.Id, CreatedAt: log.CreatedAt, Original: snapshot.CorrectedQuota + snapshot.Delta, Corrected: snapshot.CorrectedQuota, Delta: snapshot.Delta, Status: snapshot.SyncStatus}
			if err := common.UnmarshalJsonStr(snapshot.Statistics, &entry.Statistics); err != nil {
				return nil, 0, err
			}
			entry.Warnings = entry.Statistics.Warnings
			entries = append(entries, entry)
		} else {
			entry, _ := EvaluateLogCorrection(ctx, &log, params)
			entries = append(entries, entry)
		}
	}
	return entries, total, nil
}
