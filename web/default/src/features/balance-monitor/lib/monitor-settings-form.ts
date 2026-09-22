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

// ============================================================================
// Scheduled balance check settings (use getMonitorSettingsFormSchema(t) in components)
// ============================================================================

export const UPSTREAM_MONITOR_MIN_INTERVAL = 1
export const UPSTREAM_MONITOR_MAX_INTERVAL = 24 * 60

export function getMonitorSettingsFormSchema(t: TFunction) {
  const interval = z
    .number()
    .min(
      UPSTREAM_MONITOR_MIN_INTERVAL,
      t('Interval must be between {{min}} and {{max}} minutes', {
        min: UPSTREAM_MONITOR_MIN_INTERVAL,
        max: UPSTREAM_MONITOR_MAX_INTERVAL,
      })
    )
    .max(
      UPSTREAM_MONITOR_MAX_INTERVAL,
      t('Interval must be between {{min}} and {{max}} minutes', {
        min: UPSTREAM_MONITOR_MIN_INTERVAL,
        max: UPSTREAM_MONITOR_MAX_INTERVAL,
      })
    )
  return z.object({
    enabled: z.boolean(),
    peak_start_hour: z.number().min(0).max(23),
    peak_end_hour: z.number().min(0).max(23),
    peak_interval: interval,
    off_peak_interval: interval,
  })
}

export type MonitorSettingsFormValues = {
  enabled: boolean
  peak_start_hour: number
  peak_end_hour: number
  peak_interval: number
  off_peak_interval: number
}

export const MONITOR_SETTINGS_DEFAULT_VALUES: MonitorSettingsFormValues = {
  enabled: true,
  peak_start_hour: 9,
  peak_end_hour: 23,
  peak_interval: 10,
  off_peak_interval: 60,
}

/** 与后端 UpstreamMonitorSetting.InPeakHours 保持一致：起止相同视为全天，起始大于结束视为跨天 */
export function isPeakHour(hour: number, start: number, end: number): boolean {
  if (start === end) {
    return true
  }
  if (start < end) {
    return hour >= start && hour < end
  }
  return hour >= start || hour < end
}

/** 当前时刻生效的查询间隔（分钟），用于弹窗内实时提示 */
export function getEffectiveIntervalMinutes(
  values: Pick<
    MonitorSettingsFormValues,
    'peak_start_hour' | 'peak_end_hour' | 'peak_interval' | 'off_peak_interval'
  >
): number {
  const hour = new Date().getHours()
  return isPeakHour(hour, values.peak_start_hour, values.peak_end_hour)
    ? values.peak_interval
    : values.off_peak_interval
}
