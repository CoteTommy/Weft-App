import type { OutboundMessageDraft, OutboundSendOutcome } from '@shared/types/chat'
import { getStoredDisplayName, shortHash } from '@shared/utils/identity'
import { formatRelativeFromNow } from '@shared/utils/time'
import {
  getLxmfProfile,
  listLxmfMessages,
  listLxmfPeers,
  lxmfForceReindex,
  lxmfIndexStatus,
  lxmfQueryThreadMessages,
  lxmfQueryThreads,
  sendLxmfMessage,
  sendLxmfRichMessage,
} from '@lib/lxmf-api'
import type { LxmfMessageRecord } from '@lib/lxmf-payloads'

import { buildThreads } from './chatThreadBuilders'

export async function fetchChatThreads() {
  const [profile, peersResponse] = await Promise.all([
    getLxmfProfile().catch(() => null),
    listLxmfPeers().catch(() => ({ peers: [], meta: null })),
  ])
  const selfAuthor = profile?.displayName?.trim() || getStoredDisplayName() || 'You'
  const peerNames = new Map(peersResponse.peers.map(peer => [peer.peer, peer.name?.trim() || '']))

  if (!isIndexedReadModelEnabled()) {
    return fetchChatThreadsLegacy(selfAuthor, peerNames)
  }

  try {
    const indexStatus = await lxmfIndexStatus().catch(() => null)
    if (!indexStatus?.ready) {
      await lxmfForceReindex().catch(() => undefined)
    }

    const threadResponse = await lxmfQueryThreads({}, { limit: 500 })
    if (threadResponse.items.length === 0) {
      return []
    }

    const messagesByThread = await Promise.all(
      threadResponse.items.map(async thread => {
        const page = await lxmfQueryThreadMessages(thread.threadId, {}, { limit: 500 })
        return {
          threadId: thread.threadId,
          items: page.items.map(toMessageRecord),
        }
      })
    )

    const allMessages = messagesByThread.flatMap(entry => entry.items)
    const threadNameOverrides = new Map(
      threadResponse.items.map(item => [item.threadId, item.name || shortHash(item.threadId)])
    )
    const fromMessages = buildThreads(allMessages, threadNameOverrides, selfAuthor)
    const byThread = new Map(threadResponse.items.map(item => [item.threadId, item]))

    if (fromMessages.length === 0) {
      return threadResponse.items.map(item => ({
        id: item.threadId,
        name: item.name || shortHash(item.threadId),
        destination: item.destination || shortHash(item.threadId, 8),
        preview: item.preview || 'No messages yet',
        unread: item.unread,
        pinned: item.pinned,
        muted: item.muted,
        lastActivity: formatRelativeFromNow(item.lastActivityMs),
        lastActivityAtMs: item.lastActivityMs,
        messages: [],
      }))
    }

    return fromMessages.map(thread => {
      const indexed = byThread.get(thread.id)
      if (!indexed) {
        return thread
      }
      return {
        ...thread,
        name: indexed.name || thread.name,
        destination: indexed.destination || thread.destination,
        preview: indexed.preview || thread.preview,
        unread: indexed.unread,
        pinned: indexed.pinned,
        muted: indexed.muted,
        lastActivity: formatRelativeFromNow(indexed.lastActivityMs),
        lastActivityAtMs: indexed.lastActivityMs,
      }
    })
  } catch {
    return fetchChatThreadsLegacy(selfAuthor, peerNames)
  }
}

export async function postChatMessage(
  threadId: string,
  draft: OutboundMessageDraft
): Promise<OutboundSendOutcome> {
  const destination = threadId.trim()
  if (!destination) {
    throw new Error('cannot send message without destination')
  }
  const content = draft.text.trim()
  if (!content) {
    throw new Error('cannot send empty message')
  }

  const attachments = draft.attachments ?? []
  if (attachments.length > 0) {
    if (draft.paper) {
      throw new Error('paper messages cannot include attachments')
    }
    const response = await sendLxmfRichMessage({
      destination,
      content,
      attachments: attachments.map(attachment => ({
        name: attachment.name,
        dataBase64: attachment.dataBase64,
        mime: attachment.mime,
        sizeBytes: attachment.sizeBytes,
      })),
    })
    return parseSendOutcome(response.result)
  }

  const response = await sendLxmfMessage({
    destination,
    content,
    fields: draft.paper
      ? {
          paper: {
            title: draft.paper.title,
            category: draft.paper.category,
          },
        }
      : undefined,
    method: draft.paper ? 'paper' : undefined,
  })
  return parseSendOutcome(response.result)
}

export { buildThreads } from './chatThreadBuilders'

async function fetchChatThreadsLegacy(selfAuthor: string, peerNames: Map<string, string>) {
  const [messagesResponse, peersResponse] = await Promise.all([
    listLxmfMessages(),
    listLxmfPeers().catch(() => ({ peers: [], meta: null })),
  ])
  for (const peer of peersResponse.peers) {
    if (!peerNames.has(peer.peer)) {
      peerNames.set(peer.peer, peer.name?.trim() || shortHash(peer.peer))
    }
  }
  return buildThreads(messagesResponse.messages, peerNames, selfAuthor)
}

function toMessageRecord(value: {
  id: string
  source: string
  destination: string
  title: string
  content: string
  timestamp: number
  direction: string
  fields: Record<string, unknown> | null
  receiptStatus: string | null
}): LxmfMessageRecord {
  return {
    id: value.id,
    source: value.source,
    destination: value.destination,
    title: value.title,
    content: value.content,
    timestamp: value.timestamp,
    direction: value.direction,
    fields: value.fields,
    receipt_status: value.receiptStatus,
  }
}

function isIndexedReadModelEnabled(): boolean {
  return import.meta.env.VITE_USE_INDEXED_READ_MODEL !== 'false'
}

function parseSendOutcome(result: unknown): OutboundSendOutcome {
  const paperUri = findPaperUri(result)
  const backendStatus = findStatus(result)
  const messageId = findMessageId(result)
  return {
    paperUri: paperUri ?? undefined,
    backendStatus: backendStatus ?? undefined,
    messageId: messageId ?? undefined,
  }
}

function findPaperUri(value: unknown, depth = 0): string | null {
  if (depth > 5 || value === null || value === undefined) {
    return null
  }
  if (typeof value === 'string') {
    const normalized = value.trim()
    if (normalized.toLowerCase().startsWith('lxm://')) {
      return normalized
    }
    return null
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = findPaperUri(entry, depth + 1)
      if (found) {
        return found
      }
    }
    return null
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    for (const key of ['paper_uri', 'uri', 'lxm_uri']) {
      const candidate = record[key]
      if (typeof candidate === 'string' && candidate.trim().toLowerCase().startsWith('lxm://')) {
        return candidate.trim()
      }
    }
    for (const entry of Object.values(record)) {
      const found = findPaperUri(entry, depth + 1)
      if (found) {
        return found
      }
    }
    return null
  }
  return null
}

function findStatus(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null
  }
  if (typeof value === 'string') {
    const normalized = value.trim()
    return normalized.length > 0 ? normalized : null
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const nested = findStatus(entry)
      if (nested) {
        return nested
      }
    }
    return null
  }
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const record = value as Record<string, unknown>
    for (const key of ['status', 'receipt_status', 'state']) {
      const candidate = record[key]
      if (typeof candidate === 'string' && candidate.trim().length > 0) {
        return candidate.trim()
      }
    }
    for (const entry of Object.values(record)) {
      const nested = findStatus(entry)
      if (nested) {
        return nested
      }
    }
  }
  return null
}

function findMessageId(value: unknown, depth = 0): string | null {
  if (depth > 5 || value === null || value === undefined) {
    return null
  }
  if (typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>
    for (const key of ['message_id', 'messageId', 'id', 'lxmf_id']) {
      const candidate = record[key]
      if (typeof candidate === 'string' && candidate.trim().length > 0) {
        return candidate.trim()
      }
    }
    for (const entry of Object.values(record)) {
      const nested = findMessageId(entry, depth + 1)
      if (nested) {
        return nested
      }
    }
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const nested = findMessageId(entry, depth + 1)
      if (nested) {
        return nested
      }
    }
  }
  return null
}
