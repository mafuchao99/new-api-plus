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
import { api } from '@/lib/api'

import type {
  ApiResponse,
  BalanceQueryResult,
  GetUpstreamAccountsParams,
  GetUpstreamAccountsResponse,
  UpstreamAccount,
  UpstreamAccountFormData,
  UpstreamAlertSettings,
  UpstreamAlertSettingsResponse,
  UpstreamMonitorSettings,
  UpstreamMonitorSettingsResponse,
  UpdateBalancesResponse,
} from './types'

// ============================================================================
// Upstream Account Management
// ============================================================================

// Get paginated upstream accounts (credentials are omitted by the backend)
export async function getUpstreamAccounts(
  params: GetUpstreamAccountsParams = {}
): Promise<GetUpstreamAccountsResponse> {
  const { p = 1, page_size = 10 } = params
  const res = await api.get(`/api/upstream/?p=${p}&page_size=${page_size}`)
  return res.data
}

// Search upstream accounts by keyword (name / base URL / remark)
export async function searchUpstreamAccounts(
  params: GetUpstreamAccountsParams
): Promise<GetUpstreamAccountsResponse> {
  const { keyword = '', p = 1, page_size = 10 } = params
  const res = await api.get(
    `/api/upstream/search?keyword=${encodeURIComponent(keyword)}&p=${p}&page_size=${page_size}`
  )
  return res.data
}

// Get single upstream account by ID (returns credentials for the edit form)
export async function getUpstreamAccount(
  id: number
): Promise<ApiResponse<UpstreamAccount>> {
  const res = await api.get(`/api/upstream/${id}`)
  return res.data
}

// Create upstream account
export async function createUpstreamAccount(
  data: UpstreamAccountFormData
): Promise<ApiResponse<UpstreamAccount>> {
  const res = await api.post('/api/upstream/', data)
  return res.data
}

// Update upstream account
export async function updateUpstreamAccount(
  data: UpstreamAccountFormData & { id: number }
): Promise<ApiResponse<UpstreamAccount>> {
  const res = await api.put('/api/upstream/', data)
  return res.data
}

// Enable / disable an upstream account
export async function updateUpstreamAccountStatus(
  id: number,
  enabled: boolean
): Promise<ApiResponse<UpstreamAccount>> {
  const res = await api.put('/api/upstream/?status_only=true', { id, enabled })
  return res.data
}

// Delete a single upstream account
export async function deleteUpstreamAccount(id: number): Promise<ApiResponse> {
  const res = await api.delete(`/api/upstream/${id}`)
  return res.data
}

// Query the balance of a single upstream account
export async function updateUpstreamAccountBalance(
  id: number
): Promise<ApiResponse<BalanceQueryResult>> {
  const res = await api.get(`/api/upstream/update_balance/${id}`)
  return res.data
}

// Query the balances of multiple upstream accounts at once
export async function updateUpstreamAccountsBalance(
  ids: number[]
): Promise<UpdateBalancesResponse> {
  const res = await api.get(`/api/upstream/update_balance?ids=${ids.join(',')}`)
  return res.data
}

// Get low-balance email alert settings
export async function getUpstreamAlertSettings(): Promise<UpstreamAlertSettingsResponse> {
  const res = await api.get('/api/upstream/alert_settings')
  return res.data
}

// Send a test email to verify the low-balance alert configuration
export async function sendUpstreamTestEmail(id?: number): Promise<ApiResponse> {
  const res = await api.post('/api/upstream/test_email', id ? { id } : {})
  return res.data
}

// Get scheduled balance check settings
export async function getUpstreamMonitorSettings(): Promise<UpstreamMonitorSettingsResponse> {
  const res = await api.get('/api/upstream/monitor_settings')
  return res.data
}

// Update scheduled balance check settings
export async function updateUpstreamMonitorSettings(
  data: Omit<UpstreamMonitorSettings, 'current_interval'>
): Promise<UpstreamMonitorSettingsResponse> {
  const res = await api.put('/api/upstream/monitor_settings', data)
  return res.data
}

// Update low-balance email alert settings
export async function updateUpstreamAlertSettings(
  data: UpstreamAlertSettings
): Promise<UpstreamAlertSettingsResponse> {
  const res = await api.put('/api/upstream/alert_settings', data)
  return res.data
}
