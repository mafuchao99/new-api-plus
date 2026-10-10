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
import { Coins, Moon, Sun, FlaskConical } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { useTheme } from '@/context/theme-provider'

import { ConsumptionSummary } from '../index'
import { demoConsumptionApi } from '../lib/demo-source'

export function ConsumptionPreview() {
  const { t, i18n } = useTranslation()
  const theme = useTheme()
  return (
    <div className='flex h-svh flex-col'>
      <header className='flex h-14 shrink-0 items-center justify-between gap-3 border-b px-4'>
        <div className='flex min-w-0 items-center gap-2'>
          <Coins className='size-5' aria-hidden='true' />
          <span className='truncate font-semibold'>new-api</span>
          <span className='text-muted-foreground hidden text-xs sm:inline'>
            / {t('Consumption summary')}
          </span>
        </div>
        <div className='flex items-center gap-2'>
          <NativeSelect
            aria-label={t('Change language')}
            value={i18n.resolvedLanguage}
            onChange={(event) => {
              void i18n.changeLanguage(event.target.value)
            }}
          >
            <NativeSelectOption value='zh'>中文</NativeSelectOption>
            <NativeSelectOption value='en'>English</NativeSelectOption>
            <NativeSelectOption value='fr'>Français</NativeSelectOption>
            <NativeSelectOption value='ja'>日本語</NativeSelectOption>
            <NativeSelectOption value='ru'>Русский</NativeSelectOption>
            <NativeSelectOption value='vi'>Tiếng Việt</NativeSelectOption>
          </NativeSelect>
          <Button
            size='icon'
            variant='ghost'
            aria-label={t('Toggle theme')}
            onClick={() =>
              theme.setTheme(theme.resolvedTheme === 'dark' ? 'light' : 'dark')
            }
          >
            {theme.resolvedTheme === 'dark' ? (
              <Sun className='size-4' />
            ) : (
              <Moon className='size-4' />
            )}
          </Button>
        </div>
      </header>
      <div className='flex min-h-0 flex-1'>
        <aside className='bg-sidebar hidden w-52 shrink-0 border-r p-4 md:block'>
          <p className='text-muted-foreground px-2 py-3 text-xs font-medium'>
            {t('Admin')}
          </p>
          <div className='bg-sidebar-accent text-sidebar-accent-foreground flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium'>
            <Coins className='size-4' aria-hidden='true' />
            {t('Consumption summary')}
          </div>
          <div className='text-muted-foreground mt-6 flex items-start gap-2 px-2 text-xs leading-relaxed'>
            <FlaskConical
              className='mt-0.5 size-4 shrink-0'
              aria-hidden='true'
            />
            {t('Demo data')}
          </div>
        </aside>
        <ConsumptionSummary source={demoConsumptionApi} />
      </div>
    </div>
  )
}
