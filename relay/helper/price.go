package helper

import (
	"fmt"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/billingexpr"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/setting/billing_setting"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/QuantumNous/new-api/types"

	"github.com/gin-gonic/gin"
)

func modelPriceNotConfiguredError(modelName string, userId int) error {
	if model.IsAdmin(userId) {
		return fmt.Errorf(
			"模型 %s 的价格未配置。请前往「系统设置 → 运营设置」开启自用模式，或在「系统设置 → 分组与模型定价设置」中为该模型配置价格；"+
				"Model %s price not configured. Go to System Settings → Operation Settings to enable self-use mode, or configure the model price in System Settings → Group & Model Pricing.",
			modelName, modelName,
		)
	}
	return fmt.Errorf(
		"模型 %s 的价格尚未由管理员配置，暂时无法使用，请联系站点管理员开启该模型；"+
			"Model %s has not been priced by the administrator yet. Please contact the site administrator to enable this model.",
		modelName, modelName,
	)
}

// https://docs.claude.com/en/docs/build-with-claude/prompt-caching#1-hour-cache-duration
const claudeCacheCreation1hMultiplier = 6 / 3.75

const (
	routeLineModelRuleLineDefault = "line_default"
	routeLineModelRuleModelPrice  = "model_price"
)

type routeLineBillingConfig struct {
	RouteLineId   int
	RouteLineName string
	RouteSlotId   int
	RouteSlotName string
	Source        string
	BillingMode   string
	Ratio         float64
	Price         float64
	Expression    string
	ModelRule     string
}

func resolveRouteLineBillingConfig(c *gin.Context, modelName string) (*routeLineBillingConfig, error) {
	routeLineId := common.GetContextKeyInt(c, constant.ContextKeyRouteLineId)
	if routeLineId <= 0 {
		return nil, nil
	}

	line, err := model.GetRouteLineById(routeLineId)
	if err != nil {
		return nil, fmt.Errorf("获取线路 #%d 失败: %w", routeLineId, err)
	}
	if !line.Enabled {
		return nil, fmt.Errorf("线路 %s 已禁用", line.Name)
	}

	defaultRatio := 1.0
	if line.DefaultRatio != nil {
		defaultRatio = *line.DefaultRatio
	}
	if defaultRatio < 0 {
		return nil, fmt.Errorf("线路 %s 默认倍率不能小于 0", line.Name)
	}

	cfg := &routeLineBillingConfig{
		RouteLineId:   line.Id,
		RouteLineName: line.Name,
		RouteSlotId:   common.GetContextKeyInt(c, constant.ContextKeyRouteSlotId),
		RouteSlotName: common.GetContextKeyString(c, constant.ContextKeyRouteSlotName),
		Source:        common.GetContextKeyString(c, constant.ContextKeyRouteLineSource),
		BillingMode:   model.RouteLineBillingModeRatio,
		Ratio:         defaultRatio,
		ModelRule:     routeLineModelRuleLineDefault,
	}

	price, err := model.GetEnabledRouteLineModelPrice(line.Id, modelName)
	if err != nil {
		return nil, err
	}
	if price == nil {
		return cfg, nil
	}

	cfg.BillingMode = strings.TrimSpace(price.BillingMode)
	cfg.ModelRule = routeLineModelRuleModelPrice
	switch cfg.BillingMode {
	case model.RouteLineBillingModeRatio:
		if price.Ratio == nil || *price.Ratio < 0 {
			return nil, fmt.Errorf("线路 %s 的模型 %s 倍率未正确配置", line.Name, price.ModelName)
		}
		cfg.Ratio = *price.Ratio
	case model.RouteLineBillingModePerRequest:
		if price.PerRequestPrice == nil || *price.PerRequestPrice < 0 {
			return nil, fmt.Errorf("线路 %s 的模型 %s 按次价格未正确配置", line.Name, price.ModelName)
		}
		cfg.Ratio = 0
		cfg.Price = *price.PerRequestPrice
	case model.RouteLineBillingModeExpression:
		if price.PriceExpression == nil || strings.TrimSpace(*price.PriceExpression) == "" {
			return nil, fmt.Errorf("线路 %s 的模型 %s 计费表达式未正确配置", line.Name, price.ModelName)
		}
		cfg.Ratio = 0
		cfg.Expression = strings.TrimSpace(*price.PriceExpression)
	default:
		return nil, fmt.Errorf("线路 %s 的模型 %s 计费模式不支持: %s", line.Name, price.ModelName, cfg.BillingMode)
	}
	return cfg, nil
}

func applyRouteLineBillingConfig(priceData *types.PriceData, cfg *routeLineBillingConfig) {
	if priceData == nil || cfg == nil {
		return
	}
	priceData.RouteLineId = cfg.RouteLineId
	priceData.RouteLineName = cfg.RouteLineName
	priceData.RouteSlotId = cfg.RouteSlotId
	priceData.RouteSlotName = cfg.RouteSlotName
	priceData.RouteLineSource = cfg.Source
	priceData.RouteLineBillingMode = cfg.BillingMode
	priceData.RouteLineModelRule = cfg.ModelRule
	if cfg.BillingMode == model.RouteLineBillingModeRatio {
		priceData.RouteLineRatio = cfg.Ratio
	}
	if cfg.BillingMode == model.RouteLineBillingModePerRequest {
		priceData.RouteLinePrice = cfg.Price
	}
}

// HandleGroupRatio checks for "auto_group" in the context and updates the group ratio and relayInfo.UsingGroup if present
func HandleGroupRatio(ctx *gin.Context, relayInfo *relaycommon.RelayInfo) types.GroupRatioInfo {
	groupRatioInfo := types.GroupRatioInfo{
		GroupRatio:        1.0, // default ratio
		GroupSpecialRatio: -1,
	}

	// check auto group
	autoGroup, exists := ctx.Get("auto_group")
	if exists {
		logger.LogDebug(ctx, "final group: %s", autoGroup)
		relayInfo.UsingGroup = autoGroup.(string)
	}

	// check user group special ratio
	userGroupRatio, ok := ratio_setting.GetGroupGroupRatio(relayInfo.UserGroup, relayInfo.UsingGroup)
	if ok {
		// user group special ratio
		groupRatioInfo.GroupSpecialRatio = userGroupRatio
		groupRatioInfo.GroupRatio = userGroupRatio
		groupRatioInfo.HasSpecialRatio = true
	} else {
		// normal group ratio
		groupRatioInfo.GroupRatio = ratio_setting.GetGroupRatio(relayInfo.UsingGroup)
	}

	return groupRatioInfo
}

func ModelPriceHelper(c *gin.Context, info *relaycommon.RelayInfo, promptTokens int, meta *types.TokenCountMeta) (types.PriceData, error) {
	modelPrice, usePrice := ratio_setting.GetModelPrice(info.OriginModelName, false)

	groupRatioInfo := HandleGroupRatio(c, info)
	routeLineBilling, err := resolveRouteLineBillingConfig(c, info.OriginModelName)
	if err != nil {
		return types.PriceData{}, err
	}

	if routeLineBilling != nil && routeLineBilling.BillingMode == model.RouteLineBillingModeExpression {
		return modelPriceHelperTiered(c, info, promptTokens, meta, groupRatioInfo, routeLineBilling, routeLineBilling.Expression)
	}
	// Check if this model uses tiered_expr billing
	if billing_setting.GetBillingMode(info.OriginModelName) == billing_setting.BillingModeTieredExpr {
		return modelPriceHelperTiered(c, info, promptTokens, meta, groupRatioInfo, routeLineBilling, "")
	}

	if routeLineBilling != nil && routeLineBilling.BillingMode == model.RouteLineBillingModePerRequest {
		preConsumedQuota := int(routeLineBilling.Price * common.QuotaPerUnit * groupRatioInfo.GroupRatio)
		freeModel := false
		if !operation_setting.GetQuotaSetting().EnableFreeModelPreConsume {
			if groupRatioInfo.GroupRatio == 0 || routeLineBilling.Price == 0 {
				preConsumedQuota = 0
				freeModel = true
			}
		}
		priceData := types.PriceData{
			FreeModel:         freeModel,
			ModelPrice:        routeLineBilling.Price,
			GroupRatioInfo:    groupRatioInfo,
			UsePrice:          true,
			QuotaToPreConsume: preConsumedQuota,
		}
		applyRouteLineBillingConfig(&priceData, routeLineBilling)
		if common.DebugEnabled {
			logger.LogDebug(c, "model_price_helper result: %s", priceData.ToSetting())
		}
		info.PriceData = priceData
		return priceData, nil
	}

	var preConsumedQuota int
	var modelRatio float64
	var completionRatio float64
	var cacheRatio float64
	var imageRatio float64
	var cacheCreationRatio float64
	var cacheCreationRatio5m float64
	var cacheCreationRatio1h float64
	var audioRatio float64
	var audioCompletionRatio float64
	var freeModel bool
	routeRatio := 1.0
	if routeLineBilling != nil && routeLineBilling.BillingMode == model.RouteLineBillingModeRatio {
		routeRatio = routeLineBilling.Ratio
	}
	if !usePrice {
		preConsumedTokens := common.Max(promptTokens, common.PreConsumedQuota)
		if meta.MaxTokens != 0 {
			preConsumedTokens += meta.MaxTokens
		}
		var success bool
		var matchName string
		modelRatio, success, matchName = ratio_setting.GetModelRatio(info.OriginModelName)
		if !success {
			acceptUnsetRatio := false
			if info.UserSetting.AcceptUnsetRatioModel {
				acceptUnsetRatio = true
			}
			if !acceptUnsetRatio {
				return types.PriceData{}, modelPriceNotConfiguredError(matchName, info.UserId)
			}
		}
		modelRatio = modelRatio * routeRatio
		completionRatio = ratio_setting.GetCompletionRatio(info.OriginModelName)
		cacheRatio, _ = ratio_setting.GetCacheRatio(info.OriginModelName)
		cacheCreationRatio, _ = ratio_setting.GetCreateCacheRatio(info.OriginModelName)
		cacheCreationRatio5m = cacheCreationRatio
		// 固定1h和5min缓存写入价格的比例
		cacheCreationRatio1h = cacheCreationRatio * claudeCacheCreation1hMultiplier
		imageRatio, _ = ratio_setting.GetImageRatio(info.OriginModelName)
		audioRatio = ratio_setting.GetAudioRatio(info.OriginModelName)
		audioCompletionRatio = ratio_setting.GetAudioCompletionRatio(info.OriginModelName)
		ratio := modelRatio * groupRatioInfo.GroupRatio
		preConsumedQuota = int(float64(preConsumedTokens) * ratio)
	} else {
		if meta.ImagePriceRatio != 0 {
			modelPrice = modelPrice * meta.ImagePriceRatio
		}
		modelPrice = modelPrice * routeRatio
		preConsumedQuota = int(modelPrice * common.QuotaPerUnit * groupRatioInfo.GroupRatio)
	}

	// check if free model pre-consume is disabled
	if !operation_setting.GetQuotaSetting().EnableFreeModelPreConsume {
		// if model price or ratio is 0, do not pre-consume quota
		if groupRatioInfo.GroupRatio == 0 {
			preConsumedQuota = 0
			freeModel = true
		} else if usePrice {
			if modelPrice == 0 {
				preConsumedQuota = 0
				freeModel = true
			}
		} else {
			if modelRatio == 0 {
				preConsumedQuota = 0
				freeModel = true
			}
		}
	}

	priceData := types.PriceData{
		FreeModel:            freeModel,
		ModelPrice:           modelPrice,
		ModelRatio:           modelRatio,
		CompletionRatio:      completionRatio,
		GroupRatioInfo:       groupRatioInfo,
		UsePrice:             usePrice,
		CacheRatio:           cacheRatio,
		ImageRatio:           imageRatio,
		AudioRatio:           audioRatio,
		AudioCompletionRatio: audioCompletionRatio,
		CacheCreationRatio:   cacheCreationRatio,
		CacheCreation5mRatio: cacheCreationRatio5m,
		CacheCreation1hRatio: cacheCreationRatio1h,
		QuotaToPreConsume:    preConsumedQuota,
	}
	applyRouteLineBillingConfig(&priceData, routeLineBilling)

	if common.DebugEnabled {
		logger.LogDebug(c, "model_price_helper result: %s", priceData.ToSetting())
	}
	info.PriceData = priceData
	return priceData, nil
}

// ModelPriceHelperPerCall 按次/按量计费的 PriceHelper (MJ、Task)
func ModelPriceHelperPerCall(c *gin.Context, info *relaycommon.RelayInfo) (types.PriceData, error) {
	groupRatioInfo := HandleGroupRatio(c, info)

	modelPrice, success := ratio_setting.GetModelPrice(info.OriginModelName, true)
	usePrice := success
	var modelRatio float64

	if !success {
		defaultPrice, ok := ratio_setting.GetDefaultModelPriceMap()[info.OriginModelName]
		if ok {
			modelPrice = defaultPrice
			usePrice = true
		} else {
			var ratioSuccess bool
			var matchName string
			modelRatio, ratioSuccess, matchName = ratio_setting.GetModelRatio(info.OriginModelName)
			acceptUnsetRatio := false
			if info.UserSetting.AcceptUnsetRatioModel {
				acceptUnsetRatio = true
			}
			if !ratioSuccess && !acceptUnsetRatio {
				return types.PriceData{}, modelPriceNotConfiguredError(matchName, info.UserId)
			}
		}
	}

	var quota int
	freeModel := false

	if usePrice {
		quota = int(modelPrice * common.QuotaPerUnit * groupRatioInfo.GroupRatio)
		if !operation_setting.GetQuotaSetting().EnableFreeModelPreConsume {
			if groupRatioInfo.GroupRatio == 0 || modelPrice == 0 {
				quota = 0
				freeModel = true
			}
		}
	} else {
		// 按量计费：以模型倍率的一半作为预扣额度
		quota = int(modelRatio / 2 * common.QuotaPerUnit * groupRatioInfo.GroupRatio)
		modelPrice = -1
		if !operation_setting.GetQuotaSetting().EnableFreeModelPreConsume {
			if groupRatioInfo.GroupRatio == 0 || modelRatio == 0 {
				quota = 0
				freeModel = true
			}
		}
	}

	priceData := types.PriceData{
		FreeModel:      freeModel,
		ModelPrice:     modelPrice,
		ModelRatio:     modelRatio,
		UsePrice:       usePrice,
		Quota:          quota,
		GroupRatioInfo: groupRatioInfo,
	}
	return priceData, nil
}

func HasModelBillingConfig(modelName string) bool {
	if _, ok := ratio_setting.GetModelPrice(modelName, false); ok {
		return true
	}
	if _, ok, _ := ratio_setting.GetModelRatio(modelName); ok {
		return true
	}
	if billing_setting.GetBillingMode(modelName) != billing_setting.BillingModeTieredExpr {
		return false
	}
	expr, ok := billing_setting.GetBillingExpr(modelName)
	return ok && strings.TrimSpace(expr) != ""
}

func modelPriceHelperTiered(c *gin.Context, info *relaycommon.RelayInfo, promptTokens int, meta *types.TokenCountMeta, groupRatioInfo types.GroupRatioInfo, routeLineBilling *routeLineBillingConfig, exprOverride string) (types.PriceData, error) {
	exprStr := strings.TrimSpace(exprOverride)
	if exprStr == "" {
		var ok bool
		exprStr, ok = billing_setting.GetBillingExpr(info.OriginModelName)
		if !ok {
			return types.PriceData{}, fmt.Errorf("model %s is configured as tiered_expr but has no billing expression", info.OriginModelName)
		}
	}

	estimatedCompletionTokens := 0
	if meta.MaxTokens != 0 {
		estimatedCompletionTokens = meta.MaxTokens
	}

	requestInput, err := ResolveIncomingBillingExprRequestInput(c, info)
	if err != nil {
		return types.PriceData{}, err
	}

	rawCost, trace, err := billingexpr.RunExprWithRequest(exprStr, billingexpr.TokenParams{
		P:   float64(promptTokens),
		C:   float64(estimatedCompletionTokens),
		Len: float64(promptTokens),
	}, requestInput)
	if err != nil {
		return types.PriceData{}, fmt.Errorf("model %s tiered expr run failed: %w", info.OriginModelName, err)
	}

	// Expression coefficients are $/1M tokens prices; convert to quota the same way per-call billing does.
	quotaBeforeGroup := rawCost / 1_000_000 * common.QuotaPerUnit
	effectiveGroupRatio := groupRatioInfo.GroupRatio
	if routeLineBilling != nil && routeLineBilling.BillingMode == model.RouteLineBillingModeRatio {
		// 线路默认倍率是模型价格体系的一层倍率。表达式结算会在后扣时重跑，
		// 所以必须写进冻结快照，避免预扣使用线路倍率、后扣又丢失线路倍率。
		effectiveGroupRatio = effectiveGroupRatio * routeLineBilling.Ratio
	}
	preConsumedQuota := billingexpr.QuotaRound(quotaBeforeGroup * effectiveGroupRatio)

	freeModel := false
	if !operation_setting.GetQuotaSetting().EnableFreeModelPreConsume {
		if effectiveGroupRatio == 0 {
			preConsumedQuota = 0
			freeModel = true
		}
	}

	exprHash := billingexpr.ExprHashString(exprStr)
	snapshot := &billingexpr.BillingSnapshot{
		BillingMode:               billing_setting.BillingModeTieredExpr,
		ModelName:                 info.OriginModelName,
		ExprString:                exprStr,
		ExprHash:                  exprHash,
		GroupRatio:                effectiveGroupRatio,
		EstimatedPromptTokens:     promptTokens,
		EstimatedCompletionTokens: estimatedCompletionTokens,
		EstimatedQuotaBeforeGroup: quotaBeforeGroup,
		EstimatedQuotaAfterGroup:  preConsumedQuota,
		EstimatedTier:             trace.MatchedTier,
		QuotaPerUnit:              common.QuotaPerUnit,
		ExprVersion:               billingexpr.ExprVersion(exprStr),
	}
	info.TieredBillingSnapshot = snapshot
	info.BillingRequestInput = &requestInput

	priceData := types.PriceData{
		FreeModel:         freeModel,
		GroupRatioInfo:    groupRatioInfo,
		QuotaToPreConsume: preConsumedQuota,
	}
	applyRouteLineBillingConfig(&priceData, routeLineBilling)

	logger.LogDebug(c, "model_price_helper_tiered result: model=%s preConsume=%d quotaBeforeGroup=%.2f groupRatio=%.2f effectiveGroupRatio=%.2f tier=%s", info.OriginModelName, preConsumedQuota, quotaBeforeGroup, groupRatioInfo.GroupRatio, effectiveGroupRatio, trace.MatchedTier)

	info.PriceData = priceData
	return priceData, nil
}
