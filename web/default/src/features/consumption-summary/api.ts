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
import type { GetUsersResponse } from '@/features/users/types'
import { api } from '@/lib/api'

import { consumptionQueryParams } from './lib/summary'
import type { ConsumptionDataSource, ConsumptionResult } from './types'

export const consumptionApi: ConsumptionDataSource = {
  kind: 'live',
  async summary(filters, model, signal) {
    const response = await api.get<{
      success: boolean
      message: string
      data: ConsumptionResult
    }>('/api/log/consumption-summary', {
      params: consumptionQueryParams(filters, model),
      signal,
      disableDuplicate: true,
      skipBusinessError: true,
      skipErrorHandler: true,
    })
    if (!response.data.success) throw new Error(response.data.message)
    return response.data.data
  },
  async users(keyword, page, signal) {
    const response = await api.get<GetUsersResponse>('/api/user/search', {
      params: { keyword, p: page, page_size: 30 },
      signal,
      disableDuplicate: true,
      skipBusinessError: true,
      skipErrorHandler: true,
    })
    if (!response.data.success || !response.data.data) {
      throw new Error(response.data.message)
    }
    return {
      users: response.data.data.items.map((user) => ({
        id: String(user.id),
        username: user.username,
      })),
      total: response.data.data.total,
    }
  },
}
