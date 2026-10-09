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

const ratio = z
  .string()
  .refine(
    (value) =>
      value.trim() !== '' &&
      Number.isFinite(Number(value)) &&
      Number(value) >= 0,
    'Enter a finite nonnegative ratio'
  )
const optionalRatio = z.union([z.literal(''), ratio])

export const correctionFormSchema = z
  .object({
    userId: z.string().regex(/^[1-9]\d*$/, 'Select a user'),
    model: z.string().trim().min(1, 'Enter an exact model name'),
    start: z.string().min(1, 'Select a start time'),
    end: z.string().min(1, 'Select an end time'),
    read: ratio,
    write: ratio,
    write5m: optionalRatio,
    write1h: optionalRatio,
  })
  .refine(
    (values) => {
      const start = new Date(values.start).getTime()
      const end = new Date(values.end).getTime()
      return Number.isFinite(start) && Number.isFinite(end) && end > start
    },
    { message: 'End time must be after start time', path: ['end'] }
  )
  .refine(
    (values) =>
      new Date(values.end).getTime() <=
      Math.floor(Date.now() / 3_600_000) * 3_600_000,
    { message: 'Select completed historical hours', path: ['end'] }
  )

export type CorrectionFormValues = z.infer<typeof correctionFormSchema>

export const correctionSummarySchema = z.object({
  matched: z.number(),
  changes: z.number(),
  skipped: z.number(),
  unchanged: z.number(),
  warnings: z.number(),
  original_quota: z.number(),
  corrected_quota: z.number(),
  delta: z.number(),
  dashboard_delta: z.number(),
  monthly_delta: z.number(),
  user_delta: z.number().default(0),
  token_delta: z.number().default(0),
  channel_delta: z.number().default(0),
  monthly_wallet_delta: z.number().default(0),
  monthly_subscription_delta: z.number().default(0),
})

export function parseCorrectionSummary(value: string) {
  try {
    const result = correctionSummarySchema.safeParse(JSON.parse(value))
    return result.success ? result.data : null
  } catch {
    return null
  }
}

export function parseCorrectionProgress(value?: string) {
  try {
    const result = z
      .object({
        processed: z.number().int().nonnegative(),
        total: z.number().int().nonnegative().optional(),
      })
      .safeParse(JSON.parse(value || 'null'))
    return result.success ? result.data : null
  } catch {
    return null
  }
}

export const correctionStatusLabels: Record<string, string> = {
  previewing: 'Previewing',
  ready: 'Ready',
  applying: 'Applying',
  completed: 'Completed',
  failed: 'Failed',
  change: 'Will be corrected',
  skipped: 'Skipped',
  unchanged: 'Unchanged',
  pending: 'Pending synchronization',
  synced: 'Synchronized',
}

export function translateCorrectionMessage(
  message: string,
  t: TFunction
): string {
  const replay =
    /^historical replay mismatch: expected (\d+), calculated (\d+)$/.exec(
      message
    )
  if (replay) {
    return t(
      'Historical replay mismatch: expected {{expected}}, calculated {{calculated}}',
      {
        expected: replay[1],
        calculated: replay[2],
      }
    )
  }
  const counter = /^(user|token|channel) consumed quota is insufficient$/.exec(
    message
  )
  if (counter) {
    return t('Consumed quota is insufficient: {{account}}', {
      account: counter[1],
    })
  }
  const totals =
    /^(\w+) aggregate is insufficient for the complete correction batch$/.exec(
      message
    )
  if (totals) {
    return t(
      'Aggregate is insufficient for the complete correction batch: {{aggregate}}',
      { aggregate: totals[1] }
    )
  }
  return t(message)
}
