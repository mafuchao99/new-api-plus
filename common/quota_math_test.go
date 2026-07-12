package common

import (
	"math"
	"testing"

	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestQuotaFromFloatSaturates(t *testing.T) {
	tests := []struct {
		name string
		in   float64
		want int
	}{
		{name: "normal", in: 123.9, want: 123},
		{name: "nan", in: math.NaN(), want: 0},
		{name: "positive infinity", in: math.Inf(1), want: math.MaxInt32},
		{name: "negative infinity", in: math.Inf(-1), want: math.MinInt32},
		{name: "above max int32", in: float64(math.MaxInt32) * 2, want: math.MaxInt32},
		{name: "below min int32", in: float64(math.MinInt32) * 2, want: math.MinInt32},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, QuotaFromFloat(tt.in))
		})
	}
}

func TestQuotaConversionsReportClampAndPreserveRounding(t *testing.T) {
	quota, clamp := QuotaFromFloatChecked(float64(MaxQuota) * 2)
	require.NotNil(t, clamp)
	assert.Equal(t, MaxQuota, quota)
	assert.Equal(t, QuotaClampOverflow, clamp.Kind)
	assert.Equal(t, "QuotaFromFloat", clamp.Op)
	assert.Equal(t, MaxQuota, clamp.AuditMap()["clamped"])

	quota, clamp = QuotaRoundChecked(12.5)
	assert.Nil(t, clamp)
	assert.Equal(t, 13, quota)

	quota, clamp = QuotaFromDecimalChecked(decimal.RequireFromString("-12.5"))
	assert.Nil(t, clamp)
	assert.Equal(t, -13, quota)
}

func TestQuotaFromFloatStrictReturnsTypedClamp(t *testing.T) {
	quota, err := QuotaFromFloatStrict(42.9)
	require.NoError(t, err)
	assert.Equal(t, 42, quota)

	quota, err = QuotaFromFloatStrict(float64(MaxQuota) * 2)
	assert.Zero(t, quota)
	var clamp *QuotaClamp
	require.ErrorAs(t, err, &clamp)
	assert.Equal(t, QuotaClampOverflow, clamp.Kind)
}

func TestQuotaExactBoundariesRemainValid(t *testing.T) {
	tests := []struct {
		name  string
		value float64
		want  int
	}{
		{name: "maximum", value: MaxQuota, want: MaxQuota},
		{name: "minimum", value: MinQuota, want: MinQuota},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			quota, clamp := QuotaFromFloatChecked(tt.value)
			assert.Nil(t, clamp)
			assert.Equal(t, tt.want, quota)

			quota, err := QuotaFromFloatStrict(tt.value)
			require.NoError(t, err)
			assert.Equal(t, tt.want, quota)
		})
	}
}

func TestQuotaClampAuditMapSerializesNonFiniteOriginal(t *testing.T) {
	tests := []struct {
		name     string
		value    float64
		expected string
	}{
		{name: "nan", value: math.NaN(), expected: "NaN"},
		{name: "positive infinity", value: math.Inf(1), expected: "+Inf"},
		{name: "negative infinity", value: math.Inf(-1), expected: "-Inf"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, clamp := QuotaFromFloatChecked(tt.value)
			require.NotNil(t, clamp)
			assert.Equal(t, tt.expected, clamp.AuditMap()["original"])

			encoded, err := Marshal(clamp.AuditMap())
			require.NoError(t, err)
			assert.Contains(t, string(encoded), `"original":"`+tt.expected+`"`)
		})
	}
}
