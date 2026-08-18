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

import { sideDrawerContentClassName } from '@/components/drawer-layout'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { getLobeIcon } from '@/lib/lobe-icon'

import type { RoutePricingModel } from '../types'
import { CopyableModelName } from './copyable-model-name'
import { OfficialPricePanel, RouteLineRow } from './route-price-display'

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
                <h2 className='min-w-0'>
                  <CopyableModelName
                    value={props.model.id}
                    className='font-mono text-xl font-bold tracking-tight'
                  />
                </h2>
                {props.model.vendor && (
                  <span className='text-muted-foreground inline-flex items-center gap-1.5'>
                    {props.model.icon && (
                      <span aria-hidden='true'>
                        {getLobeIcon(props.model.icon, 16)}
                      </span>
                    )}
                    <span>{props.model.vendor}</span>
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
