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
import { useMutation, useQuery } from '@tanstack/react-query'
import type { TFunction } from 'i18next'
import {
  ChevronLeft,
  ChevronRight,
  Lock,
  Loader2,
  Route,
  Unlock,
} from 'lucide-react'
import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactElement,
} from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Dialog } from '@/components/dialog'
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
import { Skeleton } from '@/components/ui/skeleton'
import type { User } from '@/features/users/types'
import { cn } from '@/lib/utils'

import {
  getAdminUserApiKeys,
  getApiKeyRouteOptions,
  lockAdminApiKeyRoute,
  switchAdminApiKeyRoutes,
} from '../api'
import type {
  ApiKey,
  ApiKeyEffectiveRouteLine,
  ApiKeyRouteLine,
  ApiKeyRouteSlot,
} from '../types'

type ApiKeysRouteSwitchDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: User | null
  onRouteSwitchSuccess?: () => void
}

type PendingRouteSwitchAction = {
  apiKey: ApiKey
  routeLineId: string
}

type PendingRouteLockAction = PendingRouteSwitchAction & {
  locked: boolean
}

const KEY_PAGE_SIZE_OPTIONS = [10, 20, 50]
const DEFAULT_ROUTE_LINE_VALUE = '__default_route_line__'
const ROUTE_SWITCH_SKELETON_ROWS = ['first', 'second', 'third', 'fourth']

type ApiKeyRouteSwitchKeysResult = {
  items: ApiKey[]
  total: number
}

function formatRouteLineBillingLabel(
  line: ApiKeyRouteLine,
  t: TFunction
): string {
  const customModelPriceCount = line.model_prices.filter(
    (price) => price.enabled !== false
  ).length
  const ratio = line.default_ratio ?? 1
  if (customModelPriceCount > 0) {
    return t('Ratio {{ratio}}, {{count}} custom model price(s)', {
      ratio,
      count: customModelPriceCount,
    })
  }

  return t('Ratio {{ratio}}', { ratio })
}

function userDisplayName(user: User): string {
  return user.display_name || user.username || `#${user.id}`
}

function routeLineOptionsForSlot(
  lines: ApiKeyRouteLine[],
  slotId: string
): ApiKeyRouteLine[] {
  const numericSlotId = Number(slotId)
  if (!Number.isFinite(numericSlotId) || numericSlotId <= 0) return []

  return lines
    .filter((line) => line.slot_id === numericSlotId)
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.id - b.id)
}

function isDefaultRouteLineValue(routeLineId: string): boolean {
  return routeLineId === DEFAULT_ROUTE_LINE_VALUE
}

function routeLineValueToPayload(routeLineId: string): number {
  return isDefaultRouteLineValue(routeLineId) ? 0 : Number(routeLineId)
}

function effectiveRouteForSlot(
  apiKey: ApiKey,
  slotId: string
): ApiKeyEffectiveRouteLine | null {
  const numericSlotId = Number(slotId)
  if (!Number.isFinite(numericSlotId) || numericSlotId <= 0) return null

  return (
    apiKey.effective_route_lines?.find(
      (item) => item.route_slot.id === numericSlotId
    ) ?? null
  )
}

function ApiKeyRouteSwitchSkeleton(): ReactElement {
  return (
    <div className='space-y-2 rounded-lg border p-3'>
      {ROUTE_SWITCH_SKELETON_ROWS.map((row) => (
        <div key={row} className='space-y-2 border-b pb-3 last:border-b-0'>
          <div className='flex items-center justify-between gap-3'>
            <Skeleton className='h-4 w-40' />
            <Skeleton className='h-8 w-28' />
          </div>
          <Skeleton className='h-3 w-64 max-w-full' />
        </div>
      ))}
    </div>
  )
}

export function ApiKeysRouteSwitchDialog(
  props: ApiKeysRouteSwitchDialogProps
): ReactElement {
  const { t } = useTranslation()
  const selectedUser = props.user
  const [keySearchInput, setKeySearchInput] = useState('')
  const [keySearchTerm, setKeySearchTerm] = useState('')
  const [keyPage, setKeyPage] = useState(1)
  const [keyPageSize, setKeyPageSize] = useState(10)
  const [selectedSlotId, setSelectedSlotId] = useState('')
  const [batchLineId, setBatchLineId] = useState('')
  const [rowLineByKey, setRowLineByKey] = useState<Record<number, string>>({})
  const [lockedLineByKey, setLockedLineByKey] = useState<
    Record<number, string | null>
  >({})
  const [pendingSwitchAction, setPendingSwitchAction] =
    useState<PendingRouteSwitchAction | null>(null)
  const [pendingLockAction, setPendingLockAction] =
    useState<PendingRouteLockAction | null>(null)

  const routeOptionsQuery = useQuery({
    queryKey: ['api-key-route-switch-route-options'],
    queryFn: getApiKeyRouteOptions,
    enabled: props.open,
    staleTime: 5 * 60 * 1000,
  })
  const routeSlots = useMemo<ApiKeyRouteSlot[]>(() => {
    const rawSlots = routeOptionsQuery.data?.data?.slots ?? []
    return rawSlots
      .filter((slot) => slot.enabled !== false)
      .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.id - b.id)
  }, [routeOptionsQuery.data?.data?.slots])
  const routeLines = useMemo<ApiKeyRouteLine[]>(() => {
    const rawLines = routeOptionsQuery.data?.data?.lines ?? []
    return rawLines.filter(
      (line) => line.enabled !== false && line.visible !== false
    )
  }, [routeOptionsQuery.data?.data?.lines])
  const selectedSlot = routeSlots.find(
    (slot) => String(slot.id) === selectedSlotId
  )
  const selectedSlotLineOptions = useMemo(
    () => routeLineOptionsForSlot(routeLines, selectedSlotId),
    [routeLines, selectedSlotId]
  )
  const selectedSlotDefaultLine = selectedSlot?.default_route_line_id
    ? selectedSlotLineOptions.find(
        (line) => line.id === selectedSlot.default_route_line_id
      )
    : undefined
  const defaultRouteLineAvailable = selectedSlot?.default_route_line_id != null
  const selectedBatchLine = selectedSlotLineOptions.find(
    (line) => String(line.id) === batchLineId
  )

  const keysQuery = useQuery<ApiKeyRouteSwitchKeysResult>({
    queryKey: [
      'api-key-route-switch-user-keys',
      selectedUser?.id,
      keySearchTerm,
      keyPage,
      keyPageSize,
    ],
    queryFn: async () => {
      if (!selectedUser) return { items: [], total: 0 }
      const result = await getAdminUserApiKeys({
        userId: selectedUser.id,
        keyword: keySearchTerm,
        p: keyPage,
        size: keyPageSize,
      })
      if (!result.success) {
        throw new Error(result.message || t('Failed to load API keys'))
      }
      return {
        items: result.data?.items ?? [],
        total: result.data?.total ?? 0,
      }
    },
    enabled: props.open && selectedUser !== null,
    placeholderData: (previousData) => previousData,
  })
  const apiKeys = keysQuery.data?.items ?? []
  const keyTotal = keysQuery.data?.total ?? 0
  const keyTotalPages = Math.max(1, Math.ceil(keyTotal / keyPageSize))

  const routeSwitchMutation = useMutation({
    mutationFn: async (payload: {
      userId?: number
      tokenIds?: number[]
      routeSlotId: number
      routeLineId: number
    }) => {
      const result = await switchAdminApiKeyRoutes({
        user_id: payload.userId,
        token_ids: payload.tokenIds,
        route_slot_id: payload.routeSlotId,
        route_line_id: payload.routeLineId,
      })
      if (!result.success) {
        throw new Error(result.message || t('Failed to switch API key route'))
      }
      return result
    },
    onSuccess: () => {
      toast.success(t('Route switch saved'))
      props.onRouteSwitchSuccess?.()
      void keysQuery.refetch()
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : t('Failed to switch API key route')
      )
    },
  })

  const routeLockMutation = useMutation({
    mutationFn: async (payload: {
      userId?: number
      tokenId: number
      routeSlotId: number
      routeLineId: number
      locked: boolean
    }) => {
      const result = await lockAdminApiKeyRoute({
        user_id: payload.userId,
        token_ids: [payload.tokenId],
        route_slot_id: payload.routeSlotId,
        route_line_id: payload.routeLineId,
        locked: payload.locked,
      })
      if (!result.success) {
        throw new Error(result.message || t('Failed to update route lock'))
      }
      return payload
    },
    onSuccess: (payload) => {
      setLockedLineByKey((currentRows) => {
        const nextRows = { ...currentRows }
        if (payload.locked) {
          nextRows[payload.tokenId] = String(payload.routeLineId)
        } else {
          nextRows[payload.tokenId] = null
        }
        return nextRows
      })
      toast.success(
        payload.locked ? t('Route lock saved') : t('Route unlock saved')
      )
      props.onRouteSwitchSuccess?.()
      void keysQuery.refetch()
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : t('Failed to update route lock')
      )
    },
  })

  useEffect(() => {
    if (props.open) return
    setKeySearchInput('')
    setKeySearchTerm('')
    setKeyPage(1)
    setRowLineByKey({})
    setLockedLineByKey({})
    setPendingSwitchAction(null)
    setPendingLockAction(null)
  }, [props.open])

  useEffect(() => {
    if (!props.open) return
    setKeySearchInput('')
    setKeySearchTerm('')
    setKeyPage(1)
    setRowLineByKey({})
    setLockedLineByKey({})
    setPendingSwitchAction(null)
    setPendingLockAction(null)
  }, [props.open, selectedUser?.id])

  useEffect(() => {
    if (!props.open || routeSlots.length === 0 || selectedSlotId) return
    setSelectedSlotId(String(routeSlots[0].id))
  }, [props.open, routeSlots, selectedSlotId])

  useEffect(() => {
    if (!selectedSlotId) {
      setBatchLineId('')
      return
    }
    if (isDefaultRouteLineValue(batchLineId)) return
    const currentLineExists = selectedSlotLineOptions.some(
      (line) => String(line.id) === batchLineId
    )
    if (!currentLineExists) {
      setBatchLineId(DEFAULT_ROUTE_LINE_VALUE)
    }
  }, [batchLineId, selectedSlotId, selectedSlotLineOptions])

  const handleKeySearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setKeySearchTerm(keySearchInput.trim())
    setKeyPage(1)
  }

  const handleSlotChange = (value: string | null) => {
    setSelectedSlotId(value ?? '')
    setBatchLineId('')
    setRowLineByKey({})
  }

  const canSwitch =
    selectedSlotId !== '' &&
    batchLineId !== '' &&
    (isDefaultRouteLineValue(batchLineId)
      ? defaultRouteLineAvailable
      : selectedSlotLineOptions.length > 0)

  const defaultRouteLineLabel = selectedSlotDefaultLine
    ? t('Use default route line ({{route}})', {
        route: selectedSlotDefaultLine.name,
      })
    : t('Use default route line')

  const routeLineNameById = (routeLineId: string): string => {
    if (isDefaultRouteLineValue(routeLineId)) return defaultRouteLineLabel
    return (
      selectedSlotLineOptions.find((line) => String(line.id) === routeLineId)
        ?.name ?? t('No route line')
    )
  }

  const handleSwitchAll = (): void => {
    if (!selectedUser || !canSwitch) return

    routeSwitchMutation.mutate({
      userId: selectedUser.id,
      routeSlotId: Number(selectedSlotId),
      routeLineId: routeLineValueToPayload(batchLineId),
    })
  }

  const handleSwitchOne = (apiKey: ApiKey, routeLineId: string): void => {
    if (!selectedSlotId || !routeLineId) return

    routeSwitchMutation.mutate({
      userId: selectedUser?.id,
      tokenIds: [apiKey.id],
      routeSlotId: Number(selectedSlotId),
      routeLineId: routeLineValueToPayload(routeLineId),
    })
  }

  const routeLockedLineIdForKey = (apiKey: ApiKey): string => {
    if (Object.hasOwn(lockedLineByKey, apiKey.id)) {
      return lockedLineByKey[apiKey.id] ?? ''
    }
    if (
      apiKey.route_locked &&
      apiKey.locked_route_slot_id === Number(selectedSlotId) &&
      apiKey.locked_route_line_id
    ) {
      return String(apiKey.locked_route_line_id)
    }
    return ''
  }

  const handleToggleRouteLock = (
    apiKey: ApiKey,
    routeLineId: string,
    locked: boolean
  ): void => {
    if (
      !selectedSlotId ||
      !routeLineId ||
      isDefaultRouteLineValue(routeLineId)
    ) {
      return
    }

    routeLockMutation.mutate({
      userId: selectedUser?.id,
      tokenId: apiKey.id,
      routeSlotId: Number(selectedSlotId),
      routeLineId: Number(routeLineId),
      locked: !locked,
    })
  }

  const handleConfirmSwitchOne = (): void => {
    if (!pendingSwitchAction) return
    handleSwitchOne(pendingSwitchAction.apiKey, pendingSwitchAction.routeLineId)
    setPendingSwitchAction(null)
  }

  const handleConfirmRouteLock = (): void => {
    if (!pendingLockAction) return
    handleToggleRouteLock(
      pendingLockAction.apiKey,
      pendingLockAction.routeLineId,
      pendingLockAction.locked
    )
    setPendingLockAction(null)
  }

  const keysError =
    keysQuery.error instanceof Error ? keysQuery.error.message : null

  let apiKeyListContent: ReactElement
  if (keysQuery.isLoading) {
    apiKeyListContent = <ApiKeyRouteSwitchSkeleton />
  } else if (keysError) {
    apiKeyListContent = (
      <div className='text-muted-foreground rounded-lg border border-dashed p-4 text-center text-sm'>
        {keysError}
      </div>
    )
  } else if (apiKeys.length === 0) {
    apiKeyListContent = (
      <div className='text-muted-foreground rounded-lg border border-dashed p-4 text-center text-sm'>
        {t('No API keys found for this user')}
      </div>
    )
  } else {
    apiKeyListContent = (
      <div className='divide-border overflow-hidden rounded-lg border'>
        {apiKeys.map((apiKey) => {
          const current = effectiveRouteForSlot(apiKey, selectedSlotId)
          const lockedLineId = routeLockedLineIdForKey(apiKey)
          const lockedLine = lockedLineId
            ? selectedSlotLineOptions.find(
                (line) => String(line.id) === lockedLineId
              )
            : undefined
          const routeLocked = lockedLineId !== ''
          const rowLineId =
            rowLineByKey[apiKey.id] ||
            lockedLineId ||
            (current?.is_custom && current.route_line?.id
              ? String(current.route_line.id)
              : DEFAULT_ROUTE_LINE_VALUE)
          const rowRouteLine = isDefaultRouteLineValue(rowLineId)
            ? undefined
            : selectedSlotLineOptions.find(
                (line) => String(line.id) === rowLineId
              )
          const currentLineName =
            lockedLine?.name ?? current?.route_line?.name ?? t('No route line')
          const rowBusy =
            routeSwitchMutation.isPending || routeLockMutation.isPending
          const rowSwitchDisabled =
            !selectedSlotId ||
            !rowLineId ||
            rowBusy ||
            routeLocked ||
            (isDefaultRouteLineValue(rowLineId) && !defaultRouteLineAvailable)
          const rowLockDisabled =
            !selectedSlotId ||
            !rowLineId ||
            rowBusy ||
            (!routeLocked && isDefaultRouteLineValue(rowLineId))

          return (
            <div
              key={apiKey.id}
              className='grid gap-3 border-b p-3 last:border-b-0 xl:grid-cols-[minmax(0,1fr)_minmax(13rem,0.75fr)_auto] xl:items-center'
            >
              <div className='min-w-0'>
                <div className='flex min-w-0 items-center gap-2'>
                  <span className='truncate font-medium'>{apiKey.name}</span>
                  <Badge variant='outline' className='font-mono'>
                    #{apiKey.id}
                  </Badge>
                </div>
                <div className='text-muted-foreground mt-1 truncate font-mono text-xs'>
                  {apiKey.key}
                </div>
                <div className='text-muted-foreground mt-1 flex min-w-0 items-center gap-1 text-xs'>
                  <Route className='size-3.5 shrink-0' />
                  <span className='truncate'>
                    {t('Current route')}: {currentLineName}
                  </span>
                  {routeLocked && (
                    <Badge variant='secondary' className='h-5 shrink-0 gap-1'>
                      <Lock className='size-3' />
                      {t('Route locked')}
                    </Badge>
                  )}
                </div>
              </div>

              <Select
                value={rowLineId || undefined}
                onValueChange={(value) => {
                  if (value == null) return
                  setRowLineByKey((currentRows) => ({
                    ...currentRows,
                    [apiKey.id]: value,
                  }))
                }}
                disabled={routeLocked || !selectedSlotId}
              >
                <SelectTrigger className='w-full'>
                  <span
                    data-slot='select-value'
                    className={cn(
                      'flex flex-1 items-center gap-1.5 truncate text-left',
                      !rowRouteLine &&
                        !isDefaultRouteLineValue(rowLineId) &&
                        'text-muted-foreground'
                    )}
                  >
                    {isDefaultRouteLineValue(rowLineId)
                      ? defaultRouteLineLabel
                      : (rowRouteLine?.name ?? t('Select route line'))}
                  </span>
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  <SelectGroup>
                    <SelectItem value={DEFAULT_ROUTE_LINE_VALUE}>
                      <span className='truncate'>{defaultRouteLineLabel}</span>
                      <span className='text-muted-foreground truncate text-xs'>
                        {t('Clear custom route override')}
                      </span>
                    </SelectItem>
                    {selectedSlotLineOptions.map((line) => (
                      <SelectItem key={line.id} value={String(line.id)}>
                        <span className='truncate'>{line.name}</span>
                        <span className='text-muted-foreground truncate text-xs'>
                          {formatRouteLineBillingLabel(line, t)}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>

              <div className='flex flex-wrap gap-2 xl:justify-end'>
                {routeLocked && (
                  <div className='text-muted-foreground basis-full text-xs xl:text-right'>
                    {t('Unlock this key before switching routes.')}
                  </div>
                )}
                <Button
                  type='button'
                  variant='outline'
                  onClick={() =>
                    setPendingSwitchAction({ apiKey, routeLineId: rowLineId })
                  }
                  disabled={rowSwitchDisabled}
                >
                  <Route className='size-4' />
                  {t('Switch this key')}
                </Button>
                <Button
                  type='button'
                  variant={routeLocked ? 'secondary' : 'outline'}
                  onClick={() =>
                    setPendingLockAction({
                      apiKey,
                      routeLineId: rowLineId,
                      locked: routeLocked,
                    })
                  }
                  disabled={rowLockDisabled}
                >
                  {routeLocked ? (
                    <Unlock className='size-4' />
                  ) : (
                    <Lock className='size-4' />
                  )}
                  {routeLocked ? t('Unlock route') : t('Lock route')}
                </Button>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  const pendingSwitchRouteName = pendingSwitchAction
    ? routeLineNameById(pendingSwitchAction.routeLineId)
    : ''
  const pendingLockRouteName = pendingLockAction
    ? routeLineNameById(pendingLockAction.routeLineId)
    : ''

  return (
    <>
      <Dialog
        open={props.open}
        onOpenChange={props.onOpenChange}
        title={t('Manage API Keys')}
        contentClassName='sm:max-w-4xl'
        contentHeight='min(76vh, 48rem)'
        footer={
          <Button variant='outline' onClick={() => props.onOpenChange(false)}>
            {t('Close')}
          </Button>
        }
      >
        {!selectedUser ? (
          <div className='text-muted-foreground flex min-h-80 items-center justify-center rounded-lg border border-dashed p-8 text-center text-sm'>
            {t('Select a user first')}
          </div>
        ) : (
          <div className='grid min-w-0 gap-4'>
            <div className='grid gap-3 rounded-lg border p-3'>
              <div className='flex min-w-0 flex-wrap items-center justify-between gap-2'>
                <div className='min-w-0'>
                  <div className='text-muted-foreground text-xs font-medium'>
                    {t('Selected user')}
                  </div>
                  <div className='truncate font-semibold'>
                    {userDisplayName(selectedUser)}
                  </div>
                  <div className='text-muted-foreground truncate text-xs'>
                    {selectedUser.username}
                    {selectedUser.email ? ` - ${selectedUser.email}` : ''}
                  </div>
                </div>
                <div className='flex flex-wrap items-center gap-2'>
                  <Badge variant='secondary' className='font-mono'>
                    #{selectedUser.id}
                  </Badge>
                </div>
              </div>

              <div className='grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end'>
                <div className='grid gap-1.5'>
                  <label className='text-xs font-medium'>
                    {t('Target route slot')}
                  </label>
                  <Select
                    value={selectedSlotId || undefined}
                    onValueChange={handleSlotChange}
                    disabled={routeSlots.length === 0}
                  >
                    <SelectTrigger className='w-full'>
                      <span
                        data-slot='select-value'
                        className={cn(
                          'flex flex-1 items-center gap-1.5 truncate text-left',
                          !selectedSlot && 'text-muted-foreground'
                        )}
                      >
                        {selectedSlot?.name ?? t('Route slot')}
                      </span>
                    </SelectTrigger>
                    <SelectContent alignItemWithTrigger={false}>
                      <SelectGroup>
                        {routeSlots.map((slot) => (
                          <SelectItem key={slot.id} value={String(slot.id)}>
                            <span className='truncate'>{slot.name}</span>
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>

                <div className='grid gap-1.5'>
                  <label className='text-xs font-medium'>
                    {t('Target route line')}
                  </label>
                  <Select
                    value={batchLineId || undefined}
                    onValueChange={(value) => setBatchLineId(value ?? '')}
                    disabled={!selectedSlotId}
                  >
                    <SelectTrigger className='w-full'>
                      <span
                        data-slot='select-value'
                        className={cn(
                          'flex flex-1 items-center gap-1.5 truncate text-left',
                          !selectedBatchLine &&
                            !isDefaultRouteLineValue(batchLineId) &&
                            'text-muted-foreground'
                        )}
                      >
                        {isDefaultRouteLineValue(batchLineId)
                          ? defaultRouteLineLabel
                          : (selectedBatchLine?.name ?? t('Select route line'))}
                      </span>
                    </SelectTrigger>
                    <SelectContent alignItemWithTrigger={false}>
                      <SelectGroup>
                        <SelectItem value={DEFAULT_ROUTE_LINE_VALUE}>
                          <span className='truncate'>
                            {defaultRouteLineLabel}
                          </span>
                          <span className='text-muted-foreground truncate text-xs'>
                            {t('Clear custom route override')}
                          </span>
                        </SelectItem>
                        {selectedSlotLineOptions.map((line) => (
                          <SelectItem key={line.id} value={String(line.id)}>
                            <span className='truncate'>{line.name}</span>
                            <span className='text-muted-foreground truncate text-xs'>
                              {formatRouteLineBillingLabel(line, t)}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  type='button'
                  onClick={handleSwitchAll}
                  disabled={!canSwitch || routeSwitchMutation.isPending}
                >
                  {routeSwitchMutation.isPending && (
                    <Loader2 className='size-4 animate-spin' />
                  )}
                  {t('Apply to all keys')}
                </Button>
              </div>

              {selectedSlot && selectedSlotLineOptions.length === 0 && (
                <div className='text-muted-foreground rounded-lg border border-dashed p-3 text-xs'>
                  {t('No route lines in this slot')}
                </div>
              )}
            </div>

            <div className='grid gap-3 rounded-lg border p-3'>
              <form className='flex gap-2' onSubmit={handleKeySearch}>
                <Input
                  value={keySearchInput}
                  onChange={(event) => setKeySearchInput(event.target.value)}
                  placeholder={t("Filter this user's API keys...")}
                />
                <Button type='submit' variant='outline'>
                  {t('Search')}
                </Button>
              </form>

              {apiKeyListContent}

              <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
                <div className='text-muted-foreground text-xs'>
                  {t('Page {{current}} of {{total}}', {
                    current: Math.min(keyPage, keyTotalPages),
                    total: keyTotalPages,
                  })}
                </div>
                <div className='flex flex-wrap items-center gap-2'>
                  <span className='text-muted-foreground text-xs'>
                    {t('Rows per page')}
                  </span>
                  <Select
                    value={String(keyPageSize)}
                    onValueChange={(value) => {
                      setKeyPageSize(Number(value))
                      setKeyPage(1)
                    }}
                  >
                    <SelectTrigger size='sm'>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent alignItemWithTrigger={false}>
                      <SelectGroup>
                        {KEY_PAGE_SIZE_OPTIONS.map((size) => (
                          <SelectItem key={size} value={String(size)}>
                            {size}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    onClick={() => setKeyPage((page) => Math.max(1, page - 1))}
                    disabled={keyPage <= 1 || keysQuery.isFetching}
                  >
                    <ChevronLeft className='size-4' />
                    {t('Previous')}
                  </Button>
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    onClick={() =>
                      setKeyPage((page) => Math.min(keyTotalPages, page + 1))
                    }
                    disabled={keyPage >= keyTotalPages || keysQuery.isFetching}
                  >
                    {t('Next')}
                    <ChevronRight className='size-4' />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </Dialog>
      <ConfirmDialog
        open={pendingSwitchAction !== null}
        onOpenChange={(open) => {
          if (!open) setPendingSwitchAction(null)
        }}
        title={t('Switch this key')}
        desc={t('Switch {{key}} to {{route}}?', {
          key: pendingSwitchAction?.apiKey.name ?? '',
          route: pendingSwitchRouteName,
        })}
        confirmText={t('Switch this key')}
        handleConfirm={handleConfirmSwitchOne}
        isLoading={routeSwitchMutation.isPending}
      />
      <ConfirmDialog
        open={pendingLockAction !== null}
        onOpenChange={(open) => {
          if (!open) setPendingLockAction(null)
        }}
        title={pendingLockAction?.locked ? t('Unlock route') : t('Lock route')}
        desc={
          pendingLockAction?.locked
            ? t('Unlock route for {{key}}?', {
                key: pendingLockAction?.apiKey.name ?? '',
              })
            : t('Lock {{key}} to {{route}}?', {
                key: pendingLockAction?.apiKey.name ?? '',
                route: pendingLockRouteName,
              })
        }
        confirmText={
          pendingLockAction?.locked ? t('Unlock route') : t('Lock route')
        }
        handleConfirm={handleConfirmRouteLock}
        isLoading={routeLockMutation.isPending}
      />
    </>
  )
}
