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

import { Badge } from '@/components/ui/badge'
import { DynamicPricingBreakdown } from '@/features/pricing/components/dynamic-pricing-breakdown'
import { formatBillingCurrencyFromUSD } from '@/lib/currency'
import { cn } from '@/lib/utils'

import type {
  RoutePricingLine,
  RoutePricingPriceItem,
} from '../types'

function formatPriceAmount(value?: number | null) {
  return formatBillingCurrencyFromUSD(value, {
    digitsLarge: 2,
    digitsSmall: 6,
    abbreviate: false,
    minimumNonZero: 0.000001,
  })
}

export function formatPriceItemValue(
  item: RoutePricingPriceItem,
  translate: (key: string) => string
) {
  if (item.amount != null) {
    const unit = item.unit === 'request' ? translate('request') : item.unit
    return unit
      ? `${formatPriceAmount(item.amount)} / ${unit}`
      : formatPriceAmount(item.amount)
  }

  if (item.text) {
    return item.translate_text ? translate(item.text) : item.text
  }

  return '-'
}

function PriceBreakdown(props: {
  items: RoutePricingPriceItem[]
  align?: 'left' | 'right'
}) {
  const { t } = useTranslation()

  return (
    <div
      className={cn(
        'flex flex-wrap gap-1.5',
        props.align === 'right' && 'sm:justify-end'
      )}
    >
      {props.items.map((item) => (
        <div
          key={`${item.type}-${item.label_key}-${item.text || item.amount || 0}`}
          className='bg-muted/60 rounded-md px-2 py-1 text-[11px] leading-tight'
        >
          <span className='text-muted-foreground'>{t(item.label_key)}</span>
          <span className='ml-1 font-semibold tabular-nums'>
            {formatPriceItemValue(item, t)}
          </span>
        </div>
      ))}
    </div>
  )
}

export function OfficialPricePanel(props: {
  items: RoutePricingPriceItem[]
  billingExpr?: string
}) {
  const { t } = useTranslation()

  return (
    <div className='bg-muted/40 rounded-lg p-3'>
      <div className='mb-2'>
        <div className='text-muted-foreground text-xs font-medium'>
          {t('Official base price')}
        </div>
        <p className='text-muted-foreground/70 mt-1 text-[11px] leading-relaxed'>
          {t('Reference price before route multipliers are applied.')}
        </p>
      </div>
      {props.billingExpr ? (
        <DynamicPricingBreakdown
          billingExpr={props.billingExpr}
          showHeader={false}
        />
      ) : (
        <div
          className={cn(
            'grid gap-2',
            props.items.length === 1
              ? 'grid-cols-1'
              : 'grid-cols-2 sm:grid-cols-4'
          )}
        >
          {props.items.map((item) => (
            <div
              key={`${item.type}-${item.label_key}-${item.text || item.amount || 0}`}
              className='bg-background/70 rounded-md px-3 py-2'
            >
              <div className='text-muted-foreground text-xs'>
                {t(item.label_key)}
              </div>
              <div className='mt-1 text-sm font-semibold tabular-nums'>
                {formatPriceItemValue(item, t)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function formatRatio(value?: number | null) {
  if (value == null) return '-'
  return `${value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}x`
}

function getBillingModeLabelKey(mode: RoutePricingLine['billing_mode']) {
  if (mode === 'per_request') return 'Per request'
  if (mode === 'expression') return 'Expression'
  return 'Ratio'
}

export function RouteLineRow(props: { line: RoutePricingLine }) {
  const { t } = useTranslation()
  const ratioLabel =
    props.line.billing_mode === 'ratio' ? formatRatio(props.line.ratio) : null
  const billingLabel = ratioLabel
    ? `${t('Route multiplier')} ${ratioLabel}`
    : t(getBillingModeLabelKey(props.line.billing_mode))
  const routePriceHint = ratioLabel
    ? t('Route price = official base price x route multiplier.')
    : t('Charged according to this route rule.')
  const hasExpressionBreakdown = Boolean(props.line.billing_expr)

  return (
    <div className='border-t px-4 py-4 text-sm'>
      <div className='flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between'>
        <div className='min-w-0'>
          <div className='flex flex-wrap items-center gap-1.5'>
            <div className='font-medium'>{props.line.name}</div>
            {props.line.is_default && (
              <Badge variant='secondary'>{t('Default')}</Badge>
            )}
            {props.line.is_model_override && (
              <Badge variant='outline'>{t('Model override')}</Badge>
            )}
            <Badge
              variant={
                props.line.billing_mode === 'ratio' ? 'default' : 'secondary'
              }
              className='tabular-nums'
            >
              {billingLabel}
            </Badge>
          </div>
          {props.line.description && (
            <p className='text-muted-foreground mt-2 max-w-2xl text-xs leading-relaxed'>
              {props.line.description}
            </p>
          )}
        </div>

        <div className='rounded-md bg-muted/50 px-3 py-2 lg:min-w-[240px] lg:text-right'>
          <div className='text-muted-foreground mb-1 text-xs'>
            {t('Estimated route price')}
          </div>
          {hasExpressionBreakdown ? (
            <DynamicPricingBreakdown
              billingExpr={props.line.billing_expr}
              priceMultiplier={props.line.expression_multiplier ?? 1}
              showHeader={false}
            />
          ) : (
            <PriceBreakdown items={props.line.price_items} align='right' />
          )}
          <p className='text-muted-foreground/60 mt-1.5 text-[11px] leading-relaxed'>
            {routePriceHint}
          </p>
        </div>
      </div>
    </div>
  )
}
