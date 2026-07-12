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

func TestGPT56DefaultRatios(t *testing.T) {
	tests := []struct {
		model      string
		inputRatio float64
	}{
		{model: "gpt-5.6-sol", inputRatio: 2.5},
		{model: "gpt-5.6-terra", inputRatio: 1.25},
		{model: "gpt-5.6-luna", inputRatio: 0.5},
	}

	for _, test := range tests {
		t.Run(test.model, func(t *testing.T) {
			require.Equal(t, test.inputRatio, defaultModelRatio[test.model])
			completionRatio, locked := getHardcodedCompletionModelRatio(test.model)
			require.Equal(t, 6.0, completionRatio)
			require.False(t, locked)
			require.Equal(t, 0.1, defaultCacheRatio[test.model])
			require.Equal(t, 1.25, defaultCreateCacheRatio[test.model])
		})
	}
}
