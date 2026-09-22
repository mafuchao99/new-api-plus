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
import type { Row } from '@tanstack/react-table'
import { Edit, Loader2, Mail, RefreshCw, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { DataTableRowActionMenu } from '@/components/data-table/core/row-action-menu'
import { Button } from '@/components/ui/button'
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

import { sendUpstreamTestEmail } from '../api'
import type { UpstreamAccount } from '../types'
import { useUpstreamAccounts } from './upstream-accounts-provider'

export function UpstreamAccountsRowActions(props: {
  row: Row<UpstreamAccount>
}) {
  const { t } = useTranslation()
  const account = props.row.original
  const { setOpen, setCurrentRow, queryingIds, queryAccount } =
    useUpstreamAccounts()
  const [isSendingTestEmail, setIsSendingTestEmail] = useState(false)
  const isQuerying = queryingIds.includes(account.id)
  const openUpdate = () => {
    setCurrentRow(account)
    setOpen('update')
  }

  const handleSendTestEmail = async () => {
    setIsSendingTestEmail(true)
    try {
      const result = await sendUpstreamTestEmail(account.id)
      if (result.success) {
        toast.success(t('Test email sent successfully'))
      }
    } finally {
      setIsSendingTestEmail(false)
    }
  }

  return (
    <div className='-ml-1.5 flex items-center gap-1'>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant='ghost'
              size='icon-sm'
              onClick={() => void queryAccount(account.id)}
              disabled={isQuerying}
              aria-label={t('Check Balance Now')}
            />
          }
        >
          {isQuerying ? <Loader2 className='animate-spin' /> : <RefreshCw />}
        </TooltipTrigger>
        <TooltipContent>{t('Check Balance Now')}</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant='ghost'
              size='icon-sm'
              onClick={() => void handleSendTestEmail()}
              disabled={isSendingTestEmail}
              aria-label={t('Send Test Email')}
            />
          }
        >
          {isSendingTestEmail ? <Loader2 className='animate-spin' /> : <Mail />}
        </TooltipTrigger>
        <TooltipContent>{t('Send Test Email')}</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant='ghost'
              size='icon-sm'
              onClick={openUpdate}
              aria-label={t('Edit')}
            />
          }
        >
          <Edit />
        </TooltipTrigger>
        <TooltipContent>{t('Edit')}</TooltipContent>
      </Tooltip>

      <DataTableRowActionMenu ariaLabel={t('Open menu')} modal={false}>
        <DropdownMenuItem onClick={openUpdate}>
          {t('Edit')}
          <DropdownMenuShortcut>
            <Edit size={16} />
          </DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            setCurrentRow(account)
            setOpen('delete')
          }}
          className='text-destructive focus:text-destructive'
        >
          {t('Delete')}
          <DropdownMenuShortcut>
            <Trash2 size={16} />
          </DropdownMenuShortcut>
        </DropdownMenuItem>
      </DataTableRowActionMenu>
    </div>
  )
}
