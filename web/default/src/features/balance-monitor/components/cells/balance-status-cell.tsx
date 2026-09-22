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
import { Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { StatusBadge } from '@/components/status-badge'
import { formatLocalCurrencyAmount } from '@/lib/currency'
import { cn } from '@/lib/utils'

import { isLowBalance, isNeverQueried } from '../../lib/utils'
import type { UpstreamAccount } from '../../types'

export function BalanceStatusCell(props: {
  account: UpstreamAccount
  isQuerying: boolean
}) {
  const { t } = useTranslation()

  if (props.isQuerying) {
    return (
      <div className='text-muted-foreground flex items-center gap-1.5 text-sm'>
        <Loader2 className='size-3.5 animate-spin' />
        {t('Querying...')}
      </div>
    )
  }

  if (isNeverQueried(props.account)) {
    return <span className='text-muted-foreground text-sm'>-</span>
  }

  const low = isLowBalance(props.account)
  // 已提醒但余额尚未回升：提醒只在再次回升后才会重发
  const alertSent = low && props.account.last_alert_time > 0

  return (
    <div className='flex items-center gap-1.5'>
      <span
        className={cn(
          'font-mono text-sm font-medium',
          low && 'text-destructive'
        )}
      >
        {formatLocalCurrencyAmount(props.account.balance, {
          abbreviate: false,
        })}
      </span>
      {alertSent && (
        <StatusBadge
          label={t('Alert sent')}
          variant='warning'
          copyable={false}
        />
      )}
    </div>
  )
}
