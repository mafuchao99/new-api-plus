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
import { useEffect, useState } from 'react'
import { useForm, type SubmitErrorHandler } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  ChevronDown,
  KeyRound,
  Route,
  Settings2,
  WalletCards,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { getUserModels, getUserGroups } from '@/lib/api'
import { getCurrencyDisplay, getCurrencyLabel } from '@/lib/currency'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
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
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { DateTimePicker } from '@/components/datetime-picker'
import {
  SideDrawerSection,
  SideDrawerSectionHeader,
  sideDrawerContentClassName,
  sideDrawerFooterClassName,
  sideDrawerFormClassName,
  sideDrawerHeaderClassName,
  sideDrawerSwitchItemClassName,
} from '@/components/drawer-layout'
import { MultiSelect } from '@/components/multi-select'
import {
  createApiKey,
  updateApiKey,
  getApiKey,
  getApiKeyRouteOptions,
} from '../api'
import { ERROR_MESSAGES, SUCCESS_MESSAGES } from '../constants'
import {
  getApiKeyFormSchema,
  type ApiKeyFormValues,
  getApiKeyFormDefaultValues,
  transformFormDataToPayload,
  transformApiKeyToFormDefaults,
} from '../lib'
import { type ApiKey, type ApiKeyRouteLine } from '../types'
import {
  ApiKeyGroupCombobox,
  type ApiKeyGroupOption,
} from './api-key-group-combobox'
import { useApiKeys } from './api-keys-provider'

type ApiKeyMutateDrawerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentRow?: ApiKey
}

type ApiKeyRoutePolicyMode = 'follow_default' | 'custom'

type ApiKeyRouteSlotLinePreviewOption = {
  id: string
  code: string
  name: string
  description: string
  billingMode: string
  defaultRatio?: number | null
  modelPrices: ApiKeyRouteLine['model_prices']
  channelModels: string[]
}

type ApiKeyRouteSlotPreviewOption = {
  id: string
  code: string
  name: string
  description: string
  defaultLineId?: string
  modelNames: string[]
  routeLines: ApiKeyRouteSlotLinePreviewOption[]
}

export function ApiKeysMutateDrawer({
  open,
  onOpenChange,
  currentRow,
}: ApiKeyMutateDrawerProps) {
  const { t } = useTranslation()
  const isUpdate = !!currentRow
  const { triggerRefresh } = useApiKeys()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [routePolicyMode, setRoutePolicyMode] =
    useState<ApiKeyRoutePolicyMode>('follow_default')
  const [slotRouteOverrides, setSlotRouteOverrides] = useState<
    Record<string, string>
  >({})
  // Fetch models
  const { data: modelsData } = useQuery({
    queryKey: ['user-models'],
    queryFn: getUserModels,
    enabled: open,
    staleTime: 0,
  })

  // Fetch groups
  const { data: groupsData } = useQuery({
    queryKey: ['user-groups'],
    queryFn: getUserGroups,
    enabled: open,
    staleTime: 0,
  })

  const { data: routeOptionsData } = useQuery({
    queryKey: ['api-key-route-options'],
    queryFn: getApiKeyRouteOptions,
    enabled: open,
    staleTime: 0,
  })

  const models = modelsData?.data || []
  const groupsRaw = groupsData?.data || {}
  const groups: ApiKeyGroupOption[] = Object.entries(groupsRaw).map(
    ([key, info]) => ({
      value: key,
      label: key,
      desc: info.desc || key,
      ratio: info.ratio,
    })
  )
  const routeOptionSlots = routeOptionsData?.data?.slots ?? []
  const routeOptionLines = routeOptionsData?.data?.lines ?? []
  const parseChannelModels = (models: string | null | undefined) =>
    (models || '')
      .split(',')
      .map((model) => model.trim())
      .filter(Boolean)
  const routeSlotOptions: ApiKeyRouteSlotPreviewOption[] =
    routeOptionSlots.map((slot) => {
      const routeLines = routeOptionLines
        .filter((line) => line.slot_id === slot.id)
        .map((line) => {
          const channelModels = Array.from(
            new Set(
              (line.bindings ?? []).flatMap((binding) =>
                binding.enabled === false
                  ? []
                  : parseChannelModels(binding.channel?.models)
              )
            )
          )
          return {
            id: String(line.id),
            code: line.code,
            name: line.name,
            description: line.description || '',
            billingMode:
              (line.model_prices ?? []).some(
                (price) =>
                  price.enabled !== false &&
                  price.billing_mode === 'per_request'
              )
                ? 'per_request'
                : (line.model_prices ?? []).some(
                      (price) => price.enabled !== false
                    )
                  ? 'custom'
                  : 'ratio',
            defaultRatio: line.default_ratio,
            modelPrices: line.model_prices ?? [],
            channelModels,
          }
        })
      const modelNames = Array.from(
        new Set(
          routeLines.flatMap((line) =>
            line.channelModels.length > 0
              ? line.channelModels
              : line.modelPrices
                  .filter((price) => price.enabled !== false)
                  .map((price) => price.model_name)
          )
        )
      )

      return {
        id: String(slot.id),
        code: slot.code,
        name: slot.name,
        description: slot.description || '',
        defaultLineId: slot.default_route_line_id
          ? String(slot.default_route_line_id)
          : undefined,
        modelNames,
        routeLines,
      }
    })
  const schema = getApiKeyFormSchema(t)

  const form = useForm<ApiKeyFormValues>({
    resolver: zodResolver(schema),
    defaultValues: getApiKeyFormDefaultValues(),
  })

  // Load existing data when updating
  useEffect(() => {
    if (open && isUpdate && currentRow) {
      getApiKey(currentRow.id).then((result) => {
        if (result.success && result.data) {
          form.reset(transformApiKeyToFormDefaults(result.data))
          const routeOverrides = result.data.route_overrides ?? []
          const overrides = Object.fromEntries(
            routeOverrides.map((override) => [
              String(override.route_slot_id),
              String(override.route_line_id),
            ])
          )
          setRoutePolicyMode(
            routeOverrides.length > 0 ? 'custom' : 'follow_default'
          )
          setSlotRouteOverrides(overrides)
        }
      })
    } else if (open && !isUpdate) {
      form.reset(getApiKeyFormDefaultValues())
      setRoutePolicyMode('follow_default')
      setSlotRouteOverrides({})
    }
  }, [open, isUpdate, currentRow, form])

  // Correct group after groups load: if the form value is not in available groups, fall back
  useEffect(() => {
    if (groups.length === 0) return
    const currentGroup = form.getValues('group')
    if (currentGroup && !groups.some((g) => g.value === currentGroup)) {
      const fallback =
        groups.find((g) => g.value === 'default')?.value ??
        groups[0]?.value ??
        ''
      form.setValue('group', fallback)
      if (currentGroup === 'auto') {
        form.setValue('cross_group_retry', false)
      }
    }
  }, [groups, form])

  const getRouteOverridePayload = () => {
    if (routePolicyMode !== 'custom') return []
    return Object.entries(slotRouteOverrides).flatMap(
      ([routeSlotId, selectedLineId]) => {
        if (!selectedLineId) return []
        return [
          {
            route_slot_id: Number(routeSlotId),
            route_line_id: Number(selectedLineId),
          },
        ]
      }
    )
  }

  const onSubmit = async (data: ApiKeyFormValues) => {
    setIsSubmitting(true)
    try {
      const basePayload = transformFormDataToPayload(
        data,
        getRouteOverridePayload()
      )

      if (isUpdate && currentRow) {
        const result = await updateApiKey({
          ...basePayload,
          id: currentRow.id,
        })
        if (result.success) {
          toast.success(t(SUCCESS_MESSAGES.API_KEY_UPDATED))
          onOpenChange(false)
          triggerRefresh()
        } else {
          toast.error(
            result.message
              ? t(result.message)
              : t(ERROR_MESSAGES.UPDATE_FAILED)
          )
        }
      } else {
        // Create mode - handle batch creation
        const count = data.tokenCount || 1
        let successCount = 0

        for (let i = 0; i < count; i++) {
          const result = await createApiKey({
            ...basePayload,
            name:
              i === 0 && data.name
                ? data.name
                : `${data.name || 'default'}-${Math.random().toString(36).slice(2, 8)}`,
          })
          if (result.success) {
            successCount++
          } else {
            toast.error(
              result.message
                ? t(result.message)
                : t(ERROR_MESSAGES.CREATE_FAILED)
            )
            break
          }
        }

        if (successCount > 0) {
          toast.success(
            t('Successfully created {{count}} API Key(s)', {
              count: successCount,
            })
          )
          onOpenChange(false)
          triggerRefresh()
        }
      }
    } catch (_error) {
      toast.error(t(ERROR_MESSAGES.UNEXPECTED))
    } finally {
      setIsSubmitting(false)
    }
  }

  const onInvalid: SubmitErrorHandler<ApiKeyFormValues> = () => {
    toast.error(t('Please fix the highlighted fields before saving'))
  }

  const handleSetExpiry = (months: number, days: number, hours: number) => {
    if (months === 0 && days === 0 && hours === 0) {
      form.setValue('expired_time', undefined)
      return
    }

    const now = new Date()
    now.setMonth(now.getMonth() + months)
    now.setDate(now.getDate() + days)
    now.setHours(now.getHours() + hours)

    form.setValue('expired_time', now)
  }

  const { meta: currencyMeta } = getCurrencyDisplay()
  const currencyLabel = getCurrencyLabel()
  const tokensOnly = currencyMeta.kind === 'tokens'
  const quotaLabel = t('Quota ({{currency}})', { currency: currencyLabel })
  const quotaPlaceholder = tokensOnly
    ? t('Enter quota in tokens')
    : t('Enter quota in {{currency}}', { currency: currencyLabel })
  const selectedGroup = form.watch('group')
  const unlimitedQuota = form.watch('unlimited_quota')
  const getEffectiveRouteLine = (slot: ApiKeyRouteSlotPreviewOption) => {
    const selectedLineId =
      routePolicyMode === 'custom' ? slotRouteOverrides[slot.id] : undefined
    return (
      slot.routeLines.find((line) => line.id === selectedLineId) ??
      (slot.defaultLineId
        ? slot.routeLines.find((line) => line.id === slot.defaultLineId)
        : undefined) ??
      slot.routeLines[0]
    )
  }

  const getRouteLineBillingLabel = (
    routeLine?: ApiKeyRouteSlotLinePreviewOption
  ) => {
    if (!routeLine) return t('No route line')
    const customModelPriceCount = routeLine.modelPrices.filter(
      (price) => price.enabled !== false
    ).length
    const ratioLabel = t('Ratio {{ratio}}', {
      ratio: routeLine.defaultRatio ?? 1,
    })
    if (customModelPriceCount > 0) {
      return t('Ratio {{ratio}}, {{count}} custom model price(s)', {
        ratio: routeLine.defaultRatio ?? 1,
        count: customModelPriceCount,
      })
    }
    return ratioLabel
  }

  const handleSlotRouteOverrideChange = (
    slotId: string,
    value: string | null
  ) => {
    setSlotRouteOverrides((overrides) => {
      const next = { ...overrides }
      if (!value || value === 'follow_default') {
        delete next[slotId]
      } else {
        next[slotId] = value
      }
      return next
    })
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v)
        if (!v) {
          form.reset()
        }
      }}
    >
      <SheetContent
        className={sideDrawerContentClassName('max-w-none sm:!max-w-[620px]')}
      >
        <SheetHeader className={sideDrawerHeaderClassName()}>
          <SheetTitle>
            {isUpdate ? t('Update API Key') : t('Create API Key')}
          </SheetTitle>
          <SheetDescription>
            {isUpdate
              ? t('Update the API key by providing necessary info.')
              : t('Add a new API key by providing necessary info.')}
          </SheetDescription>
        </SheetHeader>
        <Form {...form}>
          <form
            id='api-key-form'
            onSubmit={form.handleSubmit(onSubmit, onInvalid)}
            className={sideDrawerFormClassName('gap-5')}
          >
            <SideDrawerSection>
              <SideDrawerSectionHeader
                title={t('Basic Information')}
                description={t('Set API key basic information')}
                icon={<KeyRound className='size-4' />}
              />
              <FormField
                control={form.control}
                name='name'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Name')}</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder={t('Enter a name')} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='group'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Group')}</FormLabel>
                    <FormControl>
                      <ApiKeyGroupCombobox
                        options={groups}
                        value={field.value}
                        onValueChange={field.onChange}
                        placeholder={t('Select a group')}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {selectedGroup === 'auto' && (
                <FormField
                  control={form.control}
                  name='cross_group_retry'
                  render={({ field }) => (
                    <FormItem className={sideDrawerSwitchItemClassName()}>
                      <div className='flex flex-col gap-0.5'>
                        <FormLabel className='text-sm'>
                          {t('Cross-group retry')}
                        </FormLabel>
                        <FormDescription className='line-clamp-2 text-xs sm:line-clamp-none'>
                          {t(
                            'When enabled, if channels in the current group fail, it will try channels in the next group in order.'
                          )}
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={!!field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name='expired_time'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Expiration Time')}</FormLabel>
                    <div className='grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center'>
                      <FormControl>
                        <DateTimePicker
                          value={field.value}
                          onChange={field.onChange}
                          placeholder={t('Never expires')}
                          className='min-w-0 [&_input[type=time]]:w-24 sm:[&_input[type=time]]:w-32'
                        />
                      </FormControl>
                      <div className='grid grid-cols-4 gap-2 sm:flex'>
                        <Button
                          type='button'
                          variant='outline'
                          size='sm'
                          className='px-2 text-xs sm:px-3 sm:text-sm'
                          onClick={() => handleSetExpiry(0, 0, 0)}
                        >
                          {t('Never')}
                        </Button>
                        <Button
                          type='button'
                          variant='outline'
                          size='sm'
                          className='px-2 text-xs sm:px-3 sm:text-sm'
                          onClick={() => handleSetExpiry(1, 0, 0)}
                        >
                          {t('1 Month')}
                        </Button>
                        <Button
                          type='button'
                          variant='outline'
                          size='sm'
                          className='px-2 text-xs sm:px-3 sm:text-sm'
                          onClick={() => handleSetExpiry(0, 1, 0)}
                        >
                          {t('1 Day')}
                        </Button>
                        <Button
                          type='button'
                          variant='outline'
                          size='sm'
                          className='px-2 text-xs sm:px-3 sm:text-sm'
                          onClick={() => handleSetExpiry(0, 0, 1)}
                        >
                          {t('1 Hour')}
                        </Button>
                      </div>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {!isUpdate && (
                <FormField
                  control={form.control}
                  name='tokenCount'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Quantity')}</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type='number'
                          min='1'
                          placeholder={t('Number of keys to create')}
                          onChange={(e) =>
                            field.onChange(parseInt(e.target.value, 10) || 1)
                          }
                        />
                      </FormControl>
                      <FormDescription>
                        {t(
                          'Create multiple API keys at once (random suffix will be added to names)'
                        )}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </SideDrawerSection>

            <SideDrawerSection>
              <SideDrawerSectionHeader
                title={t('Model Route Strategy')}
                description={
                  <span className='inline-flex flex-wrap items-center gap-x-2 gap-y-1'>
                    <span>
                      {t('Choose which route each model category uses')}
                    </span>
                    <Link
                      to='/pricing'
                      target='_blank'
                      rel='noopener noreferrer'
                      className='text-foreground underline decoration-current/40 underline-offset-4 transition-colors hover:decoration-current'
                    >
                      {t('View model pricing')}
                    </Link>
                  </span>
                }
                icon={<Route className='size-4' />}
              />
              <div className='grid gap-3'>
                <div className='grid grid-cols-2 gap-1 rounded-lg border p-1'>
                  <Button
                    type='button'
                    variant={
                      routePolicyMode === 'follow_default'
                        ? 'secondary'
                        : 'ghost'
                    }
                    className='h-8'
                    onClick={() => setRoutePolicyMode('follow_default')}
                  >
                    {t('Follow default strategy')}
                  </Button>
                  <Button
                    type='button'
                    variant={
                      routePolicyMode === 'custom' ? 'secondary' : 'ghost'
                    }
                    className='h-8'
                    onClick={() => setRoutePolicyMode('custom')}
                  >
                    {t('Custom routes')}
                  </Button>
                </div>

                <div className='grid gap-2'>
                  {routeSlotOptions.length === 0 && (
                    <div className='text-muted-foreground rounded-lg border border-dashed p-3 text-xs'>
                      {t('No route slots available')}
                    </div>
                  )}
                  {routeSlotOptions.map((slot) => {
                    const effectiveLine = getEffectiveRouteLine(slot)
                    const overrideLineId = slotRouteOverrides[slot.id]
                    const isOverridden =
                      routePolicyMode === 'custom' && Boolean(overrideLineId)
                    return (
                      <div
                        key={slot.id}
                        className='border-border/70 rounded-lg border p-3'
                      >
                        <div className='grid gap-3'>
                          <div className='flex flex-wrap items-start justify-between gap-3'>
                            <div className='min-w-0'>
                              <div className='flex flex-wrap items-center gap-2'>
                                <span className='truncate text-sm font-medium'>
                                  {slot.name}
                                </span>
                                <Badge variant='outline' className='font-mono'>
                                  {slot.code}
                                </Badge>
                                {isOverridden ? (
                                  <Badge variant='secondary'>
                                    {t('Custom')}
                                  </Badge>
                                ) : (
                                  <Badge variant='outline'>
                                    {t('Default')}
                                  </Badge>
                                )}
                              </div>
                              <div className='text-muted-foreground mt-1 text-xs'>
                                {slot.description || t('No description')}
                              </div>
                            </div>
                            <div className='flex shrink-0 flex-wrap justify-end gap-1'>
                              <Badge variant='secondary'>
                                {effectiveLine?.name ?? t('No route line')}
                              </Badge>
                              <Badge variant='outline'>
                                {getRouteLineBillingLabel(effectiveLine)}
                              </Badge>
                            </div>
                          </div>

                          {routePolicyMode === 'custom' && (
                            <Select
                              items={[
                                {
                                  value: 'follow_default',
                                  label: t('Follow default route'),
                                },
                                ...slot.routeLines.map((routeLine) => ({
                                  value: routeLine.id,
                                  label: routeLine.name,
                                })),
                              ]}
                              value={overrideLineId || 'follow_default'}
                              onValueChange={(value) =>
                                handleSlotRouteOverrideChange(slot.id, value)
                              }
                            >
                              <SelectTrigger className='w-full'>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent alignItemWithTrigger={false}>
                                <SelectGroup>
                                  <SelectItem value='follow_default'>
                                    <span className='truncate'>
                                      {t('Follow default route')}
                                    </span>
                                    <span className='text-muted-foreground truncate text-xs'>
                                      {getEffectiveRouteLine(slot)?.name ??
                                        t('No route line')}
                                    </span>
                                    <span className='text-muted-foreground font-mono text-xs'>
                                      {getRouteLineBillingLabel(
                                        getEffectiveRouteLine(slot)
                                      )}
                                    </span>
                                  </SelectItem>
                                  {slot.routeLines.map((routeLine) => (
                                    <SelectItem
                                      key={routeLine.id}
                                      value={routeLine.id}
                                    >
                                      <span className='truncate'>
                                        {routeLine.name}
                                      </span>
                                      <span className='text-muted-foreground truncate text-xs'>
                                        {getRouteLineBillingLabel(routeLine)}
                                      </span>
                                      {routeLine.description && (
                                        <span className='text-muted-foreground truncate text-xs'>
                                          {routeLine.description}
                                        </span>
                                      )}
                                    </SelectItem>
                                  ))}
                                </SelectGroup>
                              </SelectContent>
                            </Select>
                          )}

                          <div className='flex flex-wrap gap-1'>
                            {slot.modelNames.length === 0 && (
                              <span className='text-muted-foreground text-xs'>
                                {t('No custom model prices')}
                              </span>
                            )}
                            {slot.modelNames.slice(0, 8).map((model) => (
                              <Badge
                                key={model}
                                variant='outline'
                                className='font-mono'
                              >
                                {model}
                              </Badge>
                            ))}
                            {slot.modelNames.length > 8 && (
                              <Badge variant='outline'>
                                {t('+{{count}} more', {
                                  count: slot.modelNames.length - 8,
                                })}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div className='text-muted-foreground rounded-lg border border-dashed p-3 text-xs'>
                  <div className='font-medium text-foreground'>
                    {t('Current route preview')}
                  </div>
                  <div className='mt-2 grid gap-1'>
                    {routeSlotOptions.map((slot) => {
                      const effectiveLine = getEffectiveRouteLine(slot)
                      return (
                        <div
                          key={slot.id}
                          className='grid grid-cols-[minmax(0,1fr)_auto] gap-2'
                        >
                          <span className='truncate'>{slot.name}</span>
                          <span className='truncate font-medium text-foreground'>
                            {effectiveLine?.name ?? t('No route line')}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </SideDrawerSection>

            <SideDrawerSection>
              <SideDrawerSectionHeader
                title={t('Quota Settings')}
                description={t('Set quota amount and limits')}
                icon={<WalletCards className='size-4' />}
              />
              {!unlimitedQuota && (
                <FormField
                  control={form.control}
                  name='remain_quota_dollars'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{quotaLabel}</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type='number'
                          step={tokensOnly ? 1 : 0.01}
                          placeholder={quotaPlaceholder}
                          onChange={(e) =>
                            field.onChange(parseFloat(e.target.value) || 0)
                          }
                        />
                      </FormControl>
                      <FormDescription>
                        {tokensOnly
                          ? t('Enter the quota amount in tokens')
                          : t('Enter the quota amount in {{currency}}', {
                              currency: currencyLabel,
                            })}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name='unlimited_quota'
                render={({ field }) => (
                  <FormItem className={sideDrawerSwitchItemClassName()}>
                    <div className='flex flex-col gap-0.5'>
                      <FormLabel className='text-sm'>
                        {t('Unlimited Quota')}
                      </FormLabel>
                      <FormDescription className='text-xs'>
                        {t('Enable unlimited quota for this API key')}
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
            </SideDrawerSection>

            <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
              <SideDrawerSection>
                <CollapsibleTrigger
                  render={
                    <button
                      type='button'
                      className='hover:bg-muted/40 flex w-full items-center gap-3 rounded-md py-1.5 text-left transition-colors'
                    />
                  }
                >
                  <SideDrawerSectionHeader
                    className='flex-1'
                    title={t('Advanced Settings')}
                    description={t('Set API key access restrictions')}
                    icon={<Settings2 className='size-4' />}
                  />
                  <ChevronDown
                    className={cn(
                      'text-muted-foreground size-4 shrink-0 transition-transform',
                      advancedOpen && 'rotate-180'
                    )}
                  />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className='flex flex-col gap-4 pt-2'>
                    <FormField
                      control={form.control}
                      name='model_limits'
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('Model Limits')}</FormLabel>
                          <FormControl>
                            <MultiSelect
                              options={models.map((m) => ({
                                label: m,
                                value: m,
                              }))}
                              selected={field.value}
                              onChange={field.onChange}
                              placeholder={t(
                                'Select models (empty for allow all)'
                              )}
                            />
                          </FormControl>
                          <FormDescription>
                            {t('Limit which models can be used with this key')}
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name='allow_ips'
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            {t('IP Whitelist (supports CIDR)')}
                          </FormLabel>
                          <FormControl>
                            <Textarea
                              {...field}
                              className='min-h-20 resize-none'
                              placeholder={t(
                                'One IP per line (empty for no restriction)'
                              )}
                              rows={3}
                            />
                          </FormControl>
                          <FormDescription>
                            {t(
                              'Do not over-trust this feature. IP may be spoofed. Please use with nginx, CDN and other gateways.'
                            )}
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </CollapsibleContent>
              </SideDrawerSection>
            </Collapsible>
          </form>
        </Form>
        <SheetFooter className={sideDrawerFooterClassName()}>
          <SheetClose
            render={<Button variant='outline' className='w-full sm:w-auto' />}
          >
            {t('Close')}
          </SheetClose>
          <Button
            type='button'
            onClick={form.handleSubmit(onSubmit, onInvalid)}
            disabled={isSubmitting}
            className='w-full sm:w-auto'
          >
            {isSubmitting ? t('Saving...') : t('Save changes')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
