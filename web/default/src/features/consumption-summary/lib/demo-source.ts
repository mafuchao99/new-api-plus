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
import type { ConsumptionDataSource } from '../types'
import { createMockRecords, MOCK_USERS } from './mock-data'
import {
  aggregateConsumption,
  filterConsumptionRecords,
  summarizeConsumption,
} from './summary'

const records = createMockRecords(new Date())

// Only the isolated style preview imports this data source.
export const demoConsumptionApi: ConsumptionDataSource = {
  kind: 'demo',
  async summary(filters, model) {
    const filtered = filterConsumptionRecords(records, filters).filter(
      (record) => model === null || record.model === model
    )
    const summary = summarizeConsumption(filtered)
    return {
      totals: summary.totals,
      rows:
        model === null
          ? summary.models
          : aggregateConsumption(filtered, 'user'),
    }
  },
  async users(keyword, page) {
    const search = keyword.trim().toLowerCase()
    const users = MOCK_USERS.filter(
      (user) =>
        user.username.toLowerCase().includes(search) || user.id.includes(search)
    )
    return {
      users: users.slice((page - 1) * 30, page * 30),
      total: users.length,
    }
  },
}
