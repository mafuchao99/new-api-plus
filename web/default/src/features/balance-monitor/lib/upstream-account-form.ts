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
import type { TFunction } from 'i18next'
import { z } from 'zod'

import {
  ERROR_MESSAGES,
  UPSTREAM_ACCOUNT_TYPES,
  UPSTREAM_ACCOUNT_VALIDATION,
  UPSTREAM_AUTH_TYPES,
  getUpstreamAccountFormErrorMessages,
} from '../constants'
import type {
  UpstreamAccount,
  UpstreamAccountFormData,
  UpstreamAccountType,
  UpstreamAuthType,
} from '../types'

// ============================================================================
// Form Schema (use getUpstreamAccountFormSchema(t) in components for i18n messages)
// ============================================================================

export function getUpstreamAccountFormSchema(t: TFunction) {
  const msg = getUpstreamAccountFormErrorMessages(t)
  return z
    .object({
      name: z
        .string()
        .trim()
        .min(
          UPSTREAM_ACCOUNT_VALIDATION.NAME_MIN_LENGTH,
          t(ERROR_MESSAGES.NAME_REQUIRED)
        )
        .max(
          UPSTREAM_ACCOUNT_VALIDATION.NAME_MAX_LENGTH,
          msg.NAME_LENGTH_INVALID
        ),
      type: z.enum(UPSTREAM_ACCOUNT_TYPES),
      base_url: z
        .string()
        .trim()
        .min(1, t(ERROR_MESSAGES.BASE_URL_REQUIRED))
        .refine(
          (value) => /^https?:\/\//i.test(value),
          t(ERROR_MESSAGES.BASE_URL_INVALID)
        ),
      auth_type: z.enum(UPSTREAM_AUTH_TYPES),
      access_token: z.string(),
      username: z.string(),
      password: z.string(),
      low_balance_threshold: z
        .number()
        .min(0, t(ERROR_MESSAGES.THRESHOLD_INVALID)),
      enabled: z.boolean(),
      remark: z
        .string()
        .max(
          UPSTREAM_ACCOUNT_VALIDATION.REMARK_MAX_LENGTH,
          msg.REMARK_LENGTH_INVALID
        ),
    })
    .superRefine((values, ctx) => {
      if (values.auth_type === 'access_token' && !values.access_token.trim()) {
        ctx.addIssue({
          code: 'custom',
          path: ['access_token'],
          message: t(ERROR_MESSAGES.ACCESS_TOKEN_REQUIRED),
        })
      }

      if (values.auth_type === 'password') {
        if (!values.username.trim()) {
          ctx.addIssue({
            code: 'custom',
            path: ['username'],
            message: t(ERROR_MESSAGES.USERNAME_REQUIRED),
          })
        }
        if (!values.password) {
          ctx.addIssue({
            code: 'custom',
            path: ['password'],
            message: t(ERROR_MESSAGES.PASSWORD_REQUIRED),
          })
        }
      }
    })
}

export type UpstreamAccountFormValues = {
  name: string
  type: UpstreamAccountType
  base_url: string
  auth_type: UpstreamAuthType
  access_token: string
  username: string
  password: string
  low_balance_threshold: number
  enabled: boolean
  remark: string
}

// ============================================================================
// Form Defaults
// ============================================================================

export const UPSTREAM_ACCOUNT_FORM_DEFAULT_VALUES: UpstreamAccountFormValues = {
  name: '',
  type: 'new-api',
  base_url: '',
  auth_type: 'access_token',
  access_token: '',
  username: '',
  password: '',
  low_balance_threshold:
    UPSTREAM_ACCOUNT_VALIDATION.DEFAULT_LOW_BALANCE_THRESHOLD,
  enabled: true,
  remark: '',
}

// ============================================================================
// Form Data Transformation
// ============================================================================

/**
 * Transform form data to API payload. Only the credentials matching the
 * selected auth type are sent; the other fields are cleared.
 */
export function transformFormDataToPayload(
  data: UpstreamAccountFormValues
): UpstreamAccountFormData {
  const usesAccessToken = data.auth_type === 'access_token'
  return {
    name: data.name.trim(),
    type: data.type,
    base_url: data.base_url.trim(),
    auth_type: data.auth_type,
    access_token: usesAccessToken ? data.access_token.trim() : '',
    username: usesAccessToken ? '' : data.username.trim(),
    password: usesAccessToken ? '' : data.password,
    low_balance_threshold: data.low_balance_threshold,
    enabled: data.enabled,
    remark: data.remark.trim(),
  }
}

/**
 * Transform upstream account data to form defaults. The single-record endpoint
 * returns stored credentials so the edit form can prefill them; list responses
 * omit credentials (see the backend's UpstreamAccount.Clean).
 */
export function transformAccountToFormDefaults(
  account: UpstreamAccount
): UpstreamAccountFormValues {
  return {
    name: account.name,
    type: account.type,
    base_url: account.base_url,
    auth_type: account.auth_type,
    access_token: account.access_token,
    username: account.username,
    password: account.password,
    low_balance_threshold: account.low_balance_threshold,
    enabled: account.enabled,
    remark: account.remark,
  }
}
