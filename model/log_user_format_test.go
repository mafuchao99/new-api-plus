package model

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestFormatUserLogsHidesSensitiveRelayContent(t *testing.T) {
	logs := []*Log{
		{
			Type:        LogTypeConsume,
			Content:     `{"messages":[{"role":"user","content":"secret"}]}`,
			ChannelName: "primary",
			Other:       `{"admin_info":{"channel":1},"audit_info":{"route":"/v1/chat"},"stream_status":{"status":"ok"},"request_body":{"input":"secret"},"group":"default"}`,
		},
		{
			Type:    LogTypeError,
			Content: `{"error":"upstream rejected request","request":"secret"}`,
		},
		{
			Type:    LogTypeLogin,
			Content: "User login succeeded",
		},
	}

	require.NotPanics(t, func() {
		formatUserLogs(logs, 10)
	})

	assert.Equal(t, "", logs[0].Content)
	assert.Equal(t, "", logs[0].ChannelName)
	assert.JSONEq(t, `{"group":"default"}`, logs[0].Other)
	assert.Equal(t, 11, logs[0].Id)

	assert.Equal(t, "", logs[1].Content)
	assert.Equal(t, 12, logs[1].Id)

	assert.Equal(t, "User login succeeded", logs[2].Content)
	assert.Equal(t, 13, logs[2].Id)
}
