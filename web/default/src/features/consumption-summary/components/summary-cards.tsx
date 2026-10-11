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
import { Boxes, Coins, Hash, Zap } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Skeleton } from '@/components/ui/skeleton'
import {
  formatCompactNumber,
  formatLogQuota,
  formatNumber,
  formatQuota,
} from '@/lib/format'

import type { ConsumptionTotals } from '../types'

export function SummaryCards(props: {
  totals: ConsumptionTotals
  loading: boolean
}) {
  const { t, i18n } = useTranslation()
  const locale = i18n.resolvedLanguage || i18n.language
  const items = [
    {
      title: t('Total spending'),
      value: formatQuota(props.totals.quota),
      full: formatLogQuota(props.totals.quota),
      description: t('Consumption in the selected period'),
      icon: Coins,
      accent: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    },
    {
      title: t('Total requests'),
      value: formatCompactNumber(props.totals.requests, locale),
      full: formatNumber(props.totals.requests, locale),
      description: t('Including zero-cost calls'),
      icon: Zap,
      accent: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    },
    {
      title: t('Total tokens'),
      value: formatCompactNumber(props.totals.tokens, locale),
      full: formatNumber(props.totals.tokens, locale),
      description: t('Input and output tokens combined'),
      icon: Hash,
      accent: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
    },
    {
      title: t('Models used'),
      value: String(props.totals.models),
      full: String(props.totals.models),
      description: t('Models with calls in this period'),
      icon: Boxes,
      accent: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
    },
  ]
  return (
    <div className='grid grid-cols-2 gap-3 lg:grid-cols-4'>
      {items.map((item) => (
        <div key={item.title} className='bg-card rounded-xl border p-4 sm:p-5'>
          <div className='flex items-center justify-between gap-2'>
            <span className='text-muted-foreground text-xs font-medium sm:text-sm'>
              {item.title}
            </span>
            <div
              className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${item.accent}`}
            >
              <item.icon className='size-4' aria-hidden='true' />
            </div>
          </div>
          {props.loading ? (
            <Skeleton className='my-2 h-8 w-24' />
          ) : (
            <div
              className='mt-2 truncate text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl'
              title={item.full}
            >
              {item.value}
            </div>
          )}
          <p className='text-muted-foreground mt-2 text-xs leading-relaxed'>
            {item.description}
          </p>
        </div>
      ))}
    </div>
  )
}
