package controller

import (
	"encoding/csv"
	"fmt"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

func LogCorrectionCapabilities(c *gin.Context) {
	common.ApiSuccess(c, map[string]bool{"supported": !common.UsingLogDatabase(common.DatabaseTypeClickHouse)})
}

func CreateLogCorrection(c *gin.Context) {
	var params service.LogCorrectionParameters
	if err := c.ShouldBindJSON(&params); err != nil {
		common.ApiError(c, err)
		return
	}
	batch, err := service.StartLogCorrection(params, c.GetInt("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, batch)
}

func ListLogCorrections(c *gin.Context) {
	page := common.GetPageQuery(c)
	query := model.DB.Model(&model.LogCorrectionBatch{})
	if userID, _ := strconv.Atoi(c.Query("user_id")); userID > 0 {
		query = query.Where("user_id = ?", userID)
	}
	var total int64
	if err := query.Count(&total).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	var batches []model.LogCorrectionBatch
	if err := query.Order("created_at desc, id desc").Offset(page.GetStartIdx()).Limit(page.GetPageSize()).Find(&batches).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	page.SetTotal(int(total))
	page.SetItems(batches)
	common.ApiSuccess(c, page)
}

func GetLogCorrection(c *gin.Context) {
	batch, err := model.GetLogCorrectionBatch(c.Param("batch_id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	task, err := model.GetSystemTaskByTaskID(batch.TaskID)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if task != nil && task.Status == model.SystemTaskStatusFailed && (batch.Status == "previewing" || batch.Status == "applying") {
		result := model.DB.Model(batch).Where("task_id = ? AND status IN ?", task.TaskID, []string{"previewing", "applying"}).
			Updates(map[string]any{"status": "failed", "error": task.Error})
		if result.Error != nil {
			common.ApiError(c, result.Error)
			return
		}
		if result.RowsAffected == 1 {
			batch.Status, batch.Error = "failed", task.Error
		}
	}
	common.ApiSuccess(c, map[string]interface{}{"batch": batch, "task": task})
}

func ConfirmLogCorrection(c *gin.Context) {
	batch, err := model.GetLogCorrectionBatch(c.Param("batch_id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	var params struct {
		Reason string `json:"reason"`
	}
	if err := c.ShouldBindJSON(&params); err != nil {
		common.ApiError(c, err)
		return
	}
	if err := service.ConfirmLogCorrection(batch, params.Reason, c.GetInt("id")); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, map[string]string{"batch_id": batch.ID})
}

func GetLogCorrectionDetails(c *gin.Context) {
	batch, err := model.GetLogCorrectionBatch(c.Param("batch_id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	page := common.GetPageQuery(c)
	items, total, err := service.LogCorrectionDetails(c.Request.Context(), batch, page.GetStartIdx(), page.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	page.SetItems(items)
	page.SetTotal(int(total))
	common.ApiSuccess(c, page)
}

func GetLogCorrectionSnapshots(c *gin.Context) {
	if common.UsingLogDatabase(common.DatabaseTypeClickHouse) {
		common.ApiErrorMsg(c, "ClickHouse log correction is not supported")
		return
	}
	page := common.GetPageQuery(c)
	query := model.LOG_DB.Model(&model.LogCorrectionSnapshot{})
	for _, name := range []string{"user_id", "log_id"} {
		if value, _ := strconv.Atoi(c.Query(name)); value > 0 {
			query = query.Where(name+" = ?", value)
		}
	}
	if value := c.Query("batch_id"); value != "" {
		query = query.Where("batch_id = ?", value)
	}
	if value := c.Query("model_name"); value != "" {
		query = query.Where("model_name = ?", value)
	}
	for _, bound := range []struct{ name, condition string }{{"start_time", "log_created_at >= ?"}, {"end_time", "log_created_at < ?"}} {
		if value, _ := strconv.ParseInt(c.Query(bound.name), 10, 64); value > 0 {
			query = query.Where(bound.condition, value)
		}
	}
	var total int64
	if err := query.Count(&total).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	var snapshots []model.LogCorrectionSnapshot
	if err := query.Order("id desc").Offset(page.GetStartIdx()).Limit(page.GetPageSize()).Find(&snapshots).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	page.SetItems(snapshots)
	page.SetTotal(int(total))
	common.ApiSuccess(c, page)
}

func ExportLogCorrection(c *gin.Context) {
	batch, err := model.GetLogCorrectionBatch(c.Param("batch_id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	release, ok := acquireLogExportLock(c, true)
	if !ok {
		common.ApiErrorMsg(c, "log export already in progress")
		return
	}
	defer release()
	if c.Query("summary") == "true" {
		var summary service.LogCorrectionSummary
		if err := common.UnmarshalJsonStr(batch.Summary, &summary); err != nil {
			common.ApiError(c, err)
			return
		}
		c.Header("Content-Type", "text/csv; charset=utf-8")
		c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=log-correction-%s-summary.csv", batch.ID))
		writer := csv.NewWriter(c.Writer)
		_ = writer.Write([]string{"batch_id", "user_id", "model_name", "status", "matched", "changes", "skipped", "warnings", "original_quota", "corrected_quota", "delta", "dashboard_delta", "monthly_delta", "user_delta", "token_delta", "channel_delta", "monthly_wallet_delta", "monthly_subscription_delta"})
		_ = writer.Write([]string{batch.ID, strconv.Itoa(batch.UserID), csvSafe(batch.ModelName), batch.Status,
			strconv.Itoa(summary.Matched), strconv.Itoa(summary.Changes), strconv.Itoa(summary.Skipped), strconv.Itoa(summary.Warnings),
			strconv.FormatInt(summary.OriginalQuota, 10), strconv.FormatInt(summary.CorrectedQuota, 10), strconv.FormatInt(summary.Delta, 10),
			strconv.FormatInt(summary.DashboardDelta, 10), strconv.FormatInt(summary.MonthlyDelta, 10),
			strconv.FormatInt(summary.UserDelta, 10), strconv.FormatInt(summary.TokenDelta, 10), strconv.FormatInt(summary.ChannelDelta, 10),
			strconv.FormatInt(summary.MonthlyWalletDelta, 10), strconv.FormatInt(summary.MonthlySubscriptionDelta, 10)})
		writer.Flush()
		return
	}
	// Fetch the first page before sending CSV headers so errors stay structured.
	items, total, err := service.LogCorrectionDetails(c.Request.Context(), batch, 0, 250)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.Header("Content-Type", "text/csv; charset=utf-8")
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=log-correction-%s.csv", batch.ID))
	writer := csv.NewWriter(c.Writer)
	if err := writer.Write([]string{"batch_id", "user_id", "model_name", "log_id", "created_at", "original_quota", "corrected_quota", "delta", "status", "error", "warnings"}); err != nil {
		return
	}
	for offset := 0; ; offset += 250 {
		if offset > 0 {
			items, _, err = service.LogCorrectionDetails(c.Request.Context(), batch, offset, 250)
			if err != nil {
				return
			}
		}
		for _, item := range items {
			warnings, err := common.Marshal(item.Warnings)
			if err != nil {
				return
			}
			if err := writer.Write([]string{batch.ID, strconv.Itoa(batch.UserID), csvSafe(batch.ModelName), strconv.Itoa(item.LogID), strconv.FormatInt(item.CreatedAt, 10),
				strconv.Itoa(item.Original), strconv.Itoa(item.Corrected), strconv.Itoa(item.Delta), item.Status, csvSafe(item.Error), csvSafe(string(warnings))}); err != nil {
				return
			}
		}
		writer.Flush()
		if writer.Error() != nil || int64(offset+len(items)) >= total {
			break
		}
	}
}
