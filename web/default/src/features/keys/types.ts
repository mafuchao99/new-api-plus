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

export const apiKeyRouteOverrideSchema = z.object({
  id: z.number().optional(),
  token_id: z.number().optional(),
  route_slot_id: z.number(),
  route_line_id: z.number(),
})

export const apiKeyRouteSlotSchema = z.object({
  id: z.number(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullish().default(''),
  default_route_line_id: z.number().nullish(),
  enabled: z.boolean().optional(),
  sort: z.number().optional(),
  remark: z.string().optional(),
})

export const apiKeyRouteLineModelPriceSchema = z.object({
  id: z.number(),
  route_line_id: z.number(),
  model_name: z.string(),
  billing_mode: z.string(),
  ratio: z.number().nullish(),
  per_request_price: z.number().nullish(),
  price_expression: z.string().nullish(),
  description: z.string().nullish().default(''),
  enabled: z.boolean().optional(),
})

export const apiKeyRouteLineBindingSchema = z.object({
  id: z.number(),
  channel_id: z.number(),
  route_line_id: z.number(),
  enabled: z.boolean().optional(),
  channel: z
    .object({
      id: z.number(),
      name: z.string(),
      type: z.number(),
      type_name: z.string().optional(),
      models: z.string().nullish().default(''),
      status: z.number(),
    })
    .nullish(),
})

export const apiKeyRouteLineSchema = z.object({
  id: z.number(),
  slot_id: z.number().nullish(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullish().default(''),
  default_ratio: z.number().nullish(),
  visible: z.boolean().optional(),
  enabled: z.boolean().optional(),
  sort: z.number().optional(),
  remark: z.string().optional(),
  model_prices: z.array(apiKeyRouteLineModelPriceSchema).optional().default([]),
  bindings: z.array(apiKeyRouteLineBindingSchema).optional().default([]),
})

export const apiKeyEffectiveRouteLineSchema = z.object({
  route_slot: apiKeyRouteSlotSchema,
  route_line: apiKeyRouteLineSchema
    .pick({
      id: true,
      slot_id: true,
      code: true,
      name: true,
      description: true,
      default_ratio: true,
    })
    .extend({
      billing_mode: z.string().optional(),
    })
    .nullish(),
  is_custom: z.boolean(),
})

// ============================================================================
// API Key Schema & Types
// ============================================================================

export const apiKeySchema = z.object({
  id: z.number(),
  name: z.string(),
  key: z.string(),
  status: z.number(), // 1: enabled, 2: disabled, 3: expired, 4: exhausted
  remain_quota: z.number(),
  used_quota: z.number(),
  unlimited_quota: z.boolean(),
  expired_time: z.number(), // -1 for never expires
  created_time: z.number(),
  accessed_time: z.number(),
  group: z.string().nullish().default(''),
  cross_group_retry: z
    .preprocess((v) => {
      if (v === 1) return true
      if (v === 0) return false
      return v
    }, z.boolean())
    .optional()
    .default(false),
  model_limits_enabled: z.boolean(),
  model_limits: z.string().nullish().default(''),
  allow_ips: z.string().nullish().default(''),
  route_locked: z.boolean().optional().default(false),
  locked_route_slot_id: z.number().nullish(),
  locked_route_line_id: z.number().nullish(),
  route_overrides: z.array(apiKeyRouteOverrideSchema).optional().default([]),
  route_overrides_count: z.number().optional().default(0),
  effective_route_lines: z
    .array(apiKeyEffectiveRouteLineSchema)
    .optional()
    .default([]),
})

export type ApiKey = z.infer<typeof apiKeySchema>
export type ApiKeyRouteOverride = z.infer<typeof apiKeyRouteOverrideSchema>
export type ApiKeyRouteSlot = z.infer<typeof apiKeyRouteSlotSchema>
export type ApiKeyRouteLine = z.infer<typeof apiKeyRouteLineSchema>
export type ApiKeyEffectiveRouteLine = z.infer<
  typeof apiKeyEffectiveRouteLineSchema
>

// ============================================================================
// API Request/Response Types
// ============================================================================

export interface ApiResponse<T = unknown> {
  success: boolean
  message?: string
  data?: T
}

export interface GetApiKeysParams {
  p?: number
  size?: number
}

export interface GetApiKeysResponse {
  success: boolean
  message?: string
  data?: {
    items: ApiKey[]
    total: number
    page: number
    page_size: number
  }
}

export interface SearchApiKeysParams {
  keyword?: string
  token?: string
  p?: number
  size?: number
}

export interface AdminUserApiKeysParams {
  userId: number
  keyword?: string
  p?: number
  size?: number
}

export interface AdminApiKeyRouteSwitchPayload {
  user_id?: number
  token_ids?: number[]
  route_slot_id: number
  route_line_id: number
}

export interface AdminApiKeyRouteLockPayload {
  user_id?: number
  token_ids: number[]
  route_slot_id: number
  route_line_id: number
  locked: boolean
}

export interface ApiKeyFormData {
  name: string
  remain_quota: number
  expired_time: number
  unlimited_quota: boolean
  model_limits_enabled: boolean
  model_limits: string
  allow_ips: string
  group: string
  cross_group_retry: boolean
  route_overrides: Array<{
    route_slot_id: number
    route_line_id: number
  }>
}

export interface ApiKeyRouteOptionsResponse {
  success: boolean
  message?: string
  data?: {
    slots: ApiKeyRouteSlot[]
    lines: ApiKeyRouteLine[]
  }
}

// ============================================================================
// Dialog Types
// ============================================================================

export type ApiKeysDialogType =
  | 'create'
  | 'update'
  | 'delete'
  | 'batch-delete'
  | 'cc-switch'
