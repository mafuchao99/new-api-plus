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
import { useEffect, useMemo, useState } from 'react'
import * as z from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import {
  ChevronsUpDown,
  CheckCircle2,
  Eye,
  EyeOff,
  Link2,
  Pencil,
  Plus,
  RefreshCw,
  Route,
  Star,
  Tags,
  Trash2,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Dialog } from '@/components/dialog'
import { api } from '@/lib/api'
import { SettingsCard } from '../components/settings-card'

type RouteLine = {
  id: number
  slotId?: number | null
  slot?: RouteLineSlot | null
  code: string
  name: string
  description: string
  defaultRatio?: number | null
  visible: boolean
  enabled: boolean
  sort: number
  remark: string
  modelPrices: RouteLineModelPrice[]
  bindings: RouteLineBinding[]
}

type RouteLineSlot = {
  id: number
  code: string
  name: string
}

type RouteSlot = {
  id: number
  code: string
  name: string
  description: string
  defaultRouteLineId?: number | null
  enabled: boolean
  sort: number
  remark: string
}

type RouteLineModelPrice = {
  id: number
  modelName: string
  billingMode: string
  ratio?: number
  perRequestPrice?: number
  priceExpression?: string
  description: string
  enabled: boolean
}

type RouteLineBinding = {
  id: number
  channelId: number
  channelName: string
  channelType: string
  channelModels: string
  description: string
  isDefault: boolean
  enabled: boolean
  priority: number
  weight: number
}

type ApiRouteLine = {
  id: number
  slot_id?: number | null
  slot?: RouteLineSlot | null
  code: string
  name: string
  description: string
  default_ratio?: number | null
  visible: boolean
  enabled: boolean
  sort: number
  remark: string
  model_prices?: ApiRouteLineModelPrice[]
  bindings?: ApiRouteLineBinding[]
}

type ApiRouteSlot = {
  id: number
  code: string
  name: string
  description: string
  default_route_line_id?: number | null
  enabled: boolean
  sort: number
  remark: string
}

type ApiRouteLineModelPrice = {
  id: number
  model_name: string
  billing_mode: string
  ratio?: number
  per_request_price?: number
  price_expression?: string
  description: string
  enabled: boolean
}

type ApiRouteLineBinding = {
  id: number
  channel_id: number
  is_default: boolean
  enabled: boolean
  priority: number
  weight: number
  description: string
  channel?: {
    id: number
    name: string
    type: number
    type_name: string
    models: string
    status: number
  }
}

type RouteLinesResponse = {
  success: boolean
  message?: string
  data?: {
    items?: ApiRouteLine[]
    total?: number
  }
}

type RouteSlotsResponse = {
  success: boolean
  message?: string
  data?: {
    items?: ApiRouteSlot[]
    total?: number
  }
}

type RouteLinePayload = {
  slot_id?: number | null
  code: string
  name: string
  description: string
  default_ratio?: number | null
  visible: boolean
  enabled: boolean
  sort: number
  remark: string
}

type RouteSlotPayload = {
  code: string
  name: string
  description: string
  default_route_line_id?: number | null
  enabled: boolean
  sort: number
  remark: string
}

type SaveModelPricePayload = {
  model_name: string
  billing_mode: string
  ratio?: number
  per_request_price?: number
  price_expression?: string
  description: string
  enabled: boolean
}

type SaveBindingPayload = {
  channel_id: number
  is_default: boolean
  enabled: boolean
  priority: number
  weight: number
  description: string
}

type RouteLineResponse = {
  success: boolean
  message?: string
  data?: ApiRouteLine
}

type RouteSlotResponse = {
  success: boolean
  message?: string
  data?: ApiRouteSlot
}

type ChannelOption = {
  id: number
  name: string
  type: number
  models: string
  status: number
}

type ChannelsResponse = {
  success: boolean
  message?: string
  data?: {
    items?: ChannelOption[]
  }
}

const routeLineSchema = z.object({
  slotId: z.string().trim(),
  code: z
    .string()
    .trim()
    .min(1, 'Route line code is required')
    .max(64, 'Route line code must be less than 64 characters')
    .regex(
      /^[A-Za-z0-9_.-]+$/,
      'Route line code can only contain letters, numbers, dots, underscores, and hyphens'
    ),
  name: z
    .string()
    .trim()
    .min(1, 'Route line name is required')
    .max(128, 'Route line name must be less than 128 characters'),
  description: z
    .string()
    .trim()
    .max(500, 'Description must be less than 500 characters'),
  remark: z
    .string()
    .trim()
    .max(255, 'Remark must be less than 255 characters'),
  sort: z.number().int('Sort must be an integer'),
  visible: z.boolean(),
  enabled: z.boolean(),
  defaultRatio: z.string().trim().refine((value) => {
    if (value === '') return true
    const ratio = Number(value)
    return Number.isFinite(ratio) && ratio >= 0
  }, 'Default ratio must be greater than or equal to 0'),
})

const modelPriceSchema = z.object({
  modelName: z
    .string()
    .trim()
    .min(1, 'Model name is required')
    .max(191, 'Model name must be less than 191 characters'),
  billingMode: z.enum(['ratio', 'per_request', 'expression']),
  ratio: z.number().min(0, 'Ratio must be greater than or equal to 0'),
  perRequestPrice: z
    .number()
    .min(0, 'Per-request price must be greater than or equal to 0'),
  priceExpression: z.string().trim(),
  description: z
    .string()
    .trim()
    .max(500, 'Description must be less than 500 characters'),
  enabled: z.boolean(),
})

const bindingSchema = z.object({
  channelId: z.number().int().min(1, 'Channel is required'),
  priority: z.number().int('Priority must be an integer'),
  weight: z.number().int('Weight must be an integer'),
  description: z
    .string()
    .trim()
    .max(500, 'Description must be less than 500 characters'),
  isDefault: z.boolean(),
  enabled: z.boolean(),
})

const routeSlotSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, 'Route slot code is required')
    .max(64, 'Route slot code must be less than 64 characters')
    .regex(
      /^[A-Za-z0-9_.-]+$/,
      'Route slot code can only contain letters, numbers, dots, underscores, and hyphens'
    ),
  name: z
    .string()
    .trim()
    .min(1, 'Route slot name is required')
    .max(128, 'Route slot name must be less than 128 characters'),
  description: z
    .string()
    .trim()
    .max(500, 'Description must be less than 500 characters'),
  defaultRouteLineId: z.string().trim(),
  remark: z
    .string()
    .trim()
    .max(255, 'Remark must be less than 255 characters'),
  sort: z.number().int('Sort must be an integer'),
  enabled: z.boolean(),
})

type RouteLineFormValues = z.infer<typeof routeLineSchema>
type RouteSlotFormValues = z.infer<typeof routeSlotSchema>
type ModelPriceFormValues = z.infer<typeof modelPriceSchema>
type BindingFormValues = z.infer<typeof bindingSchema>
type DeleteTarget =
  | {
      type: 'model-price'
      line: RouteLine
      price: RouteLineModelPrice
    }
  | {
      type: 'binding'
      line: RouteLine
      binding: RouteLineBinding
    }

const CREATE_ROUTE_LINE_FORM_ID = 'create-route-line-form'
const EDIT_ROUTE_LINE_FORM_ID = 'edit-route-line-form'
const MODEL_PRICE_FORM_ID = 'route-line-model-price-form'
const BINDING_FORM_ID = 'route-line-binding-form'

async function fetchRouteLines(): Promise<RouteLine[]> {
  const res = await api.get<RouteLinesResponse>('/api/route-lines/')
  if (!res.data.success) {
    throw new Error(res.data.message || 'Request failed')
  }
  return (res.data.data?.items ?? []).map(normalizeRouteLine)
}

async function fetchRouteSlots(): Promise<RouteSlot[]> {
  const res = await api.get<RouteSlotsResponse>('/api/route-lines/slots')
  if (!res.data.success) {
    throw new Error(res.data.message || 'Request failed')
  }
  return (res.data.data?.items ?? []).map(normalizeRouteSlot)
}

async function createRouteSlot(payload: RouteSlotPayload) {
  const res = await api.post<RouteSlotResponse>('/api/route-lines/slots', payload)
  if (!res.data.success) {
    throw new Error(res.data.message || 'Request failed')
  }
  return res.data.data
}

async function updateRouteSlot(id: number, payload: RouteSlotPayload) {
  const res = await api.put<RouteSlotResponse>(
    `/api/route-lines/slots/${id}`,
    payload
  )
  if (!res.data.success) {
    throw new Error(res.data.message || 'Request failed')
  }
  return res.data.data
}

async function createRouteLine(payload: RouteLinePayload) {
  const res = await api.post<RouteLineResponse>('/api/route-lines/', payload)
  if (!res.data.success) {
    throw new Error(res.data.message || 'Request failed')
  }
  return res.data.data
}

async function updateRouteLine(id: number, payload: RouteLinePayload) {
  const res = await api.put<RouteLineResponse>(`/api/route-lines/${id}`, payload)
  if (!res.data.success) {
    throw new Error(res.data.message || 'Request failed')
  }
  return res.data.data
}

async function saveModelPrice(routeLineId: number, payload: SaveModelPricePayload) {
  const res = await api.post(`/api/route-lines/${routeLineId}/model-prices`, payload)
  if (!res.data.success) {
    throw new Error(res.data.message || 'Request failed')
  }
  return res.data.data
}

async function deleteModelPrice(routeLineId: number, priceId: number) {
  const res = await api.delete(
    `/api/route-lines/${routeLineId}/model-prices/${priceId}`
  )
  if (!res.data.success) {
    throw new Error(res.data.message || 'Request failed')
  }
  return res.data.data
}

async function deleteBinding(routeLineId: number, bindingId: number) {
  const res = await api.delete(
    `/api/route-lines/${routeLineId}/bindings/${bindingId}`
  )
  if (!res.data.success) {
    throw new Error(res.data.message || 'Request failed')
  }
  return res.data.data
}

async function saveBinding(routeLineId: number, payload: SaveBindingPayload) {
  const res = await api.post(`/api/route-lines/${routeLineId}/bindings`, payload)
  if (!res.data.success) {
    throw new Error(res.data.message || 'Request failed')
  }
  return res.data.data
}

async function fetchChannels(): Promise<ChannelOption[]> {
  const res = await api.get<ChannelsResponse>('/api/channel/', {
    params: { p: 1, page_size: 1000, status: -1 },
  })
  if (!res.data.success) {
    throw new Error(res.data.message || 'Request failed')
  }
  return res.data.data?.items ?? []
}

function normalizeRouteLine(line: ApiRouteLine): RouteLine {
  return {
    id: line.id,
    slotId: line.slot_id,
    slot: line.slot ?? null,
    code: line.code,
    name: line.name,
    description: line.description,
    defaultRatio: line.default_ratio ?? 1,
    visible: line.visible,
    enabled: line.enabled,
    sort: line.sort,
    remark: line.remark,
    modelPrices: (line.model_prices ?? []).map((price) => ({
      id: price.id,
      modelName: price.model_name,
      billingMode: price.billing_mode,
      ratio: price.ratio,
      perRequestPrice: price.per_request_price,
      priceExpression: price.price_expression,
      description: price.description,
      enabled: price.enabled,
    })),
    bindings: (line.bindings ?? []).map((binding) => ({
      id: binding.id,
      channelId: binding.channel_id,
      channelName: binding.channel?.name || `#${binding.channel_id}`,
      channelType: binding.channel?.type_name || String(binding.channel?.type ?? ''),
      channelModels: binding.channel?.models || '',
      description: binding.description,
      isDefault: binding.is_default ?? false,
      enabled: binding.enabled,
      priority: binding.priority,
      weight: binding.weight,
    })),
  }
}

function normalizeRouteSlot(slot: ApiRouteSlot): RouteSlot {
  return {
    id: slot.id,
    code: slot.code,
    name: slot.name,
    description: slot.description,
    defaultRouteLineId: slot.default_route_line_id,
    enabled: slot.enabled,
    sort: slot.sort,
    remark: slot.remark,
  }
}

function getRouteLineModelSuggestions(line: RouteLine | null) {
  if (!line) return []

  const seen = new Set<string>()
  for (const binding of line.bindings) {
    for (const model of binding.channelModels.split(/[\s,;]+/)) {
      const normalizedModel = model.trim()
      if (normalizedModel) seen.add(normalizedModel)
    }
  }

  return [...seen].sort((a, b) => a.localeCompare(b))
}

function parseDefaultRatio(value: string) {
  const trimmed = value.trim()
  return trimmed === '' ? 1 : Number(trimmed)
}

function parseNullableId(value: string) {
  const id = Number(value)
  return Number.isFinite(id) && id > 0 ? id : null
}

function formatDefaultRatio(value?: number | null) {
  return typeof value === 'number' ? `${value}x` : '-'
}

function StatusBadge(props: { enabled: boolean }) {
  const { t } = useTranslation()
  return (
    <Badge variant={props.enabled ? 'secondary' : 'outline'} className='gap-1'>
      <CheckCircle2 className='size-3' />
      {props.enabled ? t('Enabled') : t('Disabled')}
    </Badge>
  )
}

function VisibilityBadge(props: { visible: boolean }) {
  const { t } = useTranslation()
  const Icon = props.visible ? Eye : EyeOff
  return (
    <Badge variant='outline' className='gap-1'>
      <Icon className='size-3' />
      {props.visible ? t('Visible') : t('Hidden')}
    </Badge>
  )
}

function BindingCountPreview(props: { bindings: RouteLineBinding[] }) {
  const { t } = useTranslation()

  if (props.bindings.length === 0) {
    return (
      <span className='text-muted-foreground text-xs'>
        {t('No channels bound')}
      </span>
    )
  }

  return (
    <div className='flex max-w-full min-w-0 flex-wrap gap-1'>
      {props.bindings.slice(0, 3).map((binding) => (
        <Badge
          key={binding.id}
          variant='outline'
          className='min-w-0 max-w-full gap-1 font-mono'
        >
          {binding.isDefault && <Star className='size-3' />}
          <span className='truncate'>{binding.channelName}</span>
        </Badge>
      ))}
      {props.bindings.length > 3 && (
        <Badge variant='secondary'>+{props.bindings.length - 3}</Badge>
      )}
    </div>
  )
}

function ModelPriceCountPreview(props: { modelPrices: RouteLineModelPrice[] }) {
  const { t } = useTranslation()

  if (props.modelPrices.length === 0) {
    return (
      <span className='text-muted-foreground text-xs'>
        {t('No model prices configured')}
      </span>
    )
  }

  return (
    <div className='flex max-w-full min-w-0 flex-wrap gap-1'>
      {props.modelPrices.slice(0, 3).map((price) => (
        <Badge
          key={price.id}
          variant='outline'
          className='min-w-0 max-w-full font-mono'
        >
          <span className='truncate'>{price.modelName}</span>
        </Badge>
      ))}
      {props.modelPrices.length > 3 && (
        <Badge variant='secondary'>+{props.modelPrices.length - 3}</Badge>
      )}
    </div>
  )
}

function billingModeLabel(mode: string) {
  switch (mode) {
    case 'ratio':
      return 'Official price ratio'
    case 'per_request':
      return 'Per request'
    case 'expression':
      return 'Expression'
    default:
      return mode || 'Custom'
  }
}

function priceValue(price: RouteLineModelPrice) {
  if (price.billingMode === 'ratio') return `${price.ratio ?? '-'}x`
  if (price.billingMode === 'per_request') return price.perRequestPrice
  if (price.billingMode === 'expression') return price.priceExpression || '-'
  return '-'
}

function ModelPricesPreview(props: {
  modelPrices: RouteLineModelPrice[]
  onEdit?: (price: RouteLineModelPrice) => void
  onDelete?: (price: RouteLineModelPrice) => void
  deletingPriceId?: number | null
}) {
  const { t } = useTranslation()

  if (props.modelPrices.length === 0) {
    return (
      <div className='text-muted-foreground rounded-lg border border-dashed p-3 text-sm'>
        {t('No model prices configured')}
      </div>
    )
  }

  return (
    <div className='grid min-w-0 gap-2'>
      {props.modelPrices.map((price) => (
        <div
          key={price.id}
          className='border-border/70 min-w-0 rounded-lg border p-3'
        >
          <div className='grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]'>
            <div className='min-w-0'>
              <div className='flex min-w-0 flex-wrap items-center gap-2'>
                <span className='min-w-0 max-w-full truncate font-mono font-medium'>
                  {price.modelName}
                </span>
                <Badge variant='outline'>{t(billingModeLabel(price.billingMode))}</Badge>
                {!price.enabled && (
                  <Badge variant='outline'>{t('Disabled')}</Badge>
                )}
              </div>
              <div className='text-muted-foreground mt-1 break-words text-xs'>
                {price.description || t('No description')}
              </div>
            </div>
            <div className='flex min-w-0 flex-wrap items-center justify-end gap-1 sm:min-w-fit'>
              <Badge variant='secondary' className='min-w-0 max-w-full'>
                <span className='truncate'>
                  {price.billingMode === 'per_request'
                    ? t('{{price}} / request', { price: priceValue(price) })
                    : priceValue(price)}
                </span>
              </Badge>
              {props.onEdit && (
                <Button
                  type='button'
                  variant='ghost'
                  size='icon-sm'
                  onClick={() => props.onEdit?.(price)}
                  aria-label={t('Edit model price')}
                >
                  <Pencil className='size-3.5' />
                </Button>
              )}
              {props.onDelete && (
                <Button
                  type='button'
                  variant='ghost'
                  size='icon-sm'
                  onClick={() => props.onDelete?.(price)}
                  disabled={props.deletingPriceId === price.id}
                  aria-label={t('Delete model price')}
                >
                  <Trash2 className='size-3.5' />
                </Button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function ChannelBindingsPreview(props: {
  bindings: RouteLineBinding[]
  onEdit?: (binding: RouteLineBinding) => void
  onDelete?: (binding: RouteLineBinding) => void
  deletingBindingId?: number | null
}) {
  const { t } = useTranslation()

  if (props.bindings.length === 0) {
    return (
      <div className='text-muted-foreground rounded-lg border border-dashed p-3 text-sm'>
        {t('No channels bound')}
      </div>
    )
  }

  return (
    <div className='grid min-w-0 gap-2'>
      {props.bindings.map((binding) => (
        <div
          key={binding.id}
          className='border-border/70 min-w-0 rounded-lg border p-3'
        >
          <div className='grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]'>
            <div className='min-w-0'>
              <div className='flex min-w-0 flex-wrap items-center gap-2'>
                <span className='min-w-0 max-w-full truncate font-medium'>
                  {binding.channelName}
                </span>
                {binding.isDefault && (
                  <Badge variant='secondary' className='gap-1'>
                    <Star className='size-3' />
                    {t('Default')}
                  </Badge>
                )}
                <Badge variant='outline'>{binding.channelType}</Badge>
                {!binding.enabled && (
                  <Badge variant='outline'>{t('Disabled')}</Badge>
                )}
              </div>
              <div className='text-muted-foreground mt-1 break-words text-xs'>
                {binding.description || t('No description')}
              </div>
              {binding.channelModels && (
                <div className='text-muted-foreground mt-1 max-w-full break-all font-mono text-xs'>
                  {binding.channelModels}
                </div>
              )}
            </div>
            <div className='flex min-w-0 flex-wrap justify-end gap-1 sm:min-w-fit'>
              <Badge variant='outline'>P{binding.priority}</Badge>
              <Badge variant='outline'>W{binding.weight}</Badge>
              {props.onEdit && (
                <Button
                  type='button'
                  variant='ghost'
                  size='icon-sm'
                  onClick={() => props.onEdit?.(binding)}
                  aria-label={t('Edit channel binding')}
                >
                  <Pencil className='size-3.5' />
                </Button>
              )}
              {props.onDelete && (
                <Button
                  type='button'
                  variant='ghost'
                  size='icon-sm'
                  onClick={() => props.onDelete?.(binding)}
                  disabled={props.deletingBindingId === binding.id}
                  aria-label={t('Delete channel binding')}
                >
                  <Trash2 className='size-3.5' />
                </Button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function ChannelCombobox(props: {
  channels: ChannelOption[]
  value: number
  onValueChange: (value: number) => void
  disabled?: boolean
  isLoading?: boolean
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [searchValue, setSearchValue] = useState('')
  const selectedChannel = props.channels.find(
    (channel) => channel.id === props.value
  )
  const filteredChannels = useMemo(() => {
    const searchTerms = searchValue
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)

    if (searchTerms.length === 0) return props.channels

    return props.channels.filter((channel) => {
      const haystack = [
        channel.name,
        `#${channel.id}`,
        String(channel.id),
        `t${channel.type}`,
        String(channel.type),
        channel.models,
        String(channel.status),
      ]
        .join(' ')
        .toLowerCase()

      return searchTerms.every((term) => haystack.includes(term))
    })
  }, [props.channels, searchValue])

  const handleSelect = (channelId: number) => {
    props.onValueChange(channelId)
    setOpen(false)
    setSearchValue('')
  }
  let selectedChannelLabel = t('Select channel')
  if (props.isLoading) selectedChannelLabel = t('Loading...')
  if (props.value > 0) selectedChannelLabel = `#${props.value}`
  if (selectedChannel?.name) selectedChannelLabel = selectedChannel.name

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type='button'
            variant='outline'
            role='combobox'
            aria-expanded={open}
            disabled={props.disabled}
            className='h-auto min-h-10 w-full justify-between gap-2 px-3 py-2 text-left font-normal'
          />
        }
      >
        <span className='flex min-w-0 flex-1 flex-col items-start'>
          <span className='w-full truncate'>{selectedChannelLabel}</span>
          {selectedChannel && (
            <span className='text-muted-foreground font-mono text-xs'>
              #{selectedChannel.id} T{selectedChannel.type}
            </span>
          )}
        </span>
        <ChevronsUpDown className='size-4 shrink-0 opacity-50' />
      </PopoverTrigger>
      <PopoverContent
        className='w-[var(--anchor-width)] overflow-hidden p-0'
        onWheel={(event) => event.stopPropagation()}
        onTouchMove={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={t('Search...')}
            value={searchValue}
            onValueChange={setSearchValue}
          />
          <CommandList className='max-h-80'>
            <CommandEmpty>{t('No channels found')}</CommandEmpty>
            <CommandGroup>
              {filteredChannels.map((channel) => (
                <CommandItem
                  key={channel.id}
                  value={String(channel.id)}
                  data-checked={props.value === channel.id}
                  onSelect={() => handleSelect(channel.id)}
                  className='items-start gap-3 px-3 py-3'
                >
                  <span className='min-w-0 flex-1'>
                    <span className='flex min-w-0 flex-wrap items-center gap-2'>
                      <span className='max-w-full truncate font-medium'>
                        {channel.name || `#${channel.id}`}
                      </span>
                      <Badge variant='outline' className='font-mono'>
                        #{channel.id}
                      </Badge>
                      <Badge variant='outline' className='font-mono'>
                        T{channel.type}
                      </Badge>
                    </span>
                    {channel.models && (
                      <span className='text-muted-foreground mt-1 block truncate font-mono text-xs'>
                        {channel.models}
                      </span>
                    )}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

function RouteLineMetric(props: {
  label: string
  value: string | number
  description: string
}) {
  return (
    <div className='border-border/70 rounded-lg border p-4'>
      <div className='text-muted-foreground text-xs font-medium'>
        {props.label}
      </div>
      <div className='mt-2 text-2xl font-semibold tabular-nums'>
        {props.value}
      </div>
      <div className='text-muted-foreground mt-1 text-xs'>
        {props.description}
      </div>
    </div>
  )
}

function RouteLineLoading() {
  const { t } = useTranslation()
  return (
    <div className='text-muted-foreground rounded-lg border border-dashed p-6 text-sm'>
      {t('Loading...')}
    </div>
  )
}

function RouteLineEmpty(props: { colSpan?: number }) {
  const { t } = useTranslation()
  return (
    <TableRow>
      <TableCell
        colSpan={props.colSpan ?? 1}
        className='text-muted-foreground h-24 text-center'
      >
        {t('No data')}
      </TableCell>
    </TableRow>
  )
}

function RouteLineTableLoading(props: { colSpan?: number }) {
  const { t } = useTranslation()
  return (
    <TableRow>
      <TableCell
        colSpan={props.colSpan ?? 1}
        className='text-muted-foreground h-24 text-center'
      >
        {t('Loading...')}
      </TableCell>
    </TableRow>
  )
}

export function RouteLinesSection() {
  const { t } = useTranslation()
  const [slotOpen, setSlotOpen] = useState(false)
  const [editingSlot, setEditingSlot] = useState<RouteSlot | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [editingLine, setEditingLine] = useState<RouteLine | null>(null)
  const [modelPriceLine, setModelPriceLine] = useState<RouteLine | null>(null)
  const [editingModelPrice, setEditingModelPrice] =
    useState<RouteLineModelPrice | null>(null)
  const [bindingLine, setBindingLine] = useState<RouteLine | null>(null)
  const [editingBinding, setEditingBinding] =
    useState<RouteLineBinding | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)
  const [deletingPriceId, setDeletingPriceId] = useState<number | null>(null)
  const [deletingBindingId, setDeletingBindingId] = useState<number | null>(null)
  const {
    data: lines = [],
    error,
    isFetching,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['route-lines'],
    queryFn: fetchRouteLines,
  })
  const {
    data: slots = [],
    error: slotsError,
    refetch: refetchSlots,
  } = useQuery({
    queryKey: ['route-slots'],
    queryFn: fetchRouteSlots,
  })
  const {
    data: channels = [],
    isLoading: isChannelsLoading,
  } = useQuery({
    queryKey: ['route-line-channels'],
    queryFn: fetchChannels,
    enabled: bindingLine !== null,
  })
  const slotForm = useForm<RouteSlotFormValues>({
    resolver: zodResolver(routeSlotSchema),
    defaultValues: {
      code: '',
      name: '',
      description: '',
      defaultRouteLineId: '',
      remark: '',
      sort: 0,
      enabled: true,
    },
  })
  const createForm = useForm<RouteLineFormValues>({
    resolver: zodResolver(routeLineSchema),
    defaultValues: {
      slotId: '',
      code: '',
      name: '',
      description: '',
      defaultRatio: '1',
      remark: '',
      sort: 0,
      visible: true,
      enabled: true,
    },
  })
  const editForm = useForm<RouteLineFormValues>({
    resolver: zodResolver(routeLineSchema),
    defaultValues: {
      slotId: '',
      code: '',
      name: '',
      description: '',
      defaultRatio: '1',
      remark: '',
      sort: 0,
      visible: true,
      enabled: true,
    },
  })
  const slotMutation = useMutation({
    mutationFn: ({ id, payload }: { id?: number; payload: RouteSlotPayload }) =>
      id ? updateRouteSlot(id, payload) : createRouteSlot(payload),
    onSuccess: async () => {
      toast.success(
        editingSlot
          ? t('Route slot updated successfully')
          : t('Route slot created successfully')
      )
      setSlotOpen(false)
      setEditingSlot(null)
      slotForm.reset()
      await refetchSlots()
      await refetch()
    },
    onError: (mutationError: Error) => {
      toast.error(mutationError.message || t('Failed to save route slot'))
    },
  })
  const modelPriceForm = useForm<ModelPriceFormValues>({
    resolver: zodResolver(modelPriceSchema),
    defaultValues: {
      modelName: '',
      billingMode: 'ratio',
      ratio: 1,
      perRequestPrice: 0,
      priceExpression: '',
      description: '',
      enabled: true,
    },
  })
  const bindingForm = useForm<BindingFormValues>({
    resolver: zodResolver(bindingSchema),
    defaultValues: {
      channelId: 0,
      priority: 0,
      weight: 100,
      description: '',
      isDefault: false,
      enabled: true,
    },
  })
  const createMutation = useMutation({
    mutationFn: createRouteLine,
    onSuccess: async () => {
      toast.success(t('Route line created successfully'))
      setCreateOpen(false)
      createForm.reset()
      await refetch()
    },
    onError: (mutationError: Error) => {
      toast.error(mutationError.message || t('Failed to create route line'))
    },
  })
  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: RouteLinePayload }) =>
      updateRouteLine(id, payload),
    onSuccess: async () => {
      toast.success(t('Route line updated successfully'))
      setEditingLine(null)
      await refetch()
    },
    onError: (mutationError: Error) => {
      toast.error(mutationError.message || t('Failed to update route line'))
    },
  })
  const modelPriceMutation = useMutation({
    mutationFn: ({
      routeLineId,
      payload,
    }: {
      routeLineId: number
      payload: SaveModelPricePayload
    }) => saveModelPrice(routeLineId, payload),
    onSuccess: async () => {
      toast.success(t('Model price saved successfully'))
      setModelPriceLine(null)
      setEditingModelPrice(null)
      modelPriceForm.reset()
      await refetch()
    },
    onError: (mutationError: Error) => {
      toast.error(mutationError.message || t('Failed to save model price'))
    },
  })
  const deleteModelPriceMutation = useMutation({
    mutationFn: ({
      routeLineId,
      priceId,
    }: {
      routeLineId: number
      priceId: number
    }) => deleteModelPrice(routeLineId, priceId),
    onMutate: ({ priceId }) => {
      setDeletingPriceId(priceId)
    },
    onSuccess: async () => {
      toast.success(t('Model price deleted successfully'))
      setDeleteTarget(null)
      await refetch()
    },
    onError: (mutationError: Error) => {
      toast.error(mutationError.message || t('Failed to delete model price'))
    },
    onSettled: () => {
      setDeletingPriceId(null)
    },
  })
  const deleteBindingMutation = useMutation({
    mutationFn: ({
      routeLineId,
      bindingId,
    }: {
      routeLineId: number
      bindingId: number
    }) => deleteBinding(routeLineId, bindingId),
    onMutate: ({ bindingId }) => {
      setDeletingBindingId(bindingId)
    },
    onSuccess: async () => {
      toast.success(t('Channel binding deleted successfully'))
      setDeleteTarget(null)
      await refetch()
    },
    onError: (mutationError: Error) => {
      toast.error(mutationError.message || t('Failed to delete channel binding'))
    },
    onSettled: () => {
      setDeletingBindingId(null)
    },
  })
  const bindingMutation = useMutation({
    mutationFn: ({
      routeLineId,
      payload,
    }: {
      routeLineId: number
      payload: SaveBindingPayload
    }) => saveBinding(routeLineId, payload),
    onSuccess: async () => {
      toast.success(t('Channel binding saved successfully'))
      setBindingLine(null)
      setEditingBinding(null)
      bindingForm.reset()
      await refetch()
    },
    onError: (mutationError: Error) => {
      toast.error(mutationError.message || t('Failed to save channel binding'))
    },
  })

  useEffect(() => {
    if (!slotOpen) return
    if (editingSlot) {
      slotForm.reset({
        code: editingSlot.code,
        name: editingSlot.name,
        description: editingSlot.description,
        defaultRouteLineId: editingSlot.defaultRouteLineId
          ? String(editingSlot.defaultRouteLineId)
          : '',
        remark: editingSlot.remark,
        sort: editingSlot.sort,
        enabled: editingSlot.enabled,
      })
      return
    }
    slotForm.reset({
      code: '',
      name: '',
      description: '',
      defaultRouteLineId: '',
      remark: '',
      sort: 0,
      enabled: true,
    })
  }, [editingSlot, slotForm, slotOpen])

  useEffect(() => {
    if (!editingLine) return
    editForm.reset({
      slotId: editingLine.slotId ? String(editingLine.slotId) : '',
      code: editingLine.code,
      name: editingLine.name,
      description: editingLine.description,
      defaultRatio:
        typeof editingLine.defaultRatio === 'number'
          ? String(editingLine.defaultRatio)
          : '',
      remark: editingLine.remark,
      sort: editingLine.sort,
      visible: editingLine.visible,
      enabled: editingLine.enabled,
    })
  }, [editForm, editingLine])

  useEffect(() => {
    if (!modelPriceLine) return
    if (editingModelPrice) {
      modelPriceForm.reset({
        modelName: editingModelPrice.modelName,
        billingMode: editingModelPrice.billingMode as ModelPriceFormValues['billingMode'],
        ratio: editingModelPrice.ratio ?? 1,
        perRequestPrice: editingModelPrice.perRequestPrice ?? 0,
        priceExpression: editingModelPrice.priceExpression ?? '',
        description: editingModelPrice.description,
        enabled: editingModelPrice.enabled,
      })
      return
    }
    modelPriceForm.reset({
      modelName: '',
      billingMode: 'ratio',
      ratio: 1,
      perRequestPrice: 0,
      priceExpression: '',
      description: '',
      enabled: true,
    })
  }, [editingModelPrice, modelPriceForm, modelPriceLine])

  useEffect(() => {
    if (!bindingLine) return
    if (editingBinding) {
      bindingForm.reset({
        channelId: editingBinding.channelId,
        priority: editingBinding.priority,
        weight: editingBinding.weight,
        description: editingBinding.description,
        isDefault: editingBinding.isDefault,
        enabled: editingBinding.enabled,
      })
      return
    }
    bindingForm.reset({
      channelId: 0,
      priority: 0,
      weight: 100,
      description: '',
      isDefault: false,
      enabled: true,
    })
  }, [bindingForm, bindingLine, editingBinding])

  const sortedLines = useMemo(
    () => [...lines].sort((a, b) => a.sort - b.sort || a.id - b.id),
    [lines]
  )
  const sortedSlots = useMemo(
    () => [...slots].sort((a, b) => a.sort - b.sort || a.id - b.id),
    [slots]
  )
  const lineById = useMemo(
    () => new Map(lines.map((line) => [line.id, line])),
    [lines]
  )

  const visibleCount = lines.filter((line) => line.visible).length
  const modelPriceCount = lines.reduce(
    (total, line) => total + line.modelPrices.length,
    0
  )
  const boundChannelCount = lines.reduce(
    (total, line) => total + line.bindings.length,
    0
  )
  const defaultBindingCount = lines.reduce(
    (total, line) =>
      total + line.bindings.filter((binding) => binding.isDefault).length,
    0
  )
  const selectedBillingMode = modelPriceForm.watch('billingMode')
  const selectedBindingChannelId = bindingForm.watch('channelId')
  const editableDefaultLines = useMemo(
    () =>
      editingSlot
        ? sortedLines.filter((line) => line.slotId === editingSlot.id)
        : [],
    [editingSlot, sortedLines]
  )
  const modelSuggestions = useMemo(
    () => getRouteLineModelSuggestions(modelPriceLine),
    [modelPriceLine]
  )

  useEffect(() => {
    if (!bindingLine || editingBinding || selectedBindingChannelId <= 0) return

    const existingBinding = bindingLine.bindings.find(
      (binding) => binding.channelId === selectedBindingChannelId
    )
    bindingForm.setValue('priority', existingBinding?.priority ?? 0)
    bindingForm.setValue('weight', existingBinding?.weight ?? 100)
    bindingForm.setValue('description', existingBinding?.description ?? '')
    bindingForm.setValue('isDefault', existingBinding?.isDefault ?? false)
    bindingForm.setValue('enabled', existingBinding?.enabled ?? true)
  }, [bindingForm, bindingLine, editingBinding, selectedBindingChannelId])

  const handleSlotSubmit = slotForm.handleSubmit((values) => {
    slotMutation.mutate({
      id: editingSlot?.id,
      payload: {
        code: values.code.trim(),
        name: values.name.trim(),
        description: values.description.trim(),
        default_route_line_id: parseNullableId(values.defaultRouteLineId),
        remark: values.remark.trim(),
        sort: values.sort,
        enabled: values.enabled,
      },
    })
  })
  const handleCreateSubmit = createForm.handleSubmit((values) => {
    createMutation.mutate({
      slot_id: parseNullableId(values.slotId),
      code: values.code.trim(),
      name: values.name.trim(),
      description: values.description.trim(),
      default_ratio: parseDefaultRatio(values.defaultRatio),
      remark: values.remark.trim(),
      sort: values.sort,
      visible: values.visible,
      enabled: values.enabled,
    })
  })
  const handleEditSubmit = editForm.handleSubmit((values) => {
    if (!editingLine) return
    updateMutation.mutate({
      id: editingLine.id,
      payload: {
        code: values.code.trim(),
        slot_id: parseNullableId(values.slotId),
        name: values.name.trim(),
        description: values.description.trim(),
        default_ratio: parseDefaultRatio(values.defaultRatio),
        remark: values.remark.trim(),
        sort: values.sort,
        visible: values.visible,
        enabled: values.enabled,
      },
    })
  })
  const handleModelPriceSubmit = modelPriceForm.handleSubmit((values) => {
    if (!modelPriceLine) return
    const payload: SaveModelPricePayload = {
      model_name: values.modelName.trim(),
      billing_mode: values.billingMode,
      description: values.description.trim(),
      enabled: values.enabled,
    }
    if (values.billingMode === 'ratio') payload.ratio = values.ratio
    if (values.billingMode === 'per_request') {
      payload.per_request_price = values.perRequestPrice
    }
    if (values.billingMode === 'expression') {
      payload.price_expression = values.priceExpression.trim()
    }
    modelPriceMutation.mutate({
      routeLineId: modelPriceLine.id,
      payload,
    })
  })
  const handleBindingSubmit = bindingForm.handleSubmit((values) => {
    if (!bindingLine) return
    bindingMutation.mutate({
      routeLineId: bindingLine.id,
      payload: {
        channel_id: values.channelId,
        is_default: values.isDefault,
        enabled: values.enabled,
        priority: values.priority,
        weight: values.weight,
        description: values.description.trim(),
      },
    })
  })
  const handleDeleteModelPrice = (
    line: RouteLine,
    price: RouteLineModelPrice
  ) => {
    setDeleteTarget({ type: 'model-price', line, price })
  }
  const handleDeleteBinding = (line: RouteLine, binding: RouteLineBinding) => {
    setDeleteTarget({ type: 'binding', line, binding })
  }
  const handleEditModelPrice = (
    line: RouteLine,
    price: RouteLineModelPrice
  ) => {
    setEditingModelPrice(price)
    setModelPriceLine(line)
  }
  const handleEditBinding = (line: RouteLine, binding: RouteLineBinding) => {
    setEditingBinding(binding)
    setBindingLine(line)
  }
  const handleConfirmDelete = () => {
    if (!deleteTarget) return
    if (deleteTarget.type === 'model-price') {
      deleteModelPriceMutation.mutate({
        routeLineId: deleteTarget.line.id,
        priceId: deleteTarget.price.id,
      })
      return
    }
    deleteBindingMutation.mutate({
      routeLineId: deleteTarget.line.id,
      bindingId: deleteTarget.binding.id,
    })
  }
  const deletePending =
    deleteModelPriceMutation.isPending || deleteBindingMutation.isPending
  const deleteDialogTitle =
    deleteTarget?.type === 'binding'
      ? t('Delete channel binding')
      : t('Delete model price')
  const deleteDialogDescription =
    deleteTarget?.type === 'binding'
      ? t('Delete the binding between {{line}} and {{channel}}?', {
          line: deleteTarget.line.name,
          channel: deleteTarget.binding.channelName,
        })
      : deleteTarget?.type === 'model-price'
        ? t('Delete custom model price {{model}} from {{line}}?', {
            model: deleteTarget.price.modelName,
            line: deleteTarget.line.name,
          })
        : ''

  return (
    <div className='grid gap-4'>
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !deletePending) setDeleteTarget(null)
        }}
        title={deleteDialogTitle}
        desc={deleteDialogDescription}
        destructive
        isLoading={deletePending}
        confirmText={deletePending ? t('Deleting...') : t('Delete')}
        handleConfirm={handleConfirmDelete}
      />
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <div className='max-w-3xl'>
          <div className='flex flex-wrap items-center gap-2'>
            <h2 className='text-lg font-semibold'>{t('Route Lines')}</h2>
            {isFetching && <Badge variant='outline'>{t('Loading')}</Badge>}
          </div>
          <p className='text-muted-foreground mt-1 text-sm'>
            {t(
              'Manage route labels globally, configure model prices under each line, then bind channels that can serve it.'
            )}
          </p>
          {error instanceof Error && (
            <p className='text-destructive mt-1 text-sm'>
              {error.message || t('Request failed')}
            </p>
          )}
          {slotsError instanceof Error && (
            <p className='text-destructive mt-1 text-sm'>
              {slotsError.message || t('Request failed')}
            </p>
          )}
        </div>
        <div className='flex flex-wrap gap-2'>
          <Dialog
            open={slotOpen}
            onOpenChange={(open) => {
              setSlotOpen(open)
              if (!open) setEditingSlot(null)
            }}
            title={editingSlot ? t('Edit route slot') : t('Create route slot')}
            description={t(
              'Route slots group replaceable default lines, such as GPT chat or GPT image.'
            )}
            trigger={
              <Button
                type='button'
                variant='outline'
                onClick={() => {
                  setEditingSlot(null)
                  setSlotOpen(true)
                }}
              >
                <Plus className='size-4' />
                {t('Create slot')}
              </Button>
            }
            footer={
              <>
                <Button
                  type='button'
                  variant='outline'
                  onClick={() => setSlotOpen(false)}
                  disabled={slotMutation.isPending}
                >
                  {t('Cancel')}
                </Button>
                <Button
                  type='submit'
                  form='route-slot-form'
                  disabled={slotMutation.isPending}
                >
                  {slotMutation.isPending ? t('Saving...') : t('Save')}
                </Button>
              </>
            }
          >
            <Form {...slotForm}>
              <form
                id='route-slot-form'
                className='grid gap-4'
                onSubmit={handleSlotSubmit}
              >
                <div className='grid gap-4 md:grid-cols-2'>
                  <FormField
                    control={slotForm.control}
                    name='name'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('Slot name')}</FormLabel>
                        <FormControl>
                          <Input
                            placeholder={t('GPT chat')}
                            autoComplete='off'
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={slotForm.control}
                    name='code'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('Slot code')}</FormLabel>
                        <FormControl>
                          <Input
                            placeholder='gpt_chat'
                            autoComplete='off'
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={slotForm.control}
                  name='description'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Description')}</FormLabel>
                      <FormControl>
                        <Textarea rows={3} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={slotForm.control}
                  name='defaultRouteLineId'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Default route line')}</FormLabel>
                      <Select
                        items={[
                          { value: 'none', label: t('No default line') },
                          ...editableDefaultLines.map((line) => ({
                            value: String(line.id),
                            label: line.name,
                          })),
                        ]}
                        value={field.value || 'none'}
                        onValueChange={(value) =>
                          field.onChange(value === 'none' ? '' : value)
                        }
                        disabled={!editingSlot}
                      >
                        <FormControl>
                          <SelectTrigger className='w-full'>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent alignItemWithTrigger={false}>
                          <SelectGroup>
                            <SelectItem value='none'>
                              {t('No default line')}
                            </SelectItem>
                            {editableDefaultLines.map((line) => (
                              <SelectItem key={line.id} value={String(line.id)}>
                                <span className='truncate'>{line.name}</span>
                                <span className='text-muted-foreground font-mono text-xs'>
                                  {line.code}
                                </span>
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        {editingSlot
                          ? t('Keys that follow this slot use the current default line.')
                          : t('Create the slot first, then assign lines and choose a default.')}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className='grid gap-4 md:grid-cols-2'>
                  <FormField
                    control={slotForm.control}
                    name='sort'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('Sort')}</FormLabel>
                        <FormControl>
                          <Input
                            type='number'
                            inputMode='numeric'
                            value={field.value}
                            onChange={(event) =>
                              field.onChange(Number(event.target.value || 0))
                            }
                            onBlur={field.onBlur}
                            name={field.name}
                            ref={field.ref}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={slotForm.control}
                    name='remark'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('Remark')}</FormLabel>
                        <FormControl>
                          <Input autoComplete='off' {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={slotForm.control}
                  name='enabled'
                  render={({ field }) => (
                    <FormItem className='flex items-center justify-between gap-3 rounded-lg border p-3'>
                      <FormLabel>{t('Enabled')}</FormLabel>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </form>
            </Form>
          </Dialog>
          <Dialog
            open={createOpen}
            onOpenChange={setCreateOpen}
            title={t('Create route line')}
            description={t(
              'Create the line label first. Model prices and channel bindings can be configured after the line exists.'
            )}
            trigger={
              <Button type='button'>
                <Plus className='size-4' />
                {t('Create')}
              </Button>
            }
            footer={
              <>
                <Button
                  type='button'
                  variant='outline'
                  onClick={() => setCreateOpen(false)}
                  disabled={createMutation.isPending}
                >
                  {t('Cancel')}
                </Button>
                <Button
                  type='submit'
                  form={CREATE_ROUTE_LINE_FORM_ID}
                  disabled={createMutation.isPending}
                >
                  {createMutation.isPending ? t('Creating...') : t('Create')}
                </Button>
              </>
            }
          >
            <Form {...createForm}>
              <form
                id={CREATE_ROUTE_LINE_FORM_ID}
                className='grid gap-4'
                onSubmit={handleCreateSubmit}
              >
                <div className='grid gap-4 md:grid-cols-2'>
                  <FormField
                    control={createForm.control}
                    name='name'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('Line name')}</FormLabel>
                        <FormControl>
                          <Input
                            placeholder={t('Stable Pro')}
                            autoComplete='off'
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={createForm.control}
                    name='code'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('Line code')}</FormLabel>
                        <FormControl>
                          <Input
                            placeholder='stable-pro'
                            autoComplete='off'
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>
                          {t('Used as a stable identifier for API and billing rules.')}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={createForm.control}
                  name='slotId'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Route slot')}</FormLabel>
                      <Select
                        items={[
                          { value: 'none', label: t('No slot') },
                          ...slots.map((slot) => ({
                            value: String(slot.id),
                            label: slot.name,
                          })),
                        ]}
                        value={field.value || 'none'}
                        onValueChange={(value) =>
                          field.onChange(value === 'none' ? '' : value)
                        }
                      >
                        <FormControl>
                          <SelectTrigger className='w-full'>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent alignItemWithTrigger={false}>
                          <SelectGroup>
                            <SelectItem value='none'>
                              {t('No slot')}
                            </SelectItem>
                            {slots.map((slot) => (
                              <SelectItem key={slot.id} value={String(slot.id)}>
                                <span className='truncate'>{slot.name}</span>
                                <span className='text-muted-foreground font-mono text-xs'>
                                  {slot.code}
                                </span>
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        {t('API keys can follow the default route line of this slot.')}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={createForm.control}
                  name='description'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Description')}</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder={t('Shown to admins when choosing this route line.')}
                          rows={3}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={createForm.control}
                  name='defaultRatio'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Default route ratio')}</FormLabel>
                      <FormControl>
                        <Input
                          type='number'
                          inputMode='decimal'
                          step='0.01'
                          placeholder='1'
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        {t(
                          'Used when a bound model has no custom model price. Default is 1, meaning official price.'
                        )}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className='grid gap-4 md:grid-cols-2'>
                  <FormField
                    control={createForm.control}
                    name='sort'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('Sort')}</FormLabel>
                        <FormControl>
                          <Input
                            type='number'
                            inputMode='numeric'
                            value={field.value}
                            onChange={(event) =>
                              field.onChange(Number(event.target.value || 0))
                            }
                            onBlur={field.onBlur}
                            name={field.name}
                            ref={field.ref}
                          />
                        </FormControl>
                        <FormDescription>
                          {t('Lower numbers appear earlier in lists.')}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={createForm.control}
                    name='remark'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('Remark')}</FormLabel>
                        <FormControl>
                          <Input
                            placeholder={t('Internal note')}
                            autoComplete='off'
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className='grid gap-3 rounded-lg border p-3'>
                  <FormField
                    control={createForm.control}
                    name='enabled'
                    render={({ field }) => (
                      <FormItem className='flex items-center justify-between gap-3'>
                        <div className='grid gap-1'>
                          <FormLabel>{t('Enabled')}</FormLabel>
                          <FormDescription>
                            {t('Disabled lines stay saved but cannot be selected later.')}
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={createForm.control}
                    name='visible'
                    render={({ field }) => (
                      <FormItem className='flex items-center justify-between gap-3'>
                        <div className='grid gap-1'>
                          <FormLabel>{t('Visible')}</FormLabel>
                          <FormDescription>
                            {t('Visible lines can be shown on pricing and selection pages.')}
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
              </form>
            </Form>
          </Dialog>
          <Dialog
            open={editingLine !== null}
            onOpenChange={(open) => {
              if (!open) setEditingLine(null)
            }}
            title={t('Edit route line')}
            description={editingLine?.name}
            footer={
              <>
                <Button
                  type='button'
                  variant='outline'
                  onClick={() => setEditingLine(null)}
                  disabled={updateMutation.isPending}
                >
                  {t('Cancel')}
                </Button>
                <Button
                  type='submit'
                  form={EDIT_ROUTE_LINE_FORM_ID}
                  disabled={updateMutation.isPending}
                >
                  {updateMutation.isPending ? t('Saving...') : t('Save')}
                </Button>
              </>
            }
          >
            <Form {...editForm}>
              <form
                id={EDIT_ROUTE_LINE_FORM_ID}
                className='grid gap-4'
                onSubmit={handleEditSubmit}
              >
                <div className='grid gap-4 md:grid-cols-2'>
                  <FormField
                    control={editForm.control}
                    name='name'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('Line name')}</FormLabel>
                        <FormControl>
                          <Input autoComplete='off' {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={editForm.control}
                    name='code'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('Line code')}</FormLabel>
                        <FormControl>
                          <Input autoComplete='off' {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={editForm.control}
                  name='slotId'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Route slot')}</FormLabel>
                      <Select
                        items={[
                          { value: 'none', label: t('No slot') },
                          ...slots.map((slot) => ({
                            value: String(slot.id),
                            label: slot.name,
                          })),
                        ]}
                        value={field.value || 'none'}
                        onValueChange={(value) =>
                          field.onChange(value === 'none' ? '' : value)
                        }
                      >
                        <FormControl>
                          <SelectTrigger className='w-full'>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent alignItemWithTrigger={false}>
                          <SelectGroup>
                            <SelectItem value='none'>
                              {t('No slot')}
                            </SelectItem>
                            {slots.map((slot) => (
                              <SelectItem key={slot.id} value={String(slot.id)}>
                                <span className='truncate'>{slot.name}</span>
                                <span className='text-muted-foreground font-mono text-xs'>
                                  {slot.code}
                                </span>
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        {t('Moving a line out of a slot clears stale slot defaults automatically.')}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editForm.control}
                  name='description'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Description')}</FormLabel>
                      <FormControl>
                        <Textarea rows={3} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editForm.control}
                  name='defaultRatio'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Default route ratio')}</FormLabel>
                      <FormControl>
                        <Input
                          type='number'
                          inputMode='decimal'
                          step='0.01'
                          placeholder='1'
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        {t(
                          'Used when a bound model has no custom model price. Default is 1, meaning official price.'
                        )}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className='grid gap-4 md:grid-cols-2'>
                  <FormField
                    control={editForm.control}
                    name='sort'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('Sort')}</FormLabel>
                        <FormControl>
                          <Input
                            type='number'
                            inputMode='numeric'
                            value={field.value}
                            onChange={(event) =>
                              field.onChange(Number(event.target.value || 0))
                            }
                            onBlur={field.onBlur}
                            name={field.name}
                            ref={field.ref}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={editForm.control}
                    name='remark'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('Remark')}</FormLabel>
                        <FormControl>
                          <Input autoComplete='off' {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className='grid gap-3 rounded-lg border p-3'>
                  <FormField
                    control={editForm.control}
                    name='enabled'
                    render={({ field }) => (
                      <FormItem className='flex items-center justify-between gap-3'>
                        <FormLabel>{t('Enabled')}</FormLabel>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={editForm.control}
                    name='visible'
                    render={({ field }) => (
                      <FormItem className='flex items-center justify-between gap-3'>
                        <FormLabel>{t('Visible')}</FormLabel>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
              </form>
            </Form>
          </Dialog>
          <Dialog
            open={modelPriceLine !== null}
            onOpenChange={(open) => {
              if (!open) {
                setModelPriceLine(null)
                setEditingModelPrice(null)
              }
            }}
            title={
              editingModelPrice ? t('Edit model price') : t('Add model price')
            }
            description={modelPriceLine?.name}
            footer={
              <>
                <Button
                  type='button'
                  variant='outline'
                  onClick={() => {
                    setModelPriceLine(null)
                    setEditingModelPrice(null)
                  }}
                  disabled={modelPriceMutation.isPending}
                >
                  {t('Cancel')}
                </Button>
                <Button
                  type='submit'
                  form={MODEL_PRICE_FORM_ID}
                  disabled={modelPriceMutation.isPending}
                >
                  {modelPriceMutation.isPending ? t('Saving...') : t('Save')}
                </Button>
              </>
            }
          >
            <Form {...modelPriceForm}>
              <form
                id={MODEL_PRICE_FORM_ID}
                className='grid gap-4'
                onSubmit={handleModelPriceSubmit}
              >
                {modelPriceLine && modelPriceLine.bindings.length === 0 && (
                  <div className='border-border/70 bg-muted/30 text-muted-foreground rounded-lg border border-dashed p-3 text-sm'>
                    {t(
                      'Bind a channel first to collect model suggestions. You can still enter a model name manually.'
                    )}
                  </div>
                )}
                {modelPriceLine &&
                  modelPriceLine.bindings.length > 0 &&
                  modelSuggestions.length === 0 && (
                    <div className='border-border/70 bg-muted/30 text-muted-foreground rounded-lg border border-dashed p-3 text-sm'>
                      {t(
                        'No model suggestions found from bound channels. You can still enter a model name manually.'
                      )}
                    </div>
                  )}
                {modelSuggestions.length > 0 && (
                  <div className='grid gap-2 rounded-lg border p-3'>
                    <div className='text-muted-foreground text-xs font-medium'>
                      {t('Model suggestions from bound channels')}
                    </div>
                    <div className='flex max-h-28 flex-wrap gap-1 overflow-y-auto'>
                      {modelSuggestions.map((model) => (
                        <Button
                          key={model}
                          type='button'
                          variant='outline'
                          size='sm'
                          className='font-mono'
                          disabled={editingModelPrice !== null}
                          onClick={() =>
                            modelPriceForm.setValue('modelName', model, {
                              shouldDirty: true,
                              shouldValidate: true,
                            })
                          }
                        >
                          {model}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
                <div className='grid gap-4 md:grid-cols-2'>
                  <FormField
                    control={modelPriceForm.control}
                    name='modelName'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('Model name')}</FormLabel>
                        <FormControl>
                          <Input
                            placeholder='gpt-4.1'
                            autoComplete='off'
                            disabled={editingModelPrice !== null}
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>
                          {editingModelPrice
                            ? t('Delete and recreate this price to rename the model.')
                            : t('Submitting the same model name updates its rule.')}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={modelPriceForm.control}
                    name='billingMode'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('Billing mode')}</FormLabel>
                        <Select
                          items={[
                            { value: 'ratio', label: t('Official price ratio') },
                            { value: 'per_request', label: t('Per request') },
                            { value: 'expression', label: t('Expression') },
                          ]}
                          value={field.value}
                          onValueChange={field.onChange}
                        >
                          <FormControl>
                            <SelectTrigger className='w-full'>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent alignItemWithTrigger={false}>
                            <SelectGroup>
                              <SelectItem value='ratio'>
                                {t('Official price ratio')}
                              </SelectItem>
                              <SelectItem value='per_request'>
                                {t('Per request')}
                              </SelectItem>
                              <SelectItem value='expression'>
                                {t('Expression')}
                              </SelectItem>
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                {selectedBillingMode === 'ratio' && (
                  <FormField
                    control={modelPriceForm.control}
                    name='ratio'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('Ratio')}</FormLabel>
                        <FormControl>
                          <Input
                            type='number'
                            inputMode='decimal'
                            step='0.01'
                            value={field.value}
                            onChange={(event) =>
                              field.onChange(Number(event.target.value || 0))
                            }
                            onBlur={field.onBlur}
                            name={field.name}
                            ref={field.ref}
                          />
                        </FormControl>
                        <FormDescription>
                          {t('Example: 0.25 means 25% of the official price.')}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                {selectedBillingMode === 'per_request' && (
                  <FormField
                    control={modelPriceForm.control}
                    name='perRequestPrice'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('Per-request price')}</FormLabel>
                        <FormControl>
                          <Input
                            type='number'
                            inputMode='decimal'
                            step='0.001'
                            value={field.value}
                            onChange={(event) =>
                              field.onChange(Number(event.target.value || 0))
                            }
                            onBlur={field.onBlur}
                            name={field.name}
                            ref={field.ref}
                          />
                        </FormControl>
                        <FormDescription>
                          {t('One request consumes this fixed price.')}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                {selectedBillingMode === 'expression' && (
                  <FormField
                    control={modelPriceForm.control}
                    name='priceExpression'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('Price expression')}</FormLabel>
                        <FormControl>
                          <Textarea rows={3} {...field} />
                        </FormControl>
                        <FormDescription>
                          {t('Reserved for image size, count, quality, or other dynamic billing rules.')}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                <FormField
                  control={modelPriceForm.control}
                  name='description'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Description')}</FormLabel>
                      <FormControl>
                        <Textarea rows={2} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={modelPriceForm.control}
                  name='enabled'
                  render={({ field }) => (
                    <FormItem className='flex items-center justify-between gap-3 rounded-lg border p-3'>
                      <FormLabel>{t('Enabled')}</FormLabel>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </form>
            </Form>
          </Dialog>
          <Dialog
            open={bindingLine !== null}
            onOpenChange={(open) => {
              if (!open) {
                setBindingLine(null)
                setEditingBinding(null)
              }
            }}
            title={editingBinding ? t('Edit channel binding') : t('Bind channel')}
            description={bindingLine?.name}
            footer={
              <>
                <Button
                  type='button'
                  variant='outline'
                  onClick={() => {
                    setBindingLine(null)
                    setEditingBinding(null)
                  }}
                  disabled={bindingMutation.isPending}
                >
                  {t('Cancel')}
                </Button>
                <Button
                  type='submit'
                  form={BINDING_FORM_ID}
                  disabled={bindingMutation.isPending}
                >
                  {bindingMutation.isPending ? t('Saving...') : t('Save')}
                </Button>
              </>
            }
          >
            <Form {...bindingForm}>
              <form
                id={BINDING_FORM_ID}
                className='grid gap-4'
                onSubmit={handleBindingSubmit}
              >
                <FormField
                  control={bindingForm.control}
                  name='channelId'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Channel')}</FormLabel>
                      <FormControl>
                        <ChannelCombobox
                          channels={channels}
                          value={field.value}
                          onValueChange={field.onChange}
                          disabled={editingBinding !== null}
                          isLoading={isChannelsLoading}
                        />
                      </FormControl>
                      <FormDescription>
                        {t('Submitting an already bound channel updates its binding.')}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className='grid gap-4 md:grid-cols-2'>
                  <FormField
                    control={bindingForm.control}
                    name='priority'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('Priority')}</FormLabel>
                        <FormControl>
                          <Input
                            type='number'
                            inputMode='numeric'
                            value={field.value}
                            onChange={(event) =>
                              field.onChange(Number(event.target.value || 0))
                            }
                            onBlur={field.onBlur}
                            name={field.name}
                            ref={field.ref}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={bindingForm.control}
                    name='weight'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('Weight')}</FormLabel>
                        <FormControl>
                          <Input
                            type='number'
                            inputMode='numeric'
                            value={field.value}
                            onChange={(event) =>
                              field.onChange(Number(event.target.value || 0))
                            }
                            onBlur={field.onBlur}
                            name={field.name}
                            ref={field.ref}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={bindingForm.control}
                  name='description'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Description')}</FormLabel>
                      <FormControl>
                        <Textarea rows={2} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={bindingForm.control}
                  name='isDefault'
                  render={({ field }) => (
                    <FormItem className='flex items-center justify-between gap-3 rounded-lg border p-3'>
                      <div className='grid gap-1'>
                        <FormLabel>{t('Default for this channel')}</FormLabel>
                        <FormDescription>
                          {t(
                            'Only one route line can be the default for the same channel. Enabling this clears other defaults for that channel.'
                          )}
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={bindingForm.control}
                  name='enabled'
                  render={({ field }) => (
                    <FormItem className='flex items-center justify-between gap-3 rounded-lg border p-3'>
                      <FormLabel>{t('Enabled')}</FormLabel>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </form>
            </Form>
          </Dialog>
          <Button
            type='button'
            variant='outline'
            onClick={() => void refetch()}
            disabled={isFetching}
          >
            <RefreshCw className='size-4' />
            {t('Refresh')}
          </Button>
        </div>
      </div>

      <div className='grid gap-3 md:grid-cols-5'>
        <RouteLineMetric
          label={t('Route slots')}
          value={slots.length}
          description={t('Replaceable default groups')}
        />
        <RouteLineMetric
          label={t('Route lines')}
          value={lines.length}
          description={t('Total configured lines')}
        />
        <RouteLineMetric
          label={t('Model prices')}
          value={modelPriceCount}
          description={t('Ratio or per-request rules')}
        />
        <RouteLineMetric
          label={t('Visible')}
          value={visibleCount}
          description={t('Shown in pricing surfaces')}
        />
        <RouteLineMetric
          label={t('Channel bindings')}
          value={boundChannelCount}
          description={t('{{count}} channel defaults', {
            count: defaultBindingCount,
          })}
        />
      </div>

      <SettingsCard
        title={t('Route slot inventory')}
        description={t(
          'Slots define which default line can be replaced for a model family.'
        )}
      >
        <div className='overflow-x-auto'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('Slot')}</TableHead>
                <TableHead>{t('Code')}</TableHead>
                <TableHead>{t('Default route line')}</TableHead>
                <TableHead>{t('Enabled')}</TableHead>
                <TableHead>{t('Sort')}</TableHead>
                <TableHead>{t('Actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedSlots.length === 0 ? (
                <RouteLineEmpty colSpan={6} />
              ) : (
                sortedSlots.map((slot) => {
                  const defaultLine = slot.defaultRouteLineId
                    ? lineById.get(slot.defaultRouteLineId)
                    : null
                  return (
                    <TableRow key={slot.id}>
                      <TableCell>
                        <div className='flex min-w-52 flex-col gap-1'>
                          <span className='font-medium'>{slot.name}</span>
                          <span className='text-muted-foreground text-xs'>
                            {slot.description || t('No description')}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className='font-mono'>{slot.code}</TableCell>
                      <TableCell>
                        {defaultLine ? (
                          <Badge variant='secondary'>{defaultLine.name}</Badge>
                        ) : (
                          <span className='text-muted-foreground text-xs'>
                            {t('No default line')}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <StatusBadge enabled={slot.enabled} />
                      </TableCell>
                      <TableCell className='font-mono'>{slot.sort}</TableCell>
                      <TableCell>
                        <Button
                          type='button'
                          variant='outline'
                          size='sm'
                          onClick={() => {
                            setEditingSlot(slot)
                            setSlotOpen(true)
                          }}
                        >
                          <Pencil className='size-3.5' />
                          {t('Edit')}
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </SettingsCard>

      <SettingsCard
        title={t('Route line inventory')}
        description={t(
          'A route line owns model pricing rules. Channel bindings decide which upstreams can serve that line.'
        )}
      >
        <div className='overflow-x-auto'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('Line')}</TableHead>
                <TableHead>{t('Slot')}</TableHead>
                <TableHead>{t('Code')}</TableHead>
                <TableHead>{t('Default ratio')}</TableHead>
                <TableHead>{t('Model prices')}</TableHead>
                <TableHead>{t('Bound channels')}</TableHead>
                <TableHead>{t('Enabled')}</TableHead>
                <TableHead>{t('Visible')}</TableHead>
                <TableHead>{t('Sort')}</TableHead>
                <TableHead>{t('Actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <RouteLineTableLoading colSpan={10} />
              ) : sortedLines.length === 0 ? (
                <RouteLineEmpty colSpan={10} />
              ) : (
                sortedLines.map((line) => (
                  <TableRow key={line.id}>
                    <TableCell>
                      <div className='flex min-w-56 flex-col gap-1'>
                        <div className='flex flex-wrap items-center gap-2'>
                          <Route className='text-muted-foreground size-4' />
                          <span className='font-medium'>{line.name}</span>
                        </div>
                        <span className='text-muted-foreground text-xs'>
                          {line.description || t('No description')}
                        </span>
                        {line.remark && (
                          <span className='text-muted-foreground text-xs'>
                            {line.remark}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {line.slot ? (
                        <Badge variant='outline'>{line.slot.name}</Badge>
                      ) : (
                        <span className='text-muted-foreground text-xs'>
                          {t('No slot')}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className='font-mono'>{line.code}</TableCell>
                    <TableCell className='font-mono'>
                      {formatDefaultRatio(line.defaultRatio)}
                    </TableCell>
                    <TableCell>
                      <ModelPriceCountPreview modelPrices={line.modelPrices} />
                    </TableCell>
                    <TableCell>
                      <BindingCountPreview bindings={line.bindings} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge enabled={line.enabled} />
                    </TableCell>
                    <TableCell>
                      <VisibilityBadge visible={line.visible} />
                    </TableCell>
                    <TableCell className='font-mono'>{line.sort}</TableCell>
                    <TableCell>
                      <div className='flex min-w-48 flex-wrap gap-1'>
                        <Button
                          type='button'
                          variant='outline'
                          size='sm'
                          onClick={() => setEditingLine(line)}
                        >
                          <Pencil className='size-3.5' />
                          {t('Edit')}
                        </Button>
                        <Button
                          type='button'
                          variant='outline'
                          size='sm'
                          onClick={() => {
                            setEditingModelPrice(null)
                            setModelPriceLine(line)
                          }}
                        >
                          <Tags className='size-3.5' />
                          {t('Price')}
                        </Button>
                        <Button
                          type='button'
                          variant='outline'
                          size='sm'
                          onClick={() => {
                            setEditingBinding(null)
                            setBindingLine(line)
                          }}
                        >
                          <Link2 className='size-3.5' />
                          {t('Bind')}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </SettingsCard>

      <SettingsCard
        title={t('Route line detail preview')}
        description={t(
          'Model prices control billing. Channel bindings only control which carriers are available.'
        )}
      >
        {isLoading ? (
          <RouteLineLoading />
        ) : sortedLines.length === 0 ? (
          <div className='text-muted-foreground rounded-lg border border-dashed p-6 text-sm'>
            {t('No data')}
          </div>
        ) : (
          <div className='grid gap-3 md:grid-cols-2 xl:grid-cols-3'>
            {sortedLines.map((line) => (
              <div
                key={line.id}
                className='border-border/70 min-w-0 rounded-lg border p-4'
              >
                <div className='grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]'>
                  <div className='min-w-0'>
                    <div className='flex items-center gap-2'>
                      <span className='truncate font-medium'>{line.name}</span>
                    </div>
                    <div className='text-muted-foreground mt-1 font-mono text-xs'>
                      {line.code}
                    </div>
                    <div className='text-muted-foreground mt-1 text-xs'>
                      {t('Slot')}: {line.slot?.name || t('No slot')}
                    </div>
                    <div className='text-muted-foreground mt-1 text-xs'>
                      {t('Default ratio: {{ratio}}', {
                        ratio: formatDefaultRatio(line.defaultRatio),
                      })}
                    </div>
                  </div>
                  <div className='flex min-w-0 flex-wrap justify-end gap-1 sm:min-w-fit'>
                    <Button
                      type='button'
                      variant='outline'
                      size='sm'
                      onClick={() => setEditingLine(line)}
                    >
                      <Pencil className='size-3.5' />
                      {t('Edit')}
                    </Button>
                    <Button
                      type='button'
                      variant='outline'
                      size='sm'
                      onClick={() => {
                        setEditingModelPrice(null)
                        setModelPriceLine(line)
                      }}
                    >
                      <Tags className='size-3.5' />
                      {t('Price')}
                    </Button>
                    <Button
                      type='button'
                      variant='outline'
                      size='sm'
                      onClick={() => {
                        setEditingBinding(null)
                        setBindingLine(line)
                      }}
                    >
                      <Link2 className='size-3.5' />
                      {t('Bind')}
                    </Button>
                  </div>
                </div>
                <div className='mt-4 grid gap-4'>
                  <div className='grid gap-2'>
                    <div className='text-muted-foreground text-xs font-medium'>
                      {t('Model prices')}
                    </div>
                    <div className='text-muted-foreground text-xs'>
                      {t(
                        'Only custom model price overrides are listed here. Other models use the route default ratio when it is set.'
                      )}
                    </div>
                    <ModelPricesPreview
                      modelPrices={line.modelPrices}
                      deletingPriceId={deletingPriceId}
                      onEdit={(price) => handleEditModelPrice(line, price)}
                      onDelete={(price) => handleDeleteModelPrice(line, price)}
                    />
                  </div>
                  <div className='grid gap-2'>
                    <div className='text-muted-foreground text-xs font-medium'>
                      {t('Channel bindings')}
                    </div>
                    <ChannelBindingsPreview
                      bindings={line.bindings}
                      deletingBindingId={deletingBindingId}
                      onEdit={(binding) => handleEditBinding(line, binding)}
                      onDelete={(binding) => handleDeleteBinding(line, binding)}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </SettingsCard>
    </div>
  )
}
