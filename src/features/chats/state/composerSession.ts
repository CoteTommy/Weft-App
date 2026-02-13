export interface ComposerSessionDraft {
  text: string
  paperEnabled: boolean
  paperTitle: string
  paperCategory: string
  updatedAtMs: number
}

const COMPOSER_SESSION_KEY = 'weft.chat.composer-session.v1'
const MAX_COMPOSER_SESSIONS = 64

export function readComposerSession(threadId: string): ComposerSessionDraft | null {
  const normalizedThreadId = threadId.trim()
  if (!normalizedThreadId || typeof window === 'undefined') {
    return null
  }
  const all = readAllComposerSessions()
  return all[normalizedThreadId] ?? null
}

export function writeComposerSession(
  threadId: string,
  draft: Omit<ComposerSessionDraft, 'updatedAtMs'>,
): void {
  const normalizedThreadId = threadId.trim()
  if (!normalizedThreadId || typeof window === 'undefined') {
    return
  }
  const all = readAllComposerSessions()
  all[normalizedThreadId] = {
    text: draft.text,
    paperEnabled: draft.paperEnabled,
    paperTitle: draft.paperTitle,
    paperCategory: draft.paperCategory,
    updatedAtMs: Date.now(),
  }
  pruneAndPersist(all)
}

export function clearComposerSession(threadId: string): void {
  const normalizedThreadId = threadId.trim()
  if (!normalizedThreadId || typeof window === 'undefined') {
    return
  }
  const all = readAllComposerSessions()
  if (!(normalizedThreadId in all)) {
    return
  }
  delete all[normalizedThreadId]
  pruneAndPersist(all)
}

function readAllComposerSessions(): Record<string, ComposerSessionDraft> {
  if (typeof window === 'undefined') {
    return {}
  }
  const raw = window.localStorage.getItem(COMPOSER_SESSION_KEY)
  if (!raw) {
    return {}
  }
  try {
    const parsed = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return {}
    }
    const out: Record<string, ComposerSessionDraft> = {}
    for (const [threadId, value] of Object.entries(parsed)) {
      const normalizedThreadId = threadId.trim()
      if (!normalizedThreadId) {
        continue
      }
      const draft = parseComposerDraft(value)
      if (!draft) {
        continue
      }
      out[normalizedThreadId] = draft
    }
    return out
  } catch {
    return {}
  }
}

function pruneAndPersist(all: Record<string, ComposerSessionDraft>): void {
  const entries = Object.entries(all)
    .sort((left, right) => right[1].updatedAtMs - left[1].updatedAtMs)
    .slice(0, MAX_COMPOSER_SESSIONS)

  const next = Object.fromEntries(entries)
  if (typeof window === 'undefined') {
    return
  }
  window.localStorage.setItem(COMPOSER_SESSION_KEY, JSON.stringify(next))
}

function parseComposerDraft(value: unknown): ComposerSessionDraft | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null
  }
  const record = value as Record<string, unknown>
  if (typeof record.text !== 'string') {
    return null
  }
  if (typeof record.paperEnabled !== 'boolean') {
    return null
  }
  if (typeof record.paperTitle !== 'string') {
    return null
  }
  if (typeof record.paperCategory !== 'string') {
    return null
  }
  if (typeof record.updatedAtMs !== 'number' || !Number.isFinite(record.updatedAtMs)) {
    return null
  }
  return {
    text: record.text,
    paperEnabled: record.paperEnabled,
    paperTitle: record.paperTitle,
    paperCategory: record.paperCategory,
    updatedAtMs: record.updatedAtMs,
  }
}
