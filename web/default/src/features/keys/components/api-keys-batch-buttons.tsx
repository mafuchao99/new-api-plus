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
import { FileDownloadIcon, FileUploadIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/spinner'

import {
  batchCreateApiKeysFromCsv,
  fetchTokenKeysBatch,
  getApiKeys,
} from '../api'
import type { ApiKey } from '../types'
import { ApiKeysBatchDisableButton } from './api-keys-batch-disable-button'
import { useApiKeys } from './api-keys-provider'

const CSV_HEADERS = ['name', 'api_key', 'url', '剩余金额'] as const

function escapeCsvValue(value: string | number | boolean | null | undefined) {
  const text = value == null ? '' : String(value)
  return `"${text.replaceAll('"', '""')}"`
}

function downloadCsv(filename: string, rows: (string | number | boolean)[][]) {
  const content = rows
    .map((row) => row.map((value) => escapeCsvValue(value)).join(','))
    .join('\n')
  const blob = new Blob([`\uFEFF${content}\n`], {
    type: 'text/csv;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

async function fetchAllApiKeys(): Promise<ApiKey[]> {
  const pageSize = 100
  const firstPage = await getApiKeys({ p: 1, size: pageSize })
  if (!firstPage.success) {
    throw new Error(firstPage.message)
  }

  const firstItems = firstPage.data?.items ?? []
  const total = firstPage.data?.total ?? firstItems.length
  const pageCount = Math.ceil(total / pageSize)
  const rest: ApiKey[] = []

  for (let page = 2; page <= pageCount; page++) {
    const result = await getApiKeys({ p: page, size: pageSize })
    if (!result.success) throw new Error(result.message)
    rest.push(...(result.data?.items ?? []))
  }

  return [...firstItems, ...rest]
}

async function fetchFullKeys(ids: number[]) {
  const keys: Record<number, string> = {}
  for (let i = 0; i < ids.length; i += 100) {
    const result = await fetchTokenKeysBatch(ids.slice(i, i + 100))
    if (!result.success) throw new Error(result.message)
    for (const [id, key] of Object.entries(result.data?.keys ?? {})) {
      keys[Number(id)] = key.startsWith('sk-') ? key : `sk-${key}`
    }
  }
  return keys
}

export function ApiKeysBatchButtons() {
  const { t } = useTranslation()
  const { selectedApiKeys, triggerRefresh } = useApiKeys()
  const createFileInputRef = useRef<HTMLInputElement>(null)
  const [isImporting, setIsImporting] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [duplicateNames, setDuplicateNames] = useState<string[]>([])
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false)
  const isBusy = isImporting || isExporting

  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setIsImporting(true)
    try {
      const result = await batchCreateApiKeysFromCsv(file)
      if (result.success) {
        const skippedDuplicateNames = result.data?.duplicate_names ?? []
        toast.success(
          t('Successfully imported {{count}} API key(s)', {
            count: result.data?.count ?? 0,
          })
        )
        if (skippedDuplicateNames.length > 0) {
          setDuplicateNames(skippedDuplicateNames)
          setDuplicateDialogOpen(true)
        }
        triggerRefresh()
      } else {
        toast.error(result.message || t('Failed to import API keys from CSV'))
      }
    } catch {
      toast.error(t('Failed to import API keys from CSV'))
    } finally {
      setIsImporting(false)
    }
  }

  const handleExport = async () => {
    setIsExporting(true)
    try {
      const apiKeys =
        selectedApiKeys.length > 0 ? selectedApiKeys : await fetchAllApiKeys()
      if (apiKeys.length === 0) {
        toast.error(t('No API keys to export'))
        return
      }

      const fullKeys = await fetchFullKeys(apiKeys.map((apiKey) => apiKey.id))
      const baseUrl = window.location.origin
      const rows: (string | number | boolean)[][] = [
        [...CSV_HEADERS],
        ...apiKeys.map((apiKey) => [
          apiKey.name,
          fullKeys[apiKey.id] || apiKey.key,
          baseUrl,
          apiKey.unlimited_quota ? -1 : apiKey.remain_quota / 500000,
        ]),
      ]
      downloadCsv(`api-keys-${new Date().toISOString().slice(0, 10)}.csv`, rows)
      toast.success(
        t('Successfully exported {{count}} API key(s)', {
          count: apiKeys.length,
        })
      )
    } catch {
      toast.error(t('Failed to export API keys'))
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <>
      <input
        ref={createFileInputRef}
        type='file'
        accept='.csv,text/csv'
        className='hidden'
        onChange={handleImportFile}
      />
      <ButtonGroup aria-label={t('Batch API key actions')}>
        <Button
          variant='outline'
          size='sm'
          aria-label={t('Batch Create')}
          title={t('Batch Create')}
          onClick={() => createFileInputRef.current?.click()}
          disabled={isBusy}
        >
          {isImporting ? (
            <Spinner data-icon='inline-start' />
          ) : (
            <HugeiconsIcon
              icon={FileUploadIcon}
              strokeWidth={2}
              data-icon='inline-start'
              aria-hidden='true'
            />
          )}
          <span className='hidden sm:inline'>{t('Batch Create')}</span>
        </Button>
        <Button
          variant='outline'
          size='sm'
          aria-label={t('Batch Export')}
          title={t('Batch Export')}
          onClick={handleExport}
          disabled={isBusy}
        >
          {isExporting ? (
            <Spinner data-icon='inline-start' />
          ) : (
            <HugeiconsIcon
              icon={FileDownloadIcon}
              strokeWidth={2}
              data-icon='inline-start'
              aria-hidden='true'
            />
          )}
          <span className='hidden sm:inline'>{t('Batch Export')}</span>
        </Button>
        <ApiKeysBatchDisableButton disabled={isBusy} />
      </ButtonGroup>
      <Dialog open={duplicateDialogOpen} onOpenChange={setDuplicateDialogOpen}>
        <DialogContent className='sm:max-w-md'>
          <DialogHeader>
            <DialogTitle>
              {t('Duplicate API key names were skipped')}
            </DialogTitle>
            <DialogDescription>
              {t(
                'These API key names already exist or appeared more than once in the CSV. They were not created.'
              )}
            </DialogDescription>
          </DialogHeader>
          <div className='bg-muted/30 max-h-64 overflow-y-auto rounded-md border p-2'>
            <div className='text-muted-foreground mb-2 text-xs font-medium'>
              {t('Duplicate names')}
            </div>
            <ul className='space-y-1'>
              {duplicateNames.map((name) => (
                <li
                  key={name}
                  className='bg-background rounded px-2 py-1 text-sm break-all'
                >
                  {name}
                </li>
              ))}
            </ul>
          </div>
          <DialogFooter className='-mx-4 -mb-4'>
            <DialogClose render={<Button />}>{t('Close')}</DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
