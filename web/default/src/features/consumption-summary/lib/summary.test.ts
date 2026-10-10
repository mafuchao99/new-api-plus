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

import type { ConsumptionRecord, DatePreset } from '../types'
import { createMockRecords } from './mock-data'
import {
  aggregateConsumption,
  consumptionCsvRows,
  consumptionQueryParams,
  filterConsumptionRecords,
  presetFilters,
  summarizeConsumption,
} from './summary'

const records: ConsumptionRecord[] = [
  {
    date: '2026-10-01',
    userId: '1',
    username: 'alice',
    model: 'chat-a',
    quota: 100,
    requests: 2,
    tokens: 200,
  },
  {
    date: '2026-10-10',
    userId: '2',
    username: 'bob',
    model: 'chat-a',
    quota: 300,
    requests: 3,
    tokens: 300,
  },
  {
    date: '2026-10-10',
    userId: '1',
    username: 'alice',
    model: 'image-b',
    quota: 100,
    requests: 1,
    tokens: 0,
  },
  {
    date: '2026-10-10',
    userId: '1',
    username: 'alice',
    model: 'free-c',
    quota: 0,
    requests: 4,
    tokens: 400,
  },
  {
    date: '2026-09-30',
    userId: '1',
    username: 'alice',
    model: 'chat-a',
    quota: 900,
    requests: 9,
    tokens: 900,
  },
]
const filters = {
  startDate: '2026-10-01',
  endDate: '2026-10-10',
  userId: 'all',
  model: '',
}

describe('consumption summary', () => {
  test('includes both date boundaries and combines user and case-insensitive model filters', () => {
    assert.equal(filterConsumptionRecords(records, filters).length, 4)
    assert.deepEqual(
      filterConsumptionRecords(records, {
        ...filters,
        userId: '1',
        model: ' CHAT-A ',
      }),
      [records[0]]
    )
    assert.deepEqual(
      filterConsumptionRecords(records, {
        ...filters,
        startDate: '2027-01-01',
        endDate: '2027-01-02',
      }),
      []
    )
  })

  test('reconciles model rows and totals while retaining free calls and tasks without tokens', () => {
    const result = summarizeConsumption(
      filterConsumptionRecords(records, filters)
    )
    assert.deepEqual(result.totals, {
      quota: 500,
      requests: 10,
      tokens: 900,
      models: 3,
    })
    assert.deepEqual(result.models, [
      {
        id: 'chat-a',
        name: 'chat-a',
        quota: 400,
        requests: 5,
        tokens: 500,
        share: 80,
        averageQuota: 80,
      },
      {
        id: 'image-b',
        name: 'image-b',
        quota: 100,
        requests: 1,
        tokens: 0,
        share: 20,
        averageQuota: 100,
      },
      {
        id: 'free-c',
        name: 'free-c',
        quota: 0,
        requests: 4,
        tokens: 400,
        share: 0,
        averageQuota: 0,
      },
    ])
    const modelRecords = filterConsumptionRecords(records, {
      ...filters,
      model: 'chat-a',
    })
    assert.deepEqual(aggregateConsumption(modelRecords, 'user'), [
      {
        id: '2',
        name: 'bob',
        quota: 300,
        requests: 3,
        tokens: 300,
        share: 75,
        averageQuota: 100,
      },
      {
        id: '1',
        name: 'alice',
        quota: 100,
        requests: 2,
        tokens: 200,
        share: 25,
        averageQuota: 50,
      },
    ])
    const alice = aggregateConsumption(
      modelRecords.filter((record) => record.userId === '1'),
      'user'
    )
    assert.equal(alice[0].share, 100)
  })

  test('returns finite zero shares and average amounts for a zero-cost selection and empty totals', () => {
    const free = summarizeConsumption(
      filterConsumptionRecords(records, { ...filters, model: 'free-c' })
    )
    assert.deepEqual(free.totals, {
      quota: 0,
      requests: 4,
      tokens: 400,
      models: 1,
    })
    assert.equal(free.models[0].share, 0)
    assert.equal(free.models[0].averageQuota, 0)
    assert.deepEqual(summarizeConsumption([]), {
      totals: { quota: 0, requests: 0, tokens: 0, models: 0 },
      models: [],
    })
  })

  test('exports all filtered models with the same amounts, dates, and totals as the summary', () => {
    const result = summarizeConsumption(
      filterConsumptionRecords(records, filters)
    )
    const csv = consumptionCsvRows(result.models, filters, ['headers'], String)
    assert.equal(csv.length, 4)
    assert.deepEqual(csv[1], [
      '2026-10-01',
      '2026-10-10',
      'chat-a',
      'chat-a',
      '400',
      400,
      '80.00',
      5,
      500,
      '80',
    ])
    assert.equal(
      csv.slice(1).reduce((sum, row) => sum + Number(row[5]), 0),
      result.totals.quota
    )
  })

  test('uses calendar ranges across month boundaries and leap years', () => {
    const today = new Date(2024, 2, 1)
    assert.deepEqual(presetFilters('lastMonth', today), {
      startDate: '2024-02-01',
      endDate: '2024-02-29',
      userId: 'all',
      model: '',
    })
    assert.equal(presetFilters('last7', today).startDate, '2024-02-24')
    assert.equal(presetFilters('today', today).startDate, '2024-03-01')
  })

  test('uses single-day, Monday-based week, and rolling calendar month presets', () => {
    const today = new Date(2026, 9, 10)
    const ranges: [DatePreset, string, string][] = [
      ['today', '2026-10-10', '2026-10-10'],
      ['yesterday', '2026-10-09', '2026-10-09'],
      ['dayBeforeYesterday', '2026-10-08', '2026-10-08'],
      ['thisWeek', '2026-10-05', '2026-10-10'],
      ['lastWeek', '2026-09-28', '2026-10-04'],
      ['last7', '2026-10-04', '2026-10-10'],
      ['last30', '2026-09-11', '2026-10-10'],
      ['month', '2026-10-01', '2026-10-10'],
      ['lastMonth', '2026-09-01', '2026-09-30'],
      ['last3Months', '2026-07-10', '2026-10-10'],
    ]
    for (const [preset, startDate, endDate] of ranges) {
      assert.deepEqual(
        presetFilters(preset, today),
        {
          startDate,
          endDate,
          userId: 'all',
          model: '',
        },
        preset
      )
    }
    assert.equal(today.getDate(), 10)
  })

  test('keeps date presets valid at year, Sunday, Monday, and short-month boundaries', () => {
    assert.equal(
      presetFilters('yesterday', new Date(2026, 0, 1)).startDate,
      '2025-12-31'
    )
    assert.equal(
      presetFilters('dayBeforeYesterday', new Date(2026, 0, 1)).endDate,
      '2025-12-30'
    )
    assert.equal(
      presetFilters('thisWeek', new Date(2026, 0, 4)).startDate,
      '2025-12-29'
    )
    assert.equal(
      presetFilters('thisWeek', new Date(2026, 0, 5)).startDate,
      '2026-01-05'
    )
    assert.equal(
      presetFilters('lastWeek', new Date(2026, 0, 5)).endDate,
      '2026-01-04'
    )
    assert.equal(
      presetFilters('last3Months', new Date(2024, 4, 31)).startDate,
      '2024-02-29'
    )
    assert.equal(
      presetFilters('last3Months', new Date(2025, 4, 31)).startDate,
      '2025-02-28'
    )
  })

  test('sends local inclusive calendar dates as an exclusive next-midnight API range', () => {
    const query = consumptionQueryParams(
      {
        startDate: '2026-03-08',
        endDate: '2026-03-08',
        userId: '101',
        model: ' GPT ',
      },
      'gpt-5'
    )
    assert.deepEqual(query, {
      start_timestamp: new Date(2026, 2, 8).getTime() / 1000,
      end_timestamp: new Date(2026, 2, 9).getTime() / 1000,
      user_id: 101,
      model_name: 'GPT',
      exact_model: 'gpt-5',
    })
    const all = consumptionQueryParams(filters, null)
    assert.equal(all.user_id, undefined)
    assert.equal(all.model_name, undefined)
    assert.equal(all.exact_model, undefined)
    assert.equal(consumptionQueryParams(filters, '').exact_model, '')
  })

  test('refreshing the mock window does not change its consumption values', () => {
    const today = new Date(2026, 9, 10)
    assert.deepEqual(createMockRecords(today), createMockRecords(today))
    const rows = createMockRecords(today)
    assert.equal(new Set(rows.map((row) => row.date)).size, 90)
    assert.ok(rows.some((row) => row.quota === 0 && row.requests > 0))
    assert.ok(rows.some((row) => row.tokens === 0 && row.quota > 0))
  })
})
