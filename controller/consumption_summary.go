package controller

import (
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

func GetConsumptionSummary(c *gin.Context) {
	var query model.ConsumptionSummaryQuery
	if err := c.ShouldBindQuery(&query); err != nil {
		common.ApiErrorMsg(c, "Invalid consumption summary filters.")
		return
	}
	summary, err := model.GetConsumptionSummary(c.Request.Context(), query)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, summary)
}
