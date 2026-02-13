/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

import {
  APP_NOTIFICATION_EVENT,
  type AppNotification,
  type AppNotificationInput,
  createAppNotification,
  getStoredAppNotifications,
  persistAppNotifications,
} from '@shared/runtime/notifications'

interface NotificationCenterState {
  notifications: AppNotification[]
  unreadCount: number
  addNotification: (input: AppNotificationInput) => void
  markRead: (id: string) => void
  markAllRead: () => void
  clearAll: () => void
}

const NotificationCenterContext = createContext<NotificationCenterState | undefined>(undefined)

export function NotificationCenterProvider({ children }: PropsWithChildren) {
  const [notifications, setNotifications] = useState<AppNotification[]>(() =>
    getStoredAppNotifications()
  )

  const addNotification = useCallback((input: AppNotificationInput) => {
    const next = createAppNotification(input)
    if (!next) {
      return
    }
    setNotifications(previous => {
      const updated = [next, ...previous].slice(0, 120)
      persistAppNotifications(updated)
      return updated
    })
  }, [])

  const markRead = useCallback((id: string) => {
    const normalizedId = id.trim()
    if (!normalizedId) {
      return
    }
    setNotifications(previous => {
      let changed = false
      const updated = previous.map(notification => {
        if (notification.id !== normalizedId || notification.read) {
          return notification
        }
        changed = true
        return {
          ...notification,
          read: true,
        }
      })
      if (changed) {
        persistAppNotifications(updated)
      }
      return changed ? updated : previous
    })
  }, [])

  const markAllRead = useCallback(() => {
    setNotifications(previous => {
      if (previous.every(notification => notification.read)) {
        return previous
      }
      const updated = previous.map(notification =>
        notification.read
          ? notification
          : {
              ...notification,
              read: true,
            }
      )
      persistAppNotifications(updated)
      return updated
    })
  }, [])

  const clearAll = useCallback(() => {
    setNotifications(previous => {
      if (previous.length === 0) {
        return previous
      }
      persistAppNotifications([])
      return []
    })
  }, [])

  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<AppNotificationInput>
      if (!custom.detail) {
        return
      }
      addNotification(custom.detail)
    }
    window.addEventListener(APP_NOTIFICATION_EVENT, handler as EventListener)
    return () => {
      window.removeEventListener(APP_NOTIFICATION_EVENT, handler as EventListener)
    }
  }, [addNotification])

  const value = useMemo(
    () => ({
      notifications,
      unreadCount: notifications.reduce(
        (count, notification) => count + (notification.read ? 0 : 1),
        0
      ),
      addNotification,
      markRead,
      markAllRead,
      clearAll,
    }),
    [addNotification, clearAll, markAllRead, markRead, notifications]
  )

  return (
    <NotificationCenterContext.Provider value={value}>
      {children}
    </NotificationCenterContext.Provider>
  )
}

export function useNotificationCenter(): NotificationCenterState {
  const value = useContext(NotificationCenterContext)
  if (!value) {
    throw new Error('useNotificationCenter must be used within NotificationCenterProvider')
  }
  return value
}
