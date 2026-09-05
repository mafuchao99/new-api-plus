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
import { ChevronRight } from 'lucide-react'

import { getAnnouncementSummary } from '@/lib/announcement'
import { getAnnouncementColorClass } from '@/lib/colors'
import { cn } from '@/lib/utils'

type AnnouncementListItemProps = {
  actionLabel: string
  content?: string
  dateText?: string
  fallbackTitle: string
  isRead: boolean
  onOpen: () => void
  title?: string
  type?: string
}

export function AnnouncementListItem(props: AnnouncementListItemProps) {
  const summary = getAnnouncementSummary(props.content || '', props.title)
  const title = summary.title || props.fallbackTitle

  return (
    <button
      type='button'
      onClick={props.onOpen}
      className={cn(
        'group border-border/70 bg-card/50 hover:border-border hover:bg-muted/60 focus-visible:ring-ring w-full rounded-xl border px-3.5 py-3 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none',
        !props.isRead && 'border-primary/20 bg-primary/5'
      )}
      aria-label={`${props.actionLabel}: ${title}`}
    >
      <div className='flex items-start gap-3'>
        <span className='bg-muted/80 mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full'>
          <span
            className={cn(
              'size-2 rounded-full',
              getAnnouncementColorClass(props.type),
              !props.isRead &&
                'ring-primary/25 ring-2 ring-offset-2 ring-offset-background'
            )}
          />
        </span>

        <div className='flex min-w-0 flex-1 flex-col gap-1.5'>
          <div className='flex min-w-0 items-start gap-2'>
            <p
              className={cn(
                'line-clamp-1 flex-1 text-sm leading-5',
                props.isRead
                  ? 'font-medium text-foreground/90'
                  : 'font-semibold text-foreground'
              )}
            >
              {title}
            </p>
            <ChevronRight className='text-muted-foreground/50 group-hover:text-foreground/70 mt-0.5 size-4 shrink-0 transition-colors' />
          </div>

          {summary.description ? (
            <p className='text-muted-foreground line-clamp-2 text-xs leading-5'>
              {summary.description}
            </p>
          ) : null}

          {props.dateText ? (
            <time className='text-muted-foreground/70 text-xs'>
              {props.dateText}
            </time>
          ) : null}
        </div>
      </div>
    </button>
  )
}
