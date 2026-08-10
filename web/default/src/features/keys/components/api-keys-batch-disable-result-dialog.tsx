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
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

import type { BatchDisableApiKeysResult } from '../types'

type ApiKeysBatchDisableResultDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  result: BatchDisableApiKeysResult | null
}

export function ApiKeysBatchDisableResultDialog(
  props: ApiKeysBatchDisableResultDialogProps
) {
  const { t } = useTranslation()
  const missingNames = props.result?.missing_names ?? []
  const alreadyDisabledNames = props.result?.already_disabled_names ?? []

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>{t('Batch disable completed')}</DialogTitle>
          <DialogDescription>
            {t('Disabled {{count}} API key(s).', {
              count: props.result?.count ?? 0,
            })}
          </DialogDescription>
        </DialogHeader>
        <div className='flex max-h-80 flex-col gap-4 overflow-y-auto'>
          {missingNames.length > 0 && (
            <div className='flex flex-col gap-2'>
              <div className='text-muted-foreground text-xs font-medium'>
                {t('Names not found')} ({missingNames.length})
              </div>
              <ul className='bg-muted/30 flex flex-col gap-1 rounded-md border p-2'>
                {missingNames.map((name) => (
                  <li
                    key={name}
                    className='bg-background rounded px-2 py-1 text-sm break-all'
                  >
                    {name}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {alreadyDisabledNames.length > 0 && (
            <div className='flex flex-col gap-2'>
              <div className='text-muted-foreground text-xs font-medium'>
                {t('Names already disabled')} ({alreadyDisabledNames.length})
              </div>
              <ul className='bg-muted/30 flex flex-col gap-1 rounded-md border p-2'>
                {alreadyDisabledNames.map((name) => (
                  <li
                    key={name}
                    className='bg-background rounded px-2 py-1 text-sm break-all'
                  >
                    {name}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <DialogFooter className='-mx-4 -mb-4'>
          <DialogClose render={<Button />}>{t('Close')}</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
