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

import type { StatusBadgeProps } from '@/components/status-badge'

// ============================================================================
// Upstream Account Type Configuration
// ============================================================================

export const UPSTREAM_ACCOUNT_TYPES = [
  'new-api',
  'sub2api',
  'deepseek',
] as const

export const UPSTREAM_ACCOUNT_TYPE_META: Record<
  (typeof UPSTREAM_ACCOUNT_TYPES)[number],
  Pick<StatusBadgeProps, 'variant'> & { labelKey: string }
> = {
  'new-api': { labelKey: 'New API', variant: 'info' },
  sub2api: { labelKey: 'Sub2API', variant: 'purple' },
  deepseek: { labelKey: 'DeepSeek', variant: 'cyan' },
}

// ============================================================================
// Authentication Method Configuration
// ============================================================================

export const UPSTREAM_AUTH_TYPES = ['access_token', 'password'] as const

export const UPSTREAM_AUTH_TYPE_LABEL_KEYS: Record<
  (typeof UPSTREAM_AUTH_TYPES)[number],
  string
> = {
  access_token: 'Access Token',
  password: 'Username + Password',
}

// ============================================================================
// Balance Query Status Configuration
// ============================================================================

export const BALANCE_QUERY_STATUS = {
  NEVER: 0,
  SUCCESS: 1,
  FAILED: 2,
} as const

export const BALANCE_QUERY_STATUS_VALUES = Object.values(
  BALANCE_QUERY_STATUS
).map((value) => String(value)) as `${number}`[]

// labelKey values are i18n keys; use t(config.labelKey) in components
export const BALANCE_QUERY_STATUSES: Record<
  number,
  Pick<StatusBadgeProps, 'variant'> & {
    labelKey: string
    value: number
  }
> = {
  [BALANCE_QUERY_STATUS.NEVER]: {
    labelKey: 'Not queried',
    variant: 'neutral',
    value: BALANCE_QUERY_STATUS.NEVER,
  },
  [BALANCE_QUERY_STATUS.SUCCESS]: {
    labelKey: 'Success',
    variant: 'success',
    value: BALANCE_QUERY_STATUS.SUCCESS,
  },
  [BALANCE_QUERY_STATUS.FAILED]: {
    labelKey: 'Failed',
    variant: 'danger',
    value: BALANCE_QUERY_STATUS.FAILED,
  },
}

// Virtual column value derived from balance vs. threshold
export const LOW_BALANCE_FILTER = {
  LOW: 'low',
  NORMAL: 'normal',
} as const

export const LOW_BALANCE_FILTER_VALUES = [
  LOW_BALANCE_FILTER.LOW,
  LOW_BALANCE_FILTER.NORMAL,
] as const

// ============================================================================
// Select Options
// ============================================================================

export function getUpstreamAccountTypeOptions(t: TFunction) {
  return UPSTREAM_ACCOUNT_TYPES.map((value) => ({
    value,
    label: t(UPSTREAM_ACCOUNT_TYPE_META[value].labelKey),
  }))
}

export function getBalanceQueryStatusOptions(t: TFunction) {
  return Object.values(BALANCE_QUERY_STATUSES).map((config) => ({
    label: t(config.labelKey),
    value: String(config.value),
  }))
}

export function getLowBalanceFilterOptions(t: TFunction) {
  return [
    { label: t('Low Balance'), value: LOW_BALANCE_FILTER.LOW },
    { label: t('Normal'), value: LOW_BALANCE_FILTER.NORMAL },
  ]
}

// ============================================================================
// Validation Constants
// ============================================================================

export const UPSTREAM_ACCOUNT_VALIDATION = {
  NAME_MIN_LENGTH: 1,
  NAME_MAX_LENGTH: 60,
  REMARK_MAX_LENGTH: 200,
  DEFAULT_LOW_BALANCE_THRESHOLD: 5,
} as const

// ============================================================================
// Error Messages
// ============================================================================

// i18n keys; use t(ERROR_MESSAGES.xxx) when displaying. For form schema with interpolation use getUpstreamAccountFormErrorMessages(t).
export const ERROR_MESSAGES = {
  UNEXPECTED: 'An unexpected error occurred',
  LOAD_FAILED: 'Failed to load upstream accounts',
  SEARCH_FAILED: 'Failed to search upstream accounts',
  CREATE_FAILED: 'Failed to create upstream account',
  UPDATE_FAILED: 'Failed to update upstream account',
  DELETE_FAILED: 'Failed to delete upstream account',
  STATUS_UPDATE_FAILED: 'Failed to update account status',
  BALANCE_QUERY_FAILED: 'Balance query failed',
  ALERT_SETTINGS_SAVE_FAILED: 'Failed to save alert settings',
  NAME_REQUIRED: 'Account name is required',
  NAME_LENGTH_INVALID:
    'Account name must be between {{min}} and {{max}} characters',
  BASE_URL_REQUIRED: 'Base URL is required',
  BASE_URL_INVALID: 'Base URL must start with http:// or https://',
  THRESHOLD_INVALID: 'Low balance threshold must be a positive number',
  ACCESS_TOKEN_REQUIRED: 'Access token is required',
  USERNAME_REQUIRED: 'Username is required',
  PASSWORD_REQUIRED: 'Password is required',
  REMARK_LENGTH_INVALID: 'Remark must be at most {{max}} characters',
  NOTIFICATION_EMAIL_REQUIRED:
    'Notification email is required when email alerts are enabled',
} as const

/** For form schema only: returns translated messages with interpolation. */
export function getUpstreamAccountFormErrorMessages(t: TFunction) {
  return {
    NAME_LENGTH_INVALID: t(ERROR_MESSAGES.NAME_LENGTH_INVALID, {
      min: UPSTREAM_ACCOUNT_VALIDATION.NAME_MIN_LENGTH,
      max: UPSTREAM_ACCOUNT_VALIDATION.NAME_MAX_LENGTH,
    }),
    REMARK_LENGTH_INVALID: t(ERROR_MESSAGES.REMARK_LENGTH_INVALID, {
      max: UPSTREAM_ACCOUNT_VALIDATION.REMARK_MAX_LENGTH,
    }),
  } as const
}

// ============================================================================
// Success Messages (i18n keys; use t(SUCCESS_MESSAGES.xxx) when displaying)
// ============================================================================

export const SUCCESS_MESSAGES = {
  ACCOUNT_CREATED: 'Upstream account created successfully',
  ACCOUNT_UPDATED: 'Upstream account updated successfully',
  ACCOUNT_DELETED: 'Upstream account deleted successfully',
  ACCOUNT_ENABLED: 'Upstream account enabled successfully',
  ACCOUNT_DISABLED: 'Upstream account disabled successfully',
  BALANCE_UPDATED: 'Balance updated successfully',
  ALERT_SETTINGS_SAVED: 'Alert settings saved successfully',
} as const
