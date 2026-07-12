package dto

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestOpenAIResponsesRequestPreservesCodexFields(t *testing.T) {
	requestJSON := `{
		"model":"gpt-5.6-sol",
		"input":"edit the workspace",
		"tools":[{"type":"function","name":"apply_patch"}],
		"client_metadata":{"originator":"codex_app"},
		"reasoning":{"effort":"high","mode":"adaptive","context":{"turn_id":"turn-1"}},
		"prompt_cache_options":{"type":"ephemeral"}
	}`

	var request OpenAIResponsesRequest
	require.NoError(t, common.UnmarshalJsonStr(requestJSON, &request))
	require.NotNil(t, request.Reasoning)
	assert.Equal(t, "high", request.Reasoning.Effort)
	assert.JSONEq(t, `"adaptive"`, string(request.Reasoning.Mode))
	assert.JSONEq(t, `{"turn_id":"turn-1"}`, string(request.Reasoning.Context))
	assert.JSONEq(t, `{"originator":"codex_app"}`, string(request.ClientMetadata))
	assert.JSONEq(t, `[{"type":"function","name":"apply_patch"}]`, string(request.Tools))
	assert.JSONEq(t, `{"type":"ephemeral"}`, string(request.PromptCacheOptions))

	encoded, err := common.Marshal(request)
	require.NoError(t, err)
	assert.JSONEq(t, requestJSON, string(encoded))
}

func TestOpenAIResponsesCompactionRequestParsesCodexParityFields(t *testing.T) {
	requestJSON := `{
		"model":"gpt-5.6-sol-compact",
		"input":[{"role":"user","content":"continue"}],
		"tools":[{"type":"function","name":"shell"}],
		"parallel_tool_calls":true,
		"reasoning":{"mode":"adaptive","context":{"turn_id":"turn-2"}},
		"service_tier":"priority",
		"prompt_cache_key":"workspace-1",
		"prompt_cache_options":{"type":"ephemeral"},
		"prompt_cache_retention":"24h",
		"text":{"format":{"type":"text"}}
	}`

	var request OpenAIResponsesCompactionRequest
	require.NoError(t, common.UnmarshalJsonStr(requestJSON, &request))
	require.NotNil(t, request.Reasoning)
	assert.JSONEq(t, `[{"type":"function","name":"shell"}]`, string(request.Tools))
	assert.JSONEq(t, `true`, string(request.ParallelToolCalls))
	assert.JSONEq(t, `"adaptive"`, string(request.Reasoning.Mode))
	assert.Equal(t, "priority", request.ServiceTier)
	assert.JSONEq(t, `"workspace-1"`, string(request.PromptCacheKey))
	assert.JSONEq(t, `{"type":"ephemeral"}`, string(request.PromptCacheOptions))
	assert.JSONEq(t, `"24h"`, string(request.PromptCacheRetention))
	assert.JSONEq(t, `{"format":{"type":"text"}}`, string(request.Text))
}
