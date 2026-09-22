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
// ----------------------------------------------------------------------------
// Sample data layer
// ----------------------------------------------------------------------------
//
// The /api/upstream/* endpoints do not exist yet, so every api.ts call is
// served from this in-memory store. The seed list below is generated once per
// page load with deterministic pseudo-random values (lib/seed.ts) so the list
// always renders the same states — success / failed / never queried, enabled /
// disabled, normal / low balance — without jittering between renders.
//
// Edits are intentionally lost on reload: this is sample data, not persistence.
// Delete this file and lib/seed.ts once the backend ships; api.ts is the only
// caller and each function there documents the real request to restore.

import { BALANCE_QUERY_STATUS } from '../constants'
import type {
  ApiResponse,
  BalanceQueryResult,
  GetUpstreamAccountsParams,
  GetUpstreamAccountsResponse,
  UpstreamAccount,
  UpstreamAccountFormData,
  UpstreamAlertSettings,
  UpstreamAlertSettingsResponse,
  UpdateBalancesResponse,
} from '../types'
import {
  hashStringToSeed,
  randomInRange,
  randomIntInRange,
  seededRandom,
} from './seed'

const SEED = 20_260_921
const DAY_SECONDS = 86_400
const QUERY_FAILURES = [
  'Upstream returned 401: invalid access token',
  'Upstream returned 403: account quota exhausted',
  'Connection timeout after 10s',
  'Upstream returned 500: internal error',
]

type AccountSeed = {
  name: string
  type: UpstreamAccount['type']
  base_url: string
  auth_type: UpstreamAccount['auth_type']
  low_balance_threshold: number
  enabled: boolean
  remark: string
  balance: number
  status: number
  last_error?: string
  /** Hours since the last query; 0 renders the "never queried" state. */
  updated_hours_ago: number
}

const ACCOUNT_SEEDS: AccountSeed[] = [
  {
    name: '青云中转·主线路',
    type: 'new-api',
    base_url: 'https://api.qingyun-new.com',
    auth_type: 'access_token',
    low_balance_threshold: 5,
    enabled: true,
    remark: '主力线路，优先级最高',
    balance: 128.64,
    status: BALANCE_QUERY_STATUS.SUCCESS,
    updated_hours_ago: 1,
  },
  {
    name: '青云中转·备用线路',
    type: 'new-api',
    base_url: 'https://backup.qingyun-new.com',
    auth_type: 'access_token',
    low_balance_threshold: 5,
    enabled: true,
    remark: '',
    balance: 42.3,
    status: BALANCE_QUERY_STATUS.SUCCESS,
    updated_hours_ago: 3,
  },
  {
    name: 'Sub2API 聚合 A',
    type: 'sub2api',
    base_url: 'https://sub2api-a.example.com',
    auth_type: 'password',
    low_balance_threshold: 10,
    enabled: true,
    remark: '订阅账号池，按月重置',
    balance: 18.05,
    status: BALANCE_QUERY_STATUS.SUCCESS,
    updated_hours_ago: 2,
  },
  {
    name: 'Sub2API 聚合 B',
    type: 'sub2api',
    base_url: 'https://sub2api-b.example.com',
    auth_type: 'password',
    low_balance_threshold: 10,
    enabled: true,
    remark: '',
    balance: 3.2,
    status: BALANCE_QUERY_STATUS.SUCCESS,
    updated_hours_ago: 6,
  },
  {
    name: 'OpenAI 直连（团队号）',
    type: 'new-api',
    base_url: 'https://api.openai-proxy.example.net',
    auth_type: 'access_token',
    low_balance_threshold: 20,
    enabled: true,
    remark: '仅承载 gpt 系列模型',
    balance: 76.5,
    status: BALANCE_QUERY_STATUS.SUCCESS,
    updated_hours_ago: 1,
  },
  {
    name: '星尘 API',
    type: 'new-api',
    base_url: 'https://api.xingchen-ai.com',
    auth_type: 'access_token',
    low_balance_threshold: 5,
    enabled: true,
    remark: '',
    balance: 0,
    status: BALANCE_QUERY_STATUS.FAILED,
    last_error: 'Upstream returned 401: invalid access token',
    updated_hours_ago: 12,
  },
  {
    name: '灵犀中转',
    type: 'new-api',
    base_url: 'https://api.lingxi.example.com',
    auth_type: 'access_token',
    low_balance_threshold: 3,
    enabled: true,
    remark: '',
    balance: 1.15,
    status: BALANCE_QUERY_STATUS.SUCCESS,
    updated_hours_ago: 4,
  },
  {
    name: 'Claude 订阅池',
    type: 'sub2api',
    base_url: 'https://claude-pool.example.com',
    auth_type: 'password',
    low_balance_threshold: 8,
    enabled: true,
    remark: 'Claude 订阅账号，共 6 个席位',
    balance: 63.4,
    status: BALANCE_QUERY_STATUS.SUCCESS,
    updated_hours_ago: 8,
  },
  {
    name: '旧版中转（已下线）',
    type: 'new-api',
    base_url: 'https://legacy.example.com',
    auth_type: 'access_token',
    low_balance_threshold: 5,
    enabled: false,
    remark: '线路已下线，仅保留记录',
    balance: 12,
    status: BALANCE_QUERY_STATUS.FAILED,
    last_error: 'Connection timeout after 10s',
    updated_hours_ago: 96,
  },
  {
    name: '河图 API',
    type: 'sub2api',
    base_url: 'https://hetu-api.example.com',
    auth_type: 'password',
    low_balance_threshold: 5,
    enabled: true,
    remark: '',
    balance: 0,
    status: BALANCE_QUERY_STATUS.NEVER,
    updated_hours_ago: 0,
  },
  {
    name: '白泽中转（停用）',
    type: 'new-api',
    base_url: 'https://baize.example.com',
    auth_type: 'access_token',
    low_balance_threshold: 5,
    enabled: false,
    remark: '',
    balance: 0,
    status: BALANCE_QUERY_STATUS.NEVER,
    updated_hours_ago: 0,
  },
  {
    name: '无垠 API',
    type: 'sub2api',
    base_url: 'https://wuyin.example.com',
    auth_type: 'password',
    low_balance_threshold: 15,
    enabled: true,
    remark: '',
    balance: 9.6,
    status: BALANCE_QUERY_STATUS.FAILED,
    last_error: 'Upstream returned 403: account quota exhausted',
    updated_hours_ago: 5,
  },
]

let accounts: UpstreamAccount[] | null = null
let nextId = 1
const queryAttempts = new Map<number, number>()
let alertSettings: UpstreamAlertSettings = {
  email_enabled: false,
  notification_email: '',
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000)
}

function mockSecret(prefix: string, rand: () => number): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let secret = ''
  for (let i = 0; i < 32; i++) {
    secret += alphabet[Math.floor(rand() * alphabet.length)]
  }
  return `${prefix}${secret}`
}

function initAccounts(): UpstreamAccount[] {
  const now = nowSeconds()
  const rand = seededRandom(SEED)

  return ACCOUNT_SEEDS.map((seed, index) => {
    const id = index + 1
    const neverQueried = seed.updated_hours_ago === 0
    const createdTime = now - randomIntInRange(rand, 3, 90) * DAY_SECONDS
    const usesAccessToken = seed.auth_type === 'access_token'

    return {
      id,
      name: seed.name,
      type: seed.type,
      base_url: seed.base_url,
      auth_type: seed.auth_type,
      access_token: usesAccessToken ? mockSecret('sk-', rand) : '',
      username: usesAccessToken ? '' : `monitor-${id}`,
      password: usesAccessToken ? '' : mockSecret('', rand).slice(0, 16),
      low_balance_threshold: seed.low_balance_threshold,
      enabled: seed.enabled,
      remark: seed.remark,
      balance: neverQueried ? 0 : seed.balance,
      balance_updated_time: neverQueried
        ? 0
        : now - Math.round(seed.updated_hours_ago * 3600),
      query_status: seed.status,
      last_error: seed.last_error ?? '',
      created_time: createdTime,
      updated_time: createdTime,
    }
  })
}

function getStore(): UpstreamAccount[] {
  if (!accounts) {
    accounts = initAccounts()
    nextId = accounts.length + 1
  }
  return accounts
}

function credentialFields(data: UpstreamAccountFormData) {
  return {
    name: data.name,
    type: data.type,
    base_url: data.base_url,
    auth_type: data.auth_type,
    access_token: data.access_token,
    username: data.username,
    password: data.password,
    low_balance_threshold: data.low_balance_threshold,
    enabled: data.enabled,
    remark: data.remark,
  }
}

export function listMockAccounts(
  params: GetUpstreamAccountsParams = {}
): GetUpstreamAccountsResponse {
  const { p = 1, page_size = 10, keyword = '' } = params
  const store = getStore()
  const needle = keyword.trim().toLowerCase()
  const filtered = needle
    ? store.filter((account) =>
        [account.name, account.base_url, account.remark].some((field) =>
          field.toLowerCase().includes(needle)
        )
      )
    : store
  const start = (p - 1) * page_size

  return {
    success: true,
    data: {
      items: filtered.slice(start, start + page_size),
      total: filtered.length,
      page: p,
      page_size,
    },
  }
}

export function getMockAccount(id: number): ApiResponse<UpstreamAccount> {
  const account = getStore().find((item) => item.id === id)
  if (!account) {
    return { success: false, message: 'Upstream account not found' }
  }
  return { success: true, data: account }
}

export function createMockAccount(
  data: UpstreamAccountFormData
): ApiResponse<UpstreamAccount> {
  const now = nowSeconds()
  const account: UpstreamAccount = {
    id: nextId,
    ...credentialFields(data),
    balance: 0,
    balance_updated_time: 0,
    query_status: BALANCE_QUERY_STATUS.NEVER,
    last_error: '',
    created_time: now,
    updated_time: now,
  }
  nextId += 1
  getStore().unshift(account)
  return { success: true, data: account }
}

export function updateMockAccount(
  id: number,
  data: UpstreamAccountFormData
): ApiResponse<UpstreamAccount> {
  const account = getStore().find((item) => item.id === id)
  if (!account) {
    return { success: false, message: 'Upstream account not found' }
  }
  Object.assign(account, credentialFields(data), { updated_time: nowSeconds() })
  return { success: true, data: account }
}

export function updateMockAccountStatus(
  id: number,
  enabled: boolean
): ApiResponse<UpstreamAccount> {
  const account = getStore().find((item) => item.id === id)
  if (!account) {
    return { success: false, message: 'Upstream account not found' }
  }
  account.enabled = enabled
  account.updated_time = nowSeconds()
  return { success: true, data: account }
}

export function deleteMockAccount(id: number): ApiResponse {
  const store = getStore()
  const index = store.findIndex((item) => item.id === id)
  if (index === -1) {
    return { success: false, message: 'Upstream account not found' }
  }
  store.splice(index, 1)
  return { success: true }
}

async function queryAccount(
  account: UpstreamAccount
): Promise<BalanceQueryResult> {
  // Each attempt derives a fresh seed so re-querying the same row yields new
  // (still deterministic) results instead of always repeating the first one.
  const attempt = (queryAttempts.get(account.id) ?? 0) + 1
  queryAttempts.set(account.id, attempt)
  await delay(250 + Math.round(Math.random() * 450))

  const rand = seededRandom(hashStringToSeed(`${account.name}:${attempt}`))
  const now = nowSeconds()

  if (rand() < 0.12) {
    account.query_status = BALANCE_QUERY_STATUS.FAILED
    account.last_error =
      QUERY_FAILURES[randomIntInRange(rand, 0, QUERY_FAILURES.length - 1)]
    account.updated_time = now
    return {
      id: account.id,
      success: false,
      balance: account.balance,
      balance_updated_time: account.balance_updated_time,
      query_status: account.query_status,
      message: account.last_error,
    }
  }

  // Bias two thirds of the refreshes above the threshold so repeated clicks
  // demo both the recovered and the still-low states.
  const threshold = account.low_balance_threshold
  const balance =
    rand() < 0.33
      ? randomInRange(rand, 0.2, Math.max(0.5, threshold * 0.9))
      : randomInRange(rand, threshold + 1, 150)

  account.balance = Math.round(balance * 100) / 100
  account.balance_updated_time = now
  account.query_status = BALANCE_QUERY_STATUS.SUCCESS
  account.last_error = ''
  account.updated_time = now

  return {
    id: account.id,
    success: true,
    balance: account.balance,
    balance_updated_time: now,
    query_status: account.query_status,
    message: '',
  }
}

export async function queryMockBalance(
  id: number
): Promise<ApiResponse<BalanceQueryResult>> {
  const account = getStore().find((item) => item.id === id)
  if (!account) {
    return { success: false, message: 'Upstream account not found' }
  }
  return { success: true, data: await queryAccount(account) }
}

export async function queryMockBalances(
  ids: number[]
): Promise<UpdateBalancesResponse> {
  const store = getStore()
  const targets = ids
    .map((id) => store.find((item) => item.id === id))
    .filter((item): item is UpstreamAccount => item !== undefined)

  const items = await Promise.all(
    targets.map((account) => queryAccount(account))
  )

  return {
    success: true,
    data: {
      success_count: items.filter((item) => item.success).length,
      failed_count: items.filter((item) => !item.success).length,
      items,
    },
  }
}

export function getMockAlertSettings(): UpstreamAlertSettingsResponse {
  return { success: true, data: { ...alertSettings } }
}

export function updateMockAlertSettings(
  settings: UpstreamAlertSettings
): UpstreamAlertSettingsResponse {
  alertSettings = { ...settings }
  return { success: true, data: { ...alertSettings } }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
