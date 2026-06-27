package model

import (
	"errors"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	RouteLineBillingModeRatio      = "ratio"
	RouteLineBillingModePerRequest = "per_request"
	RouteLineBillingModeExpression = "expression"
)

type RouteLine struct {
	Id           int                   `json:"id"`
	SlotId       *int                  `json:"slot_id,omitempty" gorm:"index"`
	Code         string                `json:"code" gorm:"type:varchar(64);uniqueIndex;not null"`
	Name         string                `json:"name" gorm:"type:varchar(128);not null"`
	Description  string                `json:"description" gorm:"type:text"`
	DefaultRatio *float64              `json:"default_ratio,omitempty"`
	IsDefault    bool                  `json:"is_default"`
	Visible      bool                  `json:"visible"`
	Enabled      bool                  `json:"enabled"`
	Sort         int                   `json:"sort" gorm:"index"`
	Remark       string                `json:"remark" gorm:"type:varchar(255)"`
	CreatedAt    time.Time             `json:"created_at"`
	UpdatedAt    time.Time             `json:"updated_at"`
	ModelPrices  []RouteLineModelPrice `json:"model_prices" gorm:"foreignKey:RouteLineId"`
	Bindings     []ChannelRouteBinding `json:"bindings" gorm:"foreignKey:RouteLineId"`
	Slot         *RouteSlot            `json:"slot,omitempty" gorm:"foreignKey:SlotId"`
}

type RouteSlot struct {
	Id                 int       `json:"id"`
	Code               string    `json:"code" gorm:"type:varchar(64);uniqueIndex;not null"`
	Name               string    `json:"name" gorm:"type:varchar(128);not null"`
	Description        string    `json:"description" gorm:"type:text"`
	DefaultRouteLineId *int      `json:"default_route_line_id,omitempty" gorm:"index"`
	Enabled            bool      `json:"enabled"`
	Sort               int       `json:"sort" gorm:"index"`
	Remark             string    `json:"remark" gorm:"type:varchar(255)"`
	CreatedAt          time.Time `json:"created_at"`
	UpdatedAt          time.Time `json:"updated_at"`
}

type RouteLineModelPrice struct {
	Id              int        `json:"id"`
	RouteLineId     int        `json:"route_line_id" gorm:"index;not null;uniqueIndex:idx_route_line_model_price"`
	ModelName       string     `json:"model_name" gorm:"type:varchar(191);not null;uniqueIndex:idx_route_line_model_price"`
	BillingMode     string     `json:"billing_mode" gorm:"type:varchar(32);not null"`
	Ratio           *float64   `json:"ratio,omitempty"`
	PerRequestPrice *float64   `json:"per_request_price,omitempty"`
	PriceExpression *string    `json:"price_expression,omitempty" gorm:"type:text"`
	Description     string     `json:"description" gorm:"type:text"`
	Enabled         bool       `json:"enabled"`
	CreatedAt       time.Time  `json:"created_at"`
	UpdatedAt       time.Time  `json:"updated_at"`
	RouteLine       *RouteLine `json:"-" gorm:"foreignKey:RouteLineId"`
}

type ChannelRouteBinding struct {
	Id          int        `json:"id"`
	ChannelId   int        `json:"channel_id" gorm:"index;not null;uniqueIndex:idx_channel_route_binding"`
	RouteLineId int        `json:"route_line_id" gorm:"index;not null;uniqueIndex:idx_channel_route_binding"`
	IsDefault   bool       `json:"is_default"`
	Enabled     bool       `json:"enabled"`
	Priority    int        `json:"priority"`
	Weight      int        `json:"weight"`
	Description string     `json:"description" gorm:"type:text"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
	RouteLine   *RouteLine `json:"-" gorm:"foreignKey:RouteLineId"`
	Channel     *Channel   `json:"channel,omitempty" gorm:"foreignKey:ChannelId"`
}

func ListRouteLines() ([]RouteLine, error) {
	lines := make([]RouteLine, 0)
	err := DB.
		Preload("Slot").
		Preload("ModelPrices", func(db *gorm.DB) *gorm.DB {
			return db.Order(clause.OrderByColumn{Column: clause.Column{Name: "model_name"}})
		}).
		Preload("Bindings", func(db *gorm.DB) *gorm.DB {
			return db.Order("is_default DESC").Order("priority DESC").Order("id ASC")
		}).
		Preload("Bindings.Channel", func(db *gorm.DB) *gorm.DB {
			return db.Select("id", "name", "type", "models", "status")
		}).
		Order("sort ASC").
		Order("id ASC").
		Find(&lines).Error
	return lines, err
}

func ListRouteSlots() ([]RouteSlot, error) {
	slots := make([]RouteSlot, 0)
	err := DB.Order("sort ASC").Order("id ASC").Find(&slots).Error
	return slots, err
}

func CreateRouteSlot(slot *RouteSlot) error {
	return DB.Create(slot).Error
}

func GetRouteSlotById(id int) (*RouteSlot, error) {
	slot := &RouteSlot{}
	err := DB.First(slot, "id = ?", id).Error
	return slot, err
}

func UpdateRouteSlot(slot *RouteSlot) error {
	return DB.Save(slot).Error
}

func CreateRouteLine(line *RouteLine) error {
	return DB.Create(line).Error
}

func GetRouteLineById(id int) (*RouteLine, error) {
	line := &RouteLine{}
	err := DB.First(line, "id = ?", id).Error
	return line, err
}

func UpdateRouteLine(line *RouteLine) error {
	return DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Save(line).Error; err != nil {
			return err
		}
		query := tx.Model(&RouteSlot{}).Where("default_route_line_id = ?", line.Id)
		if line.SlotId == nil {
			query = query.Where("id <> 0")
		} else {
			query = query.Where("id <> ?", *line.SlotId)
		}
		return query.Update("default_route_line_id", nil).Error
	})
}

func SaveRouteLineModelPrice(price *RouteLineModelPrice) error {
	return DB.Transaction(func(tx *gorm.DB) error {
		existing := RouteLineModelPrice{}
		err := tx.
			Where("route_line_id = ? AND model_name = ?", price.RouteLineId, price.ModelName).
			First(&existing).Error
		if err == nil {
			price.Id = existing.Id
			price.CreatedAt = existing.CreatedAt
			return tx.Save(price).Error
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		return tx.Create(price).Error
	})
}

func SaveChannelRouteBinding(binding *ChannelRouteBinding) error {
	return DB.Transaction(func(tx *gorm.DB) error {
		if binding.IsDefault {
			if err := tx.Model(&ChannelRouteBinding{}).
				Where("channel_id = ? AND route_line_id <> ?", binding.ChannelId, binding.RouteLineId).
				Update("is_default", false).Error; err != nil {
				return err
			}
		}

		existing := ChannelRouteBinding{}
		err := tx.
			Where("route_line_id = ? AND channel_id = ?", binding.RouteLineId, binding.ChannelId).
			First(&existing).Error
		if err == nil {
			binding.Id = existing.Id
			binding.CreatedAt = existing.CreatedAt
			return tx.Save(binding).Error
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		return tx.Create(binding).Error
	})
}

func DeleteRouteLineModelPrice(routeLineId int, priceId int) error {
	return DB.
		Where("route_line_id = ? AND id = ?", routeLineId, priceId).
		Delete(&RouteLineModelPrice{}).Error
}

func DeleteChannelRouteBinding(routeLineId int, bindingId int) error {
	return DB.
		Where("route_line_id = ? AND id = ?", routeLineId, bindingId).
		Delete(&ChannelRouteBinding{}).Error
}
