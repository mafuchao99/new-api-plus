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
import { Download, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetClose,
} from '@/components/ui/sheet'
import { formatCompactNumber, formatLogQuota, formatNumber } from '@/lib/format'

import { downloadConsumptionCsv } from '../lib/export'
import type {
  ConsumptionAggregate,
  ConsumptionFilters,
  ConsumptionTotals,
} from '../types'
import { ConsumptionTable } from './consumption-table'

type ModelDetailSheetProps = {
  model: ConsumptionAggregate | null
  users: ConsumptionAggregate[]
  filters: ConsumptionFilters
  onClose: () => void
  totals?: ConsumptionTotals
  loading: boolean
  error: boolean
  onRetry: () => void
  demo: boolean
}

export function ModelDetailSheet(props: ModelDetailSheetProps) {
  const { t, i18n } = useTranslation()
  const locale = i18n.resolvedLanguage || i18n.language
  return (
    <Sheet
      open={!!props.model}
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
    >
      <SheetContent
        className='w-full gap-0 sm:max-w-3xl'
        showCloseButton={false}
      >
        <SheetHeader className='border-b p-5 sm:p-6'>
          <div className='mb-3 flex items-center justify-between gap-3'>
            <Badge variant='secondary'>
              {t(props.demo ? 'Demo data' : 'User spending')}
            </Badge>
            <SheetClose render={<Button variant='ghost' size='sm' />}>
              {t('Close')}
            </SheetClose>
          </div>
          <SheetTitle className='text-lg break-all'>
            {props.model?.name || t('Unknown model')}
          </SheetTitle>
          <SheetDescription className='mt-1'>
            {props.filters.startDate} — {props.filters.endDate}
          </SheetDescription>
        </SheetHeader>
        <div className='min-h-0 flex-1 overflow-y-auto'>
          {props.model && (
            <>
              <div className='bg-muted/20 space-y-5 border-b p-5 sm:p-6'>
                <div>
                  <p className='text-muted-foreground text-sm'>
                    {t('Model spending')}
                  </p>
                  <p className='mt-2 text-3xl font-semibold tracking-tight tabular-nums'>
                    {formatLogQuota(props.totals?.quota ?? props.model.quota)}
                  </p>
                </div>
                <div className='grid grid-cols-3 gap-3 text-xs'>
                  <div>
                    <p className='text-muted-foreground'>{t('Users')}</p>
                    <p className='mt-1 text-base font-medium tabular-nums'>
                      {props.users.length}
                    </p>
                  </div>
                  <div>
                    <p className='text-muted-foreground'>{t('Requests')}</p>
                    <p className='mt-1 text-base font-medium tabular-nums'>
                      {formatNumber(
                        props.totals?.requests ?? props.model.requests,
                        locale
                      )}
                    </p>
                  </div>
                  <div>
                    <p className='text-muted-foreground'>{t('Tokens')}</p>
                    <p
                      className='mt-1 text-base font-medium tabular-nums'
                      title={formatNumber(
                        props.totals?.tokens ?? props.model.tokens,
                        locale
                      )}
                    >
                      {formatCompactNumber(
                        props.totals?.tokens ?? props.model.tokens,
                        locale
                      )}
                    </p>
                  </div>
                </div>
              </div>
              <div className='flex flex-wrap items-center justify-between gap-3 px-5 py-5 sm:px-6'>
                <div className='flex items-center gap-2 text-sm font-semibold'>
                  <Users
                    className='text-muted-foreground size-4'
                    aria-hidden='true'
                  />
                  {t('User spending')}
                </div>
                <Button
                  variant='outline'
                  size='sm'
                  disabled={props.loading || props.error || !props.users.length}
                  onClick={() =>
                    downloadConsumptionCsv(
                      props.users,
                      props.filters,
                      'user',
                      t,
                      props.model?.name,
                      props.demo
                    )
                  }
                >
                  <Download className='size-4' aria-hidden='true' />
                  {t('Export CSV')}
                </Button>
              </div>
              {props.error && (
                <div role='alert' className='space-y-3 p-5 text-sm'>
                  <p>{t('Failed to load user spending.')}</p>
                  <Button variant='outline' onClick={props.onRetry}>
                    {t('Retry')}
                  </Button>
                </div>
              )}
              {!props.error && (
                <ConsumptionTable
                  key={props.model.id}
                  rows={props.users}
                  dimension='user'
                  loading={props.loading}
                />
              )}
              <p className='text-muted-foreground px-5 py-4 text-xs leading-relaxed sm:px-6'>
                {t(
                  'User shares are calculated from this model’s spending under the current filters.'
                )}
              </p>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
