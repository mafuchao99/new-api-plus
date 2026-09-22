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
// ----------------------------------------------------------------------------
// Balance monitor API
// ----------------------------------------------------------------------------
//
// The backend endpoints named in the TODO(backend) comments below do not exist
// yet, so every function is served by the in-memory sample-data layer
// (lib/mock-store.ts). When the backend ships:
//   1. delete lib/mock-store.ts and lib/seed.ts
//   2. swap each body for the request in its TODO(backend) comment
// Nothing else in this feature needs to change.

import * as mockStore from './lib/mock-store'
import type {
  ApiResponse,
  BalanceQueryResult,
  GetUpstreamAccountsParams,
  GetUpstreamAccountsResponse,
  UpstreamAccount,
  UpstreamAccountFormData,
  UpstreamAlertSettings,
  UpstreamAlertSettingsResponse,
  UpdateBalancesResponse,
} from './types'

// Get paginated upstream accounts
export async function getUpstreamAccounts(
  params: GetUpstreamAccountsParams = {}
): Promise<GetUpstreamAccountsResponse> {
  // TODO(backend): return (await api.get(`/api/upstream/?p=${p}&page_size=${page_size}`)).data
  return mockStore.listMockAccounts(params)
}

// Search upstream accounts by keyword
export async function searchUpstreamAccounts(
  params: GetUpstreamAccountsParams
): Promise<GetUpstreamAccountsResponse> {
  // TODO(backend): return (await api.get(`/api/upstream/search?keyword=${keyword}&p=${p}&page_size=${page_size}`)).data
  return mockStore.listMockAccounts(params)
}

// Get single upstream account by ID
export async function getUpstreamAccount(
  id: number
): Promise<ApiResponse<UpstreamAccount>> {
  // TODO(backend): return (await api.get(`/api/upstream/${id}`)).data
  return mockStore.getMockAccount(id)
}

// Create upstream account
export async function createUpstreamAccount(
  data: UpstreamAccountFormData
): Promise<ApiResponse<UpstreamAccount>> {
  // TODO(backend): return (await api.post('/api/upstream/', data)).data
  return mockStore.createMockAccount(data)
}

// Update upstream account
export async function updateUpstreamAccount(
  data: UpstreamAccountFormData & { id: number }
): Promise<ApiResponse<UpstreamAccount>> {
  // TODO(backend): return (await api.put('/api/upstream/', data)).data
  return mockStore.updateMockAccount(data.id, data)
}

// Enable / disable an upstream account
export async function updateUpstreamAccountStatus(
  id: number,
  enabled: boolean
): Promise<ApiResponse<UpstreamAccount>> {
  // TODO(backend): return (await api.put('/api/upstream/?status_only=true', { id, enabled })).data
  return mockStore.updateMockAccountStatus(id, enabled)
}

// Delete a single upstream account
export async function deleteUpstreamAccount(id: number): Promise<ApiResponse> {
  // TODO(backend): return (await api.delete(`/api/upstream/${id}/`)).data
  return mockStore.deleteMockAccount(id)
}

// Query the balance of a single upstream account
export async function updateUpstreamAccountBalance(
  id: number
): Promise<ApiResponse<BalanceQueryResult>> {
  // TODO(backend): return (await api.get(`/api/upstream/update_balance/${id}`)).data
  return mockStore.queryMockBalance(id)
}

// Query the balances of multiple upstream accounts at once
export async function updateUpstreamAccountsBalance(
  ids: number[]
): Promise<UpdateBalancesResponse> {
  // TODO(backend): return (await api.get(`/api/upstream/update_balance?ids=${ids.join(',')}`)).data
  return mockStore.queryMockBalances(ids)
}

// Get low-balance email alert settings
export async function getUpstreamAlertSettings(): Promise<UpstreamAlertSettingsResponse> {
  // TODO(backend): return (await api.get('/api/upstream/alert_settings')).data
  return mockStore.getMockAlertSettings()
}

// Update low-balance email alert settings
export async function updateUpstreamAlertSettings(
  data: UpstreamAlertSettings
): Promise<UpstreamAlertSettingsResponse> {
  // TODO(backend): return (await api.put('/api/upstream/alert_settings', data)).data
  return mockStore.updateMockAlertSettings(data)
}
