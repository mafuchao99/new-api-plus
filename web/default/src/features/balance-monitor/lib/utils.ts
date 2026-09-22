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
import type { UpstreamAccount } from '../types'

/** A balance below the configured threshold (never-queried accounts excluded). */
export function isLowBalance(
  account: Pick<
    UpstreamAccount,
    'balance' | 'balance_updated_time' | 'low_balance_threshold'
  >
): boolean {
  if (account.balance_updated_time === 0) {
    return false
  }
  return account.balance < account.low_balance_threshold
}

/** True when the account balance has never been fetched. */
export function isNeverQueried(
  account: Pick<UpstreamAccount, 'balance_updated_time'>
): boolean {
  return account.balance_updated_time === 0
}
