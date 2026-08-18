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
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { getLobeIcon } from '@/lib/lobe-icon'

import {
  getLowestLineRatio,
  getLowestPerRequestPrice,
  getOfficialPriceItem,
  hasExpressionLine,
} from '../lib/model-route-utils'
import { formatPriceAmount } from '../lib/price-format'
import type { RoutePricingModel, RoutePricingPriceItem } from '../types'
import { CopyableModelName } from './copyable-model-name'

function formatRatioValue(value: number) {
  return `${value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}x`
}

function PriceStat(props: { label: string; item?: RoutePricingPriceItem }) {
  const { t } = useTranslation()
  const amount = props.item?.amount
  const unit = props.item?.unit === 'request' ? t('request') : props.item?.unit

  return (
    <div className='bg-muted/50 min-w-0 rounded-lg px-3 py-2'>
      <div className='text-muted-foreground text-[11px]'>{props.label}</div>
      {amount != null ? (
        <>
          <div className='mt-0.5 truncate font-mono text-base leading-tight font-semibold tabular-nums'>
            {formatPriceAmount(amount)}
          </div>
          {unit && (
            <div className='text-muted-foreground/70 mt-0.5 text-[10px]'>
              / {unit}
            </div>
          )}
        </>
      ) : (
        <div className='text-muted-foreground/60 mt-0.5 font-mono text-base leading-tight tabular-nums'>
          -
        </div>
      )}
    </div>
  )
}

export function ModelRouteCard(props: {
  model: RoutePricingModel
  onOpen: () => void
}) {
  const { t } = useTranslation()
  const model = props.model
  const inputItem = getOfficialPriceItem(model, 'input')
  const outputItem = getOfficialPriceItem(model, 'output')
  const perRequestItem = getOfficialPriceItem(model, 'per_request')
  const hasTokenPrices = Boolean(inputItem || outputItem)
  const lowestRatio = getLowestLineRatio(model)
  const lowestPerRequest = getLowestPerRequestPrice(model)
  const expressionLine = hasExpressionLine(model)

  const consumedTypes = new Set(['input', 'output'])
  if (!hasTokenPrices && perRequestItem) consumedTypes.add('per_request')
  const extraItems = model.official_price_items.filter(
    (item) => !consumedTypes.has(item.type)
  )

  return (
    <div className='group bg-card hover:border-foreground/25 relative flex flex-col rounded-xl border transition-all hover:shadow-md'>
      <button
        type='button'
        onClick={props.onOpen}
        aria-label={`${t('Model details')}: ${model.id}`}
        className='focus-visible:ring-ring absolute inset-0 z-10 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-offset-2'
      />
      <div className='flex h-full flex-col gap-3 p-4'>
        <div className='flex items-center gap-2'>
          {model.icon && (
            <span className='flex shrink-0 items-center'>
              {getLobeIcon(model.icon, 16)}
            </span>
          )}
          <span className='text-muted-foreground truncate text-xs'>
            {model.vendor || t('Custom')}
          </span>
          <span className='text-muted-foreground/70 ml-auto shrink-0 text-xs tabular-nums'>
            {t('{{count}} routes', { count: model.lines.length })}
          </span>
        </div>

        <div className='min-w-0'>
          <h3 className='min-w-0'>
            <CopyableModelName
              value={model.id}
              className='relative z-20 font-mono text-sm font-semibold'
            />
          </h3>
          {model.description && (
            <p className='text-muted-foreground mt-1 truncate text-xs'>
              {model.description}
            </p>
          )}
        </div>

        {hasTokenPrices && (
          <div className='grid grid-cols-2 gap-2'>
            <PriceStat label={t('Input')} item={inputItem} />
            <PriceStat label={t('Output')} item={outputItem} />
          </div>
        )}
        {!hasTokenPrices && perRequestItem && (
          <PriceStat
            label={t(perRequestItem.label_key)}
            item={perRequestItem}
          />
        )}

        {extraItems.length > 0 && (
          <div className='text-muted-foreground -mt-1 truncate text-[11px]'>
            {extraItems
              .map((item) =>
                item.amount != null
                  ? `${t(item.label_key)} ${formatPriceAmount(item.amount)}${
                      item.unit ? ` / ${item.unit}` : ''
                    }`
                  : t(item.label_key)
              )
              .join(' · ')}
          </div>
        )}

        <div className='mt-auto flex items-center gap-1.5 pt-1'>
          {lowestRatio != null && (
            <Badge variant='secondary' className='tabular-nums'>
              {t('Lowest ratio')} {formatRatioValue(lowestRatio)}
            </Badge>
          )}
          {lowestPerRequest != null && (
            <Badge variant='secondary' className='tabular-nums'>
              {t('Per request')} {formatPriceAmount(lowestPerRequest)}
            </Badge>
          )}
          {expressionLine && <Badge variant='outline'>{t('Expression')}</Badge>}
          <ChevronRight className='text-muted-foreground/50 ml-auto size-4 shrink-0 transition-transform group-hover:translate-x-0.5' />
        </div>
      </div>
    </div>
  )
}
