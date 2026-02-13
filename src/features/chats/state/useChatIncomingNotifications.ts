import { useCallback, useEffect, useRef } from 'react'

import { getWeftPreferences, PREFERENCES_UPDATED_EVENT } from '@shared/runtime/preferences'
import type { IncomingNotificationItem } from './types'

export type UseChatIncomingNotificationsResult = {
  emitIncomingNotifications: (items: IncomingNotificationItem[]) => Promise<void>
}

export function useChatIncomingNotifications(): UseChatIncomingNotificationsResult {
  const notificationsEnabledRef = useRef(getWeftPreferences().notificationsEnabled)
  const messageNotificationsEnabledRef = useRef(getWeftPreferences().messageNotificationsEnabled)

  useEffect(() => {
    const handlePreferencesUpdate = () => {
      const preferences = getWeftPreferences()
      notificationsEnabledRef.current = preferences.notificationsEnabled
      messageNotificationsEnabledRef.current = preferences.messageNotificationsEnabled
    }
    window.addEventListener(PREFERENCES_UPDATED_EVENT, handlePreferencesUpdate)
    return () => {
      window.removeEventListener(PREFERENCES_UPDATED_EVENT, handlePreferencesUpdate)
    }
  }, [])

  const emitIncomingNotifications = useCallback(
    async (items: IncomingNotificationItem[]) => {
      if (
        typeof window === 'undefined' ||
        !('Notification' in window) ||
        items.length === 0
      ) {
        return
      }
      if (!notificationsEnabledRef.current) {
        return
      }
      if (!messageNotificationsEnabledRef.current) {
        return
      }
      if (document.visibilityState === 'visible' && document.hasFocus()) {
        return
      }

      let permission = Notification.permission
      if (permission === 'default') {
        permission = await Notification.requestPermission()
      }
      if (permission !== 'granted') {
        return
      }

      for (const item of items) {
        const body =
          item.count > 1
            ? `${item.count} new messages in ${item.threadName}`
            : item.latestBody || `New message in ${item.threadName}`
        const notification = new Notification(item.threadName, {
          body,
          tag: `thread:${item.threadId}`,
        })
        notification.onclick = () => {
          window.focus()
          window.dispatchEvent(
            new CustomEvent('weft:open-thread', {
              detail: { threadId: item.threadId },
            }),
          )
          notification.close()
        }
      }
    },
    [],
  )

  return { emitIncomingNotifications }
}
