package relay

import (
	"testing"

	"github.com/QuantumNous/new-api/dto"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestConvertResponsesCompactionRequestPreservesCodexFields(t *testing.T) {
	reasoning := &dto.Reasoning{Effort: "high"}
	req := &dto.OpenAIResponsesCompactionRequest{
		Model:                "gpt-5.6",
		Input:                []byte(`[{"role":"user","content":"test"}]`),
		Instructions:         []byte(`"follow instructions"`),
		PreviousResponseID:   "resp_123",
		Tools:                []byte(`[{"type":"function","name":"edit_file"}]`),
		ParallelToolCalls:    []byte(`true`),
		Reasoning:            reasoning,
		ServiceTier:          "priority",
		PromptCacheKey:       []byte(`"cache-key"`),
		PromptCacheOptions:   []byte(`{"mode":"extended"}`),
		PromptCacheRetention: []byte(`"24h"`),
		Text:                 []byte(`{"verbosity":"low"}`),
	}

	converted := convertResponsesCompactionRequest(req, true)

	require.NotNil(t, converted)
	assert.Equal(t, req.Model, converted.Model)
	assert.Equal(t, req.Input, converted.Input)
	assert.Equal(t, req.Instructions, converted.Instructions)
	assert.Equal(t, req.PreviousResponseID, converted.PreviousResponseID)
	assert.Equal(t, req.Tools, converted.Tools)
	assert.Equal(t, req.ParallelToolCalls, converted.ParallelToolCalls)
	assert.Same(t, reasoning, converted.Reasoning)
	assert.Equal(t, req.ServiceTier, converted.ServiceTier)
	assert.Equal(t, req.PromptCacheKey, converted.PromptCacheKey)
	assert.Equal(t, req.PromptCacheOptions, converted.PromptCacheOptions)
	assert.Equal(t, req.PromptCacheRetention, converted.PromptCacheRetention)
	assert.Equal(t, req.Text, converted.Text)
}

func TestConvertResponsesCompactionRequestOmitsCodexFieldsForOpenAI(t *testing.T) {
	req := &dto.OpenAIResponsesCompactionRequest{
		Tools:     []byte(`[{"type":"function","name":"edit_file"}]`),
		Reasoning: &dto.Reasoning{Effort: "high"},
		Text:      []byte(`{"verbosity":"low"}`),
	}

	converted := convertResponsesCompactionRequest(req, false)

	assert.Empty(t, converted.Tools)
	assert.Nil(t, converted.Reasoning)
	assert.Empty(t, converted.Text)
}
