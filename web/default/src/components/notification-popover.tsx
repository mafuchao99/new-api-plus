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
import type { TFunction } from 'i18next'
import { Bell, Megaphone } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { AnnouncementDetailModal } from '@/components/announcement-detail-dialog'
import { AnnouncementListItem } from '@/components/announcement-list-item'
import { NotificationMarkdown } from '@/components/notification-markdown'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatDateTimeObject } from '@/lib/time'
import { cn } from '@/lib/utils'

interface AnnouncementItem {
  id?: number | string
  title?: string
  type?: string
  content?: string
  extra?: string
  publishDate?: string | Date
}

interface NotificationPopoverProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  unreadCount: number
  unreadNoticeCount: number
  unreadAnnouncementsCount: number
  activeTab: 'notice' | 'announcements'
  onTabChange: (tab: 'notice' | 'announcements') => void
  notice: string
  announcements: AnnouncementItem[]
  loading: boolean
  isAnnouncementRead?: (announcement: AnnouncementItem) => boolean
  onAnnouncementRead?: (announcement: AnnouncementItem) => void
  className?: string
}

function getRelativeTime(publishDate: string | Date, t: TFunction): string {
  if (!publishDate) return ''

  const now = new Date()
  const pubDate = new Date(publishDate)

  if (Number.isNaN(pubDate.getTime())) {
    return typeof publishDate === 'string' ? publishDate : ''
  }

  const diffMs = now.getTime() - pubDate.getTime()
  const diffSeconds = Math.floor(diffMs / 1000)
  const diffMinutes = Math.floor(diffSeconds / 60)
  const diffHours = Math.floor(diffMinutes / 60)
  const diffDays = Math.floor(diffHours / 24)
  const diffWeeks = Math.floor(diffDays / 7)
  const diffMonths = Math.floor(diffDays / 30)
  const diffYears = Math.floor(diffDays / 365)

  if (diffMs < 0) return formatDateTimeObject(pubDate)
  if (diffSeconds < 60) return t('Just now')
  if (diffMinutes < 60) {
    return diffMinutes === 1
      ? t('1 minute ago')
      : t('{{count}} minutes ago', { count: diffMinutes })
  }
  if (diffHours < 24) {
    return diffHours === 1
      ? t('1 hour ago')
      : t('{{count}} hours ago', { count: diffHours })
  }
  if (diffDays < 7) {
    return diffDays === 1
      ? t('1 day ago')
      : t('{{count}} days ago', { count: diffDays })
  }
  if (diffWeeks < 4) {
    return diffWeeks === 1
      ? t('1 week ago')
      : t('{{count}} weeks ago', { count: diffWeeks })
  }
  if (diffMonths < 12) {
    return diffMonths === 1
      ? t('1 month ago')
      : t('{{count}} months ago', { count: diffMonths })
  }
  if (diffYears < 2) return t('1 year ago')

  return formatDateTimeObject(pubDate)
}

function TabUnreadBadge(props: { count: number }) {
  if (props.count <= 0) return null

  return (
    <Badge
      variant='destructive'
      className='h-4 min-w-4 px-1 text-[10px] leading-none'
    >
      {props.count > 99 ? '99+' : props.count}
    </Badge>
  )
}

function NotificationAnnouncementListItem(props: {
  item: AnnouncementItem
  isRead: boolean
  onOpen: (item: AnnouncementItem) => void
  t: TFunction
}) {
  const publishDate = props.item.publishDate
    ? new Date(props.item.publishDate)
    : null
  const hasValidDate = publishDate && !Number.isNaN(publishDate.getTime())
  const relativeTime = hasValidDate ? getRelativeTime(publishDate, props.t) : ''

  return (
    <AnnouncementListItem
      actionLabel={props.t('View details')}
      content={props.item.content}
      dateText={relativeTime}
      fallbackTitle={props.t('Announcement Details')}
      isRead={props.isRead}
      onOpen={() => props.onOpen(props.item)}
      title={props.item.title}
      type={props.item.type}
    />
  )
}

function EmptyState(props: {
  icon: React.ReactNode
  title: string
  description?: string
}) {
  return (
    <Empty className='min-h-48 border-0 p-4'>
      <EmptyHeader>
        <EmptyMedia variant='icon'>{props.icon}</EmptyMedia>
        <EmptyTitle>{props.title}</EmptyTitle>
        {props.description ? (
          <EmptyDescription>{props.description}</EmptyDescription>
        ) : null}
      </EmptyHeader>
    </Empty>
  )
}

function NoticeContent(props: {
  notice: string
  loading: boolean
  t: TFunction
}) {
  if (props.loading) {
    return (
      <EmptyState
        icon={<Bell />}
        title={props.t('Loading...')}
        description={props.t('Latest platform updates and notices')}
      />
    )
  }

  if (!props.notice) {
    return (
      <EmptyState
        icon={<Bell />}
        title={props.t('No announcements at this time')}
      />
    )
  }

  return (
    <ScrollArea className='h-[min(52vh,28rem)] pr-3'>
      <NotificationMarkdown>{props.notice}</NotificationMarkdown>
    </ScrollArea>
  )
}

function AnnouncementsContent(props: {
  announcements: AnnouncementItem[]
  loading: boolean
  isAnnouncementRead: (announcement: AnnouncementItem) => boolean
  onAnnouncementOpen: (announcement: AnnouncementItem) => void
  t: TFunction
}) {
  if (props.loading) {
    return (
      <EmptyState
        icon={<Megaphone />}
        title={props.t('Loading...')}
        description={props.t('Latest platform updates and notices')}
      />
    )
  }

  if (props.announcements.length === 0) {
    return (
      <EmptyState
        icon={<Megaphone />}
        title={props.t('No system announcements')}
      />
    )
  }

  return (
    <ScrollArea className='h-[min(52vh,28rem)] pr-3'>
      <div className='flex flex-col gap-2 pr-1'>
        {props.announcements.map((item, idx) => (
          <NotificationAnnouncementListItem
            key={item.id ?? `${item.publishDate ?? 'announcement'}-${idx}`}
            item={item}
            isRead={props.isAnnouncementRead(item)}
            onOpen={props.onAnnouncementOpen}
            t={props.t}
          />
        ))}
      </div>
    </ScrollArea>
  )
}

export function NotificationPopover(props: NotificationPopoverProps) {
  const { t } = useTranslation()
  const [selectedAnnouncement, setSelectedAnnouncement] =
    useState<AnnouncementItem | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const isAnnouncementRead = props.isAnnouncementRead || (() => true)

  const handleAnnouncementOpen = (announcement: AnnouncementItem) => {
    setSelectedAnnouncement(announcement)
    setDetailOpen(true)
    props.onAnnouncementRead?.(announcement)
  }

  return (
    <>
      <Popover open={props.open} onOpenChange={props.onOpenChange}>
        <PopoverTrigger
          render={
            <Button
              variant='ghost'
              size='icon'
              className={cn('relative size-9', props.className)}
              aria-label={t('Notifications')}
            />
          }
        >
          <Bell className='size-[1.2rem]' />
          {props.unreadCount > 0 ? (
            <Badge
              variant='destructive'
              className='absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center px-1 text-[10px] font-semibold tabular-nums'
            >
              {props.unreadCount > 99 ? '99+' : props.unreadCount}
            </Badge>
          ) : null}
        </PopoverTrigger>

        <PopoverContent
          align='end'
          sideOffset={8}
          className='w-[min(36rem,calc(100vw-1rem))] gap-4 p-4'
        >
          <PopoverHeader className='gap-1 px-1'>
            <PopoverTitle>{t('Notifications')}</PopoverTitle>
            <p className='text-muted-foreground text-xs'>
              {t('Latest platform updates and notices')}
            </p>
          </PopoverHeader>

          <Tabs
            value={props.activeTab}
            onValueChange={props.onTabChange as (value: string) => void}
          >
            <TabsList className='grid w-full grid-cols-2'>
              <TabsTrigger
                value='notice'
                className={cn(
                  'gap-1.5',
                  props.unreadNoticeCount > 0 && 'text-destructive'
                )}
              >
                <Bell className='size-3.5' />
                {t('Notice')}
                <TabUnreadBadge count={props.unreadNoticeCount} />
              </TabsTrigger>
              <TabsTrigger
                value='announcements'
                className={cn(
                  'gap-1.5',
                  props.unreadAnnouncementsCount > 0 && 'text-destructive'
                )}
              >
                <Megaphone className='size-3.5' />
                {t('Announcements')}
                <TabUnreadBadge count={props.unreadAnnouncementsCount} />
              </TabsTrigger>
            </TabsList>

            <TabsContent value='notice' className='mt-2'>
              <NoticeContent
                notice={props.notice}
                loading={props.loading}
                t={t}
              />
            </TabsContent>

            <TabsContent value='announcements' className='mt-2'>
              <AnnouncementsContent
                announcements={props.announcements}
                loading={props.loading}
                isAnnouncementRead={isAnnouncementRead}
                onAnnouncementOpen={handleAnnouncementOpen}
                t={t}
              />
            </TabsContent>
          </Tabs>

          <Separator />

          <div className='flex justify-end'>
            <Button size='sm' onClick={() => props.onOpenChange(false)}>
              {t('Close')}
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      <AnnouncementDetailModal
        open={detailOpen}
        onOpenChange={setDetailOpen}
        announcement={selectedAnnouncement}
      />
    </>
  )
}
