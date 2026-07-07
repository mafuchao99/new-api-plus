package helper

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func newJSONContext(body string) *gin.Context {
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/test", strings.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")
	return c
}

func TestMaxTokensBoundsValidation(t *testing.T) {
	gin.SetMode(gin.TestMode)
	tooLarge := maxTokensLimit + 1

	tests := []struct {
		name string
		body string
		run  func(*gin.Context) error
		want string
	}{
		{
			name: "openai max_tokens",
			body: fmt.Sprintf(`{"model":"gpt-test","messages":[{"role":"user","content":"hi"}],"max_tokens":%d}`, tooLarge),
			run: func(c *gin.Context) error {
				_, err := GetAndValidateTextRequest(c, relayconstant.RelayModeChatCompletions)
				return err
			},
			want: "max_tokens is invalid",
		},
		{
			name: "openai max_completion_tokens",
			body: fmt.Sprintf(`{"model":"gpt-test","messages":[{"role":"user","content":"hi"}],"max_completion_tokens":%d}`, tooLarge),
			run: func(c *gin.Context) error {
				_, err := GetAndValidateTextRequest(c, relayconstant.RelayModeChatCompletions)
				return err
			},
			want: "max_tokens is invalid",
		},
		{
			name: "responses max_output_tokens",
			body: fmt.Sprintf(`{"model":"gpt-test","input":"hi","max_output_tokens":%d}`, tooLarge),
			run: func(c *gin.Context) error {
				_, err := GetAndValidateResponsesRequest(c)
				return err
			},
			want: "max_output_tokens is invalid",
		},
		{
			name: "claude max_tokens",
			body: fmt.Sprintf(`{"model":"claude-test","messages":[{"role":"user","content":"hi"}],"max_tokens":%d}`, tooLarge),
			run: func(c *gin.Context) error {
				_, err := GetAndValidateClaudeRequest(c)
				return err
			},
			want: "max_tokens is invalid",
		},
		{
			name: "claude max_tokens_to_sample",
			body: fmt.Sprintf(`{"model":"claude-test","messages":[{"role":"user","content":"hi"}],"max_tokens_to_sample":%d}`, tooLarge),
			run: func(c *gin.Context) error {
				_, err := GetAndValidateClaudeRequest(c)
				return err
			},
			want: "max_tokens is invalid",
		},
		{
			name: "gemini maxOutputTokens",
			body: fmt.Sprintf(`{"contents":[{"role":"user","parts":[{"text":"hi"}]}],"generationConfig":{"maxOutputTokens":%d}}`, tooLarge),
			run: func(c *gin.Context) error {
				_, err := GetAndValidateGeminiRequest(c)
				return err
			},
			want: "maxOutputTokens is invalid",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.run(newJSONContext(tt.body))
			require.Error(t, err)
			require.Contains(t, err.Error(), tt.want)
		})
	}
}
