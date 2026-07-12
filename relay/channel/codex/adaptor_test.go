package codex

import (
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/dto"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestModelListIncludesGPT56AndCompactRoutes(t *testing.T) {
	adaptor := &Adaptor{}
	models := adaptor.GetModelList()

	for _, model := range []string{"gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"} {
		assert.Contains(t, models, model)
		assert.Contains(t, models, ratio_setting.WithCompactModelSuffix(model))
	}
}

func TestConvertOpenAIResponsesRequestPreservesGPT56CodexTools(t *testing.T) {
	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	info := &relaycommon.RelayInfo{
		RelayMode: relayconstant.RelayModeResponses,
		ChannelMeta: &relaycommon.ChannelMeta{
			ChannelSetting: dto.ChannelSettings{},
		},
	}
	request := dto.OpenAIResponsesRequest{
		Model:          "gpt-5.6-sol",
		Input:          []byte(`"edit the workspace"`),
		Tools:          []byte(`[{"type":"function","name":"apply_patch"}]`),
		ClientMetadata: []byte(`{"originator":"codex_app"}`),
		Reasoning: &dto.Reasoning{
			Effort:  "high",
			Mode:    []byte(`"adaptive"`),
			Context: []byte(`{"turn_id":"turn-1"}`),
		},
		Store: []byte(`true`),
	}

	converted, err := (&Adaptor{}).ConvertOpenAIResponsesRequest(c, info, request)
	require.NoError(t, err)
	upstream, ok := converted.(dto.OpenAIResponsesRequest)
	require.True(t, ok)

	assert.JSONEq(t, string(request.Tools), string(upstream.Tools))
	assert.JSONEq(t, string(request.ClientMetadata), string(upstream.ClientMetadata))
	require.NotNil(t, upstream.Reasoning)
	assert.JSONEq(t, string(request.Reasoning.Mode), string(upstream.Reasoning.Mode))
	assert.JSONEq(t, string(request.Reasoning.Context), string(upstream.Reasoning.Context))
	assert.JSONEq(t, `false`, string(upstream.Store), "Codex upstream requires store=false")
}

func TestGetRequestURLUsesCodexRouteForResponsesModes(t *testing.T) {
	adaptor := &Adaptor{}
	info := &relaycommon.RelayInfo{ChannelMeta: &relaycommon.ChannelMeta{ChannelBaseUrl: "https://chatgpt.com"}}

	info.RelayMode = relayconstant.RelayModeResponses
	url, err := adaptor.GetRequestURL(info)
	require.NoError(t, err)
	assert.Equal(t, "https://chatgpt.com/backend-api/codex/responses", url)

	info.RelayMode = relayconstant.RelayModeResponsesCompact
	url, err = adaptor.GetRequestURL(info)
	require.NoError(t, err)
	assert.Equal(t, "https://chatgpt.com/backend-api/codex/responses/compact", url)
}
