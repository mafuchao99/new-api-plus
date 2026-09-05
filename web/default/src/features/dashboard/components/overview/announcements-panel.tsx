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
import { Megaphone } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { AnnouncementListItem } from '@/components/announcement-list-item'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useAnnouncements } from '@/features/dashboard/hooks/use-status-data'
import type { AnnouncementItem } from '@/features/dashboard/types'
import { getAnnouncementKey } from '@/hooks/use-notifications'
import { formatDateTimeObject } from '@/lib/time'
import { useNotificationStore } from '@/stores/notification-store'

import { PanelWrapper } from '../ui/panel-wrapper'
import { AnnouncementDetailModal } from './announcement-detail-dialog'

export function AnnouncementsPanel() {
  const { t } = useTranslation()
  const { items: list, loading } = useAnnouncements()
  const [selectedAnnouncement, setSelectedAnnouncement] =
    useState<AnnouncementItem | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const { isAnnouncementRead, markAnnouncementsRead } = useNotificationStore()

  const handleAnnouncementClick = (item: AnnouncementItem) => {
    setSelectedAnnouncement(item)
    setIsDialogOpen(true)
    markAnnouncementsRead([getAnnouncementKey(item)])
  }

  return (
    <PanelWrapper
      title={
        <span className='flex items-center gap-2'>
          <Megaphone className='text-muted-foreground/60 size-4' />
          {t('Announcements')}
        </span>
      }
      description={t('Latest platform updates and notices')}
      loading={loading}
      empty={!list.length}
      emptyMessage={t('No announcements at this time')}
      height='h-72'
      contentClassName='p-0'
    >
      <ScrollArea className='h-72'>
        <div className='flex flex-col gap-2 p-3'>
          {list.map((item: AnnouncementItem, idx: number) => {
            const key = item.id ?? `announcement-${idx}`
            const isRead = isAnnouncementRead(getAnnouncementKey(item))
            return (
              <AnnouncementListItem
                key={key}
                actionLabel={t('Click for details')}
                content={item.content}
                dateText={
                  item.publishDate
                    ? formatDateTimeObject(new Date(item.publishDate))
                    : undefined
                }
                fallbackTitle={t('Announcement Details')}
                isRead={isRead}
                onOpen={() => handleAnnouncementClick(item)}
                type={item.type}
              />
            )
          })}
        </div>
      </ScrollArea>

      <AnnouncementDetailModal
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        announcement={selectedAnnouncement}
      />
    </PanelWrapper>
  )
}
