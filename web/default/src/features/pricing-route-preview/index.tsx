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
import {
  Boxes,
  Gauge,
  Layers3,
  Route as RouteIcon,
  Search,
  ShieldCheck,
} from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { PublicLayout } from '@/components/layout'
import { PageTransition } from '@/components/page-transition'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import { getRoutePricing } from './api'
import {
  ModelRouteListRow,
  RoutePricingDetailsDrawer,
} from './components/model-route-list'
import type {
  RoutePricingCategory,
  RoutePricingData,
  RoutePricingModel,
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

const LOADING_CARD_IDS = ['loading-1', 'loading-2', 'loading-3', 'loading-4']

function formatRatio(value?: number | null) {
  if (value == null) return '-'
  return `${value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}x`
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
      .filter(
        (ratio): ratio is number => typeof ratio === 'number' && ratio > 0
      )
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
    <div className='flex flex-col gap-2'>
      {LOADING_CARD_IDS.map((id) => (
        <div
          key={id}
          className='bg-muted/40 h-24 animate-pulse rounded-lg border'
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
    <div className='bg-card rounded-lg border p-4'>
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
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null)
  const routePricingQuery = useQuery({
    queryKey: ['route-pricing'],
    queryFn: getRoutePricing,
    staleTime: 5 * 60 * 1000,
  })
  const routePricingData = routePricingQuery.data ?? EMPTY_ROUTE_PRICING
  const routePricingModels = routePricingData.models
  const modelsById = useMemo(
    () => new Map(routePricingModels.map((model) => [model.id, model])),
    [routePricingModels]
  )

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
  const routeGroupSelectItems = useMemo(
    () =>
      routeGroupOptions.map((option) => ({
        value: option.value,
        label: getOptionLabel(option, t),
      })),
    [routeGroupOptions, t]
  )
  const routeLineSelectItems = useMemo(
    () =>
      routeLineOptions.map((option) => ({
        value: option.value,
        label: getOptionLabel(option, t),
      })),
    [routeLineOptions, t]
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
  const selectedModel = selectedModelId
    ? modelsById.get(selectedModelId)
    : null
  const hasRouteFilters = routeGroup !== 'all' || routeLine !== 'all'

  const clearFilters = () => {
    setSearch('')
    setRouteGroup('all')
    setRouteLine('all')
  }

  const errorMessage =
    routePricingQuery.error instanceof Error
      ? routePricingQuery.error.message
      : t('Request failed')

  let pricingContent: ReactNode
  if (routePricingQuery.isLoading) {
    pricingContent = <LoadingCards />
  } else if (routePricingQuery.isError) {
    pricingContent = (
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
    )
  } else if (filteredModels.length > 0) {
    pricingContent = (
      <div className='flex flex-col gap-2'>
        {filteredModels.map((filteredModel) => {
          const model = modelsById.get(filteredModel.id) ?? filteredModel
          return (
            <ModelRouteListRow
              key={model.id}
              model={model}
              onOpen={() => setSelectedModelId(model.id)}
            />
          )
        })}
      </div>
    )
  } else {
    pricingContent = (
      <div className='flex min-h-72 flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center'>
        <Layers3 className='text-muted-foreground mb-3 size-10' />
        <h3 className='text-base font-semibold'>{t('No matching routes')}</h3>
        <p className='text-muted-foreground mt-2 max-w-sm text-sm'>
          {t(
            'Try clearing search terms or switching the model category filter.'
          )}
        </p>
        <Button
          variant='outline'
          size='sm'
          onClick={clearFilters}
          className='mt-4'
        >
          {t('Clear all filters')}
        </Button>
      </div>
    )
  }

  return (
    <PublicLayout showMainContainer={false}>
      <PageTransition className='mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-3 pt-20 pb-8 sm:px-6 sm:pt-24 xl:px-8'>
        <header className='flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between'>
          <div className='max-w-3xl'>
            <Badge variant='secondary' className='mb-3'>
              {t('Route pricing')}
            </Badge>
            <h1 className='text-3xl leading-tight font-semibold sm:text-4xl'>
              {t('Model route pricing')}
            </h1>
            <p className='text-muted-foreground mt-3 max-w-2xl text-sm leading-relaxed sm:text-base'>
              {t(
                'Compare the same model across routes, billing modes, and effective prices.'
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
            hint={t('Pick a model first, then compare its available routes.')}
          />
          <SummaryMetric
            icon={<RouteIcon className='size-4' />}
            label={t('Route choices')}
            value={String(routePricingData.total_routes)}
            hint={t(
              'Some models offer more than one route for different needs.'
            )}
          />
          <SummaryMetric
            icon={<Gauge className='size-4' />}
            label={t('Lowest ratio')}
            value={getLowestRatio(routePricingModels)}
            hint={t(
              'Lower multipliers usually mean lower estimated route prices.'
            )}
          />
          <SummaryMetric
            icon={<ShieldCheck className='size-4' />}
            label={t('Per-request rules')}
            value={String(routePricingData.per_request_routes)}
            hint={t(
              'Per-request routes show the price for each request directly.'
            )}
          />
        </div>

        <section className='flex min-w-0 flex-col gap-3'>
          <div className='bg-card flex flex-wrap items-center gap-2 rounded-lg border p-3'>
            <Select
              items={routeGroupSelectItems}
              value={routeGroup}
              onValueChange={(value) => {
                if (value == null) return
                setRouteGroup(value)
                setRouteLine('all')
              }}
            >
              <SelectTrigger className='max-w-full sm:w-64'>
                <span className='text-muted-foreground shrink-0 text-xs'>
                  {t('Model categories')}
                </span>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {routeGroupSelectItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>

            <Select
              items={routeLineSelectItems}
              value={routeLine}
              onValueChange={(value) => {
                if (value != null) setRouteLine(value)
              }}
            >
              <SelectTrigger className='max-w-full sm:w-64'>
                <span className='text-muted-foreground shrink-0 text-xs'>
                  {t('Routes in category')}
                </span>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {routeLineSelectItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>

            {hasRouteFilters && (
              <Button variant='ghost' size='sm' onClick={clearFilters}>
                {t('Reset filters')}
              </Button>
            )}
          </div>

          <main className='flex min-w-0 flex-col gap-4'>{pricingContent}</main>
        </section>
      </PageTransition>
      {selectedModel && (
        <RoutePricingDetailsDrawer
          model={selectedModel}
          open
          onOpenChange={(open) => {
            if (!open) setSelectedModelId(null)
          }}
        />
      )}
    </PublicLayout>
  )
}
