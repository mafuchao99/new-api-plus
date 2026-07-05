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
import { useDeferredValue, useState, type KeyboardEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check, ChevronsUpDown, Loader2, Search, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { getChannels, searchChannels } from '@/features/channels/api'
import { CHANNEL_STATUS_LABELS } from '@/features/channels/constants'
import type { Channel } from '@/features/channels/types'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { LogsFilterInput } from './logs-filter-toolbar'

interface ChannelFilterSelectorProps {
  value: string
  sensitiveVisible: boolean
  onChange: (value: string | undefined) => void
  onKeyDown: (e: KeyboardEvent) => void
}

function getChannelFilterLabel(channel: Channel, sensitiveVisible: boolean) {
  if (!sensitiveVisible) return `#${channel.id}`

  const name = channel.name?.trim()
  return name ? `${name} #${channel.id}` : `#${channel.id}`
}

export function ChannelFilterSelector(props: ChannelFilterSelectorProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [keyword, setKeyword] = useState('')
  const deferredKeyword = useDeferredValue(keyword.trim())

  const { data, isFetching } = useQuery({
    queryKey: ['usage-logs', 'channel-filter-selector', deferredKeyword],
    queryFn: () => {
      if (deferredKeyword) {
        return searchChannels({
          keyword: deferredKeyword,
          id_sort: true,
          p: 1,
          page_size: 30,
        })
      }

      return getChannels({ id_sort: true, p: 1, page_size: 30 })
    },
    enabled: open,
    staleTime: 30_000,
    placeholderData: (previousData) => previousData,
  })

  const channels = data?.data?.items ?? []

  const handleSelect = (channel: Channel) => {
    props.onChange(String(channel.id))
    setOpen(false)
    setKeyword('')
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className='relative min-w-0'>
        <LogsFilterInput
          placeholder={t('Channel ID')}
          value={props.value}
          onChange={(e) => {
            const nextValue = e.target.value
            props.onChange(nextValue || undefined)
            setKeyword(nextValue)
          }}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onKeyDown={props.onKeyDown}
          className='pr-14'
        />
        <div className='absolute top-1/2 right-1 flex -translate-y-1/2 items-center gap-0.5'>
          {props.value && (
            <button
              type='button'
              className='text-muted-foreground hover:text-foreground focus-visible:ring-ring flex size-6 items-center justify-center rounded-md transition-colors focus-visible:ring-2 focus-visible:outline-none'
              aria-label={t('Clear')}
              onClick={(e) => {
                e.stopPropagation()
                props.onChange(undefined)
                setKeyword('')
              }}
            >
              <X className='size-3.5' aria-hidden='true' />
            </button>
          )}
          <PopoverTrigger
            render={
              <button
                type='button'
                className='text-muted-foreground hover:text-foreground focus-visible:ring-ring flex size-6 items-center justify-center rounded-md transition-colors focus-visible:ring-2 focus-visible:outline-none'
                aria-label={t('Channels')}
              />
            }
          >
            <ChevronsUpDown className='size-3.5' aria-hidden='true' />
          </PopoverTrigger>
        </div>
      </div>
      <PopoverContent
        align='end'
        sideOffset={6}
        className='w-96 max-w-[calc(100vw-2rem)] gap-1.5 p-1.5'
      >
        <div className='relative'>
          <Search className='text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2' />
          <LogsFilterInput
            placeholder={t('Filter by name, ID, or key...')}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            className='pl-8'
          />
        </div>
        <div className='max-h-64 overflow-y-auto rounded-md'>
          {isFetching && channels.length === 0 ? (
            <div className='text-muted-foreground flex items-center justify-center gap-2 px-3 py-6 text-sm'>
              <Loader2 className='size-4 animate-spin' aria-hidden='true' />
              {t('Loading...')}
            </div>
          ) : channels.length === 0 ? (
            <div className='text-muted-foreground px-3 py-6 text-center text-sm'>
              {t('No channels found')}
            </div>
          ) : (
            <div className='flex flex-col gap-0.5'>
              {channels.map((channel) => {
                const selected = props.value === String(channel.id)
                const statusLabel =
                  CHANNEL_STATUS_LABELS[
                    channel.status as keyof typeof CHANNEL_STATUS_LABELS
                  ] ?? 'Unknown'
                const groupLabel = props.sensitiveVisible ? channel.group : ''

                return (
                  <button
                    key={channel.id}
                    type='button'
                    className={cn(
                      'hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none',
                      selected && 'bg-accent text-accent-foreground'
                    )}
                    onClick={() => handleSelect(channel)}
                  >
                    <Check
                      className={cn(
                        'size-4 shrink-0',
                        selected ? 'opacity-100' : 'opacity-0'
                      )}
                      aria-hidden='true'
                    />
                    <span className='min-w-0 flex-1'>
                      <span className='block truncate font-medium'>
                        {getChannelFilterLabel(
                          channel,
                          props.sensitiveVisible
                        )}
                      </span>
                      <span className='text-muted-foreground block truncate text-xs'>
                        {groupLabel
                          ? `${t('Group')}: ${groupLabel} · ${t(statusLabel)}`
                          : t(statusLabel)}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
