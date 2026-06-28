package service

import (
	"errors"
	"fmt"
	"sort"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/ratio_setting"

	"github.com/gin-gonic/gin"
)

type routeLineMatchedChannels struct {
	selection model.EffectiveRouteLineSelection
	bindings  []model.ChannelRouteBinding
}

type unavailableCustomRouteLine struct {
	selection model.EffectiveRouteLineSelection
	bindings  []model.ChannelRouteBinding
}

func GetRouteLineSatisfiedChannel(param *RetryParam) (*model.Channel, *model.EffectiveRouteLineSelection, bool, error) {
	if param == nil || param.Ctx == nil || strings.TrimSpace(param.ModelName) == "" {
		return nil, nil, false, nil
	}

	tokenId := common.GetContextKeyInt(param.Ctx, constant.ContextKeyTokenId)
	if tokenId <= 0 {
		clearRouteLineContext(param.Ctx)
		return nil, nil, false, nil
	}

	// 核心规则：
	// 1. 先按 API key 计算每个槽位最终生效的线路。
	// 2. 一个槽位最多只产出一条线路：有覆盖用覆盖，没有覆盖才用槽位默认。
	// 3. 再用这些最终线路去匹配当前请求模型，命中后才进入线路渠道池。
	selections, err := model.ListEffectiveRouteLineSelections(tokenId)
	if err != nil {
		clearRouteLineContext(param.Ctx)
		return nil, nil, false, err
	}
	if len(selections) == 0 {
		clearRouteLineContext(param.Ctx)
		return nil, nil, false, nil
	}

	routeLineIds := make([]int, 0, len(selections))
	for _, selection := range selections {
		routeLineIds = append(routeLineIds, selection.Line.Id)
	}

	bindings, err := model.ListEnabledRouteLineBindings(routeLineIds)
	if err != nil {
		clearRouteLineContext(param.Ctx)
		return nil, nil, false, err
	}

	bindingsByLine := make(map[int][]model.ChannelRouteBinding, len(routeLineIds))
	for _, binding := range bindings {
		bindingsByLine[binding.RouteLineId] = append(bindingsByLine[binding.RouteLineId], binding)
	}

	matchedLines := make([]routeLineMatchedChannels, 0, len(selections))
	unavailableCustomLines := make([]unavailableCustomRouteLine, 0)
	for _, selection := range selections {
		if !selection.Line.Enabled {
			if selection.Source == model.RouteLineSourceCustom {
				unavailableCustomLines = append(unavailableCustomLines, unavailableCustomRouteLine{
					selection: selection,
					bindings:  bindingsByLine[selection.Line.Id],
				})
			}
			continue
		}
		candidates := filterRouteLineBindings(bindingsByLine[selection.Line.Id], param.ModelName, param.RequestPath)
		if len(candidates) == 0 {
			if selection.Source == model.RouteLineSourceCustom {
				unavailableCustomLines = append(unavailableCustomLines, unavailableCustomRouteLine{
					selection: selection,
					bindings:  bindingsByLine[selection.Line.Id],
				})
			}
			continue
		}
		matchedLines = append(matchedLines, routeLineMatchedChannels{
			selection: selection,
			bindings:  candidates,
		})
	}

	if failedSelection, err := findUnavailableCustomRouteLineForModel(unavailableCustomLines, param.ModelName, param.RequestPath); err != nil {
		clearRouteLineContext(param.Ctx)
		return nil, nil, true, err
	} else if failedSelection != nil {
		clearRouteLineContext(param.Ctx)
		return nil, failedSelection, true, fmt.Errorf("所选线路「%s」暂无可用渠道或线路已关闭，请联系管理员或在 API 密钥中切换线路", failedSelection.Line.Name)
	}

	if len(matchedLines) == 0 {
		clearRouteLineContext(param.Ctx)
		return nil, nil, false, nil
	}

	if len(matchedLines) > 1 {
		selected := matchedLines[0].selection
		logger.LogWarn(param.Ctx, fmt.Sprintf(
			"模型 %s 同时命中 %d 条线路，按槽位排序使用线路#%d（%s），请检查线路模型覆盖是否重复",
			param.ModelName,
			len(matchedLines),
			selected.Line.Id,
			selected.Line.Name,
		))
	}

	selected := matchedLines[0]
	channel, err := selectRouteLineBindingChannel(selected.bindings, param.GetRetry())
	if err != nil {
		clearRouteLineContext(param.Ctx)
		return nil, nil, true, err
	}
	setRouteLineContext(param.Ctx, selected.selection)
	return channel, &selected.selection, true, nil
}

func filterRouteLineBindings(bindings []model.ChannelRouteBinding, modelName string, requestPath string) []model.ChannelRouteBinding {
	candidates := make([]model.ChannelRouteBinding, 0, len(bindings))
	for _, binding := range bindings {
		if !binding.Enabled || binding.Channel == nil {
			continue
		}
		if binding.Channel.Status != common.ChannelStatusEnabled {
			continue
		}
		if !model.ChannelSupportsModelName(binding.Channel, modelName) {
			continue
		}
		if !model.ChannelSupportsRequestPath(binding.Channel, requestPath) {
			continue
		}
		candidates = append(candidates, binding)
	}
	return candidates
}

func findUnavailableCustomRouteLineForModel(lines []unavailableCustomRouteLine, modelName string, requestPath string) (*model.EffectiveRouteLineSelection, error) {
	if len(lines) == 0 {
		return nil, nil
	}

	slotIds := make([]int, 0, len(lines))
	seenSlotIds := make(map[int]struct{}, len(lines))
	for _, item := range lines {
		if item.selection.Slot.Id <= 0 {
			continue
		}
		if _, ok := seenSlotIds[item.selection.Slot.Id]; ok {
			continue
		}
		seenSlotIds[item.selection.Slot.Id] = struct{}{}
		slotIds = append(slotIds, item.selection.Slot.Id)
	}

	slotClaims, err := routeSlotModelClaims(slotIds, modelName, requestPath)
	if err != nil {
		return nil, err
	}

	for _, item := range lines {
		// 自定义线路是用户显式选择的强约束：
		// 如果这条线路本身或同槽位其它线路能说明“当前模型属于这个槽位”，
		// 但自定义线路没有可用渠道，就直接失败，避免静默回退到其它价格。
		if routeLineBindingsClaimModel(item.bindings, modelName, requestPath) ||
			routeLineModelPricesClaimModel(item.selection.Line.ModelPrices, modelName) ||
			slotClaims[item.selection.Slot.Id] {
			selection := item.selection
			return &selection, nil
		}
	}
	return nil, nil
}

func routeSlotModelClaims(slotIds []int, modelName string, requestPath string) (map[int]bool, error) {
	claims := make(map[int]bool)
	if len(slotIds) == 0 {
		return claims, nil
	}

	lines, err := model.ListEnabledRouteLinesBySlotIds(slotIds)
	if err != nil {
		return nil, err
	}
	if len(lines) == 0 {
		return claims, nil
	}

	lineIds := make([]int, 0, len(lines))
	lineById := make(map[int]model.RouteLine, len(lines))
	for _, line := range lines {
		lineIds = append(lineIds, line.Id)
		lineById[line.Id] = line
	}

	bindings, err := model.ListEnabledRouteLineBindings(lineIds)
	if err != nil {
		return nil, err
	}
	bindingsByLine := make(map[int][]model.ChannelRouteBinding, len(lineIds))
	for _, binding := range bindings {
		bindingsByLine[binding.RouteLineId] = append(bindingsByLine[binding.RouteLineId], binding)
	}

	for _, line := range lineById {
		if line.SlotId == nil {
			continue
		}
		if routeLineModelPricesClaimModel(line.ModelPrices, modelName) ||
			routeLineBindingsClaimModel(bindingsByLine[line.Id], modelName, requestPath) {
			claims[*line.SlotId] = true
		}
	}
	return claims, nil
}

func routeLineBindingsClaimModel(bindings []model.ChannelRouteBinding, modelName string, requestPath string) bool {
	for _, binding := range bindings {
		if !binding.Enabled || binding.Channel == nil {
			continue
		}
		if !model.ChannelSupportsModelName(binding.Channel, modelName) {
			continue
		}
		if !model.ChannelSupportsRequestPath(binding.Channel, requestPath) {
			continue
		}
		return true
	}
	return false
}

func routeLineModelPricesClaimModel(prices []model.RouteLineModelPrice, modelName string) bool {
	modelName = strings.TrimSpace(modelName)
	if modelName == "" {
		return false
	}
	formattedModelName := ratio_setting.FormatMatchingModelName(modelName)
	for _, price := range prices {
		if !price.Enabled {
			continue
		}
		priceModelName := strings.TrimSpace(price.ModelName)
		if priceModelName == modelName || priceModelName == formattedModelName {
			return true
		}
	}
	return false
}

func selectRouteLineBindingChannel(bindings []model.ChannelRouteBinding, retry int) (*model.Channel, error) {
	if len(bindings) == 0 {
		return nil, errors.New("线路没有可用渠道")
	}

	uniquePriorities := make(map[int]struct{}, len(bindings))
	for _, binding := range bindings {
		uniquePriorities[binding.Priority] = struct{}{}
	}
	priorities := make([]int, 0, len(uniquePriorities))
	for priority := range uniquePriorities {
		priorities = append(priorities, priority)
	}
	sort.Sort(sort.Reverse(sort.IntSlice(priorities)))

	if retry >= len(priorities) {
		retry = len(priorities) - 1
	}
	if retry < 0 {
		retry = 0
	}
	targetPriority := priorities[retry]

	targetBindings := make([]model.ChannelRouteBinding, 0, len(bindings))
	sumWeight := 0
	for _, binding := range bindings {
		if binding.Priority != targetPriority {
			continue
		}
		weight := binding.Weight
		if weight < 0 {
			weight = 0
		}
		sumWeight += weight
		targetBindings = append(targetBindings, binding)
	}
	if len(targetBindings) == 0 {
		return nil, errors.New("线路优先级没有可用渠道")
	}
	if len(targetBindings) == 1 {
		return targetBindings[0].Channel, nil
	}

	smoothingFactor := 1
	smoothingAdjustment := 0
	if sumWeight == 0 {
		sumWeight = len(targetBindings) * 100
		smoothingAdjustment = 100
	} else if sumWeight/len(targetBindings) < 10 {
		smoothingFactor = 100
	}

	totalWeight := sumWeight * smoothingFactor
	if totalWeight <= 0 {
		return targetBindings[0].Channel, nil
	}
	randomWeight := common.GetRandomInt(totalWeight)
	for _, binding := range targetBindings {
		weight := binding.Weight
		if weight < 0 {
			weight = 0
		}
		randomWeight -= weight*smoothingFactor + smoothingAdjustment
		if randomWeight < 0 {
			return binding.Channel, nil
		}
	}
	return targetBindings[len(targetBindings)-1].Channel, nil
}

func setRouteLineContext(c *gin.Context, selection model.EffectiveRouteLineSelection) {
	common.SetContextKey(c, constant.ContextKeyRouteLineId, selection.Line.Id)
	common.SetContextKey(c, constant.ContextKeyRouteLineName, selection.Line.Name)
	common.SetContextKey(c, constant.ContextKeyRouteSlotId, selection.Slot.Id)
	common.SetContextKey(c, constant.ContextKeyRouteSlotName, selection.Slot.Name)
	common.SetContextKey(c, constant.ContextKeyRouteLineSource, selection.Source)
}

func clearRouteLineContext(c *gin.Context) {
	if c == nil || c.Keys == nil {
		return
	}
	delete(c.Keys, string(constant.ContextKeyRouteLineId))
	delete(c.Keys, string(constant.ContextKeyRouteLineName))
	delete(c.Keys, string(constant.ContextKeyRouteSlotId))
	delete(c.Keys, string(constant.ContextKeyRouteSlotName))
	delete(c.Keys, string(constant.ContextKeyRouteLineSource))
}
