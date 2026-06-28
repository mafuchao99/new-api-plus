package console_setting

import (
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/require"
)

func TestValidateAnnouncementsCountsUnicodeCharacters(t *testing.T) {
	announcements := []map[string]any{
		{
			"content":     strings.Repeat("系统更新", 100),
			"publishDate": time.Date(2026, 6, 28, 20, 0, 0, 0, time.UTC).Format(time.RFC3339),
			"type":        "warning",
		},
	}
	payload, err := common.Marshal(announcements)
	require.NoError(t, err)

	err = ValidateConsoleSettings(string(payload), "Announcements")

	require.NoError(t, err)
}

func TestValidateAnnouncementsRejectsMoreThanFiveHundredCharacters(t *testing.T) {
	announcements := []map[string]any{
		{
			"content":     strings.Repeat("字", 501),
			"publishDate": time.Date(2026, 6, 28, 20, 0, 0, 0, time.UTC).Format(time.RFC3339),
			"type":        "warning",
		},
	}
	payload, err := common.Marshal(announcements)
	require.NoError(t, err)

	err = ValidateConsoleSettings(string(payload), "Announcements")

	require.ErrorContains(t, err, "第1个公告的内容长度不能超过500字符")
}
