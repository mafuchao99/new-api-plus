/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import type { RoutePricingModel, RoutePricingPriceItem } from '../types'

export function getLowestLineRatio(model: RoutePricingModel) {
  const ratios = model.lines
    .map((line) => line.ratio)
    .filter((ratio): ratio is number => typeof ratio === 'number' && ratio > 0)
  if (ratios.length === 0) return null
  return Math.min(...ratios)
}

export function getLowestPerRequestPrice(model: RoutePricingModel) {
  const prices = model.lines
    .filter((line) => line.billing_mode === 'per_request')
    .map((line) => line.per_request_price)
    .filter((price): price is number => typeof price === 'number' && price > 0)
  if (prices.length === 0) return null
  return Math.min(...prices)
}

export function hasExpressionLine(model: RoutePricingModel) {
  return model.lines.some(
    (line) => line.billing_mode === 'expression' || Boolean(line.billing_expr)
  )
}

export function getOfficialPriceItem(
  model: RoutePricingModel,
  type: string
): RoutePricingPriceItem | undefined {
  return model.official_price_items.find((item) => item.type === type)
}
