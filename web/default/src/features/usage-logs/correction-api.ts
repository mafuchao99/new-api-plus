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

export interface CorrectionBatch {
  id: string
  user_id: number
  model_name: string
  start_time: number
  end_time: number
  status: string
  task_id: string
  summary: string
  fingerprint: string
  reason: string
  error: string
  created_at: number
  apply_started: boolean
}

export interface CorrectionEntry {
  log_id: number
  created_at: number
  original_quota: number
  corrected_quota: number
  delta: number
  status: string
  error?: string
  warnings?: string[]
}

export interface CorrectionSnapshot {
  id: number
  batch_id: string
  log_id: number
  user_id: number
  model_name: string
  log_created_at: number
  original: string
  corrected_quota: number
  corrected_other: string
  delta: number
  sync_status: string
  operator_id: number
  reason: string
  created_at: number
}

interface Response<T> {
  success: boolean
  message?: string
  data: T
}

interface Page<T> {
  items: T[]
  total: number
}

async function result<T>(request: Promise<{ data: Response<T> }>): Promise<T> {
  const response = await request
  if (!response.data.success) {
    throw new Error(response.data.message || 'Correction request failed')
  }
  return response.data.data
}

const base = '/api/log/corrections'

export const getCorrectionCapabilities = () =>
  result<{ supported: boolean }>(api.get(`${base}/capabilities`))

export const createCorrectionPreview = (parameters: {
  user_id: number
  model_name: string
  start_time: number
  end_time: number
  cache_read_ratio: number
  cache_write_ratio: number
  cache_write_5m_ratio?: number
  cache_write_1h_ratio?: number
}) => result<CorrectionBatch>(api.post(`${base}/`, parameters))

export const getCorrection = (id: string) =>
  result<{ batch: CorrectionBatch; task: { state: string } }>(
    api.get(`${base}/${id}`)
  )

export const applyCorrection = (id: string, reason: string) =>
  result<{ batch_id: string }>(api.post(`${base}/${id}/apply`, { reason }))

export const listCorrections = (userId: string, page: number) =>
  result<Page<CorrectionBatch>>(
    api.get(`${base}/`, {
      params: { user_id: userId || undefined, p: page, page_size: 20 },
    })
  )

export const getCorrectionDetails = (id: string, page: number) =>
  result<Page<CorrectionEntry>>(
    api.get(`${base}/${id}/details`, { params: { p: page, page_size: 20 } })
  )

export const getCorrectionSnapshots = (filters: {
  user_id?: string
  model_name?: string
  batch_id?: string
  log_id?: string
  start_time?: number
  end_time?: number
  p: number
}) =>
  result<Page<CorrectionSnapshot>>(
    api.get(`${base}/snapshots`, { params: { ...filters, page_size: 20 } })
  )

export async function exportCorrection(id: string, summary = false) {
  const response = await api.get<Blob>(`${base}/${id}/export`, {
    responseType: 'blob',
    params: { summary: summary ? 'true' : undefined },
    disableDuplicate: true,
  })
  if (String(response.headers['content-type']).includes('application/json')) {
    const error = JSON.parse(await response.data.text()) as { message?: string }
    throw new Error(error.message || 'Correction request failed')
  }
  const url = URL.createObjectURL(response.data)
  const link = document.createElement('a')
  link.href = url
  link.download = `log-correction-${id}${summary ? '-summary' : ''}.csv`
  link.click()
  URL.revokeObjectURL(url)
}
