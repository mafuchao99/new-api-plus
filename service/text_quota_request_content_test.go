package service

import (
	"testing"

	"github.com/QuantumNous/new-api/dto"
	"github.com/stretchr/testify/assert"
)

func TestUsageLogUserContentFromRequestChat(t *testing.T) {
	request := &dto.GeneralOpenAIRequest{
		Messages: []dto.Message{
			{Role: "system", Content: "do not log this"},
			{Role: "user", Content: "hello"},
			{
				Role: "user",
				Content: []any{
					map[string]any{"type": dto.ContentTypeText, "text": "second text"},
					map[string]any{"type": dto.ContentTypeImageURL, "image_url": "data:image/png;base64,secret"},
				},
			},
			{Role: "assistant", Content: "assistant history"},
		},
	}

	assert.Equal(t, "hello\n\nsecond text", usageLogUserContentFromRequest(request))
}

func TestUsageLogUserContentFromRequestStripsLeadingCodexContext(t *testing.T) {
	request := &dto.GeneralOpenAIRequest{
		Messages: []dto.Message{
			{
				Role: "user",
				Content: `# AGENTS.md instructions

<INSTRUCTIONS>
Use Context7 MCP to fetch current documentation.
</INSTRUCTIONS>

<environment_context>
  <cwd>/Users/huaxi/Documents/Codex</cwd>
</environment_context>

哈喽

今天天气怎么样呀`,
			},
		},
	}

	assert.Equal(t, "哈喽\n\n今天天气怎么样呀", usageLogUserContentFromRequest(request))
}

func TestUsageLogUserContentFromRequestResponses(t *testing.T) {
	request := &dto.OpenAIResponsesRequest{
		Input: []byte(`[
			{"role":"system","content":"do not log this"},
			{"role":"user","content":[{"type":"input_text","text":"check this request"}]},
			{"role":"assistant","content":[{"type":"output_text","text":"assistant history"}]}
		]`),
	}

	assert.Equal(t, "check this request", usageLogUserContentFromRequest(request))
}

func TestUsageLogUserContentFromRequestOtherTextInputs(t *testing.T) {
	assert.Equal(t, "embed me", usageLogUserContentFromRequest(&dto.EmbeddingRequest{Input: "embed me"}))
	assert.Equal(t, "draw a cat", usageLogUserContentFromRequest(&dto.ImageRequest{Prompt: "draw a cat"}))
	assert.Equal(t, "which document matches?", usageLogUserContentFromRequest(&dto.RerankRequest{Query: "which document matches?"}))
}
