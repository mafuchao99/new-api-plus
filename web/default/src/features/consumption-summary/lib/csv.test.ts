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

import { serializeConsumptionCsv } from './csv'

describe('consumption CSV', () => {
  test('neutralizes spreadsheet formulas in model and user text', () => {
    const inputs = [
      '=1+1',
      '+SUM(1,2)',
      '-1+1',
      '@SUM(1,2)',
      ' =1+1',
      '\t=1+1',
      '\r=1+1',
      '\n=1+1',
      '\uFEFF=1+1',
      '＝1+1',
      '＋1+1',
      '－1+1',
      '＠SUM(1,2)',
    ]
    for (const input of inputs) {
      assert.equal(
        serializeConsumptionCsv([[input]]),
        `"'\t${input.replaceAll('"', '""')}"`
      )
    }
  })

  test('preserves quotas, negative refund amounts, quoting and row boundaries', () => {
    assert.equal(
      serializeConsumptionCsv([
        ['gpt-5', 'alice', 'a,"b"\nc', -2000, 0, 150.25],
        ["'already text", 'harmless = sign', '第二行', 42],
      ]),
      '"gpt-5","alice","a,""b""\nc","-2000","0","150.25"\r\n"\'already text","harmless = sign","第二行","42"'
    )
  })
})
