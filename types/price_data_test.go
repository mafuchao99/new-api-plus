package types

import (
	"math"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestPriceDataAddOtherRatioRejectsInvalidValues(t *testing.T) {
	priceData := PriceData{}

	priceData.AddOtherRatio("zero", 0)
	priceData.AddOtherRatio("negative", -1)
	priceData.AddOtherRatio("nan", math.NaN())
	priceData.AddOtherRatio("inf", math.Inf(1))
	priceData.AddOtherRatio("valid", 1.5)

	assert.Equal(t, map[string]float64{"valid": 1.5}, priceData.OtherRatios)
}
