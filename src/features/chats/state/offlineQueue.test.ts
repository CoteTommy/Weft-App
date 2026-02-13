import { describe, expect, test } from 'bun:test'
import type { ChatThread } from '@shared/types/chat'
import {
  extendIgnoredFailedMessageIds,
  markQueueEntryAttemptFailed,
  MAX_AUTO_RETRY_ATTEMPTS,
  syncQueueFromThreads,
  retryDelayMs,
} from './offlineQueue'

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
})
