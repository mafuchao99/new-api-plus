package router

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-contrib/sessions"
	"github.com/gin-contrib/sessions/cookie"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestConsumptionSummaryAuthorizationValidationAndResponse(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	original, originalMain := model.LOG_DB, model.DB
	model.LOG_DB = db
	model.DB = db
	t.Cleanup(func() { model.LOG_DB = original; model.DB = originalMain; require.NoError(t, sqlDB.Close()) })
	require.NoError(t, db.AutoMigrate(&model.Log{}, &model.User{}))
	require.NoError(t, db.Create(&[]model.Log{
		{Type: model.LogTypeConsume, CreatedAt: 100, ModelName: "chat", UserId: 1, Username: "alice", Quota: 500},
		{Type: model.LogTypeConsume, CreatedAt: 100, ModelName: "chat", UserId: 1, Username: "alice", Quota: 100, Other: `{"task_id":"t1","pre_consumed_quota":500,"actual_quota":600}`},
		{Type: model.LogTypeRefund, CreatedAt: 100, ModelName: "chat", UserId: 1, Username: "alice", Quota: 200},
	}).Error)
	r := gin.New()
	r.Use(sessions.Sessions("consumption-test", cookie.NewStore([]byte("consumption-test-secret"))))
	r.Use(func(c *gin.Context) {
		if c.GetHeader("Test-Role") != "" {
			session := sessions.Default(c)
			role := common.RoleCommonUser
			if c.GetHeader("Test-Role") == "admin" {
				role = common.RoleAdminUser
			}
			session.Set("username", "test-user")
			session.Set("role", role)
			session.Set("id", 1)
			session.Set("status", common.UserStatusEnabled)
		}
		c.Next()
	})
	SetApiRouter(r)
	path := "/api/log/consumption-summary"
	cases := []struct {
		name, role, query string
		success           bool
	}{
		{"anonymous denied", "", "start_timestamp=100&end_timestamp=101", false},
		{"ordinary user denied", "user", "start_timestamp=100&end_timestamp=101", false},
		{"admin summary", "admin", "start_timestamp=100&end_timestamp=101", true},
		{"admin detail", "admin", "start_timestamp=100&end_timestamp=101&exact_model=chat&user_id=1", true},
		{"missing dates", "admin", "", false},
		{"invalid date", "admin", "start_timestamp=abc&end_timestamp=101", false},
		{"reversed dates", "admin", "start_timestamp=101&end_timestamp=100", false},
		{"empty dates", "admin", "start_timestamp=100&end_timestamp=100", false},
		{"invalid user", "admin", "start_timestamp=100&end_timestamp=101&user_id=-1", false},
		{"invalid user text", "admin", "start_timestamp=100&end_timestamp=101&user_id=alice", false},
		{"overlong model", "admin", "start_timestamp=100&end_timestamp=101&model_name=" + strings.Repeat("a", 513), false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			w := httptest.NewRecorder()
			request := httptest.NewRequest(http.MethodGet, path+"?"+tc.query, nil)
			request.Header.Set("New-Api-User", "1")
			request.Header.Set("Test-Role", tc.role)
			r.ServeHTTP(w, request)
			require.NotEqual(t, http.StatusNotFound, w.Code)
			var response struct {
				Success bool                      `json:"success"`
				Data    *model.ConsumptionSummary `json:"data"`
			}
			require.NoError(t, common.Unmarshal(w.Body.Bytes(), &response))
			assert.Equal(t, tc.success, response.Success)
			if tc.success {
				require.NotNil(t, response.Data)
				assert.EqualValues(t, 400, response.Data.Totals.Quota)
				assert.EqualValues(t, 1, response.Data.Totals.Requests)
				require.Len(t, response.Data.Rows, 1)
				assert.Equal(t, 100.0, response.Data.Rows[0].Share)
				assert.Equal(t, 400.0, response.Data.Rows[0].AverageQuota)
			} else {
				assert.Nil(t, response.Data)
			}
		})
	}
}
