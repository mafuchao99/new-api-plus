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
import type {
  ConsumptionAggregate,
  ConsumptionFilters,
  ConsumptionRecord,
  ConsumptionTotals,
  DatePreset,
} from '../types'
import { dateInputValue } from './date'

export function presetFilters(
  preset: DatePreset,
  today: Date
): ConsumptionFilters {
  const start = new Date(today)
  const end = new Date(today)
  if (preset === 'yesterday' || preset === 'dayBeforeYesterday') {
    const daysAgo = preset === 'yesterday' ? 1 : 2
    start.setDate(start.getDate() - daysAgo)
    end.setDate(end.getDate() - daysAgo)
  }
  if (preset === 'thisWeek' || preset === 'lastWeek') {
    const daysFromMonday = (start.getDay() + 6) % 7
    start.setDate(start.getDate() - daysFromMonday)
    if (preset === 'lastWeek') {
      end.setTime(start.getTime())
      end.setDate(end.getDate() - 1)
      start.setDate(start.getDate() - 7)
    }
  }
  if (preset === 'last7') start.setDate(start.getDate() - 6)
  if (preset === 'last30') start.setDate(start.getDate() - 29)
  if (preset === 'month') start.setDate(1)
  if (preset === 'lastMonth') {
    start.setDate(1)
    start.setMonth(start.getMonth() - 1)
    end.setDate(0)
  }
  if (preset === 'last3Months') {
    const dayOfMonth = start.getDate()
    start.setDate(1)
    start.setMonth(start.getMonth() - 3)
    const lastDayOfMonth = new Date(
      start.getFullYear(),
      start.getMonth() + 1,
      0
    ).getDate()
    start.setDate(Math.min(dayOfMonth, lastDayOfMonth))
  }
  return {
    startDate: dateInputValue(start),
    endDate: dateInputValue(end),
    userId: 'all',
    model: '',
  }
}

export function filterConsumptionRecords(
  records: ConsumptionRecord[],
  filters: ConsumptionFilters
): ConsumptionRecord[] {
  const model = filters.model.trim().toLowerCase()
  return records.filter(
    (record) =>
      record.date >= filters.startDate &&
      record.date <= filters.endDate &&
      (filters.userId === 'all' || record.userId === filters.userId) &&
      record.model.toLowerCase().includes(model)
  )
}

export function summarizeConsumption(records: ConsumptionRecord[]): {
  totals: ConsumptionTotals
  models: ConsumptionAggregate[]
} {
  const totals = { quota: 0, requests: 0, tokens: 0, models: 0 }
  for (const record of records) {
    totals.quota += record.quota
    totals.requests += record.requests
    totals.tokens += record.tokens
  }
  const models = aggregateConsumption(records, 'model')
  totals.models = models.length
  return { totals, models }
}

export function aggregateConsumption(
  records: ConsumptionRecord[],
  dimension: 'model' | 'user'
): ConsumptionAggregate[] {
  const groups = new Map<string, ConsumptionAggregate>()
  let totalQuota = 0
  for (const record of records) {
    const id = dimension === 'model' ? record.model : record.userId
    let row = groups.get(id)
    if (!row) {
      row = {
        id,
        name: dimension === 'model' ? record.model : record.username,
        quota: 0,
        requests: 0,
        tokens: 0,
        share: 0,
        averageQuota: 0,
      }
      groups.set(id, row)
    }
    row.quota += record.quota
    row.requests += record.requests
    row.tokens += record.tokens
    totalQuota += record.quota
  }
  for (const row of groups.values()) {
    row.share = totalQuota > 0 ? (row.quota / totalQuota) * 100 : 0
    row.averageQuota = row.requests > 0 ? row.quota / row.requests : 0
  }
  return [...groups.values()].sort(
    (a, b) => b.quota - a.quota || a.name.localeCompare(b.name)
  )
}

// All rows are exported before pagination, with full precision for accounting.
export function consumptionCsvRows(
  rows: ConsumptionAggregate[],
  filters: ConsumptionFilters,
  headers: string[],
  formatAmount: (quota: number) => string
): (string | number)[][] {
  return [
    headers,
    ...rows.map((row) => [
      filters.startDate,
      filters.endDate,
      row.id,
      row.name,
      formatAmount(row.quota),
      row.quota,
      row.share.toFixed(2),
      row.requests,
      row.tokens,
      formatAmount(row.averageQuota),
    ]),
  ]
}

// Build an exclusive next-midnight boundary in local time, not by adding 24 hours.
export function consumptionQueryParams(
  filters: ConsumptionFilters,
  model: string | null
) {
  const [startYear, startMonth, startDay] = filters.startDate
    .split('-')
    .map(Number)
  const [endYear, endMonth, endDay] = filters.endDate.split('-').map(Number)
  return {
    start_timestamp: Math.floor(
      new Date(startYear, startMonth - 1, startDay).getTime() / 1000
    ),
    end_timestamp: Math.floor(
      new Date(endYear, endMonth - 1, endDay + 1).getTime() / 1000
    ),
    user_id: filters.userId === 'all' ? undefined : Number(filters.userId),
    model_name: filters.model.trim() || undefined,
    exact_model: model ?? undefined,
  }
}
