export interface ThreadPreference {
  pinned: boolean
  muted: boolean
}

type StoredThreadPreferences = Record<string, ThreadPreference>

const THREAD_PREFERENCES_KEY = 'weft.chat.thread-preferences.v1'
export const THREAD_PREFERENCES_UPDATED_EVENT = 'weft://thread-preferences-updated'

export function getStoredThreadPreferences(): Map<string, ThreadPreference> {
  if (typeof window === 'undefined') {
    return new Map()
  }
  const raw = window.localStorage.getItem(THREAD_PREFERENCES_KEY)
  if (!raw) {
    return new Map()
  }
  try {
    const parsed = JSON.parse(raw) as StoredThreadPreferences
    const out = new Map<string, ThreadPreference>()
    for (const [threadId, preference] of Object.entries(parsed)) {
      const normalizedId = threadId.trim()
      if (!normalizedId) {
        continue
      }
      out.set(normalizedId, {
        pinned: Boolean(preference?.pinned),
        muted: Boolean(preference?.muted),
      })
    }
    return out
  } catch {
    return new Map()
  }
}

export function persistThreadPreferences(preferences: Map<string, ThreadPreference>): void {
  if (typeof window === 'undefined') {
    return
  }
  const serialized: StoredThreadPreferences = {}
  for (const [threadId, preference] of preferences.entries()) {
    if (!threadId) {
      continue
    }
    if (!preference.pinned && !preference.muted) {
      continue
    }
    serialized[threadId] = {
      pinned: preference.pinned,
      muted: preference.muted,
    }
  }
  window.localStorage.setItem(THREAD_PREFERENCES_KEY, JSON.stringify(serialized))
  window.dispatchEvent(new Event(THREAD_PREFERENCES_UPDATED_EVENT))
}

export function resolveThreadPreference(
  preferences: Map<string, ThreadPreference>,
  threadId: string
): ThreadPreference {
  return preferences.get(threadId) ?? { pinned: false, muted: false }
}

export function setStoredThreadMutedPreference(threadId: string, muted: boolean): void {
  const normalizedThreadId = threadId.trim()
  if (!normalizedThreadId) {
    return
  }
  const preferences = getStoredThreadPreferences()
  const current = resolveThreadPreference(preferences, normalizedThreadId)
  if (current.muted === muted) {
    return
  }
  const next = {
    ...current,
    muted,
  }
  if (!next.muted && !next.pinned) {
    preferences.delete(normalizedThreadId)
  } else {
    preferences.set(normalizedThreadId, next)
  }
  persistThreadPreferences(preferences)
}
