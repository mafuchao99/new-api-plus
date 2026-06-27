package controller

import (
	"encoding/csv"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"

	"github.com/gin-gonic/gin"
)

func buildMaskedTokenResponse(token *model.Token) *model.Token {
	if token == nil {
		return nil
	}
	maskedToken := *token
	maskedToken.Key = token.GetMaskedKey()
	return &maskedToken
}

func buildMaskedTokenResponses(tokens []*model.Token) []*model.Token {
	maskedTokens := make([]*model.Token, 0, len(tokens))
	for _, token := range tokens {
		maskedTokens = append(maskedTokens, buildMaskedTokenResponse(token))
	}
	return maskedTokens
}

type tokenRouteOverrideRequest struct {
	RouteSlotId int `json:"route_slot_id"`
	RouteLineId int `json:"route_line_id"`
}

type tokenSaveRequest struct {
	Id                 int                         `json:"id"`
	Status             int                         `json:"status"`
	Name               string                      `json:"name"`
	ExpiredTime        int64                       `json:"expired_time"`
	RemainQuota        int                         `json:"remain_quota"`
	UnlimitedQuota     bool                        `json:"unlimited_quota"`
	ModelLimitsEnabled bool                        `json:"model_limits_enabled"`
	ModelLimits        string                      `json:"model_limits"`
	AllowIps           *string                     `json:"allow_ips"`
	Group              string                      `json:"group"`
	CrossGroupRetry    bool                        `json:"cross_group_retry"`
	RouteOverrides     []tokenRouteOverrideRequest `json:"route_overrides"`
}

func ensureUserTokenNameAvailable(c *gin.Context, userId int, tokenId int, name string) bool {
	duplicated, err := model.IsUserTokenNameDuplicated(userId, tokenId, name)
	if err != nil {
		common.ApiError(c, err)
		return false
	}
	if duplicated {
		common.ApiErrorMsg(c, "API key name already exists")
		return false
	}
	return true
}

func GetAllTokens(c *gin.Context) {
	userId := c.GetInt("id")
	pageInfo := common.GetPageQuery(c)
	tokens, err := model.GetAllUserTokens(userId, pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if err := enrichTokensWithRouteStrategies(tokens); err != nil {
		common.ApiError(c, err)
		return
	}
	total, _ := model.CountUserTokens(userId)
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(buildMaskedTokenResponses(tokens))
	common.ApiSuccess(c, pageInfo)
}

func SearchTokens(c *gin.Context) {
	userId := c.GetInt("id")
	keyword := c.Query("keyword")
	token := c.Query("token")

	pageInfo := common.GetPageQuery(c)

	tokens, total, err := model.SearchUserTokens(userId, keyword, token, pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if err := enrichTokensWithRouteStrategies(tokens); err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(buildMaskedTokenResponses(tokens))
	common.ApiSuccess(c, pageInfo)
}

func GetToken(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	userId := c.GetInt("id")
	if err != nil {
		common.ApiError(c, err)
		return
	}
	token, err := model.GetTokenByIds(id, userId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if err := enrichTokensWithRouteStrategies([]*model.Token{token}); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, buildMaskedTokenResponse(token))
}

func GetTokenKey(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	userId := c.GetInt("id")
	if err != nil {
		common.ApiError(c, err)
		return
	}
	token, err := model.GetTokenByIds(id, userId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{
		"key": token.GetFullKey(),
	})
}

func GetTokenStatus(c *gin.Context) {
	tokenId := c.GetInt("token_id")
	userId := c.GetInt("id")
	token, err := model.GetTokenByIds(tokenId, userId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	expiredAt := token.ExpiredTime
	if expiredAt == -1 {
		expiredAt = 0
	}
	c.JSON(http.StatusOK, gin.H{
		"object":          "credit_summary",
		"total_granted":   token.RemainQuota,
		"total_used":      0, // not supported currently
		"total_available": token.RemainQuota,
		"expires_at":      expiredAt * 1000,
	})
}

func GetTokenUsage(c *gin.Context) {
	authHeader := c.GetHeader("Authorization")
	if authHeader == "" {
		c.JSON(http.StatusUnauthorized, gin.H{
			"success": false,
			"message": "No Authorization header",
		})
		return
	}

	parts := strings.Split(authHeader, " ")
	if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
		c.JSON(http.StatusUnauthorized, gin.H{
			"success": false,
			"message": "Invalid Bearer token",
		})
		return
	}
	tokenKey := parts[1]

	token, err := model.GetTokenByKey(strings.TrimPrefix(tokenKey, "sk-"), false)
	if err != nil {
		common.SysError("failed to get token by key: " + err.Error())
		common.ApiErrorI18n(c, i18n.MsgTokenGetInfoFailed)
		return
	}

	expiredAt := token.ExpiredTime
	if expiredAt == -1 {
		expiredAt = 0
	}

	c.JSON(http.StatusOK, gin.H{
		"code":    true,
		"message": "ok",
		"data": gin.H{
			"object":               "token_usage",
			"name":                 token.Name,
			"total_granted":        token.RemainQuota + token.UsedQuota,
			"total_used":           token.UsedQuota,
			"total_available":      token.RemainQuota,
			"unlimited_quota":      token.UnlimitedQuota,
			"model_limits":         token.GetModelLimitsMap(),
			"model_limits_enabled": token.ModelLimitsEnabled,
			"expires_at":           expiredAt,
		},
	})
}

func AddToken(c *gin.Context) {
	userId := c.GetInt("id")
	req := tokenSaveRequest{}
	err := c.ShouldBindJSON(&req)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if len(req.Name) > 50 {
		common.ApiErrorI18n(c, i18n.MsgTokenNameTooLong)
		return
	}
	if !ensureUserTokenNameAvailable(c, userId, 0, req.Name) {
		return
	}
	routeOverrides, ok := validateTokenRouteOverrides(c, req.RouteOverrides)
	if !ok {
		return
	}
	// 非无限额度时，检查额度值是否超出有效范围
	if !req.UnlimitedQuota {
		if req.RemainQuota < 0 {
			common.ApiErrorI18n(c, i18n.MsgTokenQuotaNegative)
			return
		}
		maxQuotaValue := int((1000000000 * common.QuotaPerUnit))
		if req.RemainQuota > maxQuotaValue {
			common.ApiErrorI18n(c, i18n.MsgTokenQuotaExceedMax, map[string]any{"Max": maxQuotaValue})
			return
		}
	}
	// 检查用户令牌数量是否已达上限
	maxTokens := operation_setting.GetMaxUserTokens()
	count, err := model.CountUserTokens(userId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if int(count) >= maxTokens {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": fmt.Sprintf("已达到最大令牌数量限制 (%d)", maxTokens),
		})
		return
	}
	key, err := common.GenerateKey()
	if err != nil {
		common.ApiErrorI18n(c, i18n.MsgTokenGenerateFailed)
		common.SysLog("failed to generate token key: " + err.Error())
		return
	}
	cleanToken := model.Token{
		UserId:             userId,
		Name:               req.Name,
		Key:                key,
		CreatedTime:        common.GetTimestamp(),
		AccessedTime:       common.GetTimestamp(),
		ExpiredTime:        req.ExpiredTime,
		RemainQuota:        req.RemainQuota,
		UnlimitedQuota:     req.UnlimitedQuota,
		ModelLimitsEnabled: req.ModelLimitsEnabled,
		ModelLimits:        req.ModelLimits,
		AllowIps:           req.AllowIps,
		Group:              req.Group,
		CrossGroupRetry:    req.CrossGroupRetry,
	}
	err = cleanToken.InsertWithRouteOverrides(routeOverrides)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if err := enrichTokensWithRouteStrategies([]*model.Token{&cleanToken}); err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    buildMaskedTokenResponse(&cleanToken),
	})
}

type batchTokenRow struct {
	Name           string
	RemainQuota    int
	UnlimitedQuota bool
}

func normalizeTokenBatchHeader(header string) string {
	header = strings.TrimPrefix(header, "\ufeff")
	header = strings.TrimSpace(strings.ToLower(header))
	header = strings.ReplaceAll(header, " ", "_")
	header = strings.ReplaceAll(header, "-", "_")
	switch header {
	case "name", "名字", "名称":
		return "name"
	case "quota", "amount", "额度", "金额", "剩余金额":
		return "quota"
	default:
		return header
	}
}

func parseBatchCreateTokenCsv(file io.Reader) ([]batchTokenRow, error) {
	reader := csv.NewReader(file)
	reader.FieldsPerRecord = -1
	reader.TrimLeadingSpace = true

	records, err := reader.ReadAll()
	if err != nil {
		return nil, fmt.Errorf("CSV 解析失败：%w", err)
	}
	if len(records) == 0 {
		return nil, errors.New("CSV 中没有可创建的数据")
	}

	headerIndex := map[string]int{}
	for index, header := range records[0] {
		headerIndex[normalizeTokenBatchHeader(header)] = index
	}
	nameIndex, hasName := headerIndex["name"]
	quotaIndex, hasQuota := headerIndex["quota"]
	startRow := 1
	if !hasName || !hasQuota {
		if len(records[0]) < 2 {
			return nil, errors.New("CSV 表头必须包含 name 和 quota（或 名字 和 额度）")
		}
		nameIndex = 0
		quotaIndex = 1
		startRow = 0
	}

	rows := make([]batchTokenRow, 0, len(records)-startRow)
	for rowIndex, record := range records[startRow:] {
		displayRow := rowIndex + startRow + 1
		name := ""
		if nameIndex < len(record) {
			name = strings.TrimSpace(record[nameIndex])
		}
		if name == "" {
			return nil, fmt.Errorf("第 %d 行名称不能为空", displayRow)
		}
		if len(name) > 50 {
			return nil, fmt.Errorf("第 %d 行名称超过 50 个字符", displayRow)
		}

		quotaText := ""
		if quotaIndex < len(record) {
			quotaText = strings.TrimSpace(record[quotaIndex])
		}
		if quotaText == "" {
			return nil, fmt.Errorf("第 %d 行额度不能为空", displayRow)
		}

		quotaAmount, err := strconv.ParseFloat(quotaText, 64)
		if err != nil {
			return nil, fmt.Errorf("第 %d 行额度格式不正确", displayRow)
		}
		if quotaAmount == -1 {
			rows = append(rows, batchTokenRow{Name: name, UnlimitedQuota: true})
			continue
		}
		if quotaAmount < 0 {
			return nil, fmt.Errorf("第 %d 行额度不能小于 0，只有 -1 表示无限", displayRow)
		}

		remainQuota := int(quotaAmount * common.QuotaPerUnit)
		maxQuotaValue := int((1000000000 * common.QuotaPerUnit))
		if remainQuota > maxQuotaValue {
			return nil, fmt.Errorf("第 %d 行额度超过最大值 %d", displayRow, maxQuotaValue)
		}
		rows = append(rows, batchTokenRow{
			Name:        name,
			RemainQuota: remainQuota,
		})
	}
	if len(rows) == 0 {
		return nil, errors.New("CSV 中没有可创建的数据")
	}
	return rows, nil
}

func BatchCreateTokens(c *gin.Context) {
	file, err := c.FormFile("file")
	if err != nil {
		common.ApiErrorMsg(c, "请上传 CSV 文件")
		return
	}
	openedFile, err := file.Open()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	defer openedFile.Close()

	rows, err := parseBatchCreateTokenCsv(openedFile)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	userId := c.GetInt("id")
	rowNames := make([]string, 0, len(rows))
	for _, row := range rows {
		rowNames = append(rowNames, row.Name)
	}
	existingNames, err := model.GetExistingUserTokenNames(userId, rowNames)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	existingNameSet := make(map[string]bool, len(existingNames))
	for _, name := range existingNames {
		existingNameSet[strings.ToLower(name)] = true
	}

	duplicateNames := make([]string, 0)
	duplicateNameSet := make(map[string]bool)
	addDuplicateName := func(name string) {
		normalizedName := strings.ToLower(name)
		if duplicateNameSet[normalizedName] {
			return
		}
		duplicateNameSet[normalizedName] = true
		duplicateNames = append(duplicateNames, name)
	}

	seenNames := make(map[string]bool, len(rows))
	createRows := make([]batchTokenRow, 0, len(rows))
	for _, row := range rows {
		normalizedName := strings.ToLower(row.Name)
		if existingNameSet[normalizedName] || seenNames[normalizedName] {
			addDuplicateName(row.Name)
			continue
		}
		seenNames[normalizedName] = true
		createRows = append(createRows, row)
	}
	maxTokens := operation_setting.GetMaxUserTokens()
	count, err := model.CountUserTokens(userId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if int(count)+len(createRows) > maxTokens {
		common.ApiErrorMsg(c, fmt.Sprintf("创建后将超过最大令牌数量限制 (%d)", maxTokens))
		return
	}

	now := common.GetTimestamp()
	tokens := make([]model.Token, 0, len(createRows))
	for _, row := range createRows {
		key, err := common.GenerateKey()
		if err != nil {
			common.ApiErrorI18n(c, i18n.MsgTokenGenerateFailed)
			common.SysLog("failed to generate token key: " + err.Error())
			return
		}
		tokens = append(tokens, model.Token{
			UserId:         userId,
			Name:           row.Name,
			Key:            key,
			CreatedTime:    now,
			AccessedTime:   now,
			ExpiredTime:    -1,
			RemainQuota:    row.RemainQuota,
			UnlimitedQuota: row.UnlimitedQuota,
			Group:          "",
		})
	}

	if len(tokens) > 0 {
		if err := model.BatchInsertTokens(tokens); err != nil {
			common.ApiError(c, err)
			return
		}
	}
	common.ApiSuccess(c, gin.H{
		"count":           len(tokens),
		"duplicate_names": duplicateNames,
	})
}

func GetTokenRouteOptions(c *gin.Context) {
	slots, err := model.ListRouteSlots()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	lines, err := model.ListRouteLines()
	if err != nil {
		common.ApiError(c, err)
		return
	}

	slotItems := make([]routeSlotDTO, 0, len(slots))
	for _, slot := range slots {
		if !slot.Enabled {
			continue
		}
		slotItems = append(slotItems, routeSlotToDTO(slot))
	}

	lineItems := make([]routeLineDTO, 0, len(lines))
	for _, line := range lines {
		if line.SlotId == nil || !line.Enabled || !line.Visible {
			continue
		}
		lineItems = append(lineItems, routeLineToDTO(line))
	}

	common.ApiSuccess(c, gin.H{
		"slots": slotItems,
		"lines": lineItems,
	})
}

func DeleteToken(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	userId := c.GetInt("id")
	err := model.DeleteTokenById(id, userId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
	})
}

func UpdateToken(c *gin.Context) {
	userId := c.GetInt("id")
	statusOnly := c.Query("status_only")
	req := tokenSaveRequest{}
	err := c.ShouldBindJSON(&req)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if len(req.Name) > 50 {
		common.ApiErrorI18n(c, i18n.MsgTokenNameTooLong)
		return
	}
	var routeOverrides []model.ApiKeyRouteOverrideInput
	if statusOnly == "" {
		var ok bool
		routeOverrides, ok = validateTokenRouteOverrides(c, req.RouteOverrides)
		if !ok {
			return
		}
	}
	if !req.UnlimitedQuota {
		if req.RemainQuota < 0 {
			common.ApiErrorI18n(c, i18n.MsgTokenQuotaNegative)
			return
		}
		maxQuotaValue := int((1000000000 * common.QuotaPerUnit))
		if req.RemainQuota > maxQuotaValue {
			common.ApiErrorI18n(c, i18n.MsgTokenQuotaExceedMax, map[string]any{"Max": maxQuotaValue})
			return
		}
	}
	cleanToken, err := model.GetTokenByIds(req.Id, userId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if statusOnly == "" &&
		req.Name != cleanToken.Name &&
		!ensureUserTokenNameAvailable(c, userId, req.Id, req.Name) {
		return
	}
	if req.Status == common.TokenStatusEnabled {
		if cleanToken.Status == common.TokenStatusExpired && cleanToken.ExpiredTime <= common.GetTimestamp() && cleanToken.ExpiredTime != -1 {
			common.ApiErrorI18n(c, i18n.MsgTokenExpiredCannotEnable)
			return
		}
		if cleanToken.Status == common.TokenStatusExhausted && cleanToken.RemainQuota <= 0 && !cleanToken.UnlimitedQuota {
			common.ApiErrorI18n(c, i18n.MsgTokenExhaustedCannotEable)
			return
		}
	}
	if statusOnly != "" {
		cleanToken.Status = req.Status
	} else {
		// If you add more fields, please also update token.Update()
		cleanToken.Name = req.Name
		cleanToken.ExpiredTime = req.ExpiredTime
		cleanToken.RemainQuota = req.RemainQuota
		cleanToken.UnlimitedQuota = req.UnlimitedQuota
		cleanToken.ModelLimitsEnabled = req.ModelLimitsEnabled
		cleanToken.ModelLimits = req.ModelLimits
		cleanToken.AllowIps = req.AllowIps
		cleanToken.Group = req.Group
		cleanToken.CrossGroupRetry = req.CrossGroupRetry
	}
	if statusOnly != "" {
		err = cleanToken.Update()
	} else {
		err = cleanToken.UpdateWithRouteOverrides(routeOverrides)
	}
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if err := enrichTokensWithRouteStrategies([]*model.Token{cleanToken}); err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    buildMaskedTokenResponse(cleanToken),
	})
}

type TokenBatch struct {
	Ids []int `json:"ids"`
}

func DeleteTokenBatch(c *gin.Context) {
	tokenBatch := TokenBatch{}
	if err := c.ShouldBindJSON(&tokenBatch); err != nil || len(tokenBatch.Ids) == 0 {
		common.ApiErrorI18n(c, i18n.MsgInvalidParams)
		return
	}
	userId := c.GetInt("id")
	count, err := model.BatchDeleteTokens(tokenBatch.Ids, userId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    count,
	})
}

func GetTokenKeysBatch(c *gin.Context) {
	tokenBatch := TokenBatch{}
	if err := c.ShouldBindJSON(&tokenBatch); err != nil || len(tokenBatch.Ids) == 0 {
		common.ApiErrorI18n(c, i18n.MsgInvalidParams)
		return
	}
	if len(tokenBatch.Ids) > 100 {
		common.ApiErrorI18n(c, i18n.MsgBatchTooMany, map[string]any{"Max": 100})
		return
	}
	userId := c.GetInt("id")
	tokens, err := model.GetTokenKeysByIds(tokenBatch.Ids, userId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	keysMap := make(map[int]string)
	for _, t := range tokens {
		keysMap[t.Id] = t.GetFullKey()
	}
	common.ApiSuccess(c, gin.H{"keys": keysMap})
}

func validateTokenRouteOverrides(c *gin.Context, requests []tokenRouteOverrideRequest) ([]model.ApiKeyRouteOverrideInput, bool) {
	overrides := make([]model.ApiKeyRouteOverrideInput, 0, len(requests))
	seenSlots := make(map[int]bool, len(requests))
	for _, req := range requests {
		if req.RouteSlotId <= 0 || req.RouteLineId <= 0 {
			common.ApiErrorMsg(c, "route slot and route line cannot be empty")
			return nil, false
		}
		if seenSlots[req.RouteSlotId] {
			common.ApiErrorMsg(c, "each route slot can only select one route line")
			return nil, false
		}
		seenSlots[req.RouteSlotId] = true

		slot, err := model.GetRouteSlotById(req.RouteSlotId)
		if err != nil {
			common.ApiError(c, err)
			return nil, false
		}
		if !slot.Enabled {
			common.ApiErrorMsg(c, "route slot is disabled")
			return nil, false
		}
		line, err := model.GetRouteLineById(req.RouteLineId)
		if err != nil {
			common.ApiError(c, err)
			return nil, false
		}
		if !line.Enabled || !line.Visible {
			common.ApiErrorMsg(c, "route line is not available")
			return nil, false
		}
		if line.SlotId == nil || *line.SlotId != slot.Id {
			common.ApiErrorMsg(c, "route line must belong to the selected route slot")
			return nil, false
		}
		overrides = append(overrides, model.ApiKeyRouteOverrideInput{
			RouteSlotId: req.RouteSlotId,
			RouteLineId: req.RouteLineId,
		})
	}
	return overrides, true
}

func enrichTokensWithRouteStrategies(tokens []*model.Token) error {
	if len(tokens) == 0 {
		return nil
	}

	tokenIds := make([]int, 0, len(tokens))
	for _, token := range tokens {
		if token != nil {
			tokenIds = append(tokenIds, token.Id)
		}
	}
	overrides, err := model.ListTokenRouteOverridesByTokenIds(tokenIds)
	if err != nil {
		return err
	}
	slots, err := model.ListRouteSlots()
	if err != nil {
		return err
	}
	lines, err := model.ListRouteLines()
	if err != nil {
		return err
	}

	enabledSlots := make([]model.RouteSlot, 0, len(slots))
	for _, slot := range slots {
		if slot.Enabled {
			enabledSlots = append(enabledSlots, slot)
		}
	}
	lineById := make(map[int]model.RouteLine, len(lines))
	for _, line := range lines {
		if line.Enabled && line.Visible {
			lineById[line.Id] = line
		}
	}

	overridesByToken := make(map[int][]model.ApiKeyRouteOverride)
	overridesByTokenSlot := make(map[int]map[int]model.ApiKeyRouteOverride)
	for _, override := range overrides {
		overridesByToken[override.TokenId] = append(overridesByToken[override.TokenId], override)
		if overridesByTokenSlot[override.TokenId] == nil {
			overridesByTokenSlot[override.TokenId] = make(map[int]model.ApiKeyRouteOverride)
		}
		overridesByTokenSlot[override.TokenId][override.RouteSlotId] = override
	}

	for _, token := range tokens {
		if token == nil {
			continue
		}
		token.RouteOverrides = overridesByToken[token.Id]
		token.RouteOverridesCount = len(token.RouteOverrides)
		token.EffectiveRouteLines = make([]model.ApiKeyEffectiveRouteLine, 0, len(enabledSlots))

		for _, slot := range enabledSlots {
			item := model.ApiKeyEffectiveRouteLine{
				RouteSlot: routeSlotSummary(slot),
			}
			lineId := 0
			if slot.DefaultRouteLineId != nil {
				lineId = *slot.DefaultRouteLineId
			}
			if override, ok := overridesByTokenSlot[token.Id][slot.Id]; ok {
				lineId = override.RouteLineId
				item.IsCustom = true
			}
			if line, ok := lineById[lineId]; ok {
				summary := routeLineSummary(line)
				item.RouteLine = &summary
			}
			token.EffectiveRouteLines = append(token.EffectiveRouteLines, item)
		}
	}
	return nil
}

func routeSlotSummary(slot model.RouteSlot) model.ApiKeyRouteSlotSummary {
	return model.ApiKeyRouteSlotSummary{
		Id:                 slot.Id,
		Code:               slot.Code,
		Name:               slot.Name,
		Description:        slot.Description,
		DefaultRouteLineId: slot.DefaultRouteLineId,
	}
}

func routeLineSummary(line model.RouteLine) model.ApiKeyRouteLineSummary {
	billingMode := model.RouteLineBillingModeRatio
	for _, price := range line.ModelPrices {
		if !price.Enabled {
			continue
		}
		billingMode = model.RouteLineBillingModeExpression
		if price.BillingMode == model.RouteLineBillingModePerRequest {
			billingMode = model.RouteLineBillingModePerRequest
			break
		}
	}
	return model.ApiKeyRouteLineSummary{
		Id:           line.Id,
		SlotId:       line.SlotId,
		Code:         line.Code,
		Name:         line.Name,
		Description:  line.Description,
		BillingMode:  billingMode,
		DefaultRatio: normalizeDefaultRatio(line.DefaultRatio),
	}
}
