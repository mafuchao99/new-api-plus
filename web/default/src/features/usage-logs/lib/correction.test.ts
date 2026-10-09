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

import {
  correctionFormSchema,
  parseCorrectionProgress,
  parseCorrectionSummary,
} from './correction'

const valid = {
  userId: '12',
  model: 'claude-test',
  start: '2026-01-01T00:00',
  end: '2026-01-02T00:00',
  read: '0',
  write: '1.25',
  write5m: '',
  write1h: '2',
}

describe('historical correction input contract', () => {
  test('preserves explicit zero prices and optional TTL prices', () => {
    const values = correctionFormSchema.parse(valid)
    assert.equal(values.read, '0')
    assert.equal(values.write5m, '')
    assert.equal(values.write1h, '2')
  })

  test('rejects missing identity, invalid ratios and reversed ranges', () => {
    for (const changes of [
      { userId: '0' },
      { userId: '1.5' },
      { model: '' },
      { read: '' },
      { read: 'Infinity' },
      { write: '-1' },
      { write1h: 'NaN' },
      { end: valid.start },
      { start: 'not-a-date' },
      { end: '2999-01-01T00:00' },
    ]) {
      assert.equal(
        correctionFormSchema.safeParse({ ...valid, ...changes }).success,
        false
      )
    }
  })

  test('does not display unvalidated or corrupted summary data', () => {
    assert.equal(parseCorrectionSummary('not json'), null)
    assert.equal(parseCorrectionSummary('{"delta":"100"}'), null)
    const summary = {
      matched: 3,
      changes: 1,
      skipped: 1,
      unchanged: 1,
      warnings: 0,
      original_quota: 1000,
      corrected_quota: 700,
      delta: 300,
      dashboard_delta: 300,
      monthly_delta: 300,
      user_delta: 300,
      token_delta: 300,
      channel_delta: 300,
      monthly_wallet_delta: 300,
      monthly_subscription_delta: 0,
    }
    assert.deepEqual(parseCorrectionSummary(JSON.stringify(summary)), summary)
  })

  test('validates progress returned by the task framework', () => {
    assert.deepEqual(parseCorrectionProgress('{"processed":2,"total":3}'), {
      processed: 2,
      total: 3,
    })
    assert.equal(parseCorrectionProgress('{"processed":-1}'), null)
    assert.equal(parseCorrectionProgress('invalid'), null)
  })
})
