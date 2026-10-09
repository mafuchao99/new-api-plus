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
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import {
  ArrowLeft,
  ArrowRight,
  Download,
  History,
  Loader2,
  Search,
  Wrench,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { getUser } from '@/features/users/api'
import { getSelf } from '@/lib/api'
import { formatLogQuota } from '@/lib/format'
import { useAuthStore } from '@/stores/auth-store'

import {
  applyCorrection,
  createCorrectionPreview,
  exportCorrection,
  getCorrection,
  getCorrectionCapabilities,
  getCorrectionDetails,
  getCorrectionSnapshots,
  listCorrections,
} from '../../correction-api'
import {
  correctionFormSchema,
  correctionStatusLabels,
  parseCorrectionProgress,
  parseCorrectionSummary,
  translateCorrectionMessage,
  type CorrectionFormValues,
} from '../../lib/correction'

export function CorrectionDialog(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState('preview')
  const [batchId, setBatchId] = useState('')
  const [page, setPage] = useState(1)
  const [snapshotPage, setSnapshotPage] = useState(1)
  const [historyPage, setHistoryPage] = useState(1)
  const [reason, setReason] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [snapshotLogId, setSnapshotLogId] = useState('')
  const [snapshotBatchId, setSnapshotBatchId] = useState('')
  const form = useForm<CorrectionFormValues>({
    resolver: zodResolver(correctionFormSchema),
    defaultValues: {
      userId: '',
      model: '',
      read: '',
      write: '',
      write5m: '',
      write1h: '',
      start: dayjs()
        .subtract(1, 'day')
        .startOf('day')
        .format('YYYY-MM-DDTHH:mm'),
      end: dayjs().startOf('hour').format('YYYY-MM-DDTHH:mm'),
    },
  })
  const userId = form.watch('userId')
  const modelName = form.watch('model')
  const start = form.watch('start')
  const end = form.watch('end')
  const capabilities = useQuery({
    queryKey: ['log-corrections', 'capabilities'],
    queryFn: getCorrectionCapabilities,
    enabled: props.open,
  })
  const user = useQuery({
    queryKey: ['log-corrections', 'user', userId],
    queryFn: () => getUser(Number(userId)),
    enabled: props.open && /^[1-9]\d*$/.test(userId),
  })
  const batchQuery = useQuery({
    queryKey: ['log-corrections', 'batch', batchId],
    queryFn: () => getCorrection(batchId),
    enabled: props.open && Boolean(batchId),
    refetchInterval: (query) =>
      ['previewing', 'applying'].includes(query.state.data?.batch.status ?? '')
        ? 2000
        : false,
  })
  const batch = batchQuery.data?.batch
  const active = batch?.status === 'previewing' || batch?.status === 'applying'
  const summary = batch ? parseCorrectionSummary(batch.summary) : null
  const progress = parseCorrectionProgress(batchQuery.data?.task?.state)
  const details = useQuery({
    queryKey: ['log-corrections', 'details', batchId, page, batch?.status],
    queryFn: () => getCorrectionDetails(batchId, page),
    enabled: props.open && Boolean(batchId) && !active,
  })
  const history = useQuery({
    queryKey: ['log-corrections', 'history', userId, historyPage],
    queryFn: () => listCorrections(userId, historyPage),
    enabled: props.open && tab === 'history',
  })
  const snapshots = useQuery({
    queryKey: [
      'log-corrections',
      'snapshots',
      userId,
      modelName,
      start,
      end,
      snapshotLogId,
      snapshotBatchId,
      snapshotPage,
    ],
    queryFn: () =>
      getCorrectionSnapshots({
        user_id: userId || undefined,
        model_name: modelName || undefined,
        log_id: snapshotLogId || undefined,
        batch_id: snapshotBatchId || undefined,
        start_time: Number.isFinite(new Date(start).getTime())
          ? Math.floor(new Date(start).getTime() / 1000)
          : undefined,
        end_time: Number.isFinite(new Date(end).getTime())
          ? Math.floor(new Date(end).getTime() / 1000)
          : undefined,
        p: snapshotPage,
      }),
    enabled:
      props.open &&
      tab === 'snapshots' &&
      capabilities.data?.supported === true,
  })
  const preview = useMutation({
    mutationFn: (values: CorrectionFormValues) =>
      createCorrectionPreview({
        user_id: Number(values.userId),
        model_name: values.model,
        start_time: Math.floor(new Date(values.start).getTime() / 1000),
        end_time: Math.floor(new Date(values.end).getTime() / 1000),
        cache_read_ratio: Number(values.read),
        cache_write_ratio: Number(values.write),
        cache_write_5m_ratio:
          values.write5m === '' ? undefined : Number(values.write5m),
        cache_write_1h_ratio:
          values.write1h === '' ? undefined : Number(values.write1h),
      }),
    onSuccess: (created) => {
      setBatchId(created.id)
      setPage(1)
      setReason('')
      setTab('preview')
      void queryClient.invalidateQueries({
        queryKey: ['log-corrections', 'history'],
      })
    },
    onError: (error) =>
      toast.error(translateCorrectionMessage(error.message, t)),
  })
  const apply = useMutation({
    mutationFn: () => applyCorrection(batchId, reason.trim()),
    onSuccess: () => {
      setConfirmOpen(false)
      void queryClient.invalidateQueries({
        queryKey: ['log-corrections', 'batch', batchId],
      })
    },
    onError: (error) =>
      toast.error(translateCorrectionMessage(error.message, t)),
  })

  useEffect(() => {
    if (batch?.status !== 'completed') return
    for (const key of [
      'logs',
      'usage-logs-stats',
      'dashboard',
      'users',
      'user',
      'accounting',
      'tokens',
      'keys',
      'channels',
      'log-corrections',
    ]) {
      void queryClient.invalidateQueries({ queryKey: [key] })
    }
    if (useAuthStore.getState().auth.user?.id === batch.user_id) {
      void getSelf()
        .then((response) => {
          if (response.success && response.data) {
            useAuthStore.getState().auth.setUser(response.data)
          }
        })
        .catch(() => {})
    }
  }, [batch?.status, batch?.user_id, queryClient])

  const download = async (summaryOnly: boolean) => {
    setExporting(true)
    try {
      await exportCorrection(batchId, summaryOnly)
    } catch (error) {
      toast.error(
        error instanceof Error
          ? translateCorrectionMessage(error.message, t)
          : t('Correction request failed')
      )
    } finally {
      setExporting(false)
    }
  }
  const fields: Array<{
    name: keyof CorrectionFormValues
    label: string
    type: string
  }> = [
    { name: 'userId', label: 'User ID', type: 'number' },
    { name: 'model', label: 'Exact model name', type: 'text' },
    { name: 'start', label: 'Start time (inclusive)', type: 'datetime-local' },
    { name: 'end', label: 'End time (exclusive)', type: 'datetime-local' },
    { name: 'read', label: 'Correct cache read ratio', type: 'number' },
    { name: 'write', label: 'Correct cache write ratio', type: 'number' },
    { name: 'write5m', label: 'Correct 5-minute write ratio', type: 'number' },
    { name: 'write1h', label: 'Correct 1-hour write ratio', type: 'number' },
  ]
  const canApply =
    batch &&
    ['ready', 'failed'].includes(batch.status) &&
    Boolean(batch.fingerprint) &&
    Boolean(summary?.changes)

  return (
    <>
      <Dialog
        open={props.open}
        onOpenChange={props.onOpenChange}
        title={t('Historical consumption correction')}
        contentClassName='sm:max-w-5xl'
        contentHeight='min(76vh, 850px)'
      >
        <div className='space-y-4'>
          <p
            className='border-l-2 border-amber-500 pl-3 text-sm text-amber-700 dark:text-amber-400'
            role='note'
          >
            {t('Balances and remaining quotas will not be changed.')}
          </p>
          {capabilities.isError && (
            <p role='alert' className='text-destructive'>
              {translateCorrectionMessage(capabilities.error.message, t)}
            </p>
          )}
          {capabilities.data?.supported === false && (
            <p role='alert' className='text-destructive'>
              {t('ClickHouse log correction is not supported')}
            </p>
          )}
          <form
            onSubmit={form.handleSubmit((values) => preview.mutate(values))}
          >
            <FieldGroup className='grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4'>
              {fields.map((field) => (
                <Field key={field.name}>
                  <FieldLabel htmlFor={`correction-${field.name}`}>
                    {t(field.label)}
                  </FieldLabel>
                  <Input
                    id={`correction-${field.name}`}
                    type={field.type}
                    step={field.type === 'number' ? 'any' : undefined}
                    min={field.type === 'number' ? 0 : undefined}
                    disabled={active || preview.isPending}
                    aria-invalid={Boolean(form.formState.errors[field.name])}
                    {...form.register(field.name)}
                  />
                  {form.formState.errors[field.name]?.message && (
                    <FieldError>
                      {t(form.formState.errors[field.name]?.message ?? '')}
                    </FieldError>
                  )}
                </Field>
              ))}
            </FieldGroup>
            <div className='mt-3 flex flex-wrap items-center gap-3'>
              <Button
                type='submit'
                variant='outline'
                disabled={
                  active ||
                  preview.isPending ||
                  capabilities.data?.supported !== true
                }
              >
                {preview.isPending || active ? (
                  <Loader2 className='animate-spin' />
                ) : (
                  <Search />
                )}
                {t('Preview correction')}
              </Button>
              <span className='text-muted-foreground text-xs'>
                {Intl.DateTimeFormat().resolvedOptions().timeZone}
              </span>
              {user.data?.success && (
                <span className='text-sm'>{user.data.data?.username}</span>
              )}
              {user.data?.success === false && (
                <span className='text-destructive text-sm'>
                  {t('User not found')}
                </span>
              )}
            </div>
          </form>
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className='max-w-full flex-wrap justify-start gap-1 group-data-horizontal/tabs:h-auto'>
              <TabsTrigger className='h-7' value='preview'>
                {t('Preview')}
              </TabsTrigger>
              <TabsTrigger className='h-7' value='history'>
                <History />
                {t('Correction batches')}
              </TabsTrigger>
              <TabsTrigger className='h-7' value='snapshots'>
                {t('Modification snapshots')}
              </TabsTrigger>
            </TabsList>
          </Tabs>
          {tab === 'history' && (
            <div className='divide-y'>
              {history.isPending && <Loader2 className='animate-spin' />}
              {history.isError && (
                <p role='alert'>
                  {translateCorrectionMessage(history.error.message, t)}
                </p>
              )}
              {history.data?.items.map((item) => (
                <button
                  type='button'
                  key={item.id}
                  className='hover:bg-muted flex w-full flex-wrap items-center justify-between gap-2 py-3 text-start text-sm'
                  onClick={() => {
                    setBatchId(item.id)
                    setPage(1)
                    setReason(item.reason)
                    setTab('preview')
                  }}
                >
                  <span>
                    {item.model_name} · #{item.user_id} ·{' '}
                    {dayjs.unix(item.created_at).format('YYYY-MM-DD HH:mm')}
                  </span>
                  <span>
                    {t(correctionStatusLabels[item.status] ?? item.status)}
                  </span>
                </button>
              ))}
              {history.data?.items.length === 0 && (
                <p className='text-muted-foreground py-4 text-sm'>
                  {t('No correction batches')}
                </p>
              )}
              <div className='flex items-center justify-end gap-2 py-3'>
                <Button
                  size='icon'
                  variant='outline'
                  aria-label={t('Previous page')}
                  disabled={historyPage <= 1}
                  onClick={() => setHistoryPage(historyPage - 1)}
                >
                  <ArrowLeft />
                </Button>
                <span className='text-sm'>{historyPage}</span>
                <Button
                  size='icon'
                  variant='outline'
                  aria-label={t('Next page')}
                  disabled={historyPage * 20 >= (history.data?.total ?? 0)}
                  onClick={() => setHistoryPage(historyPage + 1)}
                >
                  <ArrowRight />
                </Button>
              </div>
            </div>
          )}
          {tab === 'snapshots' && (
            <div className='space-y-3'>
              <Input
                aria-label={t('Batch ID')}
                placeholder={t('Batch ID')}
                value={snapshotBatchId}
                onChange={(event) => {
                  setSnapshotBatchId(event.target.value)
                  setSnapshotPage(1)
                }}
              />
              <Input
                type='number'
                min='1'
                aria-label={t('Log ID')}
                placeholder={t('Log ID')}
                value={snapshotLogId}
                onChange={(event) => {
                  setSnapshotLogId(event.target.value)
                  setSnapshotPage(1)
                }}
              />
              {snapshots.isPending && capabilities.data?.supported && (
                <Loader2 className='animate-spin' />
              )}
              {snapshots.isError && (
                <p role='alert'>
                  {translateCorrectionMessage(snapshots.error.message, t)}
                </p>
              )}
              {snapshots.data?.items.map((item) => (
                <details key={item.id} className='border-b py-3 text-sm'>
                  <summary className='cursor-pointer'>
                    #{item.log_id} · {item.model_name} ·{' '}
                    {formatLogQuota(item.corrected_quota + item.delta)} →{' '}
                    {formatLogQuota(item.corrected_quota)}
                    {' · '}
                    {t(
                      correctionStatusLabels[item.sync_status] ??
                        item.sync_status
                    )}
                  </summary>
                  <div className='mt-2 space-y-2'>
                    <p>
                      {item.reason} · #{item.operator_id} ·{' '}
                      {dayjs
                        .unix(item.created_at)
                        .format('YYYY-MM-DD HH:mm:ss')}
                    </p>
                    <p className='text-muted-foreground break-all'>
                      {item.batch_id}
                    </p>
                    <p>{t('Original snapshot')}</p>
                    <pre className='max-h-64 overflow-auto rounded border p-2 text-xs'>
                      {item.original}
                    </pre>
                    <p>{t('Corrected pricing')}</p>
                    <pre className='max-h-64 overflow-auto rounded border p-2 text-xs'>
                      {item.corrected_other}
                    </pre>
                  </div>
                </details>
              ))}
              {snapshots.data?.items.length === 0 && (
                <p className='text-muted-foreground text-sm'>
                  {t('No modification snapshots')}
                </p>
              )}
              <div className='flex items-center justify-end gap-2'>
                <Button
                  size='icon'
                  variant='outline'
                  aria-label={t('Previous page')}
                  disabled={snapshotPage <= 1}
                  onClick={() => setSnapshotPage(snapshotPage - 1)}
                >
                  <ArrowLeft />
                </Button>
                <span className='text-sm'>{snapshotPage}</span>
                <Button
                  size='icon'
                  variant='outline'
                  aria-label={t('Next page')}
                  disabled={snapshotPage * 20 >= (snapshots.data?.total ?? 0)}
                  onClick={() => setSnapshotPage(snapshotPage + 1)}
                >
                  <ArrowRight />
                </Button>
              </div>
            </div>
          )}
          {tab === 'preview' && (
            <div className='space-y-3'>
              {batchQuery.isError && (
                <p role='alert' className='text-destructive'>
                  {translateCorrectionMessage(batchQuery.error.message, t)}
                </p>
              )}
              {batch && (
                <div className='flex flex-wrap items-center gap-2 text-sm'>
                  {active && <Loader2 className='size-4 animate-spin' />}
                  <strong>
                    {t(correctionStatusLabels[batch.status] ?? batch.status)}
                  </strong>
                  <span className='text-muted-foreground break-all'>
                    {batch.id}
                  </span>
                </div>
              )}
              {active && progress && (
                <p className='text-muted-foreground text-sm'>
                  {t('Processed logs')}: {progress.processed}
                  {progress.total !== undefined && ` / ${progress.total}`}
                </p>
              )}
              {batch && (
                <p className='text-sm break-words'>
                  #{batch.user_id} · {batch.model_name} ·{' '}
                  {dayjs.unix(batch.start_time).format('YYYY-MM-DD HH:mm')}
                  {' → '}
                  {dayjs.unix(batch.end_time).format('YYYY-MM-DD HH:mm')}
                </p>
              )}
              {batch?.error && (
                <p role='alert' className='text-destructive text-sm'>
                  {translateCorrectionMessage(batch.error, t)}
                </p>
              )}
              {summary && (
                <dl className='grid grid-cols-2 gap-3 border-y py-3 sm:grid-cols-4'>
                  {[
                    [t('Matched logs'), summary.matched],
                    [t('Logs to correct'), summary.changes],
                    [t('Skipped logs'), summary.skipped],
                    [t('Warnings'), summary.warnings],
                    [
                      t('Original consumption'),
                      formatLogQuota(summary.original_quota),
                    ],
                    [
                      t('Corrected consumption'),
                      formatLogQuota(summary.corrected_quota),
                    ],
                    [
                      t('Dashboard correction'),
                      formatLogQuota(summary.dashboard_delta),
                    ],
                    [
                      t('Monthly correction'),
                      formatLogQuota(summary.monthly_delta),
                    ],
                    [
                      t('User consumption correction'),
                      formatLogQuota(summary.user_delta),
                    ],
                    [
                      t('Token consumption correction'),
                      formatLogQuota(summary.token_delta),
                    ],
                    [
                      t('Channel consumption correction'),
                      formatLogQuota(summary.channel_delta),
                    ],
                    [
                      t('Monthly wallet correction'),
                      formatLogQuota(summary.monthly_wallet_delta),
                    ],
                    [
                      t('Monthly subscription correction'),
                      formatLogQuota(summary.monthly_subscription_delta),
                    ],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt className='text-muted-foreground text-xs'>{label}</dt>
                      <dd className='text-sm font-semibold'>{value}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {details.isError && (
                <p role='alert' className='text-destructive text-sm'>
                  {translateCorrectionMessage(details.error.message, t)}
                </p>
              )}
              {batchId && !active && (
                <div className='overflow-x-auto'>
                  <table className='w-full text-left text-xs'>
                    <thead>
                      <tr className='border-b'>
                        {[
                          'Log ID',
                          'Original consumption',
                          'Corrected consumption',
                          'Correction amount',
                          'Status',
                        ].map((label) => (
                          <th
                            key={label}
                            className='px-2 py-2 font-medium whitespace-nowrap'
                          >
                            {t(label)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {details.data?.items.map((entry) => (
                        <tr key={entry.log_id} className='border-b align-top'>
                          <td className='px-2 py-2'>{entry.log_id}</td>
                          <td className='px-2 py-2 whitespace-nowrap'>
                            {formatLogQuota(entry.original_quota)}
                          </td>
                          <td className='px-2 py-2 whitespace-nowrap'>
                            {formatLogQuota(entry.corrected_quota)}
                          </td>
                          <td className='px-2 py-2 whitespace-nowrap'>
                            {formatLogQuota(entry.delta)}
                          </td>
                          <td className='max-w-80 px-2 py-2 break-words'>
                            {t(
                              correctionStatusLabels[entry.status] ??
                                entry.status
                            )}
                            {entry.error && (
                              <p className='text-destructive mt-1'>
                                {translateCorrectionMessage(entry.error, t)}
                              </p>
                            )}
                            {entry.warnings?.map((warning) => (
                              <p key={warning} className='mt-1 text-amber-700'>
                                {translateCorrectionMessage(warning, t)}
                              </p>
                            ))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className='mt-2 flex items-center justify-end gap-2'>
                    <Button
                      size='icon'
                      variant='outline'
                      aria-label={t('Previous page')}
                      disabled={page <= 1}
                      onClick={() => setPage(page - 1)}
                    >
                      <ArrowLeft />
                    </Button>
                    <span>
                      {page} /{' '}
                      {Math.max(1, Math.ceil((details.data?.total ?? 0) / 20))}
                    </span>
                    <Button
                      size='icon'
                      variant='outline'
                      aria-label={t('Next page')}
                      disabled={page * 20 >= (details.data?.total ?? 0)}
                      onClick={() => setPage(page + 1)}
                    >
                      <ArrowRight />
                    </Button>
                  </div>
                </div>
              )}
              {batchId && !active && (
                <div className='flex flex-wrap gap-2'>
                  <Button
                    variant='outline'
                    size='sm'
                    disabled={exporting}
                    onClick={() => void download(false)}
                  >
                    <Download />
                    {t('Export details')}
                  </Button>
                  <Button
                    variant='outline'
                    size='sm'
                    disabled={exporting}
                    onClick={() => void download(true)}
                  >
                    <Download />
                    {t('Export summary')}
                  </Button>
                </div>
              )}
              {canApply && (
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor='correction-reason'>
                      {t('Correction reason')}
                    </FieldLabel>
                    <Textarea
                      id='correction-reason'
                      value={reason}
                      maxLength={2000}
                      onChange={(event) => setReason(event.target.value)}
                    />
                  </Field>
                  <Button
                    disabled={!reason.trim() || apply.isPending}
                    onClick={() => setConfirmOpen(true)}
                    className='w-fit'
                  >
                    <Wrench />
                    {batch.apply_started
                      ? t('Resume statistics synchronization')
                      : t('Apply correction')}
                  </Button>
                </FieldGroup>
              )}
            </div>
          )}
        </div>
      </Dialog>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t('Confirm consumption correction')}
        desc={t(
          'Only overcharged logs and consumption statistics will be reduced. Balances and remaining quotas stay unchanged.'
        )}
        confirmText={t('Apply correction')}
        handleConfirm={() => apply.mutate()}
        isLoading={apply.isPending}
      />
    </>
  )
}
