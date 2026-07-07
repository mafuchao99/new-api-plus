package controller

import (
	"math"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
)

type routeLineChannelDTO struct {
	Id       int    `json:"id"`
	Name     string `json:"name"`
	Type     int    `json:"type"`
	TypeName string `json:"type_name"`
	Models   string `json:"models"`
	Status   int    `json:"status"`
}

type routeLineBindingDTO struct {
	Id          int                  `json:"id"`
	ChannelId   int                  `json:"channel_id"`
	RouteLineId int                  `json:"route_line_id"`
	IsDefault   bool                 `json:"is_default"`
	Enabled     bool                 `json:"enabled"`
	Priority    int                  `json:"priority"`
	Weight      int                  `json:"weight"`
	Description string               `json:"description"`
	Channel     *routeLineChannelDTO `json:"channel,omitempty"`
}

type routeSlotDTO struct {
	Id                 int    `json:"id"`
	Code               string `json:"code"`
	Name               string `json:"name"`
	Description        string `json:"description"`
	DefaultRouteLineId *int   `json:"default_route_line_id,omitempty"`
	Enabled            bool   `json:"enabled"`
	Sort               int    `json:"sort"`
	Remark             string `json:"remark"`
}

type routeLineSlotDTO struct {
	Id   int    `json:"id"`
	Code string `json:"code"`
	Name string `json:"name"`
}

type routeLineDTO struct {
	Id           int                         `json:"id"`
	SlotId       *int                        `json:"slot_id,omitempty"`
	Code         string                      `json:"code"`
	Name         string                      `json:"name"`
	Description  string                      `json:"description"`
	DefaultRatio *float64                    `json:"default_ratio,omitempty"`
	Visible      bool                        `json:"visible"`
	Enabled      bool                        `json:"enabled"`
	Sort         int                         `json:"sort"`
	Remark       string                      `json:"remark"`
	ModelPrices  []model.RouteLineModelPrice `json:"model_prices"`
	Bindings     []routeLineBindingDTO       `json:"bindings"`
	Slot         *routeLineSlotDTO           `json:"slot,omitempty"`
}

type saveRouteSlotRequest struct {
	Code               string `json:"code"`
	Name               string `json:"name"`
	Description        string `json:"description"`
	DefaultRouteLineId *int   `json:"default_route_line_id"`
	Enabled            *bool  `json:"enabled"`
	Sort               int    `json:"sort"`
	Remark             string `json:"remark"`
}

type createRouteLineRequest struct {
	SlotId       *int     `json:"slot_id"`
	Code         string   `json:"code"`
	Name         string   `json:"name"`
	Description  string   `json:"description"`
	DefaultRatio *float64 `json:"default_ratio"`
	Visible      *bool    `json:"visible"`
	Enabled      *bool    `json:"enabled"`
	Sort         int      `json:"sort"`
	Remark       string   `json:"remark"`
}

type saveRouteLineModelPriceRequest struct {
	ModelName       string   `json:"model_name"`
	BillingMode     string   `json:"billing_mode"`
	Ratio           *float64 `json:"ratio"`
	PerRequestPrice *float64 `json:"per_request_price"`
	PriceExpression *string  `json:"price_expression"`
	Description     string   `json:"description"`
	Enabled         *bool    `json:"enabled"`
}

type saveChannelRouteBindingRequest struct {
	ChannelId   int    `json:"channel_id"`
	IsDefault   *bool  `json:"is_default"`
	Enabled     *bool  `json:"enabled"`
	Priority    int    `json:"priority"`
	Weight      int    `json:"weight"`
	Description string `json:"description"`
}

func GetRouteLines(c *gin.Context) {
	lines, err := model.ListRouteLines()
	if err != nil {
		common.ApiError(c, err)
		return
	}

	items := make([]routeLineDTO, 0, len(lines))
	for _, line := range lines {
		items = append(items, routeLineToDTO(line))
	}

	common.ApiSuccess(c, gin.H{
		"items": items,
		"total": len(items),
	})
}

func GetRouteSlots(c *gin.Context) {
	slots, err := model.ListRouteSlots()
	if err != nil {
		common.ApiError(c, err)
		return
	}

	items := make([]routeSlotDTO, 0, len(slots))
	for _, slot := range slots {
		items = append(items, routeSlotToDTO(slot))
	}

	common.ApiSuccess(c, gin.H{
		"items": items,
		"total": len(items),
	})
}

func CreateRouteSlot(c *gin.Context) {
	req := saveRouteSlotRequest{}
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, err)
		return
	}

	code := strings.TrimSpace(req.Code)
	name := strings.TrimSpace(req.Name)
	if !validateRouteSlotBasics(c, code, name) {
		return
	}
	req.DefaultRouteLineId = normalizeOptionalPositiveId(req.DefaultRouteLineId)
	if req.DefaultRouteLineId != nil && *req.DefaultRouteLineId > 0 {
		common.ApiErrorMsg(c, "create the route slot before assigning its default route line")
		return
	}

	enabled := true
	if req.Enabled != nil {
		enabled = *req.Enabled
	}
	slot := model.RouteSlot{
		Code:        code,
		Name:        name,
		Description: strings.TrimSpace(req.Description),
		Enabled:     enabled,
		Sort:        req.Sort,
		Remark:      strings.TrimSpace(req.Remark),
	}
	if err := model.CreateRouteSlot(&slot); err != nil {
		common.ApiError(c, err)
		return
	}

	common.ApiSuccess(c, routeSlotToDTO(slot))
}

func UpdateRouteSlot(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("slot_id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}

	req := saveRouteSlotRequest{}
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, err)
		return
	}

	slot, err := model.GetRouteSlotById(id)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	code := strings.TrimSpace(req.Code)
	name := strings.TrimSpace(req.Name)
	if !validateRouteSlotBasics(c, code, name) {
		return
	}
	req.DefaultRouteLineId = normalizeOptionalPositiveId(req.DefaultRouteLineId)
	if !validateSlotDefaultRouteLine(c, slot.Id, req.DefaultRouteLineId) {
		return
	}

	slot.Code = code
	slot.Name = name
	slot.Description = strings.TrimSpace(req.Description)
	slot.DefaultRouteLineId = req.DefaultRouteLineId
	slot.Sort = req.Sort
	slot.Remark = strings.TrimSpace(req.Remark)
	if req.Enabled != nil {
		slot.Enabled = *req.Enabled
	}

	if err := model.UpdateRouteSlot(slot); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, routeSlotToDTO(*slot))
}

func CreateRouteLine(c *gin.Context) {
	req := createRouteLineRequest{}
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, err)
		return
	}

	code := strings.TrimSpace(req.Code)
	name := strings.TrimSpace(req.Name)
	if !validateRouteLineBasics(c, code, name) {
		return
	}
	if !validateDefaultRatio(c, req.DefaultRatio) {
		return
	}
	req.SlotId = normalizeOptionalPositiveId(req.SlotId)
	if !validateRouteLineSlot(c, req.SlotId) {
		return
	}
	defaultRatio := normalizeDefaultRatio(req.DefaultRatio)

	visible := true
	if req.Visible != nil {
		visible = *req.Visible
	}
	enabled := true
	if req.Enabled != nil {
		enabled = *req.Enabled
	}

	line := model.RouteLine{
		SlotId:       req.SlotId,
		Code:         code,
		Name:         name,
		Description:  strings.TrimSpace(req.Description),
		DefaultRatio: defaultRatio,
		Visible:      visible,
		Enabled:      enabled,
		Sort:         req.Sort,
		Remark:       strings.TrimSpace(req.Remark),
		ModelPrices:  make([]model.RouteLineModelPrice, 0),
		Bindings:     make([]model.ChannelRouteBinding, 0),
	}
	if err := model.CreateRouteLine(&line); err != nil {
		common.ApiError(c, err)
		return
	}

	common.ApiSuccess(c, routeLineToDTO(line))
}

func UpdateRouteLine(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}

	req := createRouteLineRequest{}
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, err)
		return
	}

	line, err := model.GetRouteLineById(id)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	code := strings.TrimSpace(req.Code)
	name := strings.TrimSpace(req.Name)
	if !validateRouteLineBasics(c, code, name) {
		return
	}
	if !validateDefaultRatio(c, req.DefaultRatio) {
		return
	}
	req.SlotId = normalizeOptionalPositiveId(req.SlotId)
	if !validateRouteLineSlot(c, req.SlotId) {
		return
	}
	defaultRatio := normalizeDefaultRatio(req.DefaultRatio)

	line.SlotId = req.SlotId
	line.Code = code
	line.Name = name
	line.Description = strings.TrimSpace(req.Description)
	line.DefaultRatio = defaultRatio
	line.Sort = req.Sort
	line.Remark = strings.TrimSpace(req.Remark)
	if req.Visible != nil {
		line.Visible = *req.Visible
	}
	if req.Enabled != nil {
		line.Enabled = *req.Enabled
	}

	if err := model.UpdateRouteLine(line); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, routeLineToDTO(*line))
}

func SaveRouteLineModelPrice(c *gin.Context) {
	routeLineId, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if _, err := model.GetRouteLineById(routeLineId); err != nil {
		common.ApiError(c, err)
		return
	}

	req := saveRouteLineModelPriceRequest{}
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, err)
		return
	}

	modelName := strings.TrimSpace(req.ModelName)
	if modelName == "" {
		common.ApiErrorMsg(c, "model name cannot be empty")
		return
	}
	if len(modelName) > 191 {
		common.ApiErrorMsg(c, "model name is too long")
		return
	}

	billingMode := strings.TrimSpace(req.BillingMode)
	priceExpression := ""
	if req.PriceExpression != nil {
		priceExpression = strings.TrimSpace(*req.PriceExpression)
	}
	switch billingMode {
	case model.RouteLineBillingModeRatio:
		if req.Ratio == nil || *req.Ratio < 0 || math.IsNaN(*req.Ratio) || math.IsInf(*req.Ratio, 0) {
			common.ApiErrorMsg(c, "ratio must be greater than or equal to 0")
			return
		}
		req.PerRequestPrice = nil
		req.PriceExpression = nil
	case model.RouteLineBillingModePerRequest:
		if req.PerRequestPrice == nil || *req.PerRequestPrice < 0 || math.IsNaN(*req.PerRequestPrice) || math.IsInf(*req.PerRequestPrice, 0) {
			common.ApiErrorMsg(c, "per-request price must be greater than or equal to 0")
			return
		}
		req.Ratio = nil
		req.PriceExpression = nil
	case model.RouteLineBillingModeExpression:
		if priceExpression == "" {
			common.ApiErrorMsg(c, "price expression cannot be empty")
			return
		}
		req.Ratio = nil
		req.PerRequestPrice = nil
		req.PriceExpression = &priceExpression
	default:
		common.ApiErrorMsg(c, "unsupported billing mode")
		return
	}

	enabled := true
	if req.Enabled != nil {
		enabled = *req.Enabled
	}
	price := model.RouteLineModelPrice{
		RouteLineId:     routeLineId,
		ModelName:       modelName,
		BillingMode:     billingMode,
		Ratio:           req.Ratio,
		PerRequestPrice: req.PerRequestPrice,
		PriceExpression: req.PriceExpression,
		Description:     strings.TrimSpace(req.Description),
		Enabled:         enabled,
	}
	if err := model.SaveRouteLineModelPrice(&price); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, price)
}

func SaveChannelRouteBinding(c *gin.Context) {
	routeLineId, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if _, err := model.GetRouteLineById(routeLineId); err != nil {
		common.ApiError(c, err)
		return
	}

	req := saveChannelRouteBindingRequest{}
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, err)
		return
	}
	if req.ChannelId <= 0 {
		common.ApiErrorMsg(c, "channel cannot be empty")
		return
	}
	if _, err := model.GetChannelById(req.ChannelId, false); err != nil {
		common.ApiError(c, err)
		return
	}

	enabled := true
	if req.Enabled != nil {
		enabled = *req.Enabled
	}
	isDefault := false
	if req.IsDefault != nil {
		isDefault = *req.IsDefault
	}
	binding := model.ChannelRouteBinding{
		ChannelId:   req.ChannelId,
		RouteLineId: routeLineId,
		IsDefault:   isDefault,
		Enabled:     enabled,
		Priority:    req.Priority,
		Weight:      req.Weight,
		Description: strings.TrimSpace(req.Description),
	}
	if err := model.SaveChannelRouteBinding(&binding); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, binding)
}

func DeleteRouteLineModelPrice(c *gin.Context) {
	routeLineId, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	priceId, err := strconv.Atoi(c.Param("price_id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if err := model.DeleteRouteLineModelPrice(routeLineId, priceId); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

func DeleteChannelRouteBinding(c *gin.Context) {
	routeLineId, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	bindingId, err := strconv.Atoi(c.Param("binding_id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if err := model.DeleteChannelRouteBinding(routeLineId, bindingId); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

func routeLineToDTO(line model.RouteLine) routeLineDTO {
	item := routeLineDTO{
		Id:           line.Id,
		SlotId:       line.SlotId,
		Code:         line.Code,
		Name:         line.Name,
		Description:  line.Description,
		DefaultRatio: normalizeDefaultRatio(line.DefaultRatio),
		Visible:      line.Visible,
		Enabled:      line.Enabled,
		Sort:         line.Sort,
		Remark:       line.Remark,
		ModelPrices:  line.ModelPrices,
		Bindings:     make([]routeLineBindingDTO, 0, len(line.Bindings)),
	}
	if line.Slot != nil {
		item.Slot = &routeLineSlotDTO{
			Id:   line.Slot.Id,
			Code: line.Slot.Code,
			Name: line.Slot.Name,
		}
	}
	for _, binding := range line.Bindings {
		bindingDTO := routeLineBindingDTO{
			Id:          binding.Id,
			ChannelId:   binding.ChannelId,
			RouteLineId: binding.RouteLineId,
			IsDefault:   binding.IsDefault,
			Enabled:     binding.Enabled,
			Priority:    binding.Priority,
			Weight:      binding.Weight,
			Description: binding.Description,
		}
		if binding.Channel != nil {
			bindingDTO.Channel = &routeLineChannelDTO{
				Id:       binding.Channel.Id,
				Name:     binding.Channel.Name,
				Type:     binding.Channel.Type,
				TypeName: constant.GetChannelTypeName(binding.Channel.Type),
				Models:   strings.TrimSpace(binding.Channel.Models),
				Status:   binding.Channel.Status,
			}
		}
		item.Bindings = append(item.Bindings, bindingDTO)
	}
	return item
}

func routeSlotToDTO(slot model.RouteSlot) routeSlotDTO {
	return routeSlotDTO{
		Id:                 slot.Id,
		Code:               slot.Code,
		Name:               slot.Name,
		Description:        slot.Description,
		DefaultRouteLineId: slot.DefaultRouteLineId,
		Enabled:            slot.Enabled,
		Sort:               slot.Sort,
		Remark:             slot.Remark,
	}
}

func validateRouteLineBasics(c *gin.Context, code string, name string) bool {
	if code == "" || name == "" {
		common.ApiErrorMsg(c, "route line code and name cannot be empty")
		return false
	}
	if len(code) > 64 || len(name) > 128 {
		common.ApiErrorMsg(c, "route line code or name is too long")
		return false
	}
	for _, r := range code {
		if (r >= 'a' && r <= 'z') ||
			(r >= 'A' && r <= 'Z') ||
			(r >= '0' && r <= '9') ||
			r == '_' ||
			r == '-' ||
			r == '.' {
			continue
		}
		common.ApiErrorMsg(c, "route line code can only contain letters, numbers, dots, underscores, and hyphens")
		return false
	}
	return true
}

func validateRouteSlotBasics(c *gin.Context, code string, name string) bool {
	if code == "" || name == "" {
		common.ApiErrorMsg(c, "route slot code and name cannot be empty")
		return false
	}
	if len(code) > 64 || len(name) > 128 {
		common.ApiErrorMsg(c, "route slot code or name is too long")
		return false
	}
	for _, r := range code {
		if (r >= 'a' && r <= 'z') ||
			(r >= 'A' && r <= 'Z') ||
			(r >= '0' && r <= '9') ||
			r == '_' ||
			r == '-' ||
			r == '.' {
			continue
		}
		common.ApiErrorMsg(c, "route slot code can only contain letters, numbers, dots, underscores, and hyphens")
		return false
	}
	return true
}

func normalizeOptionalPositiveId(id *int) *int {
	if id == nil || *id <= 0 {
		return nil
	}
	return id
}

func validateRouteLineSlot(c *gin.Context, slotId *int) bool {
	if slotId == nil || *slotId <= 0 {
		return true
	}
	if _, err := model.GetRouteSlotById(*slotId); err != nil {
		common.ApiError(c, err)
		return false
	}
	return true
}

func validateSlotDefaultRouteLine(c *gin.Context, slotId int, routeLineId *int) bool {
	if routeLineId == nil || *routeLineId <= 0 {
		return true
	}
	line, err := model.GetRouteLineById(*routeLineId)
	if err != nil {
		common.ApiError(c, err)
		return false
	}
	if line.SlotId == nil || *line.SlotId != slotId {
		common.ApiErrorMsg(c, "default route line must belong to the same route slot")
		return false
	}
	return true
}

func validateDefaultRatio(c *gin.Context, ratio *float64) bool {
	if ratio != nil && (*ratio < 0 || math.IsNaN(*ratio) || math.IsInf(*ratio, 0)) {
		common.ApiErrorMsg(c, "default ratio must be greater than or equal to 0")
		return false
	}
	return true
}

func normalizeDefaultRatio(ratio *float64) *float64 {
	if ratio != nil {
		return ratio
	}
	defaultRatio := 1.0
	return &defaultRatio
}
