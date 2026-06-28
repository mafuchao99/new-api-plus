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
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { Markdown } from '@/components/ui/markdown'
import { ScrollArea } from '@/components/ui/scroll-area'
import { formatDateTimeObject } from '@/lib/time'

interface AnnouncementDetailModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  announcement: {
    title?: string
    content?: string
    tag?: string
    publishDate?: string | Date
    extra?: string
  } | null
}

export function AnnouncementDetailModal(props: AnnouncementDetailModalProps) {
  const { t } = useTranslation()
  const publishDate = props.announcement?.publishDate
    ? new Date(props.announcement.publishDate)
    : null
  const publishedText =
    publishDate && !Number.isNaN(publishDate.getTime())
      ? `${t('Published:')} ${formatDateTimeObject(publishDate)}`
      : undefined

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={props.announcement?.title || t('Announcement Details')}
      description={publishedText}
      contentClassName='sm:max-w-xl'
      contentHeight='auto'
      bodyClassName='space-y-4'
    >
      <ScrollArea className='max-h-[min(62vh,560px)] pr-4'>
        <div className='space-y-5'>
          {props.announcement?.content ? (
            <Markdown>{props.announcement.content}</Markdown>
          ) : null}
          {props.announcement?.extra ? (
            <div className='border-border/70 bg-muted/30 rounded-lg border p-3'>
              <h4 className='mb-2 text-sm font-medium'>
                {t('Additional Information')}
              </h4>
              <Markdown className='text-muted-foreground text-sm'>
                {props.announcement.extra}
              </Markdown>
            </div>
          ) : null}
        </div>
      </ScrollArea>
    </Dialog>
  )
}
