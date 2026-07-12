package service

import (
	"math"
	"net/http"
	"testing"

	"github.com/QuantumNous/new-api/common"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestQuotaSaturationAuditUsesFirstClampAndAdminInfo(t *testing.T) {
	relayInfo := &relaycommon.RelayInfo{}
	_, first := common.QuotaFromFloatChecked(float64(common.MaxQuota) * 2)
	_, second := common.QuotaFromFloatChecked(math.Inf(-1))
	require.NotNil(t, first)
	require.NotNil(t, second)

	noteQuotaClamp(relayInfo, first)
	noteQuotaClamp(relayInfo, second)
	require.Same(t, first, relayInfo.QuotaClamp)

	other := map[string]interface{}{}
	attachQuotaSaturationToOther(other, relayInfo.QuotaClamp)
	adminInfo, ok := other["admin_info"].(map[string]interface{})
	require.True(t, ok)
	marker, ok := adminInfo["quota_saturation"].(map[string]interface{})
	require.True(t, ok)
	assert.Equal(t, common.QuotaClampOverflow, marker["kind"])
	assert.Equal(t, common.MaxQuota, marker["clamped"])
}

func TestPreConsumeBillingRejectsInvalidQuotaBeforeDeduction(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(nil)
	_, clamp := common.QuotaFromFloatChecked(float64(common.MaxQuota) * 2)
	require.NotNil(t, clamp)

	t.Run("saturated estimate", func(t *testing.T) {
		info := &relaycommon.RelayInfo{QuotaClamp: clamp}
		apiErr := PreConsumeBilling(ctx, common.MaxQuota, info)

		require.NotNil(t, apiErr)
		assert.Equal(t, types.ErrorCodeModelPriceError, apiErr.GetErrorCode())
		assert.Equal(t, http.StatusBadRequest, apiErr.StatusCode)
		assert.Nil(t, info.Billing)
		var typedClamp *common.QuotaClamp
		require.ErrorAs(t, apiErr, &typedClamp)
	})

	t.Run("negative estimate", func(t *testing.T) {
		info := &relaycommon.RelayInfo{}
		apiErr := PreConsumeBilling(ctx, -1, info)

		require.NotNil(t, apiErr)
		assert.Equal(t, types.ErrorCodeModelPriceError, apiErr.GetErrorCode())
		assert.Equal(t, http.StatusBadRequest, apiErr.StatusCode)
		assert.Nil(t, info.Billing)
	})
}
