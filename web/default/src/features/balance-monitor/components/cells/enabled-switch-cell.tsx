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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Switch } from '@/components/ui/switch'

import { updateUpstreamAccountStatus } from '../../api'
import { SUCCESS_MESSAGES } from '../../constants'
import type { UpstreamAccount } from '../../types'
import { useUpstreamAccounts } from '../upstream-accounts-provider'

export function EnabledSwitchCell(props: { account: UpstreamAccount }) {
  const { t } = useTranslation()
  const { triggerRefresh } = useUpstreamAccounts()
  const [isUpdating, setIsUpdating] = useState(false)

  const handleCheckedChange = async (checked: boolean) => {
    setIsUpdating(true)
    try {
      const result = await updateUpstreamAccountStatus(
        props.account.id,
        checked
      )
      if (result.success) {
        toast.success(
          t(
            checked
              ? SUCCESS_MESSAGES.ACCOUNT_ENABLED
              : SUCCESS_MESSAGES.ACCOUNT_DISABLED
          )
        )
        triggerRefresh()
      }
    } finally {
      setIsUpdating(false)
    }
  }

  return (
    <Switch
      checked={props.account.enabled}
      onCheckedChange={handleCheckedChange}
      disabled={isUpdating}
    />
  )
}
