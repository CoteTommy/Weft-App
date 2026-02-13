export interface ThreadPreference {
  pinned: boolean
  muted: boolean
}

type StoredThreadPreferences = Record<string, ThreadPreference>

const THREAD_PREFERENCES_KEY = 'weft.chat.thread-preferences.v1'

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
}

export function resolveThreadPreference(
  preferences: Map<string, ThreadPreference>,
  threadId: string
): ThreadPreference {
  return preferences.get(threadId) ?? { pinned: false, muted: false }
}
