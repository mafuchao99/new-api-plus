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
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { ArrowUpRight, SearchX } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { DataTablePagination, DataTableView } from '@/components/data-table'
import { Badge } from '@/components/ui/badge'
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from '@/components/ui/empty'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCompactNumber, formatLogQuota } from '@/lib/format'

import type { ConsumptionAggregate } from '../types'
import { useConsumptionColumns } from './use-consumption-columns'

type ConsumptionTableProps = {
  rows: ConsumptionAggregate[]
  dimension: 'model' | 'user'
  onModelClick?: (model: string) => void
  loading?: boolean
}

export function ConsumptionTable(props: ConsumptionTableProps) {
  const { t, i18n } = useTranslation()
  const locale = i18n.resolvedLanguage || i18n.language
  const columns = useConsumptionColumns(props.dimension, props.onModelClick)

  const table = useReactTable({
    data: props.rows,
    columns,
    initialState: {
      sorting: [{ id: 'quota', desc: true }],
      pagination: { pageIndex: 0, pageSize: 10 },
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getRowId: (row) => row.id,
    enableHiding: false,
  })
  const sorting = table.getState().sorting[0]
  return (
    <div className='space-y-3'>
      <div className='flex items-center justify-between gap-2 px-4 sm:hidden'>
        <span className='text-muted-foreground text-xs'>{t('Sort by')}</span>
        <NativeSelect
          aria-label={t('Sort by')}
          value={sorting?.id ?? 'quota'}
          onChange={(event) =>
            table.setSorting([
              { id: event.target.value, desc: event.target.value !== 'name' },
            ])
          }
        >
          <NativeSelectOption value='quota'>{t('Spending')}</NativeSelectOption>
          <NativeSelectOption value='requests'>
            {t('Requests')}
          </NativeSelectOption>
          <NativeSelectOption value='tokens'>{t('Tokens')}</NativeSelectOption>
          <NativeSelectOption value='name'>
            {t(props.dimension === 'model' ? 'Model' : 'Username')}
          </NativeSelectOption>
        </NativeSelect>
      </div>
      {!props.loading && props.rows.length === 0 ? (
        <Empty className='py-16'>
          <EmptyHeader>
            <EmptyMedia variant='icon'>
              <SearchX />
            </EmptyMedia>
            <EmptyTitle>{t('No consumption in this period')}</EmptyTitle>
            <EmptyDescription>
              {t('Try another date range, user, or model.')}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <DataTableView
            table={table}
            isLoading={props.loading}
            containerClassName='hidden rounded-none border-0 sm:block'
            tableClassName='min-w-[760px]'
          />
          {props.loading && (
            <div className='space-y-2 px-3 sm:hidden'>
              <Skeleton className='h-32 w-full' />
              <Skeleton className='h-32 w-full' />
            </div>
          )}
          <div
            className={props.loading ? 'hidden' : 'space-y-2 px-3 sm:hidden'}
          >
            {table.getRowModel().rows.map((row) => (
              <div key={row.id} className='rounded-lg border p-3'>
                <div className='flex items-start justify-between gap-2'>
                  <button
                    type='button'
                    className='min-w-0 text-left font-medium'
                    disabled={props.dimension === 'user'}
                    onClick={() => props.onModelClick?.(row.original.name)}
                  >
                    <span className='block break-all'>{row.original.name}</span>
                    {props.dimension === 'model' && (
                      <span className='text-muted-foreground mt-1 flex items-center gap-1 text-xs'>
                        {t('User spending')}
                        <ArrowUpRight className='size-3' aria-hidden='true' />
                      </span>
                    )}
                  </button>
                  <span className='shrink-0 font-semibold tabular-nums'>
                    {formatLogQuota(row.original.quota)}
                  </span>
                </div>
                <div className='text-muted-foreground my-3 flex items-center gap-3 text-xs'>
                  <Progress
                    value={Math.max(0, Math.min(100, row.original.share))}
                    className='flex-1'
                    aria-label={t('Spending share')}
                  />
                  <span>{row.original.share.toFixed(1)}%</span>
                  {row.original.quota === 0 && (
                    <Badge variant='secondary'>{t('Zero cost')}</Badge>
                  )}
                </div>
                <div className='grid grid-cols-3 gap-2 text-xs'>
                  <div className='text-muted-foreground'>
                    {t('Requests')}
                    <div className='text-foreground mt-1 tabular-nums'>
                      {formatCompactNumber(row.original.requests, locale)}
                    </div>
                  </div>
                  <div className='text-muted-foreground'>
                    {t('Tokens')}
                    <div className='text-foreground mt-1 tabular-nums'>
                      {formatCompactNumber(row.original.tokens, locale)}
                    </div>
                  </div>
                  <div className='text-muted-foreground'>
                    {t('Avg. cost / request')}
                    <div className='text-foreground mt-1 tabular-nums'>
                      {formatLogQuota(row.original.averageQuota)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      <div className='border-t px-3 py-3 sm:px-4'>
        <DataTablePagination table={table} />
      </div>
    </div>
  )
}
