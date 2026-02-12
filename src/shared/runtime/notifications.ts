export type AppNotificationKind = 'message' | 'system'

export interface AppNotification {
  id: string
  title: string
  body: string
  kind: AppNotificationKind
  createdAtMs: number
  threadId?: string
  read: boolean
}

export interface AppNotificationInput {
  title: string
  body: string
  kind?: AppNotificationKind
  createdAtMs?: number
  threadId?: string
}

export const APP_NOTIFICATION_EVENT = 'weft:app-notification'

const APP_NOTIFICATIONS_KEY = 'weft.notifications.v1'
const MAX_NOTIFICATIONS = 120

export function publishAppNotification(input: AppNotificationInput): void {
  if (typeof window === 'undefined') {
    return
  }
  window.dispatchEvent(new CustomEvent<AppNotificationInput>(APP_NOTIFICATION_EVENT, { detail: input }))
}

export function getStoredAppNotifications(): AppNotification[] {
  if (typeof window === 'undefined') {
    return []
  }
  const raw = window.localStorage.getItem(APP_NOTIFICATIONS_KEY)
  if (!raw) {
    return []
  }
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed
      .map((item) => parseStoredNotification(item))
      .filter((item): item is AppNotification => item !== null)
      .slice(0, MAX_NOTIFICATIONS)
  } catch {
    return []
  }
}

export function persistAppNotifications(items: AppNotification[]): void {
  if (typeof window === 'undefined') {
    return
  }
  window.localStorage.setItem(APP_NOTIFICATIONS_KEY, JSON.stringify(items.slice(0, MAX_NOTIFICATIONS)))
}

export function createAppNotification(input: AppNotificationInput): AppNotification | null {
  const title = input.title.trim()
  const body = input.body.trim()
  if (!title || !body) {
    return null
  }
  return {
    id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    body,
    kind: input.kind ?? 'system',
    createdAtMs:
      typeof input.createdAtMs === 'number' && Number.isFinite(input.createdAtMs)
        ? Math.max(0, Math.trunc(input.createdAtMs))
        : Date.now(),
    threadId: normalizeOptional(input.threadId),
    read: false,
  }
}

function parseStoredNotification(value: unknown): AppNotification | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const record = value as Record<string, unknown>
  const title = normalizeOptional(record.title)
  const body = normalizeOptional(record.body)
  if (!title || !body) {
    return null
  }
  return {
    id: normalizeOptional(record.id) ?? `notif-${Math.random().toString(36).slice(2, 10)}`,
    title,
    body,
    kind: record.kind === 'message' ? 'message' : 'system',
    createdAtMs:
      typeof record.createdAtMs === 'number' && Number.isFinite(record.createdAtMs)
        ? Math.max(0, Math.trunc(record.createdAtMs))
        : Date.now(),
    threadId: normalizeOptional(record.threadId),
    read: Boolean(record.read),
  }
}

function normalizeOptional(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  const normalized = value.trim()
  return normalized ? normalized : undefined
}
