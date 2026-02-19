import type { ChatMessage, ChatThread, OutboundMessageDraft } from '@shared/types/chat'

import { MAX_AUTO_RETRY_ATTEMPTS, retryDelayMs } from './offlineQueueRetryPolicy'

export type OfflineQueueSource = 'send_error' | 'failed_message'
export type OfflineQueueStatus = 'queued' | 'paused' | 'sending'

export interface OfflineQueueEntry {
  id: string
  source: OfflineQueueSource
  threadId: string
  destination: string
  draft: OutboundMessageDraft
  sourceMessageId?: string
  reason?: string
  reasonCode?: string
  attempts: number
  nextRetryAtMs: number
  createdAtMs: number
  updatedAtMs: number
  lastError?: string
  status: OfflineQueueStatus
}

export const MAX_QUEUE_ENTRIES = 160
export const MAX_IGNORED_FAILED_IDS = 512

export function enqueueSendError(
  entries: OfflineQueueEntry[],
  input: {
    threadId: string
    destination: string
    draft: OutboundMessageDraft
    reason?: string
    reasonCode?: string
    nowMs?: number
  }
): OfflineQueueEntry[] {
  const threadId = input.threadId.trim()
  const destination = input.destination.trim()
  if (!threadId || !destination) {
    return entries
  }
  const nowMs = input.nowMs ?? Date.now()
  const entry: OfflineQueueEntry = {
    id: `draft:${threadId}:${nowMs}:${Math.random().toString(36).slice(2, 7)}`,
    source: 'send_error',
    threadId,
    destination,
    draft: cloneDraft(input.draft),
    reason: normalizeString(input.reason),
    reasonCode: normalizeString(input.reasonCode),
    attempts: 0,
    nextRetryAtMs: nowMs + retryDelayMs(0),
    createdAtMs: nowMs,
    updatedAtMs: nowMs,
    status: 'queued',
    lastError: normalizeString(input.reason),
  }
  return limitQueue([...entries, entry])
}

export function syncQueueFromThreads(
  entries: OfflineQueueEntry[],
  threads: ChatThread[],
  ignoredFailedMessageIds: Set<string> = new Set(),
  nowMs = Date.now()
): OfflineQueueEntry[] {
  const byId = new Map(entries.map(entry => [entry.id, entry]))
  let changed = false

  for (const thread of threads) {
    for (const message of thread.messages) {
      if (message.sender !== 'self' || message.status !== 'failed') {
        continue
      }
      if (ignoredFailedMessageIds.has(message.id)) {
        continue
      }
      const draft = draftFromFailedMessage(message)
      if (!draft) {
        continue
      }
      const queueId = `failed:${message.id}`
      if (byId.has(queueId)) {
        continue
      }
      byId.set(queueId, {
        id: queueId,
        source: 'failed_message',
        sourceMessageId: message.id,
        threadId: thread.id,
        destination: thread.id,
        draft,
        reason: normalizeString(message.statusDetail),
        reasonCode: normalizeString(message.statusReasonCode),
        attempts: 0,
        nextRetryAtMs: nowMs + retryDelayMs(0),
        createdAtMs: nowMs,
        updatedAtMs: nowMs,
        status: 'queued',
        lastError: normalizeString(message.statusDetail),
      })
      changed = true
    }
  }

  if (!changed) {
    return entries
  }
  return limitQueue([...byId.values()])
}

export function markQueueEntrySending(
  entries: OfflineQueueEntry[],
  queueId: string,
  nowMs = Date.now()
): OfflineQueueEntry[] {
  return updateEntry(entries, queueId, entry => ({
    ...entry,
    status: 'sending',
    updatedAtMs: nowMs,
  }))
}

export function markQueueEntryDelivered(
  entries: OfflineQueueEntry[],
  queueId: string
): OfflineQueueEntry[] {
  const next = entries.filter(entry => entry.id !== queueId)
  return next.length === entries.length ? entries : next
}

export function markQueueEntryAttemptFailed(
  entries: OfflineQueueEntry[],
  queueId: string,
  errorMessage: string,
  nowMs = Date.now()
): OfflineQueueEntry[] {
  return updateEntry(entries, queueId, entry => {
    const attempts = entry.attempts + 1
    const shouldPause = attempts >= MAX_AUTO_RETRY_ATTEMPTS
    const normalizedError = errorMessage.trim() || entry.lastError
    return {
      ...entry,
      attempts,
      status: shouldPause ? 'paused' : 'queued',
      nextRetryAtMs: nowMs + retryDelayMs(attempts),
      updatedAtMs: nowMs,
      lastError: shouldPause
        ? `Auto-paused after ${MAX_AUTO_RETRY_ATTEMPTS} retries: ${normalizedError ?? 'retry budget exhausted'}`
        : normalizedError,
    }
  })
}

export function pauseQueueEntry(
  entries: OfflineQueueEntry[],
  queueId: string,
  nowMs = Date.now()
): OfflineQueueEntry[] {
  return updateEntry(entries, queueId, entry => ({
    ...entry,
    status: 'paused',
    updatedAtMs: nowMs,
  }))
}

export function resumeQueueEntry(
  entries: OfflineQueueEntry[],
  queueId: string,
  nowMs = Date.now()
): OfflineQueueEntry[] {
  return updateEntry(entries, queueId, entry => ({
    ...entry,
    status: 'queued',
    nextRetryAtMs: Math.min(entry.nextRetryAtMs, nowMs + 1_000),
    updatedAtMs: nowMs,
  }))
}

export function retryQueueEntryNow(
  entries: OfflineQueueEntry[],
  queueId: string,
  nowMs = Date.now()
): OfflineQueueEntry[] {
  return updateEntry(entries, queueId, entry => ({
    ...entry,
    status: 'queued',
    nextRetryAtMs: nowMs,
    updatedAtMs: nowMs,
  }))
}

export function removeQueueEntry(
  entries: OfflineQueueEntry[],
  queueId: string
): OfflineQueueEntry[] {
  const next = entries.filter(entry => entry.id !== queueId)
  return next.length === entries.length ? entries : next
}

export function clearOfflineQueue(): OfflineQueueEntry[] {
  return []
}

export function extendIgnoredFailedMessageIds(
  previous: Set<string>,
  messageIds: string[]
): Set<string> {
  if (messageIds.length === 0) {
    return previous
  }
  const next = new Set(previous)
  for (const messageId of messageIds) {
    const normalized = messageId.trim()
    if (!normalized) {
      continue
    }
    next.add(normalized)
  }
  if (next.size <= MAX_IGNORED_FAILED_IDS) {
    return next
  }
  const trimmed = [...next].slice(next.size - MAX_IGNORED_FAILED_IDS)
  return new Set(trimmed)
}

export function nextDueQueueEntry(
  entries: OfflineQueueEntry[],
  nowMs = Date.now()
): OfflineQueueEntry | null {
  for (const entry of entries) {
    if (entry.status !== 'queued') {
      continue
    }
    if (entry.nextRetryAtMs <= nowMs) {
      return entry
    }
  }
  return null
}

export function limitQueue(entries: OfflineQueueEntry[]): OfflineQueueEntry[] {
  return [...entries]
    .sort((left, right) => left.nextRetryAtMs - right.nextRetryAtMs)
    .slice(0, MAX_QUEUE_ENTRIES)
}

function draftFromFailedMessage(message: ChatMessage): OutboundMessageDraft | null {
  const attachmentDrafts = message.attachments.map(attachment => {
    if (!attachment.dataBase64) {
      return null
    }
    return {
      name: attachment.name,
      mime: attachment.mime,
      sizeBytes: attachment.sizeBytes,
      dataBase64: attachment.dataBase64,
    }
  })
  if (attachmentDrafts.some(entry => entry === null)) {
    return null
  }
  const text = message.body.trim()
  if (!text && attachmentDrafts.length === 0 && !message.paper) {
    return null
  }
  return {
    text,
    attachments:
      attachmentDrafts.length > 0
        ? (attachmentDrafts as NonNullable<OutboundMessageDraft['attachments']>)
        : undefined,
    paper: message.paper
      ? {
          title: message.paper.title,
          category: message.paper.category,
        }
      : undefined,
  }
}

function cloneDraft(draft: OutboundMessageDraft): OutboundMessageDraft {
  return {
    text: draft.text,
    attachments: draft.attachments?.map(attachment => ({
      name: attachment.name,
      mime: attachment.mime,
      sizeBytes: attachment.sizeBytes,
      dataBase64: attachment.dataBase64,
      blobKey: attachment.blobKey,
    })),
    paper: draft.paper
      ? {
          title: draft.paper.title,
          category: draft.paper.category,
        }
      : undefined,
  }
}

function updateEntry(
  entries: OfflineQueueEntry[],
  queueId: string,
  mutate: (entry: OfflineQueueEntry) => OfflineQueueEntry
): OfflineQueueEntry[] {
  const index = entries.findIndex(entry => entry.id === queueId)
  if (index < 0) {
    return entries
  }
  const next = [...entries]
  next[index] = mutate(next[index])
  return next
}

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : undefined
}
