package helper

import (
	"math"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/billingexpr"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/setting/billing_setting"
	"github.com/QuantumNous/new-api/setting/config"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestModelPriceHelperTieredUsesPreloadedRequestInput(t *testing.T) {
	gin.SetMode(gin.TestMode)

	saved := map[string]string{}
	require.NoError(t, config.GlobalConfig.SaveToDB(func(key, value string) error {
		saved[key] = value
		return nil
	}))
	t.Cleanup(func() {
		require.NoError(t, config.GlobalConfig.LoadFromDB(saved))
	})

	require.NoError(t, config.GlobalConfig.LoadFromDB(map[string]string{
		"billing_setting.billing_mode": `{"tiered-test-model":"tiered_expr"}`,
		"billing_setting.billing_expr": `{"tiered-test-model":"param(\"stream\") == true ? tier(\"stream\", p * 3) : tier(\"base\", p * 2)"}`,
	}))

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	req := httptest.NewRequest(http.MethodPost, "/api/channel/test/1", nil)
	req.Body = nil
	req.ContentLength = 0
	req.Header.Set("Content-Type", "application/json")
	ctx.Request = req
	ctx.Set("group", "default")

	info := &relaycommon.RelayInfo{
		OriginModelName: "tiered-test-model",
		UserGroup:       "default",
		UsingGroup:      "default",
		RequestHeaders:  map[string]string{"Content-Type": "application/json"},
		BillingRequestInput: &billingexpr.RequestInput{
			Headers: map[string]string{"Content-Type": "application/json"},
			Body:    []byte(`{"stream":true}`),
		},
	}

	priceData, err := ModelPriceHelper(ctx, info, 1000, &types.TokenCountMeta{})
	require.NoError(t, err)
	require.Equal(t, 1500, priceData.QuotaToPreConsume)
	require.NotNil(t, info.TieredBillingSnapshot)
	require.Equal(t, "stream", info.TieredBillingSnapshot.EstimatedTier)
	require.Equal(t, billing_setting.BillingModeTieredExpr, info.TieredBillingSnapshot.BillingMode)
	require.Equal(t, common.QuotaPerUnit, info.TieredBillingSnapshot.QuotaPerUnit)
}

func TestModelPriceHelperRouteLineBillingSaturatesQuota(t *testing.T) {
	gin.SetMode(gin.TestMode)

	oldDB := model.DB
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.RouteLine{}, &model.RouteLineModelPrice{}))
	model.DB = db
	t.Cleanup(func() {
		model.DB = oldDB
	})

	oldModelPrices := ratio_setting.ModelPrice2JSONString()
	require.NoError(t, ratio_setting.UpdateModelPriceByJSONString(`{"route-ratio-model":1,"route-per-request-model":1}`))
	t.Cleanup(func() {
		require.NoError(t, ratio_setting.UpdateModelPriceByJSONString(oldModelPrices))
	})

	newContext := func(routeLineId int) *gin.Context {
		ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
		req := httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)
		req.Header.Set("Content-Type", "application/json")
		ctx.Request = req
		ctx.Set("group", "default")
		common.SetContextKey(ctx, constant.ContextKeyRouteLineId, routeLineId)
		return ctx
	}

	t.Run("ratio mode", func(t *testing.T) {
		line := model.RouteLine{Code: "ratio-line", Name: "Ratio Line", Enabled: true}
		require.NoError(t, db.Create(&line).Error)
		ratio := math.MaxFloat64
		price := model.RouteLineModelPrice{
			RouteLineId: line.Id,
			ModelName:   "route-ratio-model",
			BillingMode: model.RouteLineBillingModeRatio,
			Ratio:       &ratio,
			Enabled:     true,
		}
		require.NoError(t, db.Create(&price).Error)

		info := &relaycommon.RelayInfo{
			OriginModelName: "route-ratio-model",
			UserGroup:       "default",
			UsingGroup:      "default",
		}

		priceData, err := ModelPriceHelper(newContext(line.Id), info, 1, &types.TokenCountMeta{})

		require.NoError(t, err)
		require.Equal(t, math.MaxInt32, priceData.QuotaToPreConsume)
	})

	t.Run("per request mode", func(t *testing.T) {
		line := model.RouteLine{Code: "per-request-line", Name: "Per Request Line", Enabled: true}
		require.NoError(t, db.Create(&line).Error)
		perRequestPrice := math.MaxFloat64
		price := model.RouteLineModelPrice{
			RouteLineId:     line.Id,
			ModelName:       "route-per-request-model",
			BillingMode:     model.RouteLineBillingModePerRequest,
			PerRequestPrice: &perRequestPrice,
			Enabled:         true,
		}
		require.NoError(t, db.Create(&price).Error)

		info := &relaycommon.RelayInfo{
			OriginModelName: "route-per-request-model",
			UserGroup:       "default",
			UsingGroup:      "default",
		}

		priceData, err := ModelPriceHelper(newContext(line.Id), info, 1, &types.TokenCountMeta{})

		require.NoError(t, err)
		require.Equal(t, math.MaxInt32, priceData.QuotaToPreConsume)
	})
}

func TestModelPriceHelperPerCallAppliesRouteLineBilling(t *testing.T) {
	gin.SetMode(gin.TestMode)

	oldDB := model.DB
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.RouteLine{}, &model.RouteLineModelPrice{}))
	model.DB = db
	t.Cleanup(func() {
		model.DB = oldDB
	})

	oldModelPrices := ratio_setting.ModelPrice2JSONString()
	require.NoError(t, ratio_setting.UpdateModelPriceByJSONString(`{"per-call-ratio-model":2,"per-call-per-request-model":2}`))
	t.Cleanup(func() {
		require.NoError(t, ratio_setting.UpdateModelPriceByJSONString(oldModelPrices))
	})

	newContext := func(routeLineId int) *gin.Context {
		ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
		req := httptest.NewRequest(http.MethodPost, "/v1/video/generations", nil)
		req.Header.Set("Content-Type", "application/json")
		ctx.Request = req
		ctx.Set("group", "default")
		common.SetContextKey(ctx, constant.ContextKeyRouteLineId, routeLineId)
		return ctx
	}

	t.Run("ratio mode", func(t *testing.T) {
		line := model.RouteLine{Code: "per-call-ratio-line", Name: "Per Call Ratio Line", Enabled: true}
		require.NoError(t, db.Create(&line).Error)
		ratio := 3.0
		price := model.RouteLineModelPrice{
			RouteLineId: line.Id,
			ModelName:   "per-call-ratio-model",
			BillingMode: model.RouteLineBillingModeRatio,
			Ratio:       &ratio,
			Enabled:     true,
		}
		require.NoError(t, db.Create(&price).Error)

		info := &relaycommon.RelayInfo{
			OriginModelName: "per-call-ratio-model",
			UserGroup:       "default",
			UsingGroup:      "default",
		}

		priceData, err := ModelPriceHelperPerCall(newContext(line.Id), info)

		require.NoError(t, err)
		require.True(t, priceData.UsePrice)
		require.Equal(t, 6.0, priceData.ModelPrice)
		require.Equal(t, ratio, priceData.RouteLineRatio)
		require.Equal(t, common.QuotaFromFloat(6*common.QuotaPerUnit), priceData.Quota)
	})

	t.Run("per request mode", func(t *testing.T) {
		line := model.RouteLine{Code: "per-call-price-line", Name: "Per Call Price Line", Enabled: true}
		require.NoError(t, db.Create(&line).Error)
		perRequestPrice := 4.0
		price := model.RouteLineModelPrice{
			RouteLineId:     line.Id,
			ModelName:       "per-call-per-request-model",
			BillingMode:     model.RouteLineBillingModePerRequest,
			PerRequestPrice: &perRequestPrice,
			Enabled:         true,
		}
		require.NoError(t, db.Create(&price).Error)

		info := &relaycommon.RelayInfo{
			OriginModelName: "per-call-per-request-model",
			UserGroup:       "default",
			UsingGroup:      "default",
		}

		priceData, err := ModelPriceHelperPerCall(newContext(line.Id), info)

		require.NoError(t, err)
		require.True(t, priceData.UsePrice)
		require.Equal(t, perRequestPrice, priceData.ModelPrice)
		require.Equal(t, perRequestPrice, priceData.RouteLinePrice)
		require.Equal(t, common.QuotaFromFloat(perRequestPrice*common.QuotaPerUnit), priceData.Quota)
	})
}
