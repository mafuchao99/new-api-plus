package controller

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/billing_setting"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestRoutePricingUsesGlobalBillingExpressionForRatioLine(t *testing.T) {
	expr := `len <= 272000 ? tier("standard", p * 5 + c * 30 + cr * 0.5 + cc * 6.25) : tier("long_context", p * 10 + c * 45 + cr * 1 + cc * 12.5)`
	pricing := model.Pricing{
		ModelName:       "gpt-5.6-sol",
		BillingMode:     billing_setting.BillingModeTieredExpr,
		BillingExpr:     expr,
		ModelRatio:      2.5,
		CompletionRatio: 6,
	}

	ratio := 0.3
	channel := &model.Channel{
		Id:     10,
		Status: common.ChannelStatusEnabled,
		Models: pricing.ModelName,
	}
	line := model.RouteLine{
		Id:           1,
		Name:         "stable",
		Visible:      true,
		Enabled:      true,
		DefaultRatio: &ratio,
		Bindings: []model.ChannelRouteBinding{
			{Enabled: true, ChannelId: channel.Id, Channel: channel},
		},
	}
	response := buildRoutePricingResponse([]model.Pricing{pricing}, nil, []model.RouteLine{line})
	require.Equal(t, "route-pricing-v2", response.PricingVersion)
	require.Len(t, response.Models, 1)
	modelDTO := response.Models[0]
	assert.Equal(t, billing_setting.BillingModeTieredExpr, modelDTO.BillingMode)
	assert.Equal(t, expr, modelDTO.BillingExpr)
	assert.Empty(t, modelDTO.OfficialPriceItems, "legacy flat prices must not be emitted for expression-priced models")
	require.Len(t, modelDTO.Lines, 1)
	lineDTO := modelDTO.Lines[0]

	assert.Equal(t, model.RouteLineBillingModeRatio, lineDTO.BillingMode)
	assert.Equal(t, expr, lineDTO.BillingExpr)
	require.NotNil(t, lineDTO.ExpressionMultiplier)
	assert.Equal(t, ratio, *lineDTO.ExpressionMultiplier)
	assert.Empty(t, lineDTO.PriceItems)
}

func TestRoutePricingLineExpressionOverridesGlobalExpression(t *testing.T) {
	globalExpr := `tier("global", p * 5 + c * 30)`
	lineExpr := `tier("route", p * 4 + c * 24)`
	pricing := model.Pricing{
		ModelName:   "gpt-5.6-sol",
		BillingMode: billing_setting.BillingModeTieredExpr,
		BillingExpr: globalExpr,
	}
	modelPrice := &model.RouteLineModelPrice{
		BillingMode:     model.RouteLineBillingModeExpression,
		PriceExpression: &lineExpr,
	}

	lineDTO := routePricingLineToDTO(
		model.RouteLine{Id: 2, Name: "custom"},
		"category",
		pricing,
		modelPrice,
		routePricingOfficialPriceItems(pricing),
	)

	assert.Equal(t, model.RouteLineBillingModeExpression, lineDTO.BillingMode)
	assert.Equal(t, lineExpr, lineDTO.BillingExpr)
	require.NotNil(t, lineDTO.ExpressionMultiplier)
	assert.Equal(t, 1.0, *lineDTO.ExpressionMultiplier)
}

func TestRoutePricingLabelsCacheReadAndWriteSeparately(t *testing.T) {
	cacheReadRatio := 0.1
	cacheWriteRatio := 1.25
	pricing := model.Pricing{
		ModelRatio:       2.5,
		CompletionRatio:  6,
		CacheRatio:       &cacheReadRatio,
		CreateCacheRatio: &cacheWriteRatio,
	}

	items := routePricingOfficialPriceItems(pricing)
	require.Len(t, items, 4)
	assert.Equal(t, "input", items[0].Type)
	assert.Equal(t, "cache_write", items[1].Type)
	assert.Equal(t, "Cache Write", items[1].LabelKey)
	assert.InDelta(t, 6.25, *items[1].Amount, 1e-9)
	assert.Equal(t, "output", items[2].Type)
	assert.Equal(t, "cache_read", items[3].Type)
	assert.Equal(t, "Cache Read", items[3].LabelKey)
	assert.InDelta(t, 0.5, *items[3].Amount, 1e-9)
}
