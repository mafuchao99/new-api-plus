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
import {
  CalendarDays,
  RotateCcw,
  Search,
  SlidersHorizontal,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import { presetFilters } from '../lib/summary'
import type {
  ConsumptionFilters,
  DatePreset,
  ConsumptionDataSource,
} from '../types'
import { UserFilter } from './user-filter'

const PRESETS: { value: DatePreset; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'dayBeforeYesterday', label: 'The day before yesterday' },
  { value: 'thisWeek', label: 'This week' },
  { value: 'lastWeek', label: 'Last week' },
  { value: 'last7', label: 'Last 7 days' },
  { value: 'last30', label: 'Last 30 days' },
  { value: 'month', label: 'This month' },
  { value: 'lastMonth', label: 'Last month' },
  { value: 'last3Months', label: 'Last 3 months' },
]

type SummaryFiltersProps = {
  today: Date
  source: ConsumptionDataSource
  value: ConsumptionFilters
  onChange: (filters: ConsumptionFilters) => void
  onApply: () => void
  onReset: () => void
  error: string
  loading: boolean
}

export function SummaryFilters(props: SummaryFiltersProps) {
  const { t } = useTranslation()
  return (
    <form
      className='bg-card rounded-xl border'
      onSubmit={(event) => {
        event.preventDefault()
        props.onApply()
      }}
    >
      <div className='flex flex-wrap items-center gap-2 border-b px-4 py-3'>
        <SlidersHorizontal
          className='text-muted-foreground mr-1 size-4'
          aria-hidden='true'
        />
        <span className='mr-3 text-sm font-medium'>{t('Date range')}</span>
        {PRESETS.map((preset) => {
          const range = presetFilters(preset.value, props.today)
          const selected =
            range.startDate === props.value.startDate &&
            range.endDate === props.value.endDate
          return (
            <Button
              key={preset.value}
              type='button'
              size='sm'
              variant={selected ? 'secondary' : 'ghost'}
              aria-pressed={selected}
              onClick={() =>
                props.onChange({
                  ...props.value,
                  startDate: range.startDate,
                  endDate: range.endDate,
                })
              }
              className='h-7 text-xs'
            >
              {t(preset.label)}
            </Button>
          )
        })}
      </div>
      <div className='grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-[minmax(280px,1.5fr)_minmax(160px,1fr)_minmax(180px,1fr)_auto]'>
        <fieldset className='min-w-0 space-y-2'>
          <legend className='text-muted-foreground text-xs font-medium'>
            {t('Custom date range')}
          </legend>
          <div className='flex items-center gap-2'>
            <CalendarDays
              className='text-muted-foreground hidden size-4 shrink-0 sm:block'
              aria-hidden='true'
            />
            <Input
              type='date'
              className='min-w-0 flex-1 [color-scheme:light] dark:[color-scheme:dark]'
              aria-label={t('Start date')}
              aria-invalid={!!props.error}
              aria-describedby={
                props.error ? 'consumption-date-error' : undefined
              }
              value={props.value.startDate}
              onChange={(event) =>
                props.onChange({
                  ...props.value,
                  startDate: event.target.value,
                })
              }
            />
            <span className='text-muted-foreground' aria-hidden='true'>
              –
            </span>
            <Input
              type='date'
              className='min-w-0 flex-1 [color-scheme:light] dark:[color-scheme:dark]'
              aria-label={t('End date')}
              aria-invalid={!!props.error}
              aria-describedby={
                props.error ? 'consumption-date-error' : undefined
              }
              value={props.value.endDate}
              onChange={(event) =>
                props.onChange({ ...props.value, endDate: event.target.value })
              }
            />
          </div>
        </fieldset>
        <div className='space-y-2'>
          <Label
            htmlFor='consumption-user'
            className='text-muted-foreground text-xs'
          >
            {t('User')}
          </Label>
          <UserFilter
            source={props.source}
            value={props.value.userId}
            onChange={(userId) => props.onChange({ ...props.value, userId })}
          />
        </div>
        <div className='space-y-2'>
          <Label
            htmlFor='consumption-model'
            className='text-muted-foreground text-xs'
          >
            {t('Model')}
          </Label>
          <Input
            id='consumption-model'
            placeholder={t('Search model name')}
            value={props.value.model}
            onChange={(event) =>
              props.onChange({ ...props.value, model: event.target.value })
            }
          />
        </div>
        <div className='flex items-end gap-2'>
          <Button
            type='submit'
            disabled={props.loading}
            className='flex-1 sm:flex-none'
          >
            <Search className='size-4' aria-hidden='true' />
            {t('Query')}
          </Button>
          <Button
            type='button'
            variant='outline'
            onClick={props.onReset}
            disabled={props.loading}
          >
            <RotateCcw className='size-4' aria-hidden='true' />
            {t('Reset')}
          </Button>
        </div>
      </div>
      {props.error && (
        <p
          id='consumption-date-error'
          role='alert'
          className='text-destructive px-4 pb-3 text-sm'
        >
          {props.error}
        </p>
      )}
    </form>
  )
}
