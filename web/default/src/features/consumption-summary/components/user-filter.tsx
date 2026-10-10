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
import { useInfiniteQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox'
import { useDebounce } from '@/hooks/use-debounce'

import type { ConsumptionDataSource } from '../types'

type UserOption = { value: string; label: string }
type UserFilterProps = {
  value: string
  onChange: (userId: string) => void
  source: ConsumptionDataSource
}

export function UserFilter(props: UserFilterProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedUser, setSelectedUser] = useState<UserOption | null>(null)
  const keyword = useDebounce(search.trim(), 300)
  const usersQuery = useInfiniteQuery({
    queryKey: ['consumption-users', props.source.kind, keyword],
    queryFn: ({ pageParam, signal }) =>
      props.source.users(keyword, pageParam, signal),
    initialPageParam: 1,
    getNextPageParam: (lastPage, pages) => {
      const loaded = pages.reduce((total, page) => total + page.users.length, 0)
      return lastPage.users.length > 0 && loaded < lastPage.total
        ? pages.length + 1
        : undefined
    },
    enabled: open,
    retry: false,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })
  const allUsers = { value: 'all', label: t('All users') }
  const options = useMemo<UserOption[]>(() => {
    const users = usersQuery.data?.pages.flatMap((page) => page.users) ?? []
    return [
      ...(keyword ? [] : [{ value: 'all', label: t('All users') }]),
      ...[...new Map(users.map((user) => [user.id, user])).values()].map(
        (user) => ({
          value: user.id,
          label: `${user.username} · #${user.id}`,
        })
      ),
    ]
  }, [usersQuery.data, keyword, t])
  const selected = props.value === 'all' ? allUsers : selectedUser
  const searching = search.trim() !== keyword || usersQuery.isFetching
  return (
    <Combobox
      items={options}
      filter={null}
      value={selected}
      inputValue={open ? search : (selected?.label ?? '')}
      onInputValueChange={setSearch}
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) setSearch('')
        setOpen(nextOpen)
      }}
      itemToStringLabel={(option: UserOption) => option.label}
      itemToStringValue={(option: UserOption) => option.value}
      onValueChange={(option: UserOption | null) => {
        setSelectedUser(option)
        props.onChange(option?.value ?? 'all')
      }}
    >
      <ComboboxInput
        id='consumption-user'
        className='w-full'
        placeholder={t('Search username or user ID')}
      />
      <ComboboxContent>
        {searching && (
          <p role='status' className='text-muted-foreground px-3 py-2 text-xs'>
            {t('Loading...')}
          </p>
        )}
        {usersQuery.isError ? (
          <div role='alert' className='space-y-2 p-3 text-sm'>
            <p>{t('Failed to search users.')}</p>
            <Button
              type='button'
              size='sm'
              variant='outline'
              onClick={() => void usersQuery.refetch()}
            >
              {t('Retry')}
            </Button>
          </div>
        ) : (
          <>
            <ComboboxList aria-busy={searching}>
              <ComboboxCollection>
                {(option: UserOption) => (
                  <ComboboxItem
                    key={option.value}
                    value={option}
                    disabled={searching}
                  >
                    <span className='truncate'>{option.label}</span>
                  </ComboboxItem>
                )}
              </ComboboxCollection>
            </ComboboxList>
            {!searching && (
              <ComboboxEmpty>{t('No users found.')}</ComboboxEmpty>
            )}
            {usersQuery.hasNextPage && (
              <Button
                type='button'
                variant='ghost'
                className='w-full'
                disabled={searching}
                onClick={() => void usersQuery.fetchNextPage()}
              >
                {t('Load more')}
              </Button>
            )}
          </>
        )}
      </ComboboxContent>
    </Combobox>
  )
}
