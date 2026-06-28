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
export type RouteBillingMode = 'ratio' | 'per_request' | 'expression'

export type RoutePricingPriceItem = {
  type: string
  label_key: string
  amount?: number | null
  unit?: string
  text?: string
  translate_text?: boolean
}

export type RoutePricingLine = {
  id: string
  category_id: string
  name: string
  description?: string
  billing_mode: RouteBillingMode
  ratio?: number | null
  per_request_price?: number | null
  expression_label?: string
  is_default: boolean
  is_model_override: boolean
  sort: number
  price_items: RoutePricingPriceItem[]
}

export type RoutePricingModel = {
  id: string
  vendor?: string
  description?: string
  official_price_items: RoutePricingPriceItem[]
  lines: RoutePricingLine[]
}

export type RoutePricingCategory = {
  id: string
  code: string
  name?: string
  name_key?: string
  description?: string
  sort: number
  route_count: number
}

export type RoutePricingRoute = {
  id: string
  category_id: string
  name: string
  description?: string
  sort: number
}

export type RoutePricingData = {
  categories: RoutePricingCategory[]
  routes: RoutePricingRoute[]
  models: RoutePricingModel[]
  total_routes: number
  per_request_routes: number
  pricing_version?: string
}

export type RoutePricingApiResponse = {
  success: boolean
  message?: string
  data?: RoutePricingData
}
