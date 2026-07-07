package common

import "math"

// QuotaFromFloat converts a computed quota value to int with saturation.
// Quota products can include user-controlled multipliers; an oversized product
// must never wrap around and turn a charge into a credit.
func QuotaFromFloat(value float64) int {
	if math.IsNaN(value) {
		return 0
	}
	if value >= math.MaxInt32 {
		return math.MaxInt32
	}
	if value <= math.MinInt32 {
		return math.MinInt32
	}
	return int(value)
}
