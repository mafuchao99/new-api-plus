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
import type { ConsumptionRecord } from '../types'
import { dateInputValue } from './date'

export const MOCK_USERS = [
  { id: '101', username: 'alex.chen' },
  { id: '102', username: 'sarah.lin' },
  { id: '103', username: 'dev-team' },
  { id: '104', username: 'studio.design' },
  { id: '105', username: 'research.lab' },
  { id: '106', username: 'li.ming' },
]

export const MOCK_MODELS = [
  { name: 'claude-sonnet-4-5', provider: 'Anthropic', price: 3400 },
  { name: 'gpt-5', provider: 'OpenAI', price: 2800 },
  { name: 'gemini-2.5-pro', provider: 'Google', price: 1900 },
  { name: 'deepseek-v3.1', provider: 'DeepSeek', price: 190 },
  { name: 'claude-opus-4-1', provider: 'Anthropic', price: 7900 },
  { name: 'gpt-4.1', provider: 'OpenAI', price: 1500 },
  { name: 'gemini-2.5-flash', provider: 'Google', price: 260 },
  { name: 'deepseek-r1', provider: 'DeepSeek', price: 720 },
  { name: 'gpt-4.1-mini', provider: 'OpenAI', price: 190 },
  { name: 'Qwen/Qwen3-235B-A22B-Instruct-2507', provider: 'Qwen', price: 280 },
  { name: 'grok-4', provider: 'xAI', price: 2200 },
  { name: 'kimi-k2', provider: 'Moonshot', price: 340 },
  { name: 'text-embedding-3-large', provider: 'OpenAI', price: 35 },
  { name: 'dall-e-3', provider: 'OpenAI', price: 20000 },
  { name: 'flux.1-pro', provider: 'Black Forest Labs', price: 15000 },
  { name: 'gpt-4.1-mini-free', provider: 'OpenAI', price: 0 },
]

// Fixed arithmetic keeps refreshes stable; only the 90-day date window moves.
// Quota values use the project's standard units, not upstream model prices.
export function createMockRecords(today: Date): ConsumptionRecord[] {
  const records: ConsumptionRecord[] = []
  for (let day = 0; day < 90; day++) {
    const date = new Date(today)
    date.setDate(date.getDate() - day)
    for (const [modelIndex, model] of MOCK_MODELS.entries()) {
      for (const [userIndex, user] of MOCK_USERS.entries()) {
        if ((day + modelIndex + userIndex) % 7 === 0) continue
        const seed = (day * 31 + modelIndex * 17 + userIndex * 13) % 97
        const isTask = model.name === 'dall-e-3' || model.name === 'flux.1-pro'
        const requests = isTask ? 1 + (seed % 8) : 15 + seed * (6 - userIndex)
        const freeCall = seed % 23 === 0
        records.push({
          date: dateInputValue(date),
          userId: user.id,
          username: user.username,
          model: model.name,
          quota: freeCall ? 0 : requests * model.price,
          requests,
          tokens: isTask ? 0 : requests * (850 + seed * 37),
        })
      }
    }
  }
  return records
}
