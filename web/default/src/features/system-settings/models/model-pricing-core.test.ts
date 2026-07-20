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
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { normalizeModelPricingDraft } from './model-pricing-core'

describe('normalizeModelPricingDraft', () => {
  test('uses the selected per-token mode instead of a stale fixed price', () => {
    assert.deepEqual(
      normalizeModelPricingDraft({
        name: 'gpt-test',
        billingMode: 'per-token',
        price: '0.01',
        ratio: '1.5',
        completionRatio: '4',
      }),
      {
        ratio: 1.5,
        completionRatio: 4,
      }
    )
  })

  test('activates expression mode even when a stale fixed price exists', () => {
    assert.deepEqual(
      normalizeModelPricingDraft({
        name: 'gpt-test',
        billingMode: 'tiered_expr',
        price: '0.01',
        billingExpr: 'tier("base", p * 2 + c * 8)',
      }),
      {
        price: 0.01,
        billingMode: 'tiered_expr',
        billingExpr: 'tier("base", p * 2 + c * 8)',
      }
    )
  })

  test('uses only fixed pricing in per-request mode', () => {
    assert.deepEqual(
      normalizeModelPricingDraft({
        name: 'gpt-test',
        billingMode: 'per-request',
        price: '0.02',
        ratio: '2',
      }),
      { price: 0.02 }
    )
  })
})
