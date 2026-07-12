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
import { ChevronDown, Tag as TagIcon } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { StaticDataTable } from '@/components/data-table'
import { Badge } from '@/components/ui/badge'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import { useSystemConfigStore } from '@/stores/system-config-store'

import {
  BILLING_PRICING_VARS,
  MATCH_CONTAINS,
  MATCH_EQ,
  MATCH_EXISTS,
  MATCH_GTE,
  MATCH_LT,
  MATCH_RANGE,
  SOURCE_TIME,
  normalizeTierLabel,
  parseTiersFromExpr,
  splitBillingExprAndRequestRules,
  tryParseRequestRuleExpr,
  type BillingVar,
  type ParsedTier,
  type RequestCondition,
  type RequestRuleGroup,
} from '../lib/billing-expr'
import { formatDynamicTierConditionSummary } from '../lib/dynamic-price'

type DynamicPricingBreakdownProps = {
  billingExpr: string | null | undefined
  /** Label of the tier that fired for the current request. */
  matchedTierLabel?: string | null
  /** Hide cache-pricing columns when the request did not use cache tokens. */
  hideCacheColumns?: boolean
  /** Apply an additional display-only multiplier, such as a route ratio. */
  priceMultiplier?: number
  /** Hide the component title when embedded in another pricing panel. */
  showHeader?: boolean
  /** Collapse the detailed table behind a compact pricing summary. */
  collapsible?: boolean
}

type TieredPricingTableProps = {
  tiers: ParsedTier[]
  visiblePriceFields: BillingVar[]
  matchedTierLabel?: string | null
  normalizedMatchedTierLabel: string
  priceMultiplier: number
  symbol: string
  rate: number
  t: (key: string) => string
}

const TIME_FUNC_LABELS: Record<string, string> = {
  hour: 'Hour',
  minute: 'Minute',
  weekday: 'Weekday',
  month: 'Month',
  day: 'Day',
}

function describeCondition(
  cond: RequestCondition,
  t: (key: string) => string
): string {
  if (cond.source === SOURCE_TIME) {
    const fn = t(TIME_FUNC_LABELS[cond.timeFunc] || cond.timeFunc)
    const tz = cond.timezone || 'UTC'
    if (cond.mode === MATCH_RANGE) {
      return `${fn} ${cond.rangeStart}:00~${cond.rangeEnd}:00 (${tz})`
    }
    const opMap: Record<string, string> = {
      [MATCH_EQ]: '=',
      [MATCH_GTE]: '≥',
      [MATCH_LT]: '<',
    }
    return `${fn} ${opMap[cond.mode] || '='} ${cond.value} (${tz})`
  }
  const src = cond.source === 'header' ? t('Header') : t('Body param')
  const path = cond.path || ''
  if (cond.mode === MATCH_EXISTS) return `${src} ${path} ${t('Exists')}`
  if (cond.mode === MATCH_CONTAINS) {
    return `${src} ${path} ${t('Contains')} "${cond.value}"`
  }
  const opMap: Record<string, string> = {
    eq: '=',
    gt: '>',
    gte: '≥',
    lt: '<',
    lte: '≤',
  }
  return `${src} ${path} ${opMap[cond.mode] || '='} ${cond.value}`
}

function describeGroup(
  group: RequestRuleGroup,
  t: (key: string) => string
): string {
  return (group.conditions || [])
    .map((condition) => describeCondition(condition, t))
    .join(' && ')
}

function TieredPricingTable(props: TieredPricingTableProps) {
  return (
    <div>
      <div className='text-foreground mb-2 text-sm font-semibold'>
        {props.t('Tiered price table')}
      </div>
      <div className='flex flex-col gap-1.5 sm:hidden'>
        {props.tiers.map((tier) => {
          const conditionSummary = formatDynamicTierConditionSummary(
            tier.conditions,
            props.t
          )
          const isMatched =
            props.matchedTierLabel != null &&
            props.matchedTierLabel !== '' &&
            tier.label === props.matchedTierLabel
          return (
            <div
              key={`tier-mobile-${tier.label}`}
              className={cn(
                'rounded-md border p-2',
                isMatched && 'border-emerald-500/40 bg-emerald-500/10'
              )}
            >
              <div className='mb-1.5 flex flex-wrap items-center gap-1.5'>
                <Badge
                  variant='secondary'
                  className='bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300'
                >
                  {tier.label || props.t('Default')}
                </Badge>
                {isMatched && (
                  <Badge
                    variant='secondary'
                    className='bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
                  >
                    {props.t('Matched')}
                  </Badge>
                )}
              </div>
              {conditionSummary && (
                <div className='text-muted-foreground mb-1.5 text-xs'>
                  {conditionSummary}
                </div>
              )}
              <div className='grid grid-cols-2 gap-x-3 gap-y-1.5'>
                {props.visiblePriceFields.map((field) => {
                  const value = Number(
                    tier[field.field as keyof ParsedTier] || 0
                  )
                  return (
                    <div key={field.field} className='min-w-0'>
                      <div className='text-muted-foreground truncate text-[10px] font-medium tracking-wider uppercase'>
                        {props.t(field.shortLabel)}
                      </div>
                      <div className='truncate font-mono text-sm font-semibold'>
                        {value > 0
                          ? `${props.symbol}${(value * props.priceMultiplier * props.rate).toFixed(4)}`
                          : '-'}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
      <StaticDataTable
        className='hidden rounded-none border-0 sm:block'
        tableClassName='text-sm'
        headerRowClassName='hover:bg-transparent'
        data={props.tiers}
        getRowKey={(_tier, index) => `tier-${index}`}
        getRowClassName={(tier) => {
          const isMatched =
            props.normalizedMatchedTierLabel !== '' &&
            normalizeTierLabel(tier.label) === props.normalizedMatchedTierLabel
          return cn(
            isMatched &&
              'bg-emerald-50/70 hover:bg-emerald-50/70 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/10'
          )
        }}
        columns={[
          {
            id: 'tier',
            header: props.t('Tier'),
            className: 'text-muted-foreground py-2 font-medium',
            cellClassName: 'py-2.5 align-top',
            cell: (tier) => {
              const conditionSummary = formatDynamicTierConditionSummary(
                tier.conditions,
                props.t
              )
              const isMatched =
                props.normalizedMatchedTierLabel !== '' &&
                normalizeTierLabel(tier.label) ===
                  props.normalizedMatchedTierLabel
              return (
                <>
                  <div className='flex flex-wrap items-center gap-1.5'>
                    <Badge
                      variant='secondary'
                      className='bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300'
                    >
                      {tier.label || props.t('Default')}
                    </Badge>
                    {isMatched && (
                      <Badge
                        variant='secondary'
                        className='bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
                      >
                        {props.t('Matched')}
                      </Badge>
                    )}
                  </div>
                  {conditionSummary && (
                    <div className='text-muted-foreground mt-1 text-xs'>
                      {conditionSummary}
                    </div>
                  )}
                </>
              )
            },
          },
          ...props.visiblePriceFields.map((field) => ({
            id: field.field as string,
            header: props.t(field.shortLabel),
            className: 'text-muted-foreground py-2 text-right font-medium',
            cellClassName: 'py-2.5 text-right align-top font-mono',
            cell: (tier: ParsedTier) => {
              const value = Number(tier[field.field as keyof ParsedTier] || 0)
              return value > 0 ? (
                <span className='font-semibold'>
                  {`${props.symbol}${(value * props.priceMultiplier * props.rate).toFixed(4)}`}
                </span>
              ) : (
                '-'
              )
            },
          })),
        ]}
      />
    </div>
  )
}

function ConditionalMultipliers(props: {
  ruleGroups: RequestRuleGroup[]
  t: (key: string) => string
}) {
  if (props.ruleGroups.length === 0) return null

  return (
    <div>
      <div className='text-foreground mb-2 text-sm font-semibold'>
        {props.t('Conditional multipliers')}
      </div>
      <ul className='flex flex-col gap-1.5'>
        {props.ruleGroups.map((group) => (
          <li
            key={`group-${JSON.stringify(group)}`}
            className='bg-muted/50 flex items-center justify-between gap-3 rounded-md px-3 py-2'
          >
            <span className='text-foreground text-sm break-all'>
              {describeGroup(group, props.t)}
            </span>
            <Badge
              variant='secondary'
              className='shrink-0 bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300'
            >
              {group.multiplier}x
            </Badge>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function DynamicPricingBreakdown(props: DynamicPricingBreakdownProps) {
  const { t } = useTranslation()
  const expr = props.billingExpr || ''
  const currency = useSystemConfigStore((state) => state.config.currency)

  const { symbol, rate } = useMemo(() => {
    if (currency.quotaDisplayType === 'CNY') {
      return { symbol: '¥', rate: currency.usdExchangeRate || 7 }
    }
    if (currency.quotaDisplayType === 'CUSTOM') {
      return {
        symbol: currency.customCurrencySymbol || '$',
        rate: currency.customCurrencyExchangeRate || 1,
      }
    }
    return { symbol: '$', rate: 1 }
  }, [currency])

  const { tiers, ruleGroups } = useMemo(() => {
    const split = splitBillingExprAndRequestRules(expr)
    return {
      tiers: parseTiersFromExpr(split.billingExpr),
      ruleGroups: tryParseRequestRuleExpr(split.requestRuleExpr || '') || [],
    }
  }, [expr])

  if (!expr) return null

  if (tiers.length === 0) {
    return (
      <section className='min-w-0 py-4'>
        {props.showHeader !== false && (
          <div className='mb-3 flex items-center gap-2'>
            <span className='inline-flex size-6 items-center justify-center rounded-lg bg-amber-100 text-amber-700 shadow-sm dark:bg-amber-500/20 dark:text-amber-300'>
              <TagIcon className='size-3.5' />
            </span>
            <div>
              <div className='text-foreground text-base font-medium'>
                {t('Special billing expression')}
              </div>
              <div className='text-muted-foreground text-xs'>
                {t('Unable to parse structured pricing')}
              </div>
            </div>
          </div>
        )}
        <div className='text-muted-foreground mb-1 text-[10px] font-medium tracking-wider uppercase'>
          {t('Raw expression')}
        </div>
        <code className='text-muted-foreground block text-xs break-all'>
          {expr}
        </code>
      </section>
    )
  }

  const priceMultiplier =
    Number.isFinite(props.priceMultiplier) && (props.priceMultiplier ?? 0) >= 0
      ? (props.priceMultiplier ?? 1)
      : 1
  const visiblePriceFields = BILLING_PRICING_VARS.filter((field) => {
    if (props.hideCacheColumns && field.group === 'cache') return false
    return tiers.some(
      (tier) => Number(tier[field.field as keyof ParsedTier] || 0) > 0
    )
  })
  const primaryPriceFields = visiblePriceFields.filter((field) => field.isBase)
  const baseTier = tiers[0]
  const baseTierCondition = formatDynamicTierConditionSummary(
    baseTier.conditions,
    t
  )

  const detail = (
    <div className='flex flex-col gap-4'>
      <TieredPricingTable
        tiers={tiers}
        visiblePriceFields={visiblePriceFields}
        matchedTierLabel={props.matchedTierLabel}
        normalizedMatchedTierLabel={normalizeTierLabel(
          props.matchedTierLabel ?? undefined
        )}
        priceMultiplier={priceMultiplier}
        symbol={symbol}
        rate={rate}
        t={t}
      />
      <ConditionalMultipliers ruleGroups={ruleGroups} t={t} />
    </div>
  )

  const header =
    props.showHeader !== false ? (
      <div className='mb-3 flex items-start gap-2 sm:mb-4'>
        <span className='mt-0.5 inline-flex size-6 items-center justify-center rounded-lg bg-amber-100 text-amber-700 shadow-sm dark:bg-amber-500/20 dark:text-amber-300'>
          <TagIcon className='size-3.5' />
        </span>
        <div>
          <div className='text-foreground text-base font-medium'>
            {t('Dynamic Pricing')}
          </div>
          <div className='text-muted-foreground text-xs'>
            {t('Prices vary by usage tier and request conditions')}
          </div>
        </div>
      </div>
    ) : null

  if (!props.collapsible) {
    return (
      <section className='min-w-0 py-3 sm:py-4'>
        {header}
        {detail}
      </section>
    )
  }

  return (
    <section className='min-w-0 py-3 sm:py-4'>
      {header}
      <Collapsible className='rounded-lg border'>
        <div className='flex flex-col gap-3 p-3'>
          <div className='flex flex-wrap items-center gap-1.5'>
            <Badge variant='secondary'>{baseTier.label || t('Default')}</Badge>
            <span className='text-muted-foreground text-xs'>
              {t('{{count}} tiers', { count: tiers.length })}
            </span>
          {baseTierCondition && (
            <span className='text-muted-foreground text-xs'>
              {baseTierCondition}
            </span>
          )}
          </div>
          {props.showHeader === false && primaryPriceFields.length > 0 && (
            <div className='grid grid-cols-2 gap-2'>
              {primaryPriceFields.map((field) => {
                const value = Number(
                  baseTier[field.field as keyof ParsedTier] || 0
                )
                return (
                  <div key={field.field} className='bg-muted/40 rounded-md px-3 py-2'>
                    <div className='text-muted-foreground text-xs'>
                      {t(field.shortLabel)}
                    </div>
                    <div className='text-foreground mt-1 font-mono text-sm font-semibold tabular-nums'>
                      {`${symbol}${(value * priceMultiplier * rate).toFixed(4)}`}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
        <CollapsibleTrigger className='group flex w-full items-center justify-between border-t px-3 py-2 text-left text-sm font-medium'>
          <span>{t('View full tiered price table')}</span>
          <ChevronDown className='text-muted-foreground size-4 transition-transform group-data-[panel-open]:rotate-180' />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className='p-3'>{detail}</div>
        </CollapsibleContent>
      </Collapsible>
    </section>
  )
}
