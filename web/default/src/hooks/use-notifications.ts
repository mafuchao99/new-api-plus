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
import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

import { useStatus } from '@/hooks/use-status'
import { getNotice } from '@/lib/api'
import { useNotificationStore } from '@/stores/notification-store'

export interface NotificationAnnouncementItem {
  id?: number | string
  publishDate?: string | Date
  content?: string
  extra?: string
  type?: string
  title?: string
  link?: string
}

function hashString(input: string): string {
  let hash = 0
  if (!input) return '0'

  for (let i = 0; i < input.length; i += 1) {
    const chr = input.charCodeAt(i)
    hash = (hash << 5) - hash + chr
    hash |= 0
  }

  return hash.toString(36)
}

/**
 * Generate a unique key for an announcement
 * Prefer backend id, fall back to a content hash so edits register
 */
export function getAnnouncementKey(item: NotificationAnnouncementItem): string {
  if (!item) return ''

  if (item.id !== undefined && item.id !== null) {
    return `id:${item.id}`
  }

  const fingerprint = JSON.stringify({
    publishDate: String(item.publishDate || ''),
    content: (item.content || '').trim(),
    extra: (item.extra || '').trim(),
    type: item.type || '',
    title: (item.title || '').trim(),
    link: (item.link || '').trim(),
  })
  return `hash:${hashString(fingerprint)}`
}

/**
 * Hook to manage notifications (Notice + Announcements)
 * Provides unread counts and read status management
 */
export function useNotifications() {
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'notice' | 'announcements'>(
    'notice'
  )

  // Fetch Notice from API
  const {
    data: noticeResponse,
    isLoading: noticeLoading,
    refetch: refetchNotice,
  } = useQuery({
    queryKey: ['notice'],
    queryFn: getNotice,
    staleTime: 1000 * 60 * 5, // 5 minutes
  })

  // Fetch Announcements from status
  const { status, loading: statusLoading } = useStatus()
  const announcementsEnabled = status?.announcements_enabled ?? false
  const announcements = useMemo(() => {
    if (!announcementsEnabled) return []

    return (
      (status?.announcements || []) as NotificationAnnouncementItem[]
    ).slice(0, 20)
  }, [announcementsEnabled, status?.announcements])

  // Notification store
  const {
    lastReadNotice,
    readAnnouncementKeys,
    markNoticeRead,
    markAnnouncementsRead,
    isAnnouncementRead,
  } = useNotificationStore()

  // Extract notice content
  const noticeContent = noticeResponse?.success
    ? (noticeResponse.data || '').trim()
    : ''

  // Calculate unread counts
  const unreadCounts = useMemo(() => {
    const noticeUnread =
      noticeContent && noticeContent !== lastReadNotice ? 1 : 0
    const readKeys = new Set(readAnnouncementKeys)

    const announcementsUnread = announcements.filter(
      (item: NotificationAnnouncementItem) => {
        const key = getAnnouncementKey(item)
        return !readKeys.has(key)
      }
    ).length

    return {
      notice: noticeUnread,
      announcements: announcementsUnread,
      total: noticeUnread + announcementsUnread,
    }
  }, [
    noticeContent,
    lastReadNotice,
    announcements,
    readAnnouncementKeys,
  ])

  const markAnnouncementsAsRead = () => {
    if (announcements.length > 0) {
      const allKeys = announcements.map((item: NotificationAnnouncementItem) =>
        getAnnouncementKey(item)
      )
      markAnnouncementsRead(allKeys)
    }
  }

  const markAnnouncementAsRead = (item: NotificationAnnouncementItem) => {
    const key = getAnnouncementKey(item)
    if (key) {
      markAnnouncementsRead([key])
    }
  }

  const isAnnouncementItemRead = (item: NotificationAnnouncementItem) => {
    const key = getAnnouncementKey(item)
    return key ? isAnnouncementRead(key) : true
  }

  const handleOpenPopover = (tab?: 'notice' | 'announcements') => {
    const nextTab = tab || activeTab

    setActiveTab(nextTab)
    setPopoverOpen(true)
  }

  const closePopover = () => {
    if (activeTab === 'notice' && noticeContent) {
      markNoticeRead(noticeContent)
    }
    setPopoverOpen(false)
  }

  const handlePopoverOpenChange = (open: boolean) => {
    if (open) {
      handleOpenPopover(activeTab)
      return
    }

    closePopover()
  }

  const handleTabChange = (tab: 'notice' | 'announcements') => {
    setActiveTab(tab)
  }

  return {
    // Data
    notice: noticeContent,
    announcements,
    loading: noticeLoading || statusLoading,

    // Unread counts
    unreadCount: unreadCounts.total,
    unreadNoticeCount: unreadCounts.notice,
    unreadAnnouncementsCount: unreadCounts.announcements,

    // Popover state
    popoverOpen,
    setPopoverOpen: handlePopoverOpenChange,
    activeTab,
    setActiveTab: handleTabChange,

    // Actions
    openPopover: handleOpenPopover,
    closePopover,
    refetchNotice,
    isAnnouncementRead: isAnnouncementItemRead,
    markAnnouncementRead: markAnnouncementAsRead,
    markAnnouncementsAsRead,
  }
}
