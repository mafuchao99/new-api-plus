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
import { ChevronRight } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { sideDrawerContentClassName } from '@/components/drawer-layout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  formatDynamicTierConditionSummary,
} from '@/features/pricing/lib/dynamic-price'
import {
  parseTiersFromExpr,
  splitBillingExprAndRequestRules,
} from '@/features/pricing/lib/billing-expr'

import type { RoutePricingModel, RoutePricingPriceItem } from '../types'
import {
  formatPriceItemValue,
  OfficialPricePanel,
  RouteLineRow,
} from './route-price-display'

function formatRatio(value?: number | null) {
  if (value == null) return '-'
  return `${value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}x`
}

function getLowestModelRatio(model: RoutePricingModel) {
  const ratios = model.lines
    .map((line) => line.ratio)
    .filter((ratio): ratio is number => typeof ratio === 'number' && ratio > 0)
  if (ratios.length === 0) return '-'
  return formatRatio(Math.min(...ratios))
}

function getBasePriceItems(model: RoutePricingModel) {
  return model.official_price_items.filter(
    (item) => item.type === 'input' || item.type === 'output'
  )
}

function ModelBasePrice(props: { model: RoutePricingModel }) {
  const { t } = useTranslation()
  const dynamicSummary = useMemo(() => {
    if (!props.model.billing_expr) return null
    const split = splitBillingExprAndRequestRules(props.model.billing_expr)
    const tiers = parseTiersFromExpr(split.billingExpr)
    const tier = tiers[0]
    if (!tier) return null

    return {
      tier,
      tierCount: tiers.length,
      items: [
        {
          type: 'input',
          label_key: 'Input',
          amount: Number(tier.inputPrice || 0),
          unit: '1M',
        },
        {
          type: 'output',
          label_key: 'Output',
          amount: Number(tier.outputPrice || 0),
          unit: '1M',
        },
      ].filter((item) => item.amount > 0),
    }
  }, [props.model.billing_expr])

  const fixedItems = getBasePriceItems(props.model)
  const priceItems: RoutePricingPriceItem[] = dynamicSummary
    ? dynamicSummary.items
    : fixedItems.length > 0
      ? fixedItems
      : props.model.official_price_items.slice(0, 1)

  return (
    <div className='flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1'>
      {priceItems.map((item) => (
        <span key={item.type} className='text-muted-foreground text-xs'>
          {t(item.label_key)}{' '}
          <span className='text-foreground font-mono font-semibold tabular-nums'>
            {formatPriceItemValue(item, t)}
          </span>
        </span>
      ))}
      {dynamicSummary && (
        <>
          <Badge variant='secondary'>
            {dynamicSummary.tier.label || t('Default')}
          </Badge>
          <span className='text-muted-foreground text-xs'>
            {t('{{count}} tiers', { count: dynamicSummary.tierCount })}
          </span>
          {dynamicSummary.tier.conditions.length > 0 && (
            <span className='text-muted-foreground truncate text-xs'>
              {formatDynamicTierConditionSummary(
                dynamicSummary.tier.conditions,
                t
              )}
            </span>
          )}
        </>
      )}
    </div>
  )
}

export function ModelRouteListRow(props: {
  model: RoutePricingModel
  onOpen: () => void
}) {
  const { t } = useTranslation()

  return (
    <div className='group relative rounded-lg border transition-colors hover:bg-muted/30'>
      <button
        type='button'
        onClick={props.onOpen}
        aria-label={`${t('Model details')}: ${props.model.id}`}
        className='absolute inset-0 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
      />
      <div className='pointer-events-none relative grid gap-3 p-3 sm:grid-cols-[minmax(220px,1fr)_minmax(280px,1.25fr)_auto] sm:items-center sm:px-4'>
        <div className='min-w-0'>
          <div className='flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1'>
            <div className='truncate font-mono text-sm font-semibold'>
              {props.model.id}
            </div>
            {props.model.vendor && (
              <span className='text-muted-foreground text-sm'>
                {props.model.vendor}
              </span>
            )}
          </div>
          {props.model.description && (
            <p className='text-muted-foreground mt-1 truncate text-xs'>
              {props.model.description}
            </p>
          )}
        </div>

        <div className='flex min-w-0 flex-col gap-1'>
          <ModelBasePrice model={props.model} />
          <p className='text-muted-foreground/70 text-[11px] leading-tight'>
            {t('Official base price')} ·{' '}
            {t('Actual route prices are shown in details.')}
          </p>
        </div>

        <div className='flex items-center gap-3 sm:justify-end'>
          <div className='text-muted-foreground text-right text-xs'>
            <div>{t('Lowest ratio')}</div>
            <div className='text-foreground mt-0.5 font-mono font-semibold tabular-nums'>
              {getLowestModelRatio(props.model)}
            </div>
          </div>
          <div className='text-muted-foreground text-right text-xs'>
            <div>{t('Available routes')}</div>
            <div className='text-foreground mt-0.5 font-mono font-semibold tabular-nums'>
              {props.model.lines.length}
            </div>
          </div>
          <Button
            type='button'
            variant='outline'
            size='sm'
            onClick={props.onOpen}
            className='pointer-events-auto gap-1.5'
          >
            {t('Details')}
            <ChevronRight className='size-3.5' />
          </Button>
        </div>
      </div>
    </div>
  )
}

export function RoutePricingDetailsDrawer(props: {
  model: RoutePricingModel
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()

  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent
        side='right'
        className={sideDrawerContentClassName('sm:max-w-2xl lg:max-w-3xl')}
      >
        <SheetHeader className='sr-only'>
          <SheetTitle>{props.model.id}</SheetTitle>
          <SheetDescription>{t('Model details')}</SheetDescription>
        </SheetHeader>
        <div className='flex-1 overflow-y-auto px-4 pt-11 pb-5 sm:px-6 sm:pt-12 sm:pb-6'>
          <div className='flex flex-col gap-5'>
            <header>
              <div className='flex flex-wrap items-baseline gap-x-2 gap-y-1'>
                <h2 className='font-mono text-xl font-bold tracking-tight'>
                  {props.model.id}
                </h2>
                {props.model.vendor && (
                  <span className='text-muted-foreground'>
                    {props.model.vendor}
                  </span>
                )}
              </div>
              {props.model.description && (
                <p className='text-muted-foreground mt-2 text-sm leading-relaxed'>
                  {props.model.description}
                </p>
              )}
            </header>

            <section>
              <OfficialPricePanel
                items={props.model.official_price_items}
                billingExpr={props.model.billing_expr}
              />
            </section>

            <section>
              <h3 className='text-muted-foreground mb-3 text-xs font-semibold tracking-wider uppercase'>
                {t('Available routes')}
              </h3>
              <div className='overflow-hidden rounded-lg border'>
                {props.model.lines.map((line) => (
                  <RouteLineRow key={line.id} line={line} />
                ))}
              </div>
            </section>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
