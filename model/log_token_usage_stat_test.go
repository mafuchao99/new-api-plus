package model

import (
	"fmt"
	"testing"

	"github.com/stretchr/testify/require"
)

func seedTokenUsageStatUser(t *testing.T, id int, username string) {
	t.Helper()
	require.NoError(t, DB.Create(&User{
		Id:       id,
		Username: username,
		AffCode:  fmt.Sprintf("token-usage-aff-%d", id),
	}).Error)
}

func seedTokenUsageStatToken(t *testing.T, id int, userId int, name string, group string) {
	t.Helper()
	require.NoError(t, DB.Create(&Token{
		Id:     id,
		UserId: userId,
		Name:   name,
		Key:    fmt.Sprintf("%s-key-%d", name, id),
		Group:  group,
	}).Error)
}

func seedTokenUsageStatLog(t *testing.T, tokenId int, userId int, quota int, promptTokens int, completionTokens int, createdAt int64) {
	t.Helper()
	require.NoError(t, LOG_DB.Create(&Log{
		UserId:           userId,
		Username:         fmt.Sprintf("user-%d", userId),
		CreatedAt:        createdAt,
		Type:             LogTypeConsume,
		Quota:            quota,
		PromptTokens:     promptTokens,
		CompletionTokens: completionTokens,
		TokenId:          tokenId,
		TokenName:        fmt.Sprintf("token-%d", tokenId),
		ModelName:        "gpt-test",
		Group:            "default",
	}).Error)
}

func TestGetTokenUsageStatsAggregatesByTokenId(t *testing.T) {
	truncateTables(t)

	seedTokenUsageStatUser(t, 1, "alice")
	seedTokenUsageStatUser(t, 2, "bob")
	seedTokenUsageStatToken(t, 10, 1, "shared", "default")
	seedTokenUsageStatToken(t, 20, 2, "shared", "vip")

	seedTokenUsageStatLog(t, 10, 1, 100, 10, 20, 100)
	seedTokenUsageStatLog(t, 10, 1, 50, 5, 10, 200)
	seedTokenUsageStatLog(t, 20, 2, 300, 30, 40, 150)
	seedTokenUsageStatLog(t, 0, 1, 999, 99, 99, 160)
	require.NoError(t, LOG_DB.Create(&Log{
		UserId:    1,
		CreatedAt: 170,
		Type:      LogTypeError,
		Quota:     88,
		TokenId:   10,
	}).Error)

	stats, err := GetTokenUsageStats(TokenUsageStatQuery{})
	require.NoError(t, err)
	require.Len(t, stats, 2)

	require.Equal(t, 20, stats[0].TokenId)
	require.Equal(t, "shared", stats[0].TokenName)
	require.Equal(t, "bob", stats[0].Username)
	require.Equal(t, "vip", stats[0].Group)
	require.EqualValues(t, 1, stats[0].Requests)
	require.EqualValues(t, 300, stats[0].Quota)
	require.EqualValues(t, 30, stats[0].PromptTokens)
	require.EqualValues(t, 40, stats[0].CompletionTokens)
	require.EqualValues(t, 150, stats[0].FirstUsedAt)
	require.EqualValues(t, 150, stats[0].LastUsedAt)

	require.Equal(t, 10, stats[1].TokenId)
	require.Equal(t, "alice", stats[1].Username)
	require.EqualValues(t, 3, stats[1].Requests)
	require.EqualValues(t, 238, stats[1].Quota)
	require.EqualValues(t, 15, stats[1].PromptTokens)
	require.EqualValues(t, 30, stats[1].CompletionTokens)
	require.EqualValues(t, 100, stats[1].FirstUsedAt)
	require.EqualValues(t, 200, stats[1].LastUsedAt)

	stats, err = GetTokenUsageStats(TokenUsageStatQuery{LogType: LogTypeConsume})
	require.NoError(t, err)
	require.Len(t, stats, 2)
	require.Equal(t, 10, stats[1].TokenId)
	require.EqualValues(t, 2, stats[1].Requests)
	require.EqualValues(t, 150, stats[1].Quota)
}

func TestGetTokenUsageStatsFiltersByUserAndTimeRange(t *testing.T) {
	truncateTables(t)

	seedTokenUsageStatUser(t, 1, "alice")
	seedTokenUsageStatUser(t, 2, "bob")
	seedTokenUsageStatToken(t, 10, 1, "alice-key", "default")
	seedTokenUsageStatToken(t, 20, 2, "bob-key", "default")

	seedTokenUsageStatLog(t, 10, 1, 100, 10, 10, 99)
	seedTokenUsageStatLog(t, 10, 1, 200, 20, 20, 100)
	seedTokenUsageStatLog(t, 10, 1, 300, 30, 30, 200)
	seedTokenUsageStatLog(t, 10, 1, 400, 40, 40, 201)
	seedTokenUsageStatLog(t, 20, 2, 999, 99, 99, 150)

	stats, err := GetTokenUsageStats(TokenUsageStatQuery{
		StartTimestamp: 100,
		EndTimestamp:   200,
		UserId:         1,
	})
	require.NoError(t, err)
	require.Len(t, stats, 1)
	require.Equal(t, 10, stats[0].TokenId)
	require.EqualValues(t, 2, stats[0].Requests)
	require.EqualValues(t, 500, stats[0].Quota)
	require.EqualValues(t, 100, stats[0].FirstUsedAt)
	require.EqualValues(t, 200, stats[0].LastUsedAt)
}

func TestGetTokenUsageStatsAppliesSearchFilters(t *testing.T) {
	truncateTables(t)

	seedTokenUsageStatUser(t, 1, "alice")
	seedTokenUsageStatToken(t, 10, 1, "alice-key", "default")

	require.NoError(t, LOG_DB.Create(&Log{
		UserId:           1,
		CreatedAt:        100,
		Type:             LogTypeConsume,
		Quota:            100,
		PromptTokens:     10,
		CompletionTokens: 10,
		TokenId:          10,
		ModelName:        "gpt-a",
		Group:            "default",
		ChannelId:        1,
		RequestId:        "req-a",
	}).Error)
	require.NoError(t, LOG_DB.Create(&Log{
		UserId:           1,
		CreatedAt:        200,
		Type:             LogTypeConsume,
		Quota:            300,
		PromptTokens:     30,
		CompletionTokens: 30,
		TokenId:          10,
		ModelName:        "gpt-b",
		Group:            "vip",
		ChannelId:        2,
		RequestId:        "req-b",
	}).Error)

	stats, err := GetTokenUsageStats(TokenUsageStatQuery{
		ModelName: "gpt-a",
		Group:     "default",
		Channel:   1,
		RequestId: "req-a",
	})
	require.NoError(t, err)
	require.Len(t, stats, 1)
	require.Equal(t, 10, stats[0].TokenId)
	require.EqualValues(t, 1, stats[0].Requests)
	require.EqualValues(t, 100, stats[0].Quota)

	stats, err = GetTokenUsageStats(TokenUsageStatQuery{LogType: LogTypeError})
	require.NoError(t, err)
	require.Empty(t, stats)
}

func TestGetTokenUsageStatsFallsBackToLogTokenInfo(t *testing.T) {
	truncateTables(t)

	seedTokenUsageStatUser(t, 1, "alice")
	require.NoError(t, LOG_DB.Create(&Log{
		UserId:           1,
		Username:         "alice",
		CreatedAt:        100,
		Type:             LogTypeConsume,
		Quota:            100,
		PromptTokens:     10,
		CompletionTokens: 20,
		TokenId:          99,
		TokenName:        "deleted-key",
		Group:            "legacy",
	}).Error)

	stats, err := GetTokenUsageStats(TokenUsageStatQuery{})
	require.NoError(t, err)
	require.Len(t, stats, 1)
	require.Equal(t, 99, stats[0].TokenId)
	require.Equal(t, "deleted-key", stats[0].TokenName)
	require.Equal(t, "alice", stats[0].Username)
	require.Equal(t, "legacy", stats[0].Group)
	require.EqualValues(t, 1, stats[0].Requests)
	require.EqualValues(t, 100, stats[0].Quota)
}
