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
  formatLogQuota,
  formatTimestampToDate,
  formatUseTime,
} from '@/lib/format'
import { getAllLogs, getUserLogs } from '../api'
import { buildDetailSegments } from '../components/columns/common-logs-columns'
import type { UsageLog } from '../data/schema'
import type { GetTokenUsageStatsParams, TokenUsageStat } from '../types'
import { formatModelName, parseLogOther } from './format'
import { buildApiParams, getLogTypeConfig } from './utils'

const EXPORT_PAGE_SIZE = 500
const EXPORT_REQUEST_TIMEOUT_MS = 20_000

function escapeCsvValue(value: string | number | boolean | null | undefined) {
  const text = value == null ? '' : String(value)
  return `"${text.replace(/"/g, '""')}"`
}

export function downloadCsv(
  filename: string,
  rows: (string | number | boolean | null | undefined)[][]
) {
  const content = rows
    .map((row) => row.map((value) => escapeCsvValue(value)).join(','))
    .join('\n')
  const blob = new Blob([`\uFEFF${content}\n`], {
    type: 'text/csv;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export async function fetchAllCommonLogsForExport(config: {
  isAdmin: boolean
  searchParams: Record<string, unknown>
  columnFilters: Array<{ id: string; value: unknown }>
  onProgress?: (progress: { current: number; total: number }) => void
}): Promise<UsageLog[]> {
  const { isAdmin, searchParams, columnFilters, onProgress } = config
  const fetchPage = async (page: number) => {
    const params = buildApiParams({
      page,
      pageSize: EXPORT_PAGE_SIZE,
      searchParams,
      columnFilters,
      isAdmin,
    })
    const exportParams = { ...params, export: true }
    const config = { timeout: EXPORT_REQUEST_TIMEOUT_MS }
    return isAdmin
      ? await getAllLogs(exportParams, config)
      : await getUserLogs(exportParams, config)
  }

  const firstPage = await fetchPage(1)
  if (!firstPage.success) throw new Error(firstPage.message)

  const firstItems = (firstPage.data?.items ?? []) as UsageLog[]
  const total = firstPage.data?.total ?? firstItems.length
  const pageCount = Math.ceil(total / EXPORT_PAGE_SIZE)
  const rest: UsageLog[] = []
  if (pageCount > 0) onProgress?.({ current: 1, total: pageCount })

  for (let page = 2; page <= pageCount; page++) {
    const result = await fetchPage(page)
    if (!result.success) throw new Error(result.message)
    rest.push(...((result.data?.items ?? []) as UsageLog[]))
    onProgress?.({ current: page, total: pageCount })
  }

  return [...firstItems, ...rest]
}

export function buildTokenUsageStatsExportParams(config: {
  isAdmin: boolean
  searchParams: Record<string, unknown>
  columnFilters: Array<{ id: string; value: unknown }>
}): GetTokenUsageStatsParams {
  const { p: _p, page_size: _pageSize, export: _export, ...statParams } =
    buildApiParams({
      page: 1,
      pageSize: 1,
      searchParams: config.searchParams,
      columnFilters: config.columnFilters,
      isAdmin: config.isAdmin,
    })

  return statParams
}

function getCacheWriteTokens(other: ReturnType<typeof parseLogOther>) {
  const cacheWrite5m = other?.cache_creation_tokens_5m || 0
  const cacheWrite1h = other?.cache_creation_tokens_1h || 0
  return cacheWrite5m > 0 || cacheWrite1h > 0
    ? cacheWrite5m + cacheWrite1h
    : other?.cache_creation_tokens || 0
}

export function buildCommonLogsCsvRows(config: {
  logs: UsageLog[]
  isAdmin: boolean
  t: (key: string, opts?: Record<string, unknown>) => string
}): (string | number | boolean | null | undefined)[][] {
  const { logs, isAdmin, t } = config
  const headers = [
    t('Time'),
    t('Type'),
    ...(isAdmin ? [t('User')] : []),
    t('Token'),
    t('Group'),
    t('Model'),
    t('Timing'),
    'First Response',
    t('Stream'),
    'Prompt Tokens',
    'Completion Tokens',
    'Cache Read Tokens',
    'Cache Write Tokens',
    t('Cost'),
    t('Details'),
  ]

  const rows = logs.map((log) => {
    const other = parseLogOther(log.other)
    const modelInfo = formatModelName(log)
    const details = buildDetailSegments(log, other, t)
      .map((segment) => segment.text)
      .join(' | ')
    const tokensPerSecond =
      log.use_time > 0 && log.completion_tokens > 0
        ? Math.round(log.completion_tokens / log.use_time)
        : ''

    return [
      formatTimestampToDate(log.created_at),
      t(getLogTypeConfig(log.type).label),
      ...(isAdmin ? [log.username] : []),
      log.token_name,
      log.group || other?.group || '',
      modelInfo.actualModel
        ? `${modelInfo.name} (${modelInfo.actualModel})`
        : modelInfo.name,
      [
        log.use_time > 0 ? formatUseTime(log.use_time) : '',
        tokensPerSecond ? `${tokensPerSecond} t/s` : '',
      ]
        .filter(Boolean)
        .join(' | '),
      other?.frt ? formatUseTime(other.frt / 1000) : '',
      log.is_stream ? t('Stream') : t('Non-stream'),
      log.prompt_tokens || 0,
      log.completion_tokens || 0,
      other?.cache_tokens || 0,
      getCacheWriteTokens(other),
      formatLogQuota(log.quota),
      details || log.content || '',
    ]
  })

  return [headers, ...rows]
}

export function buildTokenUsageStatsCsvRows(config: {
  stats: TokenUsageStat[]
  isAdmin: boolean
  t: (key: string, opts?: Record<string, unknown>) => string
}): (string | number | boolean | null | undefined)[][] {
  const { stats, isAdmin, t } = config
  const headers = [
    'Key ID',
    t('Key Name'),
    ...(isAdmin ? [t('Username')] : []),
    t('Group'),
    t('Requests'),
    t('Quota'),
    'Prompt Tokens',
    'Completion Tokens',
    'Total Tokens',
    t('First Used At'),
    t('Last Used At'),
  ]

  const rows = stats.map((stat) => [
    stat.token_id,
    stat.token_name,
    ...(isAdmin ? [stat.username || ''] : []),
    stat.group || '',
    stat.requests,
    formatLogQuota(stat.quota),
    stat.prompt_tokens,
    stat.completion_tokens,
    stat.prompt_tokens + stat.completion_tokens,
    stat.first_used_at ? formatTimestampToDate(stat.first_used_at) : '',
    stat.last_used_at ? formatTimestampToDate(stat.last_used_at) : '',
  ])

  return [headers, ...rows]
}
