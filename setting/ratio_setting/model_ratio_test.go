package ratio_setting

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestFutureGPT5CompletionRatioUsesConfiguredValue(t *testing.T) {
	originalCompletionRatio := CompletionRatio2JSONString()
	require.NoError(t, UpdateCompletionRatioByJSONString(`{"gpt-5.6-sol":4}`))
	t.Cleanup(func() {
		require.NoError(t, UpdateCompletionRatioByJSONString(originalCompletionRatio))
	})

	require.Equal(t, 4.0, GetCompletionRatio("gpt-5.6-sol"))
	completionRatioInfo := GetCompletionRatioInfo("gpt-5.6-sol")
	require.Equal(t, 4.0, completionRatioInfo.Ratio)
	require.False(t, completionRatioInfo.Locked)
}
