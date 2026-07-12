package controller

import (
	"sort"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/billing_setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"

	"github.com/gin-gonic/gin"
)

type routePricingCategoryDTO struct {
	Id          string `json:"id"`
	Code        string `json:"code"`
	Name        string `json:"name"`
	NameKey     string `json:"name_key,omitempty"`
	Description string `json:"description"`
	Sort        int    `json:"sort"`
	RouteCount  int    `json:"route_count"`
}

type routePricingRouteDTO struct {
	Id          string `json:"id"`
	CategoryId  string `json:"category_id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Sort        int    `json:"sort"`
}

type routePricingPriceItemDTO struct {
	Type          string   `json:"type"`
	LabelKey      string   `json:"label_key"`
	Amount        *float64 `json:"amount,omitempty"`
	Unit          string   `json:"unit,omitempty"`
	Text          string   `json:"text,omitempty"`
	TranslateText bool     `json:"translate_text,omitempty"`
}

type routePricingLineDTO struct {
	Id                   string                     `json:"id"`
	CategoryId           string                     `json:"category_id"`
	Name                 string                     `json:"name"`
	Description          string                     `json:"description"`
	BillingMode          string                     `json:"billing_mode"`
	Ratio                *float64                   `json:"ratio,omitempty"`
	PerRequestPrice      *float64                   `json:"per_request_price,omitempty"`
	BillingExpr          string                     `json:"billing_expr,omitempty"`
	ExpressionMultiplier *float64                   `json:"expression_multiplier,omitempty"`
	ExpressionLabel      string                     `json:"expression_label,omitempty"`
	IsDefault            bool                       `json:"is_default"`
	IsModelOverride      bool                       `json:"is_model_override"`
	Sort                 int                        `json:"sort"`
	PriceItems           []routePricingPriceItemDTO `json:"price_items"`
}

type routePricingModelDTO struct {
	Id                 string                     `json:"id"`
	Vendor             string                     `json:"vendor"`
	Description        string                     `json:"description,omitempty"`
	BillingMode        string                     `json:"billing_mode,omitempty"`
	BillingExpr        string                     `json:"billing_expr,omitempty"`
	OfficialPriceItems []routePricingPriceItemDTO `json:"official_price_items"`
	Lines              []routePricingLineDTO      `json:"lines"`
}

type routePricingResponseDTO struct {
	Categories       []routePricingCategoryDTO `json:"categories"`
	Routes           []routePricingRouteDTO    `json:"routes"`
	Models           []routePricingModelDTO    `json:"models"`
	TotalRoutes      int                       `json:"total_routes"`
	PerRequestRoutes int                       `json:"per_request_routes"`
	PricingVersion   string                    `json:"pricing_version"`
}

func GetRoutePricing(c *gin.Context) {
	pricings, _, _, _ := getVisiblePricingForRequest(c)
	lines, err := model.ListRouteLines()
	if err != nil {
		common.ApiError(c, err)
		return
	}

	common.ApiSuccess(c, buildRoutePricingResponse(pricings, model.GetVendors(), lines))
}

func buildRoutePricingResponse(pricings []model.Pricing, vendors []model.PricingVendor, lines []model.RouteLine) routePricingResponseDTO {
	vendorById := make(map[int]string, len(vendors))
	for _, vendor := range vendors {
		vendorById[vendor.ID] = vendor.Name
	}

	modelsByName := make(map[string]*routePricingModelDTO, len(pricings))
	categoriesById := make(map[string]*routePricingCategoryDTO)
	routesById := make(map[string]routePricingRouteDTO)
	routeCountedByCategory := make(map[string]map[string]struct{})
	perRequestRouteKeys := make(map[string]struct{})

	for _, line := range lines {
		if !isPublicRouteLine(line) {
			continue
		}

		category := routePricingCategoryFromLine(line)
		lineProducedModel := false
		for _, pricing := range pricings {
			vendorFallback, ok := routeLineSupportsPricingModel(line, pricing.ModelName)
			if !ok {
				continue
			}

			officialPriceItems := routePricingOfficialPriceItems(pricing)
			linePrice := findRouteLineModelPrice(line.ModelPrices, pricing.ModelName)
			lineDTO := routePricingLineToDTO(line, category.Id, pricing, linePrice, officialPriceItems)
			if len(lineDTO.PriceItems) == 0 && strings.TrimSpace(lineDTO.BillingExpr) == "" {
				continue
			}

			modelDTO, ok := modelsByName[pricing.ModelName]
			if !ok {
				vendorName := vendorById[pricing.VendorID]
				if strings.TrimSpace(vendorName) == "" {
					vendorName = vendorFallback
				}
				modelDTO = &routePricingModelDTO{
					Id:                 pricing.ModelName,
					Vendor:             vendorName,
					Description:        pricing.Description,
					BillingMode:        pricing.BillingMode,
					BillingExpr:        pricing.BillingExpr,
					OfficialPriceItems: officialPriceItems,
					Lines:              make([]routePricingLineDTO, 0),
				}
				modelsByName[pricing.ModelName] = modelDTO
			}
			modelDTO.Lines = append(modelDTO.Lines, lineDTO)
			if lineDTO.BillingMode == model.RouteLineBillingModePerRequest {
				perRequestRouteKeys[pricing.ModelName+"|"+lineDTO.Id] = struct{}{}
			}
			lineProducedModel = true
		}

		if lineProducedModel {
			if _, ok := categoriesById[category.Id]; !ok {
				categoryCopy := category
				categoriesById[category.Id] = &categoryCopy
			}
			if _, ok := routeCountedByCategory[category.Id]; !ok {
				routeCountedByCategory[category.Id] = make(map[string]struct{})
			}
			routeId := strconv.Itoa(line.Id)
			routeCountedByCategory[category.Id][routeId] = struct{}{}
			routesById[routeId] = routePricingRouteDTO{
				Id:          routeId,
				CategoryId:  category.Id,
				Name:        line.Name,
				Description: line.Description,
				Sort:        line.Sort,
			}
		}
	}

	categories := make([]routePricingCategoryDTO, 0, len(categoriesById))
	for id, category := range categoriesById {
		category.RouteCount = len(routeCountedByCategory[id])
		categories = append(categories, *category)
	}
	sort.Slice(categories, func(i, j int) bool {
		if categories[i].Sort != categories[j].Sort {
			return categories[i].Sort < categories[j].Sort
		}
		return categories[i].Id < categories[j].Id
	})

	routes := make([]routePricingRouteDTO, 0, len(routesById))
	for _, route := range routesById {
		routes = append(routes, route)
	}
	sort.Slice(routes, func(i, j int) bool {
		if routes[i].CategoryId != routes[j].CategoryId {
			return routes[i].CategoryId < routes[j].CategoryId
		}
		if routes[i].Sort != routes[j].Sort {
			return routes[i].Sort < routes[j].Sort
		}
		return routes[i].Id < routes[j].Id
	})

	models := make([]routePricingModelDTO, 0, len(modelsByName))
	for _, modelDTO := range modelsByName {
		sort.Slice(modelDTO.Lines, func(i, j int) bool {
			if modelDTO.Lines[i].Sort != modelDTO.Lines[j].Sort {
				return modelDTO.Lines[i].Sort < modelDTO.Lines[j].Sort
			}
			return modelDTO.Lines[i].Id < modelDTO.Lines[j].Id
		})
		models = append(models, *modelDTO)
	}
	sort.Slice(models, func(i, j int) bool {
		return models[i].Id < models[j].Id
	})

	return routePricingResponseDTO{
		Categories:       categories,
		Routes:           routes,
		Models:           models,
		TotalRoutes:      len(routes),
		PerRequestRoutes: len(perRequestRouteKeys),
		PricingVersion:   "route-pricing-v2",
	}
}

func isPublicRouteLine(line model.RouteLine) bool {
	if !line.Visible || !line.Enabled {
		return false
	}
	if line.Slot != nil && !line.Slot.Enabled {
		return false
	}
	return true
}

func routePricingLineIsDefault(line model.RouteLine) bool {
	if line.Slot != nil {
		return line.Slot.DefaultRouteLineId != nil && *line.Slot.DefaultRouteLineId == line.Id
	}
	return line.IsDefault
}

func routePricingCategoryFromLine(line model.RouteLine) routePricingCategoryDTO {
	if line.Slot == nil {
		return routePricingCategoryDTO{
			Id:      "custom",
			Code:    "custom",
			NameKey: "Custom category",
			Sort:    9999,
		}
	}

	return routePricingCategoryDTO{
		Id:          strconv.Itoa(line.Slot.Id),
		Code:        line.Slot.Code,
		Name:        line.Slot.Name,
		Description: line.Slot.Description,
		Sort:        line.Slot.Sort,
	}
}

func routeLineSupportsPricingModel(line model.RouteLine, modelName string) (string, bool) {
	for _, binding := range line.Bindings {
		if !binding.Enabled || binding.Channel == nil {
			continue
		}
		if binding.Channel.Status != common.ChannelStatusEnabled {
			continue
		}
		if !model.ChannelSupportsModelName(binding.Channel, modelName) {
			continue
		}
		return constant.GetChannelTypeName(binding.Channel.Type), true
	}
	return "", false
}

func findRouteLineModelPrice(prices []model.RouteLineModelPrice, modelName string) *model.RouteLineModelPrice {
	modelName = strings.TrimSpace(modelName)
	if modelName == "" {
		return nil
	}

	formattedModelName := ratio_setting.FormatMatchingModelName(modelName)
	for i := range prices {
		if !prices[i].Enabled {
			continue
		}
		priceModelName := strings.TrimSpace(prices[i].ModelName)
		if priceModelName == modelName || priceModelName == formattedModelName {
			return &prices[i]
		}
	}
	return nil
}

func routePricingLineToDTO(
	line model.RouteLine,
	categoryId string,
	pricing model.Pricing,
	modelPrice *model.RouteLineModelPrice,
	officialPriceItems []routePricingPriceItemDTO,
) routePricingLineDTO {
	billingMode := model.RouteLineBillingModeRatio
	ratio := normalizeDefaultRatio(line.DefaultRatio)
	var perRequestPrice *float64
	expressionLabel := ""
	isModelOverride := modelPrice != nil

	if modelPrice != nil {
		billingMode = modelPrice.BillingMode
		ratio = modelPrice.Ratio
		perRequestPrice = modelPrice.PerRequestPrice
		expressionLabel = strings.TrimSpace(modelPrice.Description)
	}

	description := strings.TrimSpace(line.Description)
	if description == "" && modelPrice != nil {
		description = strings.TrimSpace(modelPrice.Description)
	}

	lineDTO := routePricingLineDTO{
		Id:              strconv.Itoa(line.Id),
		CategoryId:      categoryId,
		Name:            line.Name,
		Description:     description,
		BillingMode:     billingMode,
		Ratio:           ratio,
		PerRequestPrice: perRequestPrice,
		ExpressionLabel: expressionLabel,
		IsModelOverride: isModelOverride,
		Sort:            line.Sort,
		PriceItems:      make([]routePricingPriceItemDTO, 0),
	}
	lineDTO.IsDefault = routePricingLineIsDefault(line)

	switch billingMode {
	case model.RouteLineBillingModePerRequest:
		if perRequestPrice != nil {
			lineDTO.PriceItems = []routePricingPriceItemDTO{
				routePricingAmountItem("per_request", "Per request", *perRequestPrice, "request"),
			}
		}
	case model.RouteLineBillingModeExpression:
		if modelPrice != nil && modelPrice.PriceExpression != nil {
			lineDTO.BillingExpr = strings.TrimSpace(*modelPrice.PriceExpression)
		}
		if lineDTO.BillingExpr != "" {
			multiplier := 1.0
			lineDTO.ExpressionMultiplier = &multiplier
		}
		label := strings.TrimSpace(expressionLabel)
		if label == "" {
			label = "Expression pricing"
		}
		lineDTO.PriceItems = []routePricingPriceItemDTO{{
			Type:          "expression",
			LabelKey:      "Expression",
			Text:          label,
			TranslateText: label == "Expression pricing",
		}}
	default:
		ratioValue := 1.0
		if ratio != nil {
			ratioValue = *ratio
		}
		if pricing.BillingMode == billing_setting.BillingModeTieredExpr && strings.TrimSpace(pricing.BillingExpr) != "" {
			lineDTO.BillingExpr = pricing.BillingExpr
			lineDTO.ExpressionMultiplier = &ratioValue
		} else {
			lineDTO.PriceItems = routePricingRatioPriceItems(pricing, officialPriceItems, ratioValue)
		}
	}

	return lineDTO
}

func routePricingOfficialPriceItems(pricing model.Pricing) []routePricingPriceItemDTO {
	if pricing.BillingMode == billing_setting.BillingModeTieredExpr && strings.TrimSpace(pricing.BillingExpr) != "" {
		return []routePricingPriceItemDTO{}
	}
	if pricing.QuotaType == 1 {
		return []routePricingPriceItemDTO{
			routePricingAmountItem("per_request", "Per request", pricing.ModelPrice, "request"),
		}
	}

	inputPrice := pricing.ModelRatio * 2
	items := []routePricingPriceItemDTO{
		routePricingAmountItem("input", "Input", inputPrice, "1M"),
	}
	if pricing.CreateCacheRatio != nil {
		items = append(items, routePricingAmountItem("cache_write", "Cache Write", inputPrice*(*pricing.CreateCacheRatio), "1M"))
	}
	items = append(items, routePricingAmountItem("output", "Output", inputPrice*pricing.CompletionRatio, "1M"))
	if pricing.CacheRatio != nil {
		items = append(items, routePricingAmountItem("cache_read", "Cache Read", inputPrice*(*pricing.CacheRatio), "1M"))
	}
	return items
}

func routePricingRatioPriceItems(pricing model.Pricing, officialPriceItems []routePricingPriceItemDTO, ratio float64) []routePricingPriceItemDTO {
	if pricing.QuotaType == 1 {
		return []routePricingPriceItemDTO{
			routePricingAmountItem("per_request", "Per request", pricing.ModelPrice*ratio, "request"),
		}
	}

	items := make([]routePricingPriceItemDTO, 0, len(officialPriceItems))
	for _, item := range officialPriceItems {
		if item.Amount == nil {
			continue
		}
		items = append(items, routePricingAmountItem(item.Type, item.LabelKey, (*item.Amount)*ratio, item.Unit))
	}
	if len(items) == 0 {
		return []routePricingPriceItemDTO{{
			Type:     "ratio",
			LabelKey: "Ratio",
			Text:     strconv.FormatFloat(ratio, 'f', -1, 64) + "x",
		}}
	}
	return items
}

func routePricingAmountItem(itemType string, labelKey string, amount float64, unit string) routePricingPriceItemDTO {
	return routePricingPriceItemDTO{
		Type:     itemType,
		LabelKey: labelKey,
		Amount:   &amount,
		Unit:     unit,
	}
}
