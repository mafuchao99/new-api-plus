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
import {
  getPresetDateRange,
  type TimeGranularity,
  type TimeRangePreset,
} from '@/lib/time'
import {
  DASHBOARD_CHART_PREFERENCES_STORAGE_KEY,
  DEFAULT_DASHBOARD_CHART_PREFERENCES,
  DEFAULT_TIME_GRANULARITY,
  EMPTY_DASHBOARD_FILTERS,
  TIME_GRANULARITY_STORAGE_KEY,
  TIME_RANGE_PRESETS,
  TIME_RANGE_BY_GRANULARITY,
} from '@/features/dashboard/constants'
import type {
  ConsumptionDistributionChartType,
  DashboardChartPreferences,
  DashboardFilters,
  ModelAnalyticsChartTab,
} from '@/features/dashboard/types'

function isTimeGranularity(value: unknown): value is TimeGranularity {
  return value === 'hour' || value === 'day' || value === 'week'
}

function getLegacySavedGranularity(): TimeGranularity {
  if (typeof window === 'undefined') return DEFAULT_TIME_GRANULARITY
  const saved = localStorage.getItem(TIME_GRANULARITY_STORAGE_KEY)
  return isTimeGranularity(saved) ? saved : DEFAULT_TIME_GRANULARITY
}

function isConsumptionDistributionChartType(
  value: unknown
): value is ConsumptionDistributionChartType {
  return value === 'bar' || value === 'area'
}

function isModelAnalyticsChartTab(
  value: unknown
): value is ModelAnalyticsChartTab {
  return value === 'trend' || value === 'proportion' || value === 'top'
}

function isTimeRangePresetDays(value: unknown): value is number {
  return value === 1 || value === 7 || value === 14 || value === 29
}

function isTimeRangePreset(value: unknown): value is TimeRangePreset {
  return TIME_RANGE_PRESETS.some((preset) => preset.value === value)
}

function migrateLegacyRangePreset(value: unknown): TimeRangePreset | undefined {
  if (!isTimeRangePresetDays(value)) return undefined
  return value === 1 ? 'last_24_hours' : undefined
}

export function cleanFilters<T extends Record<string, unknown>>(
  filters: T
): Partial<T> {
  const cleaned: Partial<T> = {}
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null) continue
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (trimmed) cleaned[key as keyof T] = trimmed as T[keyof T]
      continue
    }
    cleaned[key as keyof T] = value as T[keyof T]
  }
  return cleaned
}

export function getSavedGranularity(
  override?: TimeGranularity
): TimeGranularity {
  if (override) return override
  return getSavedChartPreferences().defaultTimeGranularity
}

export function saveGranularity(granularity: TimeGranularity): void {
  if (typeof window === 'undefined') return
  saveChartPreferences({
    ...getSavedChartPreferences(),
    defaultTimeGranularity: granularity,
  })
  localStorage.setItem(TIME_GRANULARITY_STORAGE_KEY, granularity)
}

export function getSavedChartPreferences(): DashboardChartPreferences {
  if (typeof window === 'undefined') return DEFAULT_DASHBOARD_CHART_PREFERENCES

  const fallbackPreferences = {
    ...DEFAULT_DASHBOARD_CHART_PREFERENCES,
    defaultTimeGranularity: getLegacySavedGranularity(),
  }

  try {
    const raw = localStorage.getItem(DASHBOARD_CHART_PREFERENCES_STORAGE_KEY)
    if (!raw) return fallbackPreferences

    const parsed = JSON.parse(raw) as Partial<DashboardChartPreferences> & {
      defaultTimeRangeDays?: unknown
    }
    const defaultTimeRangePreset = isTimeRangePreset(
      parsed.defaultTimeRangePreset
    )
      ? parsed.defaultTimeRangePreset
      : (migrateLegacyRangePreset(parsed.defaultTimeRangeDays) ??
        fallbackPreferences.defaultTimeRangePreset)

    return {
      consumptionDistributionChart: isConsumptionDistributionChartType(
        parsed.consumptionDistributionChart
      )
        ? parsed.consumptionDistributionChart
        : fallbackPreferences.consumptionDistributionChart,
      modelAnalyticsChart: isModelAnalyticsChartTab(parsed.modelAnalyticsChart)
        ? parsed.modelAnalyticsChart
        : fallbackPreferences.modelAnalyticsChart,
      defaultTimeRangePreset,
      defaultTimeGranularity: isTimeGranularity(parsed.defaultTimeGranularity)
        ? parsed.defaultTimeGranularity
        : fallbackPreferences.defaultTimeGranularity,
    }
  } catch {
    return fallbackPreferences
  }
}

export function saveChartPreferences(
  preferences: DashboardChartPreferences
): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(
    DASHBOARD_CHART_PREFERENCES_STORAGE_KEY,
    JSON.stringify(preferences)
  )
}

export function getDefaultRangePreset(
  granularity?: TimeGranularity
): TimeRangePreset {
  if (!granularity) return getSavedChartPreferences().defaultTimeRangePreset
  return TIME_RANGE_BY_GRANULARITY[getSavedGranularity(granularity)]
}

export function getDefaultDays(granularity?: TimeGranularity): number {
  const preset = getDefaultRangePreset(granularity)
  if (preset === 'last_24_hours' || preset === 'today' || preset === 'yesterday')
    return 1
  if (preset === 'this_week' || preset === 'last_week') return 7
  return 30
}

export function buildDefaultDashboardFilters(
  preferences: DashboardChartPreferences = getSavedChartPreferences()
): DashboardFilters {
  const { start, end } = getPresetDateRange(preferences.defaultTimeRangePreset)
  return {
    ...EMPTY_DASHBOARD_FILTERS,
    start_timestamp: start,
    end_timestamp: end,
    time_granularity: preferences.defaultTimeGranularity,
  }
}

export function buildQueryParams(
  timeRange: { start_timestamp: number; end_timestamp: number },
  filters?: { time_granularity?: TimeGranularity; username?: string }
): {
  start_timestamp: number
  end_timestamp: number
  default_time: string
  username?: string
} {
  return {
    ...timeRange,
    default_time: getSavedGranularity(filters?.time_granularity),
    ...(filters?.username && { username: filters.username }),
  }
}
