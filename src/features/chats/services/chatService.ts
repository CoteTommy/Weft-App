import type { OutboundMessageDraft, OutboundSendOutcome } from '@shared/types/chat'
import { getStoredDisplayName, shortHash } from '@shared/utils/identity'
import {
  getLxmfProfile,
  listLxmfMessages,
  listLxmfPeers,
  sendLxmfMessage,
  sendLxmfRichMessage,
} from '@lib/lxmf-api'

import { buildThreads } from './chatThreadBuilders'

export async function fetchChatThreads() {
  const [messagesResponse, peersResponse, profile] = await Promise.all([
    listLxmfMessages(),
    listLxmfPeers(),
    getLxmfProfile().catch(() => null),
  ])
  const selfAuthor = profile?.displayName?.trim() || getStoredDisplayName() || 'You'
  const peerNames = new Map(
    peersResponse.peers.map(peer => [peer.peer, peer.name?.trim() || shortHash(peer.peer)])
  )
  return buildThreads(messagesResponse.messages, peerNames, selfAuthor)
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
