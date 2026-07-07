package common

import (
	"math"
	"testing"

	"github.com/stretchr/testify/assert"
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
