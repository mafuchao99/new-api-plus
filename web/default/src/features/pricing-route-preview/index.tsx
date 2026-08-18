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
import { Layers3, Search, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { PublicLayout } from '@/components/layout'
import { PageTransition } from '@/components/page-transition'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

import { getRoutePricing } from './api'
import { ModelRouteCard } from './components/model-route-card'
import {
  type BillingModeFilter,
  PricingFilterBar,
  type PricingSort,
  type RouteSlotOption,
} from './components/pricing-filter-bar'
import { RoutePricingDetailsDrawer } from './components/route-details-drawer'
import { getOfficialPriceItem } from './lib/model-route-utils'
import type { RoutePricingData, RoutePricingModel } from './types'

const EMPTY_ROUTE_PRICING: RoutePricingData = {
  categories: [],
  routes: [],
  models: [],
  total_routes: 0,
  per_request_routes: 0,
}

const LOADING_CARD_IDS = [
  'loading-1',
  'loading-2',
  'loading-3',
  'loading-4',
  'loading-5',
  'loading-6',
]

function getCategoryLabel(
  category: RoutePricingData['categories'][number],
  translate: (key: string) => string
) {
  if (category.name_key) return translate(category.name_key)
  return category.name || category.code || category.id
}

function getModelSearchText(
  model: RoutePricingModel,
  categoryById: Map<string, string>
) {
  return [
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
}

function sortModels(models: RoutePricingModel[], sortBy: PricingSort) {
  const sorted = [...models]
  if (sortBy === 'name') {
    sorted.sort((a, b) => a.id.localeCompare(b.id))
    return sorted
  }
  if (sortBy === 'input_asc' || sortBy === 'output_asc') {
    const priceType = sortBy === 'input_asc' ? 'input' : 'output'
    const getPrice = (model: RoutePricingModel) =>
      getOfficialPriceItem(model, priceType)?.amount ?? Number.MAX_VALUE
    sorted.sort((a, b) => getPrice(a) - getPrice(b) || a.id.localeCompare(b.id))
    return sorted
  }
  sorted.sort((a, b) => {
    const aDefault = a.lines.some((line) => line.is_default) ? 0 : 1
    const bDefault = b.lines.some((line) => line.is_default) ? 0 : 1
    return aDefault - bDefault || a.id.localeCompare(b.id)
  })
  return sorted
}

function LoadingCards() {
  return (
    <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-3'>
      {LOADING_CARD_IDS.map((id) => (
        <div
          key={id}
          className='bg-muted/40 h-44 animate-pulse rounded-xl border'
        />
      ))}
    </div>
  )
}

export function PricingRoutePreview() {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [selectedSlots, setSelectedSlots] = useState<string[]>([])
  const [routeLine, setRouteLine] = useState('all')
  const [billingMode, setBillingMode] = useState<BillingModeFilter>('all')
  const [sortBy, setSortBy] = useState<PricingSort>('default')
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null)

  const routePricingQuery = useQuery({
    queryKey: ['route-pricing'],
    queryFn: getRoutePricing,
    staleTime: 5 * 60 * 1000,
  })
  const routePricingData = routePricingQuery.data ?? EMPTY_ROUTE_PRICING
  const models = routePricingData.models

  const modelsById = useMemo(
    () => new Map(models.map((model) => [model.id, model])),
    [models]
  )
  const categoryById = useMemo(
    () =>
      new Map(
        routePricingData.categories.map((item) => [
          item.id,
          getCategoryLabel(item, t),
        ])
      ),
    [routePricingData.categories, t]
  )

  const vendorCount = useMemo(() => {
    const vendors = new Set<string>()
    for (const model of models) {
      const vendor = model.vendor?.trim()
      if (vendor) vendors.add(vendor)
    }
    return vendors.size
  }, [models])

  const slotOptions = useMemo<RouteSlotOption[]>(() => {
    return routePricingData.categories
      .filter((item) => item.route_count > 0)
      .map((item) => ({
        value: item.id,
        label: getCategoryLabel(item, t),
        icon: item.icon,
        count: models.filter((model) =>
          model.lines.some((line) => line.category_id === item.id)
        ).length,
      }))
      .filter((item) => item.count > 0)
  }, [models, routePricingData.categories, t])

  const routeItems = useMemo(() => {
    const items = routePricingData.routes
      .filter(
        (item) =>
          selectedSlots.length === 0 || selectedSlots.includes(item.category_id)
      )
      .map((item) => ({ value: item.id, label: item.name }))
    return [{ value: 'all', label: t('All routes') }, ...items]
  }, [routePricingData.routes, selectedSlots, t])

  const sortItems = useMemo(
    () => [
      { value: 'default', label: t('Default order') },
      { value: 'input_asc', label: t('Input price: low to high') },
      { value: 'output_asc', label: t('Output price: low to high') },
      { value: 'name', label: t('Model name A-Z') },
    ],
    [t]
  )

  const filteredModels = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()
    const filtered = models.filter((model) => {
      const hasMatchingLine = model.lines.some((line) => {
        const matchesSlot =
          selectedSlots.length === 0 || selectedSlots.includes(line.category_id)
        const matchesRoute = routeLine === 'all' || line.id === routeLine
        const matchesBillingMode =
          billingMode === 'all' || line.billing_mode === billingMode
        return matchesSlot && matchesRoute && matchesBillingMode
      })
      if (!hasMatchingLine) return false
      if (normalizedSearch) {
        const searchText = getModelSearchText(model, categoryById)
        if (!searchText.includes(normalizedSearch)) return false
      }
      return true
    })
    return sortModels(filtered, sortBy)
  }, [
    models,
    selectedSlots,
    routeLine,
    billingMode,
    search,
    sortBy,
    categoryById,
  ])

  const selectedModel = selectedModelId ? modelsById.get(selectedModelId) : null

  const hasActiveFilters =
    selectedSlots.length > 0 ||
    routeLine !== 'all' ||
    billingMode !== 'all' ||
    search.trim() !== ''

  const clearFilters = () => {
    setSearch('')
    setSelectedSlots([])
    setRouteLine('all')
    setBillingMode('all')
  }

  const handleSlotsChange = (slots: string[]) => {
    setSelectedSlots(slots)
    if (routeLine === 'all') return

    const selectedRoute = routePricingData.routes.find(
      (item) => item.id === routeLine
    )
    if (
      !selectedRoute ||
      (slots.length > 0 && !slots.includes(selectedRoute.category_id))
    ) {
      setRouteLine('all')
    }
  }

  let content: React.ReactNode
  if (routePricingQuery.isLoading) {
    content = <LoadingCards />
  } else if (routePricingQuery.isError) {
    const errorMessage =
      routePricingQuery.error instanceof Error
        ? routePricingQuery.error.message
        : t('Request failed')
    content = (
      <div className='flex min-h-72 flex-col items-center justify-center rounded-xl border border-dashed p-8 text-center'>
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
    content = (
      <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-3'>
        {filteredModels.map((model) => (
          <ModelRouteCard
            key={model.id}
            model={model}
            onOpen={() => setSelectedModelId(model.id)}
          />
        ))}
      </div>
    )
  } else {
    content = (
      <div className='flex min-h-72 flex-col items-center justify-center rounded-xl border border-dashed p-8 text-center'>
        <Layers3 className='text-muted-foreground mb-3 size-10' />
        <h3 className='text-base font-semibold'>{t('No matching models')}</h3>
        <p className='text-muted-foreground mt-2 max-w-sm text-sm'>
          {t('Try clearing the search or adjusting the filters.')}
        </p>
        {hasActiveFilters && (
          <Button
            variant='outline'
            size='sm'
            onClick={clearFilters}
            className='mt-4'
          >
            {t('Reset filters')}
          </Button>
        )}
      </div>
    )
  }

  return (
    <PublicLayout showMainContainer={false}>
      <PageTransition className='relative mx-auto w-full max-w-7xl px-3 pt-16 pb-8 sm:px-6 sm:pt-20 sm:pb-10 xl:px-8'>
        <header className='mb-5 flex flex-col gap-4 sm:mb-6 lg:flex-row lg:items-end lg:justify-between'>
          <div className='min-w-0'>
            <h1 className='text-2xl font-bold tracking-tight sm:text-3xl'>
              {t('Model Square')}
            </h1>
            <p className='text-muted-foreground mt-2 text-sm'>
              {t('This site currently has {{count}} models enabled', {
                count: models.length,
              })}
              <span className='text-muted-foreground/60'>
                {' · '}
                {t('{{count}} vendors', { count: vendorCount })}
                {' · '}
                {t('{{count}} routes', {
                  count: routePricingData.total_routes,
                })}
              </span>
            </p>
          </div>

          <div className='relative w-full shrink-0 lg:max-w-sm'>
            <Search className='text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2' />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className='h-10 pr-9 pl-9'
              placeholder={t('Search model, provider, or route...')}
              aria-label={t('Search model routes')}
            />
            {search && (
              <button
                type='button'
                onClick={() => setSearch('')}
                aria-label={t('Clear search')}
                className='text-muted-foreground hover:text-foreground absolute top-1/2 right-3 -translate-y-1/2'
              >
                <X className='size-4' />
              </button>
            )}
          </div>
        </header>

        {!routePricingQuery.isError && (
          <PricingFilterBar
            slots={slotOptions}
            selectedSlots={selectedSlots}
            onSlotsChange={handleSlotsChange}
            routeItems={routeItems}
            routeLine={routeLine}
            onRouteLineChange={setRouteLine}
            billingMode={billingMode}
            onBillingModeChange={setBillingMode}
            sortItems={sortItems}
            sortBy={sortBy}
            onSortChange={setSortBy}
            shownCount={filteredModels.length}
            totalCount={models.length}
            hasActiveFilters={hasActiveFilters}
            onClearFilters={clearFilters}
          />
        )}

        <main className='mt-4 min-w-0'>{content}</main>
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
