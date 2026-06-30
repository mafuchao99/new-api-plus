package model

import (
	"errors"
	"time"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
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

type tokenRouteTarget struct {
	Id                int
	Key               string
	RouteLocked       bool
	LockedRouteSlotId *int
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

func resolveTokenRouteTargetsTx(tx *gorm.DB, userId int, tokenIds []int) ([]tokenRouteTarget, error) {
	targets := make([]tokenRouteTarget, 0)
	query := tx.
		Model(&Token{}).
		Select([]string{"id", commonKeyCol, "route_locked", "locked_route_slot_id"})
	if userId > 0 {
		query = query.Where("user_id = ?", userId)
	}
	if len(tokenIds) > 0 {
		query = query.Where("id IN ?", tokenIds)
	}
	if userId <= 0 && len(tokenIds) == 0 {
		return targets, errors.New("userId 或 tokenIds 不能为空")
	}
	err := query.Order("id ASC").Find(&targets).Error
	return targets, err
}

func ensureRouteTargetsSwitchable(targets []tokenRouteTarget, routeSlotId int) error {
	for _, target := range targets {
		if target.RouteLocked &&
			target.LockedRouteSlotId != nil &&
			*target.LockedRouteSlotId == routeSlotId {
			return errors.New("该密钥已被管理员锁定，不可切换，有问题联系管理员")
		}
	}
	return nil
}

func ensureRouteTargetsLockable(targets []tokenRouteTarget) error {
	for _, target := range targets {
		if target.RouteLocked {
			return errors.New("该密钥已被管理员锁定，不可切换，有问题联系管理员")
		}
	}
	return nil
}

func upsertTokenRouteOverridesTx(tx *gorm.DB, tokenIds []int, routeSlotId int, routeLineId int) error {
	if len(tokenIds) == 0 {
		return nil
	}
	if routeSlotId <= 0 || routeLineId <= 0 {
		return errors.New("routeSlotId 或 routeLineId 无效")
	}
	records := make([]ApiKeyRouteOverride, 0, len(tokenIds))
	for _, tokenId := range tokenIds {
		records = append(records, ApiKeyRouteOverride{
			TokenId:     tokenId,
			RouteSlotId: routeSlotId,
			RouteLineId: routeLineId,
		})
	}
	return tx.Clauses(clause.OnConflict{
		Columns: []clause.Column{
			{Name: "token_id"},
			{Name: "route_slot_id"},
		},
		DoUpdates: clause.AssignmentColumns([]string{"route_line_id", "updated_at"}),
	}).Create(&records).Error
}

func deleteTokenRouteOverridesTx(tx *gorm.DB, tokenIds []int, routeSlotId int) error {
	if len(tokenIds) == 0 {
		return nil
	}
	if routeSlotId <= 0 {
		return errors.New("routeSlotId 无效")
	}
	return tx.
		Where("token_id IN ? AND route_slot_id = ?", tokenIds, routeSlotId).
		Delete(&ApiKeyRouteOverride{}).Error
}

func invalidateTokenRouteTargetCaches(targets []tokenRouteTarget) {
	if !common.RedisEnabled {
		return
	}
	for _, target := range targets {
		if target.Key == "" {
			continue
		}
		if err := cacheDeleteToken(target.Key); err != nil {
			common.SysLog("failed to delete token cache: " + err.Error())
		}
	}
}

func BatchUpsertTokenRouteOverrides(userId int, tokenIds []int, routeSlotId int, routeLineId int) (int, error) {
	if routeSlotId <= 0 || routeLineId < 0 {
		return 0, errors.New("routeSlotId 或 routeLineId 无效")
	}
	targets := make([]tokenRouteTarget, 0)
	err := DB.Transaction(func(tx *gorm.DB) error {
		var err error
		targets, err = resolveTokenRouteTargetsTx(tx, userId, tokenIds)
		if err != nil {
			return err
		}
		if len(targets) == 0 {
			return nil
		}
		if err := ensureRouteTargetsSwitchable(targets, routeSlotId); err != nil {
			return err
		}
		targetIds := make([]int, 0, len(targets))
		for _, target := range targets {
			targetIds = append(targetIds, target.Id)
		}
		if routeLineId == 0 {
			return deleteTokenRouteOverridesTx(tx, targetIds, routeSlotId)
		}
		return upsertTokenRouteOverridesTx(tx, targetIds, routeSlotId, routeLineId)
	})
	if err != nil {
		return 0, err
	}
	invalidateTokenRouteTargetCaches(targets)
	return len(targets), nil
}

func BatchSetTokenRouteLock(userId int, tokenIds []int, routeSlotId int, routeLineId int, locked bool) (int, error) {
	if routeSlotId <= 0 {
		return 0, errors.New("routeSlotId 无效")
	}
	if locked && routeLineId <= 0 {
		return 0, errors.New("routeLineId 无效")
	}
	targets := make([]tokenRouteTarget, 0)
	err := DB.Transaction(func(tx *gorm.DB) error {
		var err error
		targets, err = resolveTokenRouteTargetsTx(tx, userId, tokenIds)
		if err != nil {
			return err
		}
		if len(targets) == 0 {
			return nil
		}
		if locked {
			if err := ensureRouteTargetsLockable(targets); err != nil {
				return err
			}
		}
		targetIds := make([]int, 0, len(targets))
		for _, target := range targets {
			targetIds = append(targetIds, target.Id)
		}
		updates := map[string]any{
			"route_locked":         locked,
			"locked_route_slot_id": nil,
			"locked_route_line_id": nil,
		}
		if locked {
			updates["locked_route_slot_id"] = routeSlotId
			updates["locked_route_line_id"] = routeLineId
		}
		if err := tx.Model(&Token{}).Where("id IN ?", targetIds).Updates(updates).Error; err != nil {
			return err
		}
		if !locked {
			return nil
		}
		return upsertTokenRouteOverridesTx(tx, targetIds, routeSlotId, routeLineId)
	})
	if err != nil {
		return 0, err
	}
	invalidateTokenRouteTargetCaches(targets)
	return len(targets), nil
}
