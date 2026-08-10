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
import { useRef, useState, type ChangeEvent } from 'react'
import { FileBlockIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'

import { batchDisableApiKeysFromCsv } from '../api'
import type { BatchDisableApiKeysResult } from '../types'
import { ApiKeysBatchDisableResultDialog } from './api-keys-batch-disable-result-dialog'
import { useApiKeys } from './api-keys-provider'

type ApiKeysBatchDisableButtonProps = {
  disabled: boolean
}

export function ApiKeysBatchDisableButton(
  props: ApiKeysBatchDisableButtonProps
) {
  const { t } = useTranslation()
  const { triggerRefresh } = useApiKeys()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDisabling, setIsDisabling] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [result, setResult] = useState<BatchDisableApiKeysResult | null>(null)
  const [resultOpen, setResultOpen] = useState(false)

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0]
    event.target.value = ''
    if (!selectedFile) return

    setFile(selectedFile)
    setConfirmOpen(true)
  }

  const handleConfirm = async () => {
    if (!file) return

    setIsDisabling(true)
    try {
      const response = await batchDisableApiKeysFromCsv(file)
      if (!response.success || !response.data) {
        toast.error(
          response.message || t('Failed to disable API keys from CSV')
        )
        return
      }

      if (response.data.count > 0) {
        toast.success(
          t('Successfully disabled {{count}} API key(s)', {
            count: response.data.count,
          })
        )
      } else {
        toast.info(t('No API keys needed to be disabled'))
      }
      triggerRefresh()
      setConfirmOpen(false)
      setFile(null)

      const hasDetails =
        (response.data.missing_names?.length ?? 0) > 0 ||
        (response.data.already_disabled_names?.length ?? 0) > 0
      if (hasDetails) {
        setResult(response.data)
        setResultOpen(true)
      }
    } catch {
      toast.error(t('Failed to disable API keys from CSV'))
    } finally {
      setIsDisabling(false)
    }
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type='file'
        accept='.csv,text/csv'
        className='hidden'
        onChange={handleFile}
      />
      <Button
        variant='destructive'
        size='sm'
        aria-label={t('Batch Disable')}
        title={t('Batch Disable')}
        onClick={() => fileInputRef.current?.click()}
        disabled={props.disabled || isDisabling}
      >
        {isDisabling ? (
          <Spinner data-icon='inline-start' />
        ) : (
          <HugeiconsIcon
            icon={FileBlockIcon}
            strokeWidth={2}
            data-icon='inline-start'
            aria-hidden='true'
          />
        )}
        <span className='hidden sm:inline'>{t('Batch Disable')}</span>
      </Button>
      <ConfirmDialog
        destructive
        open={confirmOpen}
        onOpenChange={(open) => {
          setConfirmOpen(open)
          if (!open && !isDisabling) setFile(null)
        }}
        handleConfirm={handleConfirm}
        isLoading={isDisabling}
        className='max-w-md'
        title={t('Disable API keys from CSV?')}
        desc={
          <>
            {t(
              'The API keys whose names match the name column in {{filename}} will be disabled.',
              { filename: file?.name ?? '' }
            )}{' '}
            {t(
              'This only affects API keys in your account. You can enable them again later.'
            )}
          </>
        }
        confirmText={t('Disable API Keys')}
      />
      <ApiKeysBatchDisableResultDialog
        open={resultOpen}
        onOpenChange={setResultOpen}
        result={result}
      />
    </>
  )
}
