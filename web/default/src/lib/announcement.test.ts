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
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { getAnnouncementSummary } from './announcement'

describe('getAnnouncementSummary', () => {
  test('uses the first Markdown paragraph as the announcement title', () => {
    const summary = getAnnouncementSummary(
      '📢 **JuAIHub AI 模型中转站开放使用**\n\nJuAIHub 已接入多家主流 AI 厂商，目前提供 **40+ 模型、14 条线路**。'
    )

    assert.deepEqual(summary, {
      title: '📢 JuAIHub AI 模型中转站开放使用',
      description:
        'JuAIHub 已接入多家主流 AI 厂商，目前提供 40+ 模型、14 条线路。',
    })
  })

  test('uses following lines as the description when there is no blank line', () => {
    const summary = getAnnouncementSummary(
      '**Maintenance notice**\nThe service will restart at 22:00.\nNo action is required.'
    )

    assert.deepEqual(summary, {
      title: 'Maintenance notice',
      description: 'The service will restart at 22:00. No action is required.',
    })
  })

  test('keeps an explicit title and cleans Markdown from the description', () => {
    const summary = getAnnouncementSummary(
      'Read the [upgrade guide](https://example.com) before continuing.',
      '**Version 2 is available**'
    )

    assert.deepEqual(summary, {
      title: 'Version 2 is available',
      description: 'Read the upgrade guide before continuing.',
    })
  })
})
