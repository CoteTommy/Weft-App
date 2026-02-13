import type { ChatMessage, ChatThread } from '@shared/types/chat'

import { deriveReasonCode, deriveReceiptStatus } from '../services/chatThreadBuilders'

export interface RuntimeMessageReducerInput {
  derivedThread: ChatThread
  mergedMessage: ChatMessage
  unread?: number
  applyThreadMetadata: (thread: ChatThread) => ChatThread
}

export interface ReceiptReducerInput {
  messageId: string
  status?: string
  reasonCode?: string
}

export function reduceHydratedThreads(
  hydratedThreads: ChatThread[],
  draftThreads: ChatThread[]
): ChatThread[] {
  return orderThreads([...draftThreads, ...hydratedThreads])
}

export function reduceRewriteSelfAuthors(
  threads: ChatThread[],
  normalizedAuthor: string
): ChatThread[] {
  let changed = false
  const updated = threads.map(thread => {
    let threadChanged = false
    const messages = thread.messages.map(message => {
      if (message.sender !== 'self' || message.author === normalizedAuthor) {
        return message
      }
      changed = true
      threadChanged = true
      return {
        ...message,
        author: normalizedAuthor,
      }
    })
    return threadChanged
      ? {
          ...thread,
          messages,
        }
      : thread
  })
  return changed ? updated : threads
}

export function reduceMarkThreadRead(threads: ChatThread[], threadId: string): ChatThread[] {
  return threads.map(thread =>
    thread.id === threadId && thread.unread > 0
      ? {
          ...thread,
          unread: 0,
        }
      : thread
  )
}

export function reduceMarkAllThreadsRead(threads: ChatThread[]): ChatThread[] {
  return threads.map(thread =>
    thread.unread > 0
      ? {
          ...thread,
          unread: 0,
        }
      : thread
  )
}

export function reduceCreateDraftThread(threads: ChatThread[], draft: ChatThread): ChatThread[] {
  if (threads.some(thread => thread.id === draft.id)) {
    return threads
  }
  return orderThreads([draft, ...threads])
}

export function reduceSetThreadPinned(
  threads: ChatThread[],
  threadId: string,
  pinned: boolean
): ChatThread[] {
  return orderThreads(
    threads.map(thread =>
      thread.id === threadId
        ? {
            ...thread,
            pinned,
          }
        : thread
    )
  )
}

export function reduceSetThreadMuted(
  threads: ChatThread[],
  threadId: string,
  muted: boolean
): ChatThread[] {
  return threads.map(thread =>
    thread.id === threadId
      ? {
          ...thread,
          muted,
        }
      : thread
  )
}

export function reduceRuntimeMessage(
  threads: ChatThread[],
  input: RuntimeMessageReducerInput
): ChatThread[] {
  const { applyThreadMetadata, derivedThread, mergedMessage, unread } = input
  const threadId = derivedThread.id
  const index = threads.findIndex(thread => thread.id === threadId)
  if (index < 0) {
    return orderThreads([
      applyThreadMetadata({
        ...derivedThread,
        unread: unread ?? 0,
      }),
      ...threads,
    ])
  }

  const existing = threads[index]
  const messages = upsertThreadMessages(existing.messages, mergedMessage)
  const derivedLastActivityAtMs = normalizeThreadLastActivityAtMs(derivedThread)
  const existingLastActivityAtMs = normalizeThreadLastActivityAtMs(existing)
  const nextLastActivityAtMs = Math.max(existingLastActivityAtMs, derivedLastActivityAtMs)
  const updatedThread = applyThreadMetadata({
    ...existing,
    preview: previewFromMessage(messages[messages.length - 1]),
    lastActivity: derivedThread.lastActivity,
    lastActivityAtMs: nextLastActivityAtMs,
    messages,
    unread: unread ?? existing.unread,
  })
  const next = [...threads]
  next[index] = updatedThread
  return orderThreads(next)
}

export function reduceReceiptUpdate(
  threads: ChatThread[],
  receipt: ReceiptReducerInput
): { threads: ChatThread[]; found: boolean } {
  let found = false
  const next = threads.map(thread => {
    let changed = false
    const messages = thread.messages.map(message => {
      if (message.id !== receipt.messageId) {
        return message
      }
      found = true
      changed = true
      const statusDetail = receipt.status ?? message.statusDetail
      const reasonCode = receipt.reasonCode ?? deriveReasonCode(statusDetail)
      const status = deriveReceiptStatus('out', statusDetail ?? null) ?? message.status
      return {
        ...message,
        status,
        statusDetail,
        statusReasonCode: reasonCode,
        deliveryTrace: appendDeliveryTraceEntry(message, statusDetail, reasonCode),
      }
    })
    if (!changed) {
      return thread
    }
    return {
      ...thread,
      preview: previewFromMessage(messages[messages.length - 1]),
      messages,
    }
  })
  return { threads: next, found }
}

export function appendDeliveryTraceEntry(
  message: ChatMessage,
  statusDetail: string | undefined,
  reasonCode?: string
): ChatMessage['deliveryTrace'] {
  if (!statusDetail) {
    return message.deliveryTrace
  }
  const existing = message.deliveryTrace ?? []
  const timestamp = Math.floor(Date.now() / 1000)
  const next = [...existing, { status: statusDetail, timestamp, reasonCode }]
  return next.slice(-32)
}

function orderThreads(threads: ChatThread[]): ChatThread[] {
  return [...threads].sort((left, right) => {
    const pinned = Number(right.pinned) - Number(left.pinned)
    if (pinned !== 0) {
      return pinned
    }
    const byActivity =
      normalizeThreadLastActivityAtMs(right) - normalizeThreadLastActivityAtMs(left)
    if (byActivity !== 0) {
      return byActivity
    }
    return left.id.localeCompare(right.id)
  })
}

function normalizeThreadLastActivityAtMs(thread: ChatThread): number {
  return Number.isFinite(thread.lastActivityAtMs) ? thread.lastActivityAtMs : 0
}

function upsertThreadMessages(messages: ChatMessage[], incoming: ChatMessage): ChatMessage[] {
  const index = messages.findIndex(message => message.id === incoming.id)
  if (index < 0) {
    return [...messages, incoming]
  }
  const next = [...messages]
  next[index] = {
    ...messages[index],
    ...incoming,
  }
  return next
}

function previewFromMessage(message: ChatMessage | undefined): string {
  if (!message) {
    return 'No messages yet'
  }
  const body = message.body.trim()
  if (body.length > 0) {
    return body
  }
  if (message.attachments.length > 0) {
    return message.attachments.length === 1
      ? `Attachment: ${message.attachments[0].name}`
      : `${message.attachments.length} attachments`
  }
  if (message.paper?.title) {
    return `Paper: ${message.paper.title}`
  }
  return 'No messages yet'
}
