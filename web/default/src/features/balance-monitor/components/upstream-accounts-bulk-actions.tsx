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
import type { Table } from '@tanstack/react-table'
import { Loader2, RefreshCw, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { DataTableBulkActions as BulkActionsToolbar } from '@/components/data-table'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

import { deleteUpstreamAccount } from '../api'
import type { UpstreamAccount } from '../types'
import { useUpstreamAccounts } from './upstream-accounts-provider'

export function UpstreamAccountsBulkActions(props: {
  table: Table<UpstreamAccount>
}) {
  const { t } = useTranslation()
  const { triggerRefresh, queryAccounts, queryingIds } = useUpstreamAccounts()
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const selectedIds = props.table
    .getFilteredSelectedRowModel()
    .rows.map((row) => row.original.id)
  const isQueryingSelection = selectedIds.some((id) => queryingIds.includes(id))

  const handleDeleteSelected = async () => {
    setIsDeleting(true)
    try {
      await Promise.all(selectedIds.map((id) => deleteUpstreamAccount(id)))
      toast.success(
        t('Successfully deleted {{count}} upstream accounts', {
          count: selectedIds.length,
        })
      )
      props.table.resetRowSelection()
      triggerRefresh()
      setShowDeleteConfirm(false)
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <>
      <BulkActionsToolbar
        table={props.table}
        entityName={t('upstream account')}
      >
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant='outline'
                size='icon'
                className='size-8'
                onClick={() => void queryAccounts(selectedIds)}
                disabled={isQueryingSelection}
                aria-label={t('Check Balance Now')}
              />
            }
          >
            {isQueryingSelection ? (
              <Loader2 className='animate-spin' />
            ) : (
              <RefreshCw />
            )}
          </TooltipTrigger>
          <TooltipContent>
            <p>{t('Check Balance Now')}</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant='destructive'
                size='icon'
                className='size-8'
                onClick={() => setShowDeleteConfirm(true)}
                aria-label={t('Delete selected accounts')}
              />
            }
          >
            <Trash2 />
          </TooltipTrigger>
          <TooltipContent>
            <p>{t('Delete selected accounts')}</p>
          </TooltipContent>
        </Tooltip>
      </BulkActionsToolbar>

      <ConfirmDialog
        destructive
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        handleConfirm={handleDeleteSelected}
        isLoading={isDeleting}
        className='max-w-md'
        title={t('Delete Selected Accounts?')}
        desc={
          <>
            {t('This will delete {{count}} selected upstream account(s).', {
              count: selectedIds.length,
            })}
            <br />
            {t('This action cannot be undone.')}
          </>
        }
        confirmText={t('Delete')}
      />
    </>
  )
}
