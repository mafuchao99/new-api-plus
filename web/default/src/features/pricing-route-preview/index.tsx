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
import { useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Boxes,
  Gauge,
  Layers3,
  Route as RouteIcon,
  Search,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { formatBillingCurrencyFromUSD } from '@/lib/currency'
import { PageTransition } from '@/components/page-transition'
import { PublicLayout } from '@/components/layout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { getRoutePricing } from './api'
import type {
  RouteBillingMode,
  RoutePricingCategory,
  RoutePricingData,
  RoutePricingLine,
  RoutePricingModel,
  RoutePricingPriceItem,
} from './types'

type FilterOption = {
  value: string
  label?: string
  labelKey?: string
  count?: number
}

const EMPTY_ROUTE_PRICING: RoutePricingData = {
  categories: [],
  routes: [],
  models: [],
  total_routes: 0,
  per_request_routes: 0,
}

function formatRatio(value?: number | null) {
  if (value == null) return '-'
  return `${value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}x`
}

function getBillingModeLabelKey(mode: RouteBillingMode) {
  if (mode === 'per_request') return 'Per request'
  if (mode === 'expression') return 'Expression'
  return 'Ratio'
}

function formatPriceAmount(value?: number | null) {
  return formatBillingCurrencyFromUSD(value, {
    digitsLarge: 2,
    digitsSmall: 6,
    abbreviate: false,
    minimumNonZero: 0.000001,
  })
}

function formatPriceItemValue(
  item: RoutePricingPriceItem,
  translate: (key: string) => string
) {
  if (item.amount != null) {
    const unit = item.unit === 'request' ? translate('request') : item.unit
    return unit ? `${formatPriceAmount(item.amount)} / ${unit}` : formatPriceAmount(item.amount)
  }

  if (item.text) {
    return item.translate_text ? translate(item.text) : item.text
  }

  return '-'
}

function getOptionLabel(
  option: FilterOption,
  translate: (key: string) => string
) {
  if (option.labelKey) return translate(option.labelKey)
  return option.label || option.value
}

function getCategoryLabel(
  category: RoutePricingCategory,
  translate: (key: string) => string
) {
  if (category.name_key) return translate(category.name_key)
  return category.name || category.code || category.id
}

function getRouteGroupOptions(
  data: RoutePricingData,
  translate: (key: string) => string
): FilterOption[] {
  const categories = data.categories
    .filter((category) => category.route_count > 0)
    .map((category) => ({
      value: category.id,
      label: getCategoryLabel(category, translate),
      count: category.route_count,
    }))

  return [
    {
      value: 'all',
      labelKey: 'All model categories',
      count: data.total_routes,
    },
    ...categories,
  ]
}

function getRouteLineOptions(
  data: RoutePricingData,
  selectedCategoryId: string
): FilterOption[] {
  const seenRouteIds = new Set<string>()
  const routes = data.routes
    .filter(
      (route) =>
        selectedCategoryId === 'all' || route.category_id === selectedCategoryId
    )
    .filter((route) => {
      if (seenRouteIds.has(route.id)) return false
      seenRouteIds.add(route.id)
      return true
    })
    .map((route) => ({
      value: route.id,
      label: route.name,
    }))

  return [{ value: 'all', labelKey: 'All routes in category' }, ...routes]
}

function getLowestRatio(models: RoutePricingModel[]) {
  const ratios = models.flatMap((model) =>
    model.lines
      .map((line) => line.ratio)
      .filter((ratio): ratio is number => typeof ratio === 'number' && ratio > 0)
  )
  if (ratios.length === 0) return '-'
  return formatRatio(Math.min(...ratios))
}

function buildCategoryLabelMap(
  categories: RoutePricingCategory[],
  translate: (key: string) => string
) {
  return new Map(
    categories.map((category) => [
      category.id,
      getCategoryLabel(category, translate),
    ])
  )
}

function LoadingCards() {
  return (
    <div className='grid gap-4 2xl:grid-cols-2'>
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={index}
          className='h-64 animate-pulse rounded-lg border bg-muted/40'
        />
      ))}
    </div>
  )
}

function SummaryMetric(props: {
  icon: ReactNode
  label: string
  value: string
  hint: string
}) {
  return (
    <div className='rounded-lg border bg-card p-4'>
      <div className='flex items-center gap-2'>
        <div className='bg-muted flex size-8 items-center justify-center rounded-md'>
          {props.icon}
        </div>
        <div className='min-w-0'>
          <div className='text-muted-foreground text-xs'>{props.label}</div>
          <div className='truncate text-lg font-semibold tabular-nums'>
            {props.value}
          </div>
        </div>
      </div>
      <p className='text-muted-foreground mt-3 text-xs leading-relaxed'>
        {props.hint}
      </p>
    </div>
  )
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
          className='rounded-md bg-muted/60 px-2 py-1 text-[11px] leading-tight'
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

function OfficialPricePanel(props: { items: RoutePricingPriceItem[] }) {
  const { t } = useTranslation()

  return (
    <div className='rounded-lg bg-muted/40 p-3'>
      <div className='text-muted-foreground mb-2 text-xs font-medium'>
        {t('Official price')}
      </div>
      <div
        className={cn(
          'grid gap-2',
          props.items.length === 1 ? 'grid-cols-1' : 'grid-cols-2 sm:grid-cols-4'
        )}
      >
        {props.items.map((item) => (
          <div
            key={`${item.type}-${item.label_key}-${item.text || item.amount || 0}`}
            className='rounded-md bg-background/70 px-3 py-2'
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
    </div>
  )
}

function RouteLineRow(props: {
  line: RoutePricingLine
}) {
  const { t } = useTranslation()
  const ratioLabel =
    props.line.billing_mode === 'ratio'
      ? formatRatio(props.line.ratio)
      : null
  const billingLabel = ratioLabel
    ? `${t('Ratio')} ${ratioLabel}`
    : t(getBillingModeLabelKey(props.line.billing_mode))

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
                props.line.billing_mode === 'ratio'
                  ? 'default'
                  : 'secondary'
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
          <div className='mb-1 text-xs text-muted-foreground'>
            {t('Route price')}
          </div>
          <PriceBreakdown
            items={props.line.price_items}
            align='right'
          />
        </div>
      </div>
    </div>
  )
}

function ModelRouteCard(props: { model: RoutePricingModel }) {
  return (
    <Card size='sm' className='rounded-lg'>
      <CardHeader>
        <div className='min-w-0'>
          <div className='flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1'>
            <CardTitle className='truncate text-base font-semibold tracking-normal'>
              {props.model.id}
            </CardTitle>
            {props.model.vendor && (
              <span className='text-muted-foreground text-sm'>
                {props.model.vendor}
              </span>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className='flex flex-col gap-3'>
        <OfficialPricePanel items={props.model.official_price_items} />
        <div className='overflow-hidden rounded-lg border'>
          {props.model.lines.map((line) => (
            <RouteLineRow
              key={line.id}
              line={line}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function getVisibleModels(
  models: RoutePricingModel[],
  categoryById: Map<string, string>,
  routeGroup: string,
  routeLine: string,
  search: string
) {
  const normalizedSearch = search.trim().toLowerCase()
  const filtered = models
    .map((model) => {
      const lines = model.lines.filter((line) => {
        const matchesRouteGroup =
          routeGroup === 'all' || line.category_id === routeGroup
        const matchesRouteLine = routeLine === 'all' || line.id === routeLine

        return matchesRouteGroup && matchesRouteLine
      })

      return { ...model, lines }
    })
    .filter((model) => model.lines.length > 0)
    .filter((model) => {
      if (!normalizedSearch) return true

      const searchable = [
        model.id,
        model.vendor,
        model.description,
        ...model.lines.map((line) => line.name),
        ...model.lines.map((line) => line.description),
        ...model.lines.map((line) => categoryById.get(line.category_id)),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return searchable.includes(normalizedSearch)
    })

  return filtered.sort((a, b) => {
    const aDefault = a.lines.some((line) => line.is_default) ? 0 : 1
    const bDefault = b.lines.some((line) => line.is_default) ? 0 : 1
    return aDefault - bDefault || a.id.localeCompare(b.id)
  })
}

export function PricingRoutePreview() {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [routeGroup, setRouteGroup] = useState('all')
  const [routeLine, setRouteLine] = useState('all')
  const routePricingQuery = useQuery({
    queryKey: ['route-pricing'],
    queryFn: getRoutePricing,
    staleTime: 5 * 60 * 1000,
  })
  const routePricingData = routePricingQuery.data ?? EMPTY_ROUTE_PRICING
  const routePricingModels = routePricingData.models

  const categoryById = useMemo(
    () => buildCategoryLabelMap(routePricingData.categories, t),
    [routePricingData.categories, t]
  )
  const routeGroupOptions = useMemo(
    () => getRouteGroupOptions(routePricingData, t),
    [routePricingData, t]
  )
  const routeLineOptions = useMemo(
    () => getRouteLineOptions(routePricingData, routeGroup),
    [routePricingData, routeGroup]
  )

  const filteredModels = useMemo(
    () =>
      getVisibleModels(
        routePricingModels,
        categoryById,
        routeGroup,
        routeLine,
        search
      ),
    [categoryById, routeGroup, routeLine, routePricingModels, search]
  )

  const clearFilters = () => {
    setSearch('')
    setRouteGroup('all')
    setRouteLine('all')
  }

  const errorMessage =
    routePricingQuery.error instanceof Error
      ? routePricingQuery.error.message
      : t('Request failed')

  return (
    <PublicLayout showMainContainer={false}>
      <PageTransition className='mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-3 pt-20 pb-8 sm:px-6 sm:pt-24 xl:px-8'>
        <header className='flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between'>
          <div className='max-w-3xl'>
            <Badge variant='secondary' className='mb-3'>
              {t('Route pricing')}
            </Badge>
            <h1 className='text-3xl leading-tight font-semibold sm:text-4xl'>
              {t('Model Square for route-based pricing')}
            </h1>
            <p className='text-muted-foreground mt-3 max-w-2xl text-sm leading-relaxed sm:text-base'>
              {t(
                'Compare the same model across stable, budget, default, and per-request routes before replacing the current model square.'
              )}
            </p>
          </div>

          <div className='flex w-full max-w-xl flex-col gap-3'>
            <div className='relative'>
              <Search className='text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2' />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className='h-10 pl-9'
                placeholder={t('Search model, provider, or route...')}
                aria-label={t('Search model routes')}
              />
            </div>
          </div>
        </header>

        <div className='grid gap-3 md:grid-cols-2 xl:grid-cols-4'>
          <SummaryMetric
            icon={<Boxes className='size-4' />}
            label={t('Visible models')}
            value={`${filteredModels.length} / ${routePricingModels.length}`}
            hint={t('Models are grouped first, then routes are shown under each model.')}
          />
          <SummaryMetric
            icon={<RouteIcon className='size-4' />}
            label={t('Route choices')}
            value={String(routePricingData.total_routes)}
            hint={t('One model can expose multiple user-facing route choices.')}
          />
          <SummaryMetric
            icon={<Gauge className='size-4' />}
            label={t('Lowest ratio')}
            value={getLowestRatio(routePricingModels)}
            hint={t('Ratio lines still show the effective route multiplier clearly.')}
          />
          <SummaryMetric
            icon={<ShieldCheck className='size-4' />}
            label={t('Per-request rules')}
            value={String(routePricingData.per_request_routes)}
            hint={t('Cheap channels can keep model-specific per-request pricing.')}
          />
        </div>

        <section className='grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]'>
          <aside className='flex flex-col gap-4 self-start rounded-lg border bg-card p-4 xl:sticky xl:top-20'>
            <div className='flex items-center gap-2'>
              <SlidersHorizontal className='size-4' />
              <h2 className='text-sm font-semibold'>
                {t('Browse by model category')}
              </h2>
            </div>

            <div className='flex flex-col gap-3'>
              <div className='text-muted-foreground text-xs font-medium'>
                {t('Model categories')}
              </div>
              <div className='grid gap-2'>
                {routeGroupOptions.map((option) => {
                  const isActive = routeGroup === option.value
                  return (
                    <button
                      key={option.value}
                      type='button'
                      onClick={() => {
                        setRouteGroup(option.value)
                        setRouteLine('all')
                      }}
                      className={cn(
                        'flex h-9 items-center justify-between rounded-md border px-3 text-sm transition-colors',
                        isActive
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-background hover:bg-muted/50'
                      )}
                    >
                      <span className='flex min-w-0 items-center gap-2'>
                        <RouteIcon className='size-4 shrink-0' />
                        <span className='truncate'>{getOptionLabel(option, t)}</span>
                      </span>
                      {option.count != null && (
                        <span className='ml-2 text-xs tabular-nums opacity-70'>
                          {option.count}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className='flex flex-col gap-3'>
              <div className='text-muted-foreground text-xs font-medium'>
                {t('Routes in category')}
              </div>
              <div className='grid gap-2'>
                {routeLineOptions.map((option) => {
                  const isActive = routeLine === option.value
                  return (
                    <button
                      key={option.value}
                      type='button'
                      onClick={() => setRouteLine(option.value)}
                      className={cn(
                        'flex min-h-9 items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors',
                        isActive
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-background hover:bg-muted/50'
                      )}
                    >
                      <span className='line-clamp-2'>
                        {getOptionLabel(option, t)}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            <Button variant='outline' size='sm' onClick={clearFilters}>
              {t('Reset filters')}
            </Button>
          </aside>

          <main className='flex min-w-0 flex-col gap-4'>
            {routePricingQuery.isLoading ? (
              <LoadingCards />
            ) : routePricingQuery.isError ? (
              <div className='flex min-h-72 flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center'>
                <Layers3 className='text-muted-foreground mb-3 size-10' />
                <h3 className='text-base font-semibold'>
                  {t('Unable to load route pricing')}
                </h3>
                <p className='text-muted-foreground mt-2 max-w-sm text-sm'>
                  {errorMessage}
                </p>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => routePricingQuery.refetch()}
                  className='mt-4'
                >
                  {t('Retry')}
                </Button>
              </div>
            ) : filteredModels.length > 0 ? (
              <div className='grid gap-4 2xl:grid-cols-2'>
                {filteredModels.map((model) => (
                  <ModelRouteCard
                    key={model.id}
                    model={model}
                  />
                ))}
              </div>
            ) : (
              <div className='flex min-h-72 flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center'>
                <Layers3 className='text-muted-foreground mb-3 size-10' />
                <h3 className='text-base font-semibold'>{t('No matching routes')}</h3>
                <p className='text-muted-foreground mt-2 max-w-sm text-sm'>
                  {t('Try clearing search terms or switching the model category filter.')}
                </p>
                <Button variant='outline' size='sm' onClick={clearFilters} className='mt-4'>
                  {t('Clear all filters')}
                </Button>
              </div>
            )}
          </main>
        </section>
      </PageTransition>
    </PublicLayout>
  )
}
