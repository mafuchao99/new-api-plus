package service

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestFilterRouteLineBindingsSupportsGPT56CodexResponses(t *testing.T) {
	channel := &model.Channel{
		Id:     56,
		Type:   constant.ChannelTypeCodex,
		Status: common.ChannelStatusEnabled,
		Models: "gpt-5.6-sol,gpt-5.6-sol-compact",
	}
	bindings := []model.ChannelRouteBinding{
		{RouteLineId: 7, ChannelId: channel.Id, Enabled: true, Channel: channel},
	}

	normal := filterRouteLineBindings(bindings, "gpt-5.6-sol", "/v1/responses")
	require.Len(t, normal, 1)
	assert.Equal(t, channel.Id, normal[0].ChannelId)

	compact := filterRouteLineBindings(bindings, "gpt-5.6-sol-compact", "/v1/responses/compact")
	require.Len(t, compact, 1)
	assert.Equal(t, channel.Id, compact[0].ChannelId)

	assert.Empty(t, filterRouteLineBindings(bindings, "gpt-5.6-terra", "/v1/responses"))
}
