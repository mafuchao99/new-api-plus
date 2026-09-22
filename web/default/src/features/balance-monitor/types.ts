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
import { z } from 'zod'

import { UPSTREAM_ACCOUNT_TYPES, UPSTREAM_AUTH_TYPES } from './constants'

// ============================================================================
// Upstream Account Schema & Types
// ============================================================================

export const upstreamAccountSchema = z.object({
  id: z.number(),
  name: z.string(),
  type: z.enum(UPSTREAM_ACCOUNT_TYPES),
  base_url: z.string(),
  auth_type: z.enum(UPSTREAM_AUTH_TYPES),
  access_token: z.string(),
  username: z.string(),
  password: z.string(),
  // new-api style upstreams need the user id that owns the access token
  upstream_user_id: z.number(),
  low_balance_threshold: z.number(),
  enabled: z.boolean(),
  remark: z.string(),
  // Balance snapshot written by the balance query task.
  // Stored as returned by the upstream panel (no currency conversion).
  balance: z.number(),
  balance_updated_time: z.number(), // unix seconds; 0 = never queried
  query_status: z.number(), // 0: never, 1: success, 2: failed
  last_error: z.string(),
  // unix seconds; non-zero means a low-balance alert has been sent and the
  // balance has not recovered above the threshold yet
  last_alert_time: z.number(),
  created_time: z.number(),
  updated_time: z.number(),
})

export type UpstreamAccount = z.infer<typeof upstreamAccountSchema>
export type UpstreamAccountType = (typeof UPSTREAM_ACCOUNT_TYPES)[number]
export type UpstreamAuthType = (typeof UPSTREAM_AUTH_TYPES)[number]

// ============================================================================
// API Request/Response Types
// ============================================================================

export interface ApiResponse<T = unknown> {
  success: boolean
  message?: string
  data?: T
}

export interface GetUpstreamAccountsParams {
  p?: number
  page_size?: number
  keyword?: string
}

export interface GetUpstreamAccountsResponse {
  success: boolean
  message?: string
  data?: {
    items: UpstreamAccount[]
    total: number
    page: number
    page_size: number
  }
}

export interface BalanceQueryResult {
  id: number
  success: boolean
  balance: number
  balance_updated_time: number
  query_status: number
  message: string
}

export interface UpdateBalancesResponse {
  success: boolean
  message?: string
  data?: {
    success_count: number
    failed_count: number
    items: BalanceQueryResult[]
  }
}

export interface UpstreamAccountFormData {
  id?: number
  name: string
  type: UpstreamAccountType
  base_url: string
  auth_type: UpstreamAuthType
  access_token: string
  username: string
  password: string
  upstream_user_id: number
  low_balance_threshold: number
  enabled: boolean
  remark: string
}

export interface UpstreamAlertSettings {
  email_enabled: boolean
  notification_email: string
}

export type UpstreamAlertSettingsResponse = ApiResponse<UpstreamAlertSettings>

// ============================================================================
// Scheduled balance check settings
// ============================================================================

export interface UpstreamMonitorSettings {
  enabled: boolean
  peak_start_hour: number
  peak_end_hour: number
  peak_interval: number
  off_peak_interval: number
  /** Current effective interval (minutes) according to the peak/off-peak window */
  current_interval: number
}

export type UpstreamMonitorSettingsResponse =
  ApiResponse<UpstreamMonitorSettings>

// ============================================================================
// Dialog Types
// ============================================================================

export type UpstreamAccountsDialogType =
  | 'create'
  | 'update'
  | 'delete'
  | 'alerts'
  | 'schedule'
