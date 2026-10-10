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
import { useQuery } from '@tanstack/react-query'
import { Download, FlaskConical, Info, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout/components/section-page-layout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatLogQuota } from '@/lib/format'

import { consumptionApi } from './api'
import { ConsumptionTable } from './components/consumption-table'
import { ModelDetailSheet } from './components/model-detail-sheet'
import { SummaryCards } from './components/summary-cards'
import { SummaryFilters } from './components/summary-filters'
import { dateInputValue } from './lib/date'
import { downloadConsumptionCsv } from './lib/export'
import { presetFilters } from './lib/summary'
import type { ConsumptionDataSource, ConsumptionResult } from './types'

const EMPTY_RESULT: ConsumptionResult = {
  totals: { quota: 0, requests: 0, tokens: 0, models: 0 },
  rows: [],
}

export function ConsumptionSummary(props: { source?: ConsumptionDataSource }) {
  const source = props.source ?? consumptionApi
  const { t } = useTranslation()
  const [today] = useState(() => new Date())
  const [draft, setDraft] = useState(() => presetFilters('month', today))
  const [applied, setApplied] = useState(draft)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const [activeModel, setActiveModel] = useState<string | null>(null)
  const summaryQuery = useQuery({
    queryKey: ['consumption-summary', source.kind, applied, revision],
    queryFn: ({ signal }) => source.summary(applied, null, signal),
    retry: false,
    refetchOnWindowFocus: false,
  })
  const detailQuery = useQuery({
    queryKey: [
      'consumption-summary-users',
      source.kind,
      applied,
      activeModel,
      revision,
    ],
    queryFn: ({ signal }) => source.summary(applied, activeModel, signal),
    enabled: activeModel !== null,
    retry: false,
    refetchOnWindowFocus: false,
  })
  const loading = summaryQuery.isFetching
  const summary = summaryQuery.data ?? EMPTY_RESULT
  const selectedModel =
    summary.rows.find((model) => model.id === activeModel) ?? null
  const updatedAt = summaryQuery.dataUpdatedAt
    ? new Date(summaryQuery.dataUpdatedAt)
    : null

  const applyFilters = () => {
    if (!draft.startDate || !draft.endDate) {
      setError('Select both a start date and an end date.')
      return
    }
    if (draft.startDate > draft.endDate) {
      setError('The start date must not be after the end date.')
      return
    }
    setError('')
    setActiveModel(null)
    setApplied({ ...draft })
    setRevision((value) => value + 1)
  }

  const resetFilters = () => {
    const defaults = presetFilters('month', today)
    setDraft(defaults)
    setError('')
    setActiveModel(null)
    setApplied(defaults)
    setRevision((value) => value + 1)
  }

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>
        <span className='inline-flex items-center gap-3'>
          {t('Consumption summary')}
          {source.kind === 'demo' && (
            <Badge
              variant='outline'
              className='border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-400'
            >
              <FlaskConical className='size-3' aria-hidden='true' />
              {t('Demo data')}
            </Badge>
          )}
        </span>
      </SectionPageLayout.Title>
      <SectionPageLayout.Actions>
        <Button
          variant='outline'
          size='sm'
          disabled={loading}
          onClick={() => {
            setActiveModel(null)
            setRevision((value) => value + 1)
          }}
        >
          <RefreshCw
            className={`size-4 ${loading ? 'animate-spin' : ''}`}
            aria-hidden='true'
          />
          {t('Refresh')}
        </Button>
        <Button
          variant='outline'
          size='sm'
          disabled={loading || summaryQuery.isError || !summary.rows.length}
          onClick={() =>
            downloadConsumptionCsv(
              summary.rows,
              applied,
              'model',
              t,
              undefined,
              source.kind === 'demo'
            )
          }
        >
          <Download className='size-4' aria-hidden='true' />
          {t('Export CSV')}
        </Button>
      </SectionPageLayout.Actions>
      <SectionPageLayout.Content>
        <div className='space-y-5 pb-4' aria-busy={loading}>
          <p className='text-muted-foreground text-sm'>
            {t(
              'See how much users spend on each model, with a breakdown by date and user.'
            )}
          </p>
          <SummaryFilters
            today={today}
            source={source}
            value={draft}
            onChange={(value) => {
              setDraft(value)
              setError('')
            }}
            onApply={applyFilters}
            onReset={resetFilters}
            error={error ? t(error) : ''}
            loading={loading}
          />
          {summaryQuery.isError && (
            <div
              role='alert'
              className='border-destructive/30 bg-destructive/5 text-destructive flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4 text-sm'
            >
              {t('Failed to load consumption summary.')}
              <Button
                variant='outline'
                size='sm'
                onClick={() => void summaryQuery.refetch()}
              >
                {t('Retry')}
              </Button>
            </div>
          )}
          <SummaryCards totals={summary.totals} loading={loading} />
          <section
            className='bg-card overflow-hidden rounded-xl border'
            aria-label={t('Model spending ranking')}
          >
            <div className='flex flex-wrap items-center justify-between gap-3 border-b px-4 py-4 sm:px-5'>
              <div>
                <h3 className='text-sm font-semibold'>
                  {t('Model spending ranking')}
                </h3>
                <p className='text-muted-foreground mt-1 text-xs'>
                  {applied.startDate} — {applied.endDate} ·{' '}
                  {t('Click a model to view user spending.')}
                </p>
              </div>
              <div className='text-muted-foreground text-xs'>
                {t('Total spending')}:{' '}
                <span className='text-foreground ml-1 font-medium tabular-nums'>
                  {formatLogQuota(summary.totals.quota)}
                </span>
              </div>
            </div>
            {!summaryQuery.isError && (
              <ConsumptionTable
                key={revision}
                rows={summary.rows}
                dimension='model'
                onModelClick={setActiveModel}
                loading={loading}
              />
            )}
          </section>
          <div className='text-muted-foreground flex flex-wrap items-start justify-between gap-3 text-xs leading-relaxed'>
            <p className='flex max-w-2xl items-start gap-2'>
              <Info className='mt-0.5 size-3.5 shrink-0' aria-hidden='true' />
              {source.kind === 'demo'
                ? t(
                    'Demo only: these figures use mock data from the last 90 days and do not reflect actual charges.'
                  )
                : t(
                    'Spending is net of refunds recorded in the selected period. Deleted logs and unrecorded usage are not included.'
                  )}
            </p>
            {updatedAt && (
              <p aria-live='polite'>
                {t('Updated at')}: {dateInputValue(updatedAt)}{' '}
                {updatedAt.toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </p>
            )}
          </div>
        </div>
        <ModelDetailSheet
          model={selectedModel}
          users={detailQuery.data?.rows ?? []}
          totals={detailQuery.data?.totals}
          loading={detailQuery.isFetching}
          error={detailQuery.isError}
          onRetry={() => void detailQuery.refetch()}
          demo={source.kind === 'demo'}
          filters={applied}
          onClose={() => setActiveModel(null)}
        />
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
