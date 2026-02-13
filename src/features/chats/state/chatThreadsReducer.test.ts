import { describe, expect, test } from 'bun:test'

import type { ChatMessage, ChatThread } from '@shared/types/chat'

import {
  reduceReceiptUpdate,
  reduceRuntimeMessage,
} from './chatThreadsReducer'

function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'm-1',
    author: 'Peer',
    sender: 'peer',
    body: 'hello',
    attachments: [],
    sentAt: 'now',
    ...overrides,
  }
}

function makeThread(overrides: Partial<ChatThread> = {}): ChatThread {
  return {
    id: 'dst-1',
    name: 'Peer',
    destination: 'dst-1',
    preview: 'hello',
    unread: 0,
    pinned: false,
    muted: false,
    lastActivity: 'now',
    messages: [makeMessage()],
    ...overrides,
  }
}

describe('chat threads domain reducer', () => {
  test('upserts runtime message into existing thread', () => {
    const base = [makeThread()]
    const incoming = makeMessage({ id: 'm-2', body: 'updated' })
    const next = reduceRuntimeMessage(base, {
      applyThreadMetadata: (thread) => thread,
      derivedThread: makeThread({
        id: 'dst-1',
        name: 'Peer',
        destination: 'dst-1',
        messages: [incoming],
      }),
      mergedMessage: incoming,
      unread: 2,
    })

    expect(next).toHaveLength(1)
    expect(next[0].messages).toHaveLength(2)
    expect(next[0].preview).toBe('updated')
    expect(next[0].unread).toBe(2)
  })

  test('applies receipt updates to outbound messages', () => {
    const outgoing = makeMessage({
      id: 'm-out',
      sender: 'self',
      status: 'sending',
      statusDetail: 'sending',
    })
    const base = [makeThread({ messages: [outgoing], preview: outgoing.body })]

    const updated = reduceReceiptUpdate(base, {
      messageId: 'm-out',
      status: 'delivered',
      reasonCode: 'receipt',
    })

    expect(updated.found).toBe(true)
    expect(updated.threads[0].messages[0].status).toBe('delivered')
    expect(updated.threads[0].messages[0].statusReasonCode).toBe('receipt')
    expect(updated.threads[0].messages[0].deliveryTrace?.length ?? 0).toBeGreaterThan(0)
  })
})
