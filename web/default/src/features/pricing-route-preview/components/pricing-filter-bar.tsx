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
import { RotateCcw } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { getLobeIcon } from '@/lib/lobe-icon'
import { cn } from '@/lib/utils'

export type BillingModeFilter = 'all' | 'ratio' | 'per_request' | 'expression'
export type PricingSort = 'default' | 'input_asc' | 'output_asc' | 'name'

export type RouteSlotOption = {
  value: string
  label: string
  icon?: string
  count: number
}

export type FilterSelectItem = {
  value: string
  label: string
}

const BILLING_MODE_KEYS: Array<{
  value: Exclude<BillingModeFilter, 'all'>
  labelKey: string
}> = [
  { value: 'ratio', labelKey: 'Ratio' },
  { value: 'per_request', labelKey: 'Per request' },
  { value: 'expression', labelKey: 'Expression' },
]

function RouteSlotChip(props: {
  slot: RouteSlotOption
  active: boolean
  onToggle: (value: string) => void
}) {
  return (
    <button
      type='button'
      aria-pressed={props.active}
      onClick={() => props.onToggle(props.slot.value)}
      className={cn(
        'flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-xs transition-colors',
        props.active
          ? 'border-primary/60 bg-primary/10 text-foreground font-medium'
          : 'text-muted-foreground hover:border-foreground/25 hover:text-foreground'
      )}
    >
      {props.slot.icon && (
        <span className='flex shrink-0 items-center' aria-hidden='true'>
          {getLobeIcon(props.slot.icon, 14)}
        </span>
      )}
      <span className='max-w-40 truncate'>{props.slot.label}</span>
      <span
        className={cn(
          'tabular-nums',
          props.active ? 'text-foreground/70' : 'text-muted-foreground/60'
        )}
      >
        {props.slot.count}
      </span>
    </button>
  )
}

export function PricingFilterBar(props: {
  slots: RouteSlotOption[]
  selectedSlots: string[]
  onSlotsChange: (slots: string[]) => void
  routeItems: FilterSelectItem[]
  routeLine: string
  onRouteLineChange: (routeLine: string) => void
  billingMode: BillingModeFilter
  onBillingModeChange: (mode: BillingModeFilter) => void
  sortItems: FilterSelectItem[]
  sortBy: PricingSort
  onSortChange: (sort: PricingSort) => void
  shownCount: number
  totalCount: number
  hasActiveFilters: boolean
  onClearFilters: () => void
}) {
  const { t } = useTranslation()

  const toggleSlot = (value: string) => {
    if (props.selectedSlots.includes(value)) {
      props.onSlotsChange(props.selectedSlots.filter((slot) => slot !== value))
      return
    }
    props.onSlotsChange([...props.selectedSlots, value])
  }

  return (
    <div className='bg-card/95 supports-[backdrop-filter]:bg-card/80 sticky top-16 z-30 flex flex-col gap-2.5 rounded-xl border p-3 shadow-sm backdrop-blur'>
      {props.slots.length > 0 && (
        <div
          className='hover-scrollbar -mb-0.5 flex items-center gap-1.5 overflow-x-auto pb-0.5'
          role='group'
          aria-label={t('Route slots')}
        >
          {props.slots.map((slot) => (
            <RouteSlotChip
              key={slot.value}
              slot={slot}
              active={props.selectedSlots.includes(slot.value)}
              onToggle={toggleSlot}
            />
          ))}
        </div>
      )}

      <div className='flex flex-wrap items-center gap-2'>
        <Select
          items={props.routeItems}
          value={props.routeLine}
          onValueChange={(value) => {
            if (value != null) props.onRouteLineChange(value)
          }}
        >
          <SelectTrigger
            className='w-auto max-w-full min-w-36'
            aria-label={t('Route lines')}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {props.routeItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>

        <ToggleGroup
          value={props.billingMode === 'all' ? [] : [props.billingMode]}
          onValueChange={(groupValue) => {
            const next = groupValue[0] as BillingModeFilter | undefined
            props.onBillingModeChange(next ?? 'all')
          }}
          variant='outline'
          size='sm'
          spacing={0}
          aria-label={t('Billing mode')}
        >
          {BILLING_MODE_KEYS.map((mode) => (
            <ToggleGroupItem key={mode.value} value={mode.value}>
              {t(mode.labelKey)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        <Select
          items={props.sortItems}
          value={props.sortBy}
          onValueChange={(value) => {
            if (value != null) props.onSortChange(value as PricingSort)
          }}
        >
          <SelectTrigger
            className='w-auto max-w-full min-w-36'
            aria-label={t('Sort')}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {props.sortItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>

        <div className='ms-auto flex items-center gap-2'>
          <span className='text-muted-foreground text-xs whitespace-nowrap tabular-nums'>
            {t('Showing {{shown}} of {{total}} models', {
              shown: props.shownCount,
              total: props.totalCount,
            })}
          </span>
          {props.hasActiveFilters && (
            <Button
              variant='ghost'
              size='sm'
              onClick={props.onClearFilters}
              className='gap-1.5'
            >
              <RotateCcw className='size-3.5' />
              {t('Reset filters')}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
