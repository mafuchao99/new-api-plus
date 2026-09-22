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
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { TruncatedCell } from '@/components/data-table'
import { StatusBadge } from '@/components/status-badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { formatLocalCurrencyAmount } from '@/lib/currency'
import { formatTimestampToDate } from '@/lib/format'

import {
  BALANCE_QUERY_STATUSES,
  LOW_BALANCE_FILTER,
  UPSTREAM_ACCOUNT_TYPE_META,
  UPSTREAM_AUTH_TYPE_LABEL_KEYS,
} from '../constants'
import { isLowBalance } from '../lib/utils'
import type { UpstreamAccount } from '../types'
import { BalanceStatusCell } from './cells/balance-status-cell'
import { EnabledSwitchCell } from './cells/enabled-switch-cell'
import { useUpstreamAccounts } from './upstream-accounts-provider'
import { UpstreamAccountsRowActions } from './upstream-accounts-row-actions'

export function useUpstreamAccountsColumns(): ColumnDef<UpstreamAccount>[] {
  const { t } = useTranslation()
  const { queryingIds } = useUpstreamAccounts()

  return [
    {
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected()}
          indeterminate={table.getIsSomePageRowsSelected()}
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label={t('Select all')}
          className='translate-y-[2px]'
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label={t('Select row')}
          className='translate-y-[2px]'
        />
      ),
      enableSorting: false,
      enableHiding: false,
      size: 40,
    },
    {
      accessorKey: 'name',
      header: t('Account name'),
      meta: { mobileTitle: true },
      cell: ({ row }) => (
        <span className='font-medium'>{row.original.name}</span>
      ),
      size: 200,
    },
    {
      accessorKey: 'type',
      header: t('Account Type'),
      meta: { mobileBadge: true },
      cell: ({ row }) => {
        const meta = UPSTREAM_ACCOUNT_TYPE_META[row.original.type]
        return (
          <StatusBadge
            label={t(meta.labelKey)}
            variant={meta.variant}
            copyable={false}
            className='-ml-1.5'
          />
        )
      },
      filterFn: (row, id, value: string[]) =>
        value.includes(row.getValue(id) as string),
      size: 120,
    },
    {
      accessorKey: 'base_url',
      header: t('Base URL'),
      meta: { mobileHidden: true },
      cell: ({ row }) => (
        <div className='flex max-w-[260px] items-center gap-1'>
          <TruncatedCell className='flex-1 font-mono text-sm'>
            {row.original.base_url}
          </TruncatedCell>
          <CopyButton
            value={row.original.base_url}
            className='size-6'
            aria-label={t('Copy to clipboard')}
          />
        </div>
      ),
      size: 280,
    },
    {
      accessorKey: 'auth_type',
      header: t('Authentication method'),
      meta: { mobileHidden: true },
      cell: ({ row }) => (
        <span className='text-muted-foreground text-sm'>
          {t(UPSTREAM_AUTH_TYPE_LABEL_KEYS[row.original.auth_type])}
        </span>
      ),
      size: 150,
    },
    {
      accessorKey: 'balance',
      header: t('Balance'),
      meta: { mobileBadge: true },
      cell: ({ row }) => (
        <BalanceStatusCell
          account={row.original}
          isQuerying={queryingIds.includes(row.original.id)}
        />
      ),
      size: 120,
    },
    {
      accessorKey: 'low_balance_threshold',
      header: t('Low Balance Threshold'),
      meta: { mobileHidden: true },
      cell: ({ row }) => (
        <span className='text-muted-foreground font-mono text-sm'>
          {formatLocalCurrencyAmount(row.original.low_balance_threshold, {
            abbreviate: false,
          })}
        </span>
      ),
      size: 150,
    },
    {
      accessorKey: 'query_status',
      header: t('Query Status'),
      meta: { mobileBadge: true },
      cell: ({ row }) => {
        const config = BALANCE_QUERY_STATUSES[row.original.query_status]
        if (!config) {
          return null
        }
        const badge = (
          <StatusBadge
            label={t(config.labelKey)}
            variant={config.variant}
            copyable={false}
            className='-ml-1.5'
          />
        )
        if (!row.original.last_error) {
          return badge
        }
        return (
          <Tooltip>
            <TooltipTrigger render={badge} />
            <TooltipContent className='max-w-xs break-all'>
              {row.original.last_error}
            </TooltipContent>
          </Tooltip>
        )
      },
      filterFn: (row, id, value: string[]) =>
        value.includes(String(row.getValue(id))),
      size: 130,
    },
    {
      id: 'is_low_balance',
      accessorFn: (row) =>
        isLowBalance(row) ? LOW_BALANCE_FILTER.LOW : LOW_BALANCE_FILTER.NORMAL,
      header: t('Balance Alert'),
      meta: { mobileBadge: true },
      cell: ({ row }) => {
        if (!isLowBalance(row.original)) {
          return <span className='text-muted-foreground text-sm'>-</span>
        }
        return (
          <StatusBadge
            label={t('Low Balance')}
            variant='danger'
            copyable={false}
            className='-ml-1.5'
          />
        )
      },
      filterFn: (row, id, value: string[]) =>
        value.includes(row.getValue(id) as string),
      size: 130,
    },
    {
      accessorKey: 'balance_updated_time',
      header: t('Last Queried'),
      meta: { mobileHidden: true },
      cell: ({ row }) => {
        if (row.original.balance_updated_time === 0) {
          return (
            <StatusBadge
              label={t('Never')}
              variant='neutral'
              copyable={false}
              className='-ml-1.5'
            />
          )
        }
        return (
          <div className='min-w-[160px] font-mono text-sm'>
            {formatTimestampToDate(row.original.balance_updated_time)}
          </div>
        )
      },
      size: 180,
    },
    {
      accessorKey: 'enabled',
      header: t('Enabled'),
      cell: ({ row }) => <EnabledSwitchCell account={row.original} />,
      size: 100,
    },
    {
      accessorKey: 'remark',
      header: t('Remark'),
      meta: { mobileHidden: true },
      cell: ({ row }) => {
        if (!row.original.remark) {
          return <span className='text-muted-foreground text-sm'>-</span>
        }
        return (
          <TruncatedCell className='max-w-[200px] text-sm'>
            {row.original.remark}
          </TruncatedCell>
        )
      },
      size: 200,
    },
    {
      id: 'actions',
      header: () => t('Actions'),
      cell: ({ row }) => <UpstreamAccountsRowActions row={row} />,
      meta: { pinned: 'right' as const },
    },
  ]
}
