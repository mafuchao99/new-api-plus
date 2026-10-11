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
import type { ColumnDef } from '@tanstack/react-table'
import { Box, UserRound } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { DataTableColumnHeader } from '@/components/data-table'
import { Progress } from '@/components/ui/progress'
import { formatCompactNumber, formatLogQuota, formatNumber } from '@/lib/format'

import type { ConsumptionAggregate } from '../types'

export function useConsumptionColumns(
  dimension: 'model' | 'user',
  onModelClick?: (model: string) => void
): ColumnDef<ConsumptionAggregate>[] {
  const { t, i18n } = useTranslation()
  const locale = i18n.resolvedLanguage || i18n.language
  const columns = useMemo<ColumnDef<ConsumptionAggregate>[]>(
    () => [
      {
        accessorKey: 'name',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t(dimension === 'model' ? 'Model' : 'Username')}
          />
        ),
        cell: ({ row }) => {
          const item = row.original
          if (dimension === 'user') {
            return (
              <div className='flex items-center gap-3'>
                <div className='bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-full'>
                  <UserRound className='size-4' aria-hidden='true' />
                </div>
                <div className='min-w-0'>
                  <span className='block truncate font-medium'>
                    {item.name || `#${item.id}`}
                  </span>
                  <span className='text-muted-foreground text-xs'>
                    #{item.id}
                  </span>
                </div>
              </div>
            )
          }
          return (
            <button
              type='button'
              className='group/model focus-visible:ring-ring flex max-w-full items-center gap-3 rounded-md text-left outline-none focus-visible:ring-2'
              onClick={() => onModelClick?.(item.name)}
              aria-label={t('View user spending for {{model}}', {
                model: item.name,
              })}
            >
              <div className='bg-primary/5 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg border'>
                <Box className='size-4' aria-hidden='true' />
              </div>
              <div className='min-w-0'>
                <div
                  className='group-hover/model:text-primary max-w-64 truncate font-medium'
                  title={item.name}
                >
                  {item.name || t('Unknown model')}
                </div>
              </div>
            </button>
          )
        },
      },
      {
        accessorKey: 'quota',
        header: ({ column }) => (
          <DataTableColumnHeader
            className='justify-end'
            column={column}
            title={t('Spending')}
          />
        ),
        cell: ({ row }) => (
          <div className='text-right font-semibold tabular-nums'>
            {formatLogQuota(row.original.quota)}
          </div>
        ),
      },
      {
        accessorKey: 'share',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Spending share')} />
        ),
        cell: ({ row }) => (
          <div className='flex min-w-28 items-center gap-3'>
            <Progress
              value={Math.max(0, Math.min(100, row.original.share))}
              aria-label={t('Spending share')}
              className='w-16'
            />
            <span className='text-muted-foreground w-12 text-right tabular-nums'>
              {row.original.share.toFixed(1)}%
            </span>
          </div>
        ),
      },
      {
        accessorKey: 'requests',
        header: ({ column }) => (
          <DataTableColumnHeader
            className='justify-end'
            column={column}
            title={t('Requests')}
          />
        ),
        cell: ({ row }) => (
          <div className='text-right tabular-nums'>
            {formatNumber(row.original.requests, locale)}
          </div>
        ),
      },
      {
        accessorKey: 'tokens',
        header: ({ column }) => (
          <DataTableColumnHeader
            className='justify-end'
            column={column}
            title={t('Tokens')}
          />
        ),
        cell: ({ row }) => (
          <div
            className='text-right tabular-nums'
            title={formatNumber(row.original.tokens, locale)}
          >
            {formatCompactNumber(row.original.tokens, locale)}
          </div>
        ),
      },
      {
        accessorKey: 'averageQuota',
        header: ({ column }) => (
          <DataTableColumnHeader
            className='justify-end'
            column={column}
            title={t('Avg. cost / request')}
          />
        ),
        cell: ({ row }) => (
          <div className='text-muted-foreground text-right tabular-nums'>
            {formatLogQuota(row.original.averageQuota)}
          </div>
        ),
      },
    ],
    [t, locale, dimension, onModelClick]
  )

  return columns
}
