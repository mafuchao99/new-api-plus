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
import { useQuery } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import type { Row } from '@tanstack/react-table'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import {
  DISABLED_ROW_DESKTOP,
  DISABLED_ROW_MOBILE,
  DataTablePage,
  useDataTable,
} from '@/components/data-table'
import { useMediaQuery } from '@/hooks'
import { useTableUrlState } from '@/hooks/use-table-url-state'

import { getUpstreamAccounts, searchUpstreamAccounts } from '../api'
import {
  getBalanceQueryStatusOptions,
  getLowBalanceFilterOptions,
} from '../constants'
import type { UpstreamAccount } from '../types'
import { UpstreamAccountsBulkActions } from './upstream-accounts-bulk-actions'
import { useUpstreamAccountsColumns } from './upstream-accounts-columns'
import { UpstreamAccountsPrimaryButtons } from './upstream-accounts-primary-buttons'
import { useUpstreamAccounts } from './upstream-accounts-provider'

const route = getRouteApi('/_authenticated/balance-monitor/')

function getRowClassName(
  row: Row<UpstreamAccount>,
  ctx: { isMobile: boolean }
): string | undefined {
  if (row.original.enabled) {
    return undefined
  }
  return ctx.isMobile ? DISABLED_ROW_MOBILE : DISABLED_ROW_DESKTOP
}

export function UpstreamAccountsTable() {
  const { t } = useTranslation()
  const columns = useUpstreamAccountsColumns()
  const { refreshTrigger } = useUpstreamAccounts()
  const isMobile = useMediaQuery('(max-width: 640px)')

  const {
    globalFilter,
    onGlobalFilterChange,
    columnFilters,
    onColumnFiltersChange,
    pagination,
    onPaginationChange,
    ensurePageInRange,
  } = useTableUrlState({
    search: route.useSearch(),
    navigate: route.useNavigate(),
    pagination: { defaultPage: 1, defaultPageSize: isMobile ? 10 : 20 },
    globalFilter: { enabled: true, key: 'filter' },
    columnFilters: [
      { columnId: 'query_status', searchKey: 'status', type: 'array' },
      { columnId: 'is_low_balance', searchKey: 'alert', type: 'array' },
    ],
  })

  const { data, isLoading, isFetching } = useQuery({
    queryKey: [
      'upstream-accounts',
      pagination.pageIndex + 1,
      pagination.pageSize,
      globalFilter,
      refreshTrigger,
    ],
    queryFn: async () => {
      const hasFilter = globalFilter?.trim()
      const params = {
        p: pagination.pageIndex + 1,
        page_size: pagination.pageSize,
      }

      const result = hasFilter
        ? await searchUpstreamAccounts({ ...params, keyword: globalFilter })
        : await getUpstreamAccounts(params)

      return {
        items: result.data?.items || [],
        total: result.data?.total || 0,
      }
    },
    placeholderData: (previousData) => previousData,
  })

  const accounts = data?.items || []

  const { table } = useDataTable({
    data: accounts,
    columns,
    enableRowSelection: true,
    columnFilters,
    globalFilter,
    pagination,
    globalFilterFn: (row, _columnId, filterValue) => {
      const needle = String(filterValue).toLowerCase()
      const account = row.original

      return [account.name, account.base_url, account.remark].some((field) =>
        field.toLowerCase().includes(needle)
      )
    },
    onPaginationChange,
    onGlobalFilterChange,
    onColumnFiltersChange,
    manualPagination: !globalFilter,
    totalCount: data?.total || 0,
    ensurePageInRange,
  })

  const statusOptions = useMemo(() => getBalanceQueryStatusOptions(t), [t])
  const alertOptions = useMemo(() => getLowBalanceFilterOptions(t), [t])

  return (
    <DataTablePage
      table={table}
      columns={columns}
      isLoading={isLoading}
      isFetching={isFetching}
      emptyTitle={t('No Upstream Accounts Found')}
      emptyDescription={t(
        'Add your first upstream account to monitor balances and receive low-balance email alerts.'
      )}
      emptyAction={<UpstreamAccountsPrimaryButtons />}
      skeletonKeyPrefix='upstream-accounts-skeleton'
      applyHeaderSize
      toolbarProps={{
        searchPlaceholder: t('Filter by name, URL or remark...'),
        filters: [
          {
            columnId: 'query_status',
            title: t('Query Status'),
            options: statusOptions,
            singleSelect: true,
          },
          {
            columnId: 'is_low_balance',
            title: t('Balance Alert'),
            options: alertOptions,
            singleSelect: true,
          },
        ],
      }}
      getRowClassName={getRowClassName}
      bulkActions={<UpstreamAccountsBulkActions table={table} />}
    />
  )
}
