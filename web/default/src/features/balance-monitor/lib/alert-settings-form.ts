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

import { ERROR_MESSAGES } from '../constants'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// ============================================================================
// Email Alert Settings Schema (use getAlertSettingsFormSchema(t) in components)
// ============================================================================

export function getAlertSettingsFormSchema(t: TFunction) {
  return z
    .object({
      email_enabled: z.boolean(),
      notification_email: z.string().trim(),
    })
    .superRefine((values, ctx) => {
      if (!values.email_enabled) {
        return
      }
      if (!values.notification_email) {
        ctx.addIssue({
          code: 'custom',
          path: ['notification_email'],
          message: t(ERROR_MESSAGES.NOTIFICATION_EMAIL_REQUIRED),
        })
        return
      }
      const hasInvalidAddress = values.notification_email
        .split(',')
        .map((address) => address.trim())
        .filter(Boolean)
        .some((address) => !EMAIL_PATTERN.test(address))
      if (hasInvalidAddress) {
        ctx.addIssue({
          code: 'custom',
          path: ['notification_email'],
          message: t('Please enter a valid email address'),
        })
      }
    })
}

export type AlertSettingsFormValues = {
  email_enabled: boolean
  notification_email: string
}

export const ALERT_SETTINGS_DEFAULT_VALUES: AlertSettingsFormValues = {
  email_enabled: false,
  notification_email: '',
}
