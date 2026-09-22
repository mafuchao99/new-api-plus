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
import { BellRing, Clock, Loader2, Plus, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

import { useUpstreamAccounts } from './upstream-accounts-provider'

export function UpstreamAccountsPrimaryButtons() {
  const { t } = useTranslation()
  const { setOpen, queryAllAccounts, isQueryingAll } = useUpstreamAccounts()

  return (
    <div className='flex flex-wrap gap-2'>
      <Button
        size='sm'
        variant='outline'
        onClick={() => void queryAllAccounts()}
        disabled={isQueryingAll}
      >
        {isQueryingAll ? (
          <Loader2 className='h-4 w-4 animate-spin' />
        ) : (
          <RefreshCw className='h-4 w-4' />
        )}
        {t('Check All Balances')}
      </Button>
      <Button size='sm' variant='outline' onClick={() => setOpen('schedule')}>
        <Clock className='h-4 w-4' />
        {t('Schedule Settings')}
      </Button>
      <Button size='sm' variant='outline' onClick={() => setOpen('alerts')}>
        <BellRing className='h-4 w-4' />
        {t('Email Alerts')}
      </Button>
      <Button size='sm' onClick={() => setOpen('create')}>
        <Plus className='h-4 w-4' />
        {t('Add Account')}
      </Button>
    </div>
  )
}
