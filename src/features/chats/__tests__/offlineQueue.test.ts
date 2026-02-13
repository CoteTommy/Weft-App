import { describe, expect, test } from 'bun:test'

import type { ChatThread } from '@shared/types/chat'

import {
  extendIgnoredFailedMessageIds,
  loadStoredOfflineQueue,
  markQueueEntryAttemptFailed,
  MAX_AUTO_RETRY_ATTEMPTS,
  type OfflineQueueEntry,
  persistOfflineQueue,
  retryDelayMs,
  syncQueueFromThreads,
} from '../state/offlineQueue'

function makeThread(messageId: string): ChatThread {
  return {
    id: 'deadbeef',
    name: 'Peer',
    destination: 'deadbeef',
    preview: 'preview',
    unread: 0,
    pinned: false,
    muted: false,
    lastActivity: 'now',
    lastActivityAtMs: Date.now(),
    messages: [
      {
        id: messageId,
        author: 'You',
        sender: 'self',
        body: 'hello',
        attachments: [],
        sentAt: '10:00 AM',
        status: 'failed',
        statusDetail: 'failed: no propagation relay selected',
        statusReasonCode: 'relay_unset',
      },
    ],
  }
}

describe('offline queue state helpers', () => {
  test('creates queue entries from failed outbound messages', () => {
    const result = syncQueueFromThreads([], [makeThread('msg-1')], new Set(), 1000)
    expect(result).toHaveLength(1)
    expect(result[0].source).toBe('failed_message')
    expect(result[0].sourceMessageId).toBe('msg-1')
    expect(result[0].status).toBe('queued')
    expect(result[0].reasonCode).toBe('relay_unset')
  })

  test('does not recreate entries for ignored failed message ids', () => {
    const ignored = new Set(['msg-2'])
    const result = syncQueueFromThreads([], [makeThread('msg-2')], ignored, 1000)
    expect(result).toHaveLength(0)
  })

  test('caps retry delay at highest backoff tier', () => {
    expect(retryDelayMs(0)).toBe(15_000)
    expect(retryDelayMs(3)).toBe(120_000)
    expect(retryDelayMs(99)).toBe(600_000)
  })

  test('extends ignored id set without losing existing values', () => {
    const next = extendIgnoredFailedMessageIds(new Set(['a']), ['b', 'c'])
    expect(next.has('a')).toBe(true)
    expect(next.has('b')).toBe(true)
    expect(next.has('c')).toBe(true)
  })

  test('auto-pauses entries once retry budget is exhausted', () => {
    const seed = syncQueueFromThreads([], [makeThread('msg-3')], new Set(), 1000)
    let queue = seed
    for (let attempt = 0; attempt < MAX_AUTO_RETRY_ATTEMPTS; attempt += 1) {
      queue = markQueueEntryAttemptFailed(queue, queue[0].id, 'failed: timeout', 1000 + attempt)
    }
    expect(queue[0].attempts).toBe(MAX_AUTO_RETRY_ATTEMPTS)
    expect(queue[0].status).toBe('paused')
    expect(queue[0].lastError?.toLowerCase().includes('auto-paused')).toBe(true)
  })

  test('migrates legacy queue entries and keeps attachment payloads', async () => {
    const storage = createLocalStorageMock()
    const previousWindow = (globalThis as { window?: unknown }).window
    ;(globalThis as { window: unknown }).window = {
      localStorage: storage,
    }
    try {
      storage.setItem(
        'weft.chat.offline-queue.v1',
        JSON.stringify([
          {
            id: 'legacy-1',
            source: 'send_error',
            threadId: 'deadbeef',
            destination: 'deadbeef',
            draft: {
              text: 'hello',
              attachments: [
                {
                  name: 'note.txt',
                  sizeBytes: 5,
                  dataBase64: 'aGVsbG8=',
                },
              ],
            },
            attempts: 0,
            nextRetryAtMs: 10,
            createdAtMs: 1,
            updatedAtMs: 1,
            status: 'queued',
          },
        ])
      )

      const loaded = await loadStoredOfflineQueue()
      expect(loaded).toHaveLength(1)
      expect(loaded[0].draft.attachments?.[0].dataBase64).toBe('aGVsbG8=')
      expect(storage.getItem('weft.chat.offline-queue.v2')).toBeTruthy()
      expect(storage.getItem('weft.chat.offline-queue.v1')).toBeNull()
    } finally {
      if (previousWindow === undefined) {
        delete (globalThis as { window?: unknown }).window
      } else {
        ;(globalThis as { window: unknown }).window = previousWindow
      }
    }
  })

  test('returns quota error when queue persistence exceeds storage capacity', async () => {
    const storage = createLocalStorageMock({
      setItem() {
        throw new DOMException('quota exceeded', 'QuotaExceededError')
      },
    })
    const previousWindow = (globalThis as { window?: unknown }).window
    ;(globalThis as { window: unknown }).window = {
      localStorage: storage,
    }
    try {
      const entry: OfflineQueueEntry = {
        id: 'draft-1',
        source: 'send_error',
        threadId: 'deadbeef',
        destination: 'deadbeef',
        draft: {
          text: 'hello',
          attachments: [
            {
              name: 'tiny.txt',
              sizeBytes: 5,
              dataBase64: 'aGVsbG8=',
            },
          ],
        },
        attempts: 0,
        nextRetryAtMs: 100,
        createdAtMs: 100,
        updatedAtMs: 100,
        status: 'queued',
      }

      const result = await persistOfflineQueue([entry])
      expect(result.ok).toBe(false)
      if (result.ok) {
        return
      }
      expect(result.code).toBe('quota')
    } finally {
      if (previousWindow === undefined) {
        delete (globalThis as { window?: unknown }).window
      } else {
        ;(globalThis as { window: unknown }).window = previousWindow
      }
    }
  })
})

function createLocalStorageMock(overrides?: {
  setItem?: (key: string, value: string) => void
}): Storage {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    clear() {
      data.clear()
    },
    getItem(key: string) {
      return data.has(key) ? (data.get(key) ?? null) : null
    },
    key(index: number) {
      return [...data.keys()][index] ?? null
    },
    removeItem(key: string) {
      data.delete(key)
    },
    setItem(key: string, value: string) {
      if (overrides?.setItem) {
        overrides.setItem(key, value)
        return
      }
      data.set(key, value)
    },
  }
}
