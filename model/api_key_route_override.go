package model

import (
	"errors"
	"time"

	"gorm.io/gorm"
)

type ApiKeyRouteOverride struct {
	Id          int       `json:"id"`
	TokenId     int       `json:"token_id" gorm:"index;not null;uniqueIndex:idx_api_key_route_overrides_token_slot"`
	RouteSlotId int       `json:"route_slot_id" gorm:"index;not null;uniqueIndex:idx_api_key_route_overrides_token_slot"`
	RouteLineId int       `json:"route_line_id" gorm:"index;not null"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type ApiKeyRouteOverrideInput struct {
	RouteSlotId int
	RouteLineId int
}

type ApiKeyRouteSlotSummary struct {
	Id                 int    `json:"id"`
	Code               string `json:"code"`
	Name               string `json:"name"`
	Description        string `json:"description"`
	DefaultRouteLineId *int   `json:"default_route_line_id,omitempty"`
}

type ApiKeyRouteLineSummary struct {
	Id           int      `json:"id"`
	SlotId       *int     `json:"slot_id,omitempty"`
	Code         string   `json:"code"`
	Name         string   `json:"name"`
	Description  string   `json:"description"`
	BillingMode  string   `json:"billing_mode"`
	DefaultRatio *float64 `json:"default_ratio,omitempty"`
}

type ApiKeyEffectiveRouteLine struct {
	RouteSlot ApiKeyRouteSlotSummary  `json:"route_slot"`
	RouteLine *ApiKeyRouteLineSummary `json:"route_line,omitempty"`
	IsCustom  bool                    `json:"is_custom"`
}

func replaceTokenRouteOverridesTx(tx *gorm.DB, tokenId int, overrides []ApiKeyRouteOverrideInput) error {
	if tokenId <= 0 {
		return errors.New("tokenId 无效")
	}
	if err := tx.Where("token_id = ?", tokenId).Delete(&ApiKeyRouteOverride{}).Error; err != nil {
		return err
	}
	if len(overrides) == 0 {
		return nil
	}
	records := make([]ApiKeyRouteOverride, 0, len(overrides))
	for _, override := range overrides {
		records = append(records, ApiKeyRouteOverride{
			TokenId:     tokenId,
			RouteSlotId: override.RouteSlotId,
			RouteLineId: override.RouteLineId,
		})
	}
	return tx.Create(&records).Error
}

func ListTokenRouteOverridesByTokenIds(tokenIds []int) ([]ApiKeyRouteOverride, error) {
	overrides := make([]ApiKeyRouteOverride, 0)
	if len(tokenIds) == 0 {
		return overrides, nil
	}
	err := DB.
		Where("token_id IN ?", tokenIds).
		Order("route_slot_id ASC").
		Find(&overrides).Error
	return overrides, err
}
