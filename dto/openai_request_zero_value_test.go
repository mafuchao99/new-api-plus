package dto

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/require"
	"github.com/tidwall/gjson"
)

func TestGeneralOpenAIRequestPreserveExplicitZeroValues(t *testing.T) {
	raw := []byte(`{
		"model":"gpt-4.1",
		"stream":false,
		"max_tokens":0,
		"max_completion_tokens":0,
		"top_p":0,
		"top_k":0,
		"n":0,
		"frequency_penalty":0,
		"presence_penalty":0,
		"seed":0,
		"logprobs":false,
		"top_logprobs":0,
		"dimensions":0,
		"return_images":false,
		"return_related_questions":false
	}`)

	var req GeneralOpenAIRequest
	err := common.Unmarshal(raw, &req)
	require.NoError(t, err)

	encoded, err := common.Marshal(req)
	require.NoError(t, err)

	require.True(t, gjson.GetBytes(encoded, "stream").Exists())
	require.True(t, gjson.GetBytes(encoded, "max_tokens").Exists())
	require.True(t, gjson.GetBytes(encoded, "max_completion_tokens").Exists())
	require.True(t, gjson.GetBytes(encoded, "top_p").Exists())
	require.True(t, gjson.GetBytes(encoded, "top_k").Exists())
	require.True(t, gjson.GetBytes(encoded, "n").Exists())
	require.True(t, gjson.GetBytes(encoded, "frequency_penalty").Exists())
	require.True(t, gjson.GetBytes(encoded, "presence_penalty").Exists())
	require.True(t, gjson.GetBytes(encoded, "seed").Exists())
	require.True(t, gjson.GetBytes(encoded, "logprobs").Exists())
	require.True(t, gjson.GetBytes(encoded, "top_logprobs").Exists())
	require.True(t, gjson.GetBytes(encoded, "dimensions").Exists())
	require.True(t, gjson.GetBytes(encoded, "return_images").Exists())
	require.True(t, gjson.GetBytes(encoded, "return_related_questions").Exists())
}

func TestOpenAIResponsesRequestPreserveExplicitZeroValues(t *testing.T) {
	raw := []byte(`{
		"model":"gpt-4.1",
		"max_output_tokens":0,
		"max_tool_calls":0,
		"stream":false,
		"top_p":0
	}`)

	var req OpenAIResponsesRequest
	err := common.Unmarshal(raw, &req)
	require.NoError(t, err)

	encoded, err := common.Marshal(req)
	require.NoError(t, err)

	require.True(t, gjson.GetBytes(encoded, "max_output_tokens").Exists())
	require.True(t, gjson.GetBytes(encoded, "max_tool_calls").Exists())
	require.True(t, gjson.GetBytes(encoded, "stream").Exists())
	require.True(t, gjson.GetBytes(encoded, "top_p").Exists())
}

func TestOpenAIResponsesRequestRemoveImageGenerationTool(t *testing.T) {
	req := OpenAIResponsesRequest{
		Tools: []byte(`[
			{"type":"web_search_preview","search_context_size":"low"},
			{"type":"image_generation","size":"1024x1024"},
			{"type":"file_search","vector_store_ids":["vs_123"]}
		]`),
	}

	req.RemoveImageGenerationTool()

	require.Equal(t, 2, int(gjson.GetBytes(req.Tools, "#").Int()))
	require.Equal(t, "web_search_preview", gjson.GetBytes(req.Tools, "0.type").String())
	require.Equal(t, "file_search", gjson.GetBytes(req.Tools, "1.type").String())
	require.Equal(t, "vs_123", gjson.GetBytes(req.Tools, "1.vector_store_ids.0").String())
}

func TestOpenAIResponsesRequestRemoveOnlyImageGenerationTool(t *testing.T) {
	req := OpenAIResponsesRequest{
		Tools: []byte(`[{"type":"image_generation","size":"1024x1024"}]`),
	}

	req.RemoveImageGenerationTool()

	require.Nil(t, req.Tools)
}

func TestRemoveImageGenerationToolFromResponsesJSONPreservesOtherFields(t *testing.T) {
	raw := []byte(`{
		"model":"gpt-4.1",
		"input":"hello",
		"metadata":{"trace_id":"abc"},
		"tools":[
			{"type":"image_generation","quality":"low"},
			{"type":"file_search","vector_store_ids":["vs_123"]}
		]
	}`)

	filtered, changed, err := RemoveImageGenerationToolFromResponsesJSON(raw)
	require.NoError(t, err)
	require.True(t, changed)

	require.Equal(t, "gpt-4.1", gjson.GetBytes(filtered, "model").String())
	require.Equal(t, "hello", gjson.GetBytes(filtered, "input").String())
	require.Equal(t, "abc", gjson.GetBytes(filtered, "metadata.trace_id").String())
	require.Equal(t, 1, int(gjson.GetBytes(filtered, "tools.#").Int()))
	require.Equal(t, "file_search", gjson.GetBytes(filtered, "tools.0.type").String())
	require.Equal(t, "vs_123", gjson.GetBytes(filtered, "tools.0.vector_store_ids.0").String())
}

func TestRemoveImageGenerationToolFromResponsesJSONRemovesEmptyToolsField(t *testing.T) {
	raw := []byte(`{"model":"gpt-4.1","input":"hello","tools":[{"type":"image_generation"}]}`)

	filtered, changed, err := RemoveImageGenerationToolFromResponsesJSON(raw)
	require.NoError(t, err)
	require.True(t, changed)

	require.False(t, gjson.GetBytes(filtered, "tools").Exists())
	require.Equal(t, "gpt-4.1", gjson.GetBytes(filtered, "model").String())
}

func TestGeneralOpenAIRequestGetSystemRoleName(t *testing.T) {
	tests := []struct {
		name  string
		model string
		want  string
	}{
		{name: "o1 uses developer", model: "o1", want: "developer"},
		{name: "o3 family uses developer", model: "o3-mini-high", want: "developer"},
		{name: "o4 family uses developer", model: "o4-mini", want: "developer"},
		{name: "o1 mini stays system", model: "o1-mini", want: "system"},
		{name: "o1 preview stays system", model: "o1-preview", want: "system"},
		{name: "gpt 5 uses developer", model: "gpt-5", want: "developer"},
		{name: "omni is not o series", model: "omni-moderation-latest", want: "system"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := GeneralOpenAIRequest{Model: tt.model}

			require.Equal(t, tt.want, req.GetSystemRoleName())
		})
	}
}
