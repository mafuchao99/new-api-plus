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
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import useDialogState from '@/hooks/use-dialog'

import {
  getUpstreamAccounts,
  updateUpstreamAccountBalance,
  updateUpstreamAccountsBalance,
} from '../api'
import { ERROR_MESSAGES, SUCCESS_MESSAGES } from '../constants'
import type { UpstreamAccount, UpstreamAccountsDialogType } from '../types'

type UpstreamAccountsContextType = {
  open: UpstreamAccountsDialogType | null
  setOpen: (value: UpstreamAccountsDialogType | null) => void
  currentRow: UpstreamAccount | null
  setCurrentRow: React.Dispatch<React.SetStateAction<UpstreamAccount | null>>
  refreshTrigger: number
  triggerRefresh: () => void
  queryingIds: number[]
  isQueryingAll: boolean
  queryAccount: (id: number) => Promise<void>
  queryAccounts: (ids: number[]) => Promise<void>
  queryAllAccounts: () => Promise<void>
}

const UpstreamAccountsContext =
  React.createContext<UpstreamAccountsContextType | null>(null)

export function UpstreamAccountsProvider(props: { children: React.ReactNode }) {
  const { t } = useTranslation()
  const [open, setOpen] = useDialogState<UpstreamAccountsDialogType>(null)
  const [currentRow, setCurrentRow] = useState<UpstreamAccount | null>(null)
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const [queryingIds, setQueryingIds] = useState<number[]>([])
  const [isQueryingAll, setIsQueryingAll] = useState(false)

  const triggerRefresh = () => setRefreshTrigger((prev) => prev + 1)

  const addQueryingIds = (ids: number[]) =>
    setQueryingIds((prev) => [
      ...prev,
      ...ids.filter((id) => !prev.includes(id)),
    ])

  const removeQueryingIds = (ids: number[]) =>
    setQueryingIds((prev) => prev.filter((id) => !ids.includes(id)))

  const queryAccount = async (id: number) => {
    addQueryingIds([id])
    try {
      const result = await updateUpstreamAccountBalance(id)
      if (result.success && result.data?.success) {
        toast.success(t(SUCCESS_MESSAGES.BALANCE_UPDATED))
      } else {
        toast.error(
          result.data?.message ||
            result.message ||
            t(ERROR_MESSAGES.BALANCE_QUERY_FAILED)
        )
      }
    } finally {
      removeQueryingIds([id])
      triggerRefresh()
    }
  }

  const queryAccounts = async (ids: number[]) => {
    if (ids.length === 0) {
      return
    }
    addQueryingIds(ids)
    try {
      const result = await updateUpstreamAccountsBalance(ids)
      const successCount = result.data?.success_count ?? 0
      const failedCount = result.data?.failed_count ?? 0
      if (failedCount > 0) {
        toast.warning(
          t(
            'Balance check finished: {{success}} succeeded, {{failed}} failed',
            {
              success: successCount,
              failed: failedCount,
            }
          )
        )
      } else {
        toast.success(
          t('Balance updated for {{count}} accounts', { count: successCount })
        )
      }
    } finally {
      removeQueryingIds(ids)
      triggerRefresh()
    }
  }

  const queryAllAccounts = async () => {
    setIsQueryingAll(true)
    try {
      const result = await getUpstreamAccounts({ p: 1, page_size: 1000 })
      const ids = (result.data?.items ?? [])
        .filter((account) => account.enabled)
        .map((account) => account.id)
      if (ids.length === 0) {
        toast.info(t('No enabled accounts to check'))
        return
      }
      await queryAccounts(ids)
    } finally {
      setIsQueryingAll(false)
    }
  }

  return (
    <UpstreamAccountsContext
      value={{
        open,
        setOpen,
        currentRow,
        setCurrentRow,
        refreshTrigger,
        triggerRefresh,
        queryingIds,
        isQueryingAll,
        queryAccount,
        queryAccounts,
        queryAllAccounts,
      }}
    >
      {props.children}
    </UpstreamAccountsContext>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useUpstreamAccounts = () => {
  const context = React.useContext(UpstreamAccountsContext)

  if (!context) {
    throw new Error(
      'useUpstreamAccounts has to be used within <UpstreamAccountsProvider>'
    )
  }

  return context
}
