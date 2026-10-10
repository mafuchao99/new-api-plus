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
export type ConsumptionRecord = {
  date: string
  userId: string
  username: string
  model: string
  quota: number
  requests: number
  tokens: number
}

export type ConsumptionFilters = {
  startDate: string
  endDate: string
  userId: string
  model: string
}

export type ConsumptionTotals = {
  quota: number
  requests: number
  tokens: number
  models: number
}

export type ConsumptionAggregate = {
  id: string
  name: string
  quota: number
  requests: number
  tokens: number
  share: number
  averageQuota: number
}

export type DatePreset =
  | 'today'
  | 'yesterday'
  | 'dayBeforeYesterday'
  | 'thisWeek'
  | 'lastWeek'
  | 'last7'
  | 'last30'
  | 'month'
  | 'lastMonth'
  | 'last3Months'

export type ConsumptionResult = {
  totals: ConsumptionTotals
  rows: ConsumptionAggregate[]
}

export type ConsumptionUser = { id: string; username: string }
export type ConsumptionUserPage = { users: ConsumptionUser[]; total: number }
export type ConsumptionDataSource = {
  kind: 'live' | 'demo'
  summary: (
    filters: ConsumptionFilters,
    model: string | null,
    signal: AbortSignal
  ) => Promise<ConsumptionResult>
  users: (
    keyword: string,
    page: number,
    signal: AbortSignal
  ) => Promise<ConsumptionUserPage>
}
