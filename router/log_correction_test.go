package router

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-contrib/sessions"
	"github.com/gin-contrib/sessions/cookie"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestLogCorrectionRoutesRequireAdministrator(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(sessions.Sessions("correction-test", cookie.NewStore([]byte("correction-test-secret"))))
	r.Use(func(c *gin.Context) {
		session := sessions.Default(c)
		role := common.RoleCommonUser
		if c.GetHeader("Test-Role") == "admin" {
			role = common.RoleAdminUser
		}
		session.Set("username", "test-user")
		session.Set("role", role)
		session.Set("id", 1)
		session.Set("status", common.UserStatusEnabled)
		c.Next()
	})
	SetApiRouter(r)
	for _, route := range []struct{ method, path string }{
		{http.MethodGet, "/api/log/corrections/capabilities"},
		{http.MethodGet, "/api/log/corrections/"},
		{http.MethodGet, "/api/log/corrections/snapshots"},
		{http.MethodGet, "/api/log/corrections/batch"},
		{http.MethodGet, "/api/log/corrections/batch/details"},
		{http.MethodGet, "/api/log/corrections/batch/export"},
		{http.MethodPost, "/api/log/corrections/"},
		{http.MethodPost, "/api/log/corrections/batch/apply"},
	} {
		t.Run(route.method+route.path, func(t *testing.T) {
			w := httptest.NewRecorder()
			request := httptest.NewRequest(route.method, route.path, strings.NewReader("{}"))
			request.Header.Set("New-Api-User", "1")
			r.ServeHTTP(w, request)
			require.NotEqual(t, http.StatusNotFound, w.Code)
			var response struct {
				Success bool        `json:"success"`
				Data    interface{} `json:"data"`
			}
			require.NoError(t, common.Unmarshal(w.Body.Bytes(), &response))
			assert.False(t, response.Success)
			assert.Nil(t, response.Data)
		})
	}
	w := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/log/corrections/capabilities", nil)
	request.Header.Set("New-Api-User", "1")
	request.Header.Set("Test-Role", "admin")
	r.ServeHTTP(w, request)
	var response struct {
		Success bool `json:"success"`
	}
	require.NoError(t, common.Unmarshal(w.Body.Bytes(), &response))
	assert.True(t, response.Success)
}
