package model

import (
	"context"
	"fmt"
	"sort"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

type ConsumptionSummaryQuery struct {
	StartTimestamp int64   `form:"start_timestamp" binding:"required,gt=0"`
	EndTimestamp   int64   `form:"end_timestamp" binding:"required,gtfield=StartTimestamp"`
	UserID         int     `form:"user_id" binding:"gte=0"`
	ModelSearch    string  `form:"model_name" binding:"max=512"`
	ExactModel     *string `form:"exact_model" binding:"omitempty,max=512"`
}

type ConsumptionSummaryRow struct {
	ID           string  `json:"id"`
	Name         string  `json:"name"`
	Quota        int64   `json:"quota"`
	Requests     int64   `json:"requests"`
	Tokens       int64   `json:"tokens"`
	Share        float64 `json:"share"`
	AverageQuota float64 `json:"averageQuota"`
}

type ConsumptionSummaryTotals struct {
	Quota    int64 `json:"quota"`
	Requests int64 `json:"requests"`
	Tokens   int64 `json:"tokens"`
	Models   int   `json:"models"`
}

type ConsumptionSummary struct {
	Totals ConsumptionSummaryTotals `json:"totals"`
	Rows   []ConsumptionSummaryRow  `json:"rows"`
}

// GetConsumptionSummary aggregates net spending from retained consumption and refund logs.
// EndTimestamp is exclusive so local calendar dates work across DST transitions.
// ExactModel requests a user breakdown; otherwise rows are grouped by model.
func GetConsumptionSummary(ctx context.Context, query ConsumptionSummaryQuery) (*ConsumptionSummary, error) {
	tx := LOG_DB.WithContext(ctx).Model(&Log{}).
		Where("type IN ? AND created_at >= ? AND created_at < ?", []int{LogTypeConsume, LogTypeRefund}, query.StartTimestamp, query.EndTimestamp)
	if query.UserID > 0 {
		tx = tx.Where("user_id = ?", query.UserID)
	}
	if search := strings.TrimSpace(query.ModelSearch); search != "" {
		// Treat wildcard characters as literal model-name characters.
		if common.UsingLogDatabase(common.DatabaseTypeClickHouse) {
			tx = tx.Where("positionCaseInsensitiveUTF8(model_name, ?) > 0", search)
		} else {
			pattern := strings.NewReplacer("!", "!!", "%", "!%", "_", "!_").Replace(strings.ToLower(search))
			tx = tx.Where("LOWER(model_name) LIKE ? ESCAPE '!'", "%"+pattern+"%")
		}
	}
	group := "model_name"
	identity := "model_name AS name"
	if query.ExactModel != nil {
		tx = tx.Where("model_name = ?", *query.ExactModel)
		group = "user_id"
		identity = "user_id"
	}
	// Most logs remain one aggregate per model/user. Only potential task settlements
	// are split by metadata, then parsed in Go to support all log database dialects
	// and avoid mistaking nested request data or malformed JSON for a settlement.
	billingMetadata := fmt.Sprintf(`CASE WHEN type = %d AND other LIKE '%%"task_id"%%' AND other LIKE '%%"pre_consumed_quota"%%' AND other LIKE '%%"actual_quota"%%' THEN other ELSE '' END`, LogTypeConsume)
	rows, err := tx.Session(&gorm.Session{}).Select(identity+", "+billingMetadata+" AS billing_metadata, COALESCE(SUM(CASE WHEN type = ? THEN -quota ELSE quota END), 0) AS quota, SUM(CASE WHEN type = ? THEN 1 ELSE 0 END) AS requests, COALESCE(SUM(CASE WHEN type = ? THEN COALESCE(prompt_tokens, 0) + COALESCE(completion_tokens, 0) ELSE 0 END), 0) AS tokens", LogTypeRefund, LogTypeConsume, LogTypeConsume).
		Group(group).Group(billingMetadata).Rows()
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := &ConsumptionSummary{Rows: make([]ConsumptionSummaryRow, 0)}
	rowIndexes := make(map[string]int)
	var userIDs []int
	for rows.Next() {
		var aggregate struct {
			UserID          int
			Name            string
			Quota           int64
			Requests        int64
			Tokens          int64
			BillingMetadata string
		}
		if err := LOG_DB.ScanRows(rows, &aggregate); err != nil {
			return nil, err
		}
		id := aggregate.Name
		if query.ExactModel != nil {
			id = strconv.Itoa(aggregate.UserID)
		}
		index, exists := rowIndexes[id]
		if !exists {
			index = len(result.Rows)
			rowIndexes[id] = index
			result.Rows = append(result.Rows, ConsumptionSummaryRow{ID: id, Name: aggregate.Name})
			if query.ExactModel != nil {
				userIDs = append(userIDs, aggregate.UserID)
			}
		}
		if aggregate.BillingMetadata != "" {
			var settlement struct {
				TaskID           string `json:"task_id"`
				PreConsumedQuota *int64 `json:"pre_consumed_quota"`
				ActualQuota      *int64 `json:"actual_quota"`
			}
			if common.UnmarshalJsonStr(aggregate.BillingMetadata, &settlement) == nil && settlement.TaskID != "" && settlement.PreConsumedQuota != nil && settlement.ActualQuota != nil {
				aggregate.Requests = 0
				aggregate.Tokens = 0
			}
		}
		result.Rows[index].Quota += aggregate.Quota
		result.Rows[index].Requests += aggregate.Requests
		result.Rows[index].Tokens += aggregate.Tokens
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if err := rows.Close(); err != nil {
		return nil, err
	}
	if query.ExactModel != nil && len(userIDs) > 0 {
		names, err := consumptionUserNames(ctx, tx, userIDs)
		if err != nil {
			return nil, err
		}
		for i := range result.Rows {
			userID, _ := strconv.Atoi(result.Rows[i].ID)
			result.Rows[i].Name = names[userID]
		}
	}
	for _, row := range result.Rows {
		result.Totals.Quota += row.Quota
		result.Totals.Requests += row.Requests
		result.Totals.Tokens += row.Tokens
		if row.Requests > 0 {
			result.Totals.Models++
		}
	}
	if query.ExactModel != nil && result.Totals.Models > 0 {
		result.Totals.Models = 1
	}
	for i := range result.Rows {
		if result.Rows[i].Requests > 0 {
			result.Rows[i].AverageQuota = float64(result.Rows[i].Quota) / float64(result.Rows[i].Requests)
		}
		if result.Totals.Quota > 0 {
			result.Rows[i].Share = float64(result.Rows[i].Quota) / float64(result.Totals.Quota) * 100
		}
	}
	sort.Slice(result.Rows, func(i, j int) bool {
		if result.Rows[i].Quota != result.Rows[j].Quota {
			return result.Rows[i].Quota > result.Rows[j].Quota
		}
		return result.Rows[i].ID < result.Rows[j].ID
	})
	return result, nil
}

// consumptionUserNames resolves current names in one main-database query.
// Deleted users retain their latest nonempty name in the selected log period.
func consumptionUserNames(ctx context.Context, filteredLogs *gorm.DB, userIDs []int) (map[int]string, error) {
	var users []User
	if err := DB.WithContext(ctx).Select("id", "username").Where("id IN ?", userIDs).Find(&users).Error; err != nil {
		return nil, err
	}
	names := make(map[int]string, len(userIDs))
	for _, user := range users {
		names[user.Id] = user.Username
	}
	var missingIDs []int
	for _, id := range userIDs {
		if _, exists := names[id]; !exists {
			missingIDs = append(missingIDs, id)
		}
	}
	if len(missingIDs) == 0 {
		return names, nil
	}
	rows, err := filteredLogs.Session(&gorm.Session{}).Select("user_id", "username").Where("user_id IN ? AND username <> ?", missingIDs, "").Order("created_at DESC").Order("request_id DESC").Rows()
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	remaining := len(missingIDs)
	for rows.Next() {
		var id int
		var name string
		if err := rows.Scan(&id, &name); err != nil {
			return nil, err
		}
		if _, exists := names[id]; !exists {
			names[id] = name
			remaining--
			if remaining == 0 {
				break
			}
		}
	}
	return names, rows.Err()
}
