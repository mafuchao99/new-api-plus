package dto_test

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestOpenAIUsageParsesNativeCacheWriteTokens(t *testing.T) {
	t.Run("chat completions", func(t *testing.T) {
		var usage dto.Usage
		err := common.Unmarshal([]byte(`{
			"prompt_tokens": 1473,
			"prompt_tokens_details": {"cache_write_tokens": 1470}
		}`), &usage)
		require.NoError(t, err)
		assert.Equal(t, 1470, usage.PromptTokensDetails.CacheWriteTokens)
	})

	t.Run("responses", func(t *testing.T) {
		var response dto.OpenAIResponsesResponse
		err := common.Unmarshal([]byte(`{
			"usage": {
				"input_tokens": 1473,
				"input_tokens_details": {"cache_write_tokens": 1470}
			}
		}`), &response)
		require.NoError(t, err)
		require.NotNil(t, response.Usage)
		require.NotNil(t, response.Usage.InputTokensDetails)
		assert.Equal(t, 1470, response.Usage.InputTokensDetails.CacheWriteTokens)
	})
}
