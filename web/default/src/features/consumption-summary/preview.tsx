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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
// Isolated entry for the local style preview; never imported by the app route.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { ThemeCustomizationProvider } from '@/context/theme-customization-provider'
import { ThemeProvider } from '@/context/theme-provider'
import '@/i18n/config'

import '@/styles/index.css'
import { ConsumptionPreview } from './components/preview-shell'

const root = document.querySelector('#root')
if (!root) throw new Error('Preview root element is missing')
const queryClient = new QueryClient()
createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        defaultTheme='light'
        storageKey='consumption-preview-theme'
      >
        <ThemeCustomizationProvider>
          <ConsumptionPreview />
        </ThemeCustomizationProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>
)
