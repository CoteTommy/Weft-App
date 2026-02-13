import { APP_NOTIFICATION_EVENT } from '@app/config/events'

import { getWeftPreferences } from './preferences'

export type AppNotificationKind = 'message' | 'system' | 'connection'

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

export { APP_NOTIFICATION_EVENT }

const APP_NOTIFICATIONS_KEY = 'weft.notifications.v1'
const MAX_NOTIFICATIONS = 120

export function publishAppNotification(input: AppNotificationInput): void {
  if (typeof window === 'undefined') {
    return
  }
  if (!shouldPublishNotification(input.kind ?? 'system')) {
    return
  }
  window.dispatchEvent(
    new CustomEvent<AppNotificationInput>(APP_NOTIFICATION_EVENT, { detail: input })
  )
  if (shouldPlayNotificationSound()) {
    playNotificationSound()
  }
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
      .map(item => parseStoredNotification(item))
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
  window.localStorage.setItem(
    APP_NOTIFICATIONS_KEY,
    JSON.stringify(items.slice(0, MAX_NOTIFICATIONS))
  )
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
    kind: parseNotificationKind(record.kind),
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

function parseNotificationKind(value: unknown): AppNotificationKind {
  if (value === 'message' || value === 'system' || value === 'connection') {
    return value
  }
  return 'system'
}

function shouldPublishNotification(kind: AppNotificationKind): boolean {
  const preferences = getWeftPreferences()
  if (!preferences.inAppNotificationsEnabled) {
    return false
  }
  if (kind === 'message' && !preferences.messageNotificationsEnabled) {
    return false
  }
  if (kind === 'system' && !preferences.systemNotificationsEnabled) {
    return false
  }
  if (kind === 'connection' && !preferences.connectionNotificationsEnabled) {
    return false
  }
  return true
}

let lastSoundAtMs = 0

function shouldPlayNotificationSound(): boolean {
  const preferences = getWeftPreferences()
  if (!preferences.notificationSoundEnabled) {
    return false
  }
  const now = Date.now()
  if (now - lastSoundAtMs < 1_200) {
    return false
  }
  lastSoundAtMs = now
  return true
}

function playNotificationSound(): void {
  if (typeof window === 'undefined') {
    return
  }
  const AudioContextImpl =
    window.AudioContext ||
    ((window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ?? null)
  if (!AudioContextImpl) {
    return
  }
  try {
    const context = new AudioContextImpl()
    const gain = context.createGain()
    gain.gain.value = 0.0001
    gain.connect(context.destination)

    const first = context.createOscillator()
    first.type = 'sine'
    first.frequency.value = 880
    first.connect(gain)

    const second = context.createOscillator()
    second.type = 'triangle'
    second.frequency.value = 660
    second.connect(gain)

    const now = context.currentTime
    gain.gain.exponentialRampToValueAtTime(0.06, now + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.025, now + 0.08)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24)

    first.start(now)
    first.stop(now + 0.18)
    second.start(now + 0.05)
    second.stop(now + 0.24)

    window.setTimeout(() => {
      void context.close().catch(() => {})
    }, 400)
  } catch {
    // Ignore sound errors; notification delivery should still succeed.
  }
}
