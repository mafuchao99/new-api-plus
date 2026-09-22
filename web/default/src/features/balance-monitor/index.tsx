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

import { SectionPageLayout } from '@/components/layout'
import { StatusBadge } from '@/components/status-badge'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

import { UpstreamAccountsDialogs } from './components/upstream-accounts-dialogs'
import { UpstreamAccountsPrimaryButtons } from './components/upstream-accounts-primary-buttons'
import { UpstreamAccountsProvider } from './components/upstream-accounts-provider'
import { UpstreamAccountsTable } from './components/upstream-accounts-table'

export function BalanceMonitor() {
  const { t } = useTranslation()

  return (
    <UpstreamAccountsProvider>
      <SectionPageLayout fixedContent>
        <SectionPageLayout.Title>
          {t('Balance Monitor')}
        </SectionPageLayout.Title>
        <SectionPageLayout.Actions>
          <Tooltip>
            <TooltipTrigger
              render={
                <StatusBadge
                  label={t('Sample data')}
                  variant='warning'
                  copyable={false}
                  className='cursor-help'
                />
              }
            />
            <TooltipContent className='max-w-xs'>
              {t(
                'This page uses sample data. The backend API is not implemented yet, so changes are lost after a refresh.'
              )}
            </TooltipContent>
          </Tooltip>
          <UpstreamAccountsPrimaryButtons />
        </SectionPageLayout.Actions>
        <SectionPageLayout.Content>
          <UpstreamAccountsTable />
        </SectionPageLayout.Content>
      </SectionPageLayout>

      <UpstreamAccountsDialogs />
    </UpstreamAccountsProvider>
  )
}
