import {
  getLxmfProfile,
  listLxmfMessages,
  listLxmfPeers,
  sendLxmfRichMessage,
  sendLxmfMessage,
} from '../../../lib/lxmf-api'
import type { LxmfMessageRecord } from '../../../lib/lxmf-payloads'
import type {
  ChatAttachment,
  ChatMessage,
  ChatPaperMeta,
  ChatThread,
  OutboundMessageDraft,
  OutboundSendOutcome,
} from '../../../shared/types/chat'
import { getStoredDisplayName, shortHash } from '../../../shared/utils/identity'
import { formatClockTime, formatRelativeFromNow } from '../../../shared/utils/time'

export async function fetchChatThreads(): Promise<ChatThread[]> {
  const [messagesResponse, peersResponse, profile] = await Promise.all([
    listLxmfMessages(),
    listLxmfPeers(),
    getLxmfProfile().catch(() => null),
  ])
  const selfAuthor = profile?.displayName?.trim() || getStoredDisplayName() || 'You'
  const peerNames = new Map(
    peersResponse.peers.map((peer) => [peer.peer, peer.name?.trim() || shortHash(peer.peer)]),
  )
  return buildThreads(messagesResponse.messages, peerNames, selfAuthor)
}

export async function postChatMessage(
  threadId: string,
  draft: OutboundMessageDraft,
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
    await sendLxmfRichMessage({
      destination,
      content,
      attachments: attachments.map((attachment) => ({
        name: attachment.name,
        dataBase64: attachment.dataBase64,
        mime: attachment.mime,
        sizeBytes: attachment.sizeBytes,
      })),
    })
    return {}
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

export function buildThreads(
  records: LxmfMessageRecord[],
  peerNames: Map<string, string> = new Map(),
  selfAuthor = 'You',
): ChatThread[] {
  const byCounterparty = new Map<string, LxmfMessageRecord[]>()

  for (const record of records) {
    if (isInternalCommandRecord(record)) {
      continue
    }
    const counterparty = record.direction === 'out' ? record.destination : record.source
    if (!counterparty) {
      continue
    }
    const list = byCounterparty.get(counterparty)
    if (list) {
      list.push(record)
    } else {
      byCounterparty.set(counterparty, [record])
    }
  }

  const threadsWithTime = [...byCounterparty.entries()].map(([counterparty, threadRecords]) => {
    const sorted = [...threadRecords].sort((a, b) => normalizeTimestampMs(a.timestamp) - normalizeTimestampMs(b.timestamp))
    const messages = sorted.map((record) => toChatMessage(record, counterparty, selfAuthor))
    const last = sorted[sorted.length - 1]
    const lastTimestampMs = normalizeTimestampMs(last?.timestamp ?? Date.now())

    return {
      lastTimestampMs,
      thread: {
        id: counterparty,
        name: peerNames.get(counterparty) ?? shortHash(counterparty),
        destination: shortHash(counterparty, 8),
        preview: latestPreview(last),
        unread: 0,
        pinned: false,
        muted: false,
        lastActivity: formatRelativeFromNow(lastTimestampMs),
        messages,
      } satisfies ChatThread,
    }
  })

  threadsWithTime.sort((a, b) => b.lastTimestampMs - a.lastTimestampMs)
  return threadsWithTime.map((entry) => entry.thread)
}

function latestPreview(record: LxmfMessageRecord | undefined): string {
  if (!record) {
    return 'No messages yet'
  }
  const content = record?.content?.trim()
  if (content && content.length > 0) {
    return content
  }
  const assets = parseMessageAssets(record.fields)
  if (assets.attachments.length > 0) {
    return assets.attachments.length === 1
      ? `Attachment: ${assets.attachments[0].name}`
      : `${assets.attachments.length} attachments`
  }
  if (assets.paper?.title) {
    return `Paper: ${assets.paper.title}`
  }
  if (record.title?.trim()) {
    return record.title.trim()
  }
  return 'No messages yet'
}

function toChatMessage(
  record: LxmfMessageRecord,
  counterparty: string,
  selfAuthor: string,
): ChatMessage {
  const timestampMs = normalizeTimestampMs(record.timestamp)
  const statusDetail = normalizeStatusDetail(record.receipt_status)
  const assets = parseMessageAssets(record.fields)
  return {
    id: record.id,
    author: record.direction === 'out' ? selfAuthor : shortHash(counterparty),
    sender: record.direction === 'out' ? 'self' : 'peer',
    body: record.content,
    attachments: assets.attachments,
    paper: assets.paper,
    sentAt: formatClockTime(timestampMs),
    status: mapReceiptStatus(record.direction, record.receipt_status),
    statusDetail,
  }
}

function normalizeTimestampMs(value: number): number {
  if (!Number.isFinite(value)) {
    return Date.now()
  }
  if (value < 1_000_000_000_000) {
    return value * 1000
  }
  return value
}

function mapReceiptStatus(
  direction: string,
  receiptStatus: string | null,
): ChatMessage['status'] | undefined {
  if (direction !== 'out') {
    return undefined
  }
  if (!receiptStatus || receiptStatus.trim() === '') {
    return 'sending'
  }
  const normalized = receiptStatus.trim().toLowerCase()
  if (normalized.includes('deliver')) {
    return 'delivered'
  }
  if (
    normalized.includes('fail') ||
    normalized.includes('error') ||
    normalized.includes('drop') ||
    normalized.includes('timeout') ||
    normalized.includes('no route') ||
    normalized.includes('not announced') ||
    normalized.includes('invalid')
  ) {
    return 'failed'
  }
  if (
    normalized.includes('sent') ||
    normalized.includes('send') ||
    normalized.includes('queue') ||
    normalized.includes('stored') ||
    normalized.includes('accepted') ||
    normalized.includes('link') ||
    normalized.includes('opportunistic') ||
    normalized.includes('broadcast') ||
    normalized.includes('direct')
  ) {
    return 'sent'
  }
  if (
    normalized.includes('pending') ||
    normalized.includes('waiting') ||
    normalized.includes('trying') ||
    normalized.includes('retry')
  ) {
    return 'sending'
  }
  return 'sent'
}

function normalizeStatusDetail(value: string | null): string | undefined {
  if (!value) {
    return undefined
  }
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : undefined
}

function isInternalCommandRecord(record: LxmfMessageRecord): boolean {
  if (record.direction !== 'out') {
    return false
  }
  return record.content.trim().startsWith('\\\\\\\\\\')
}

function parseMessageAssets(
  fields: LxmfMessageRecord['fields'],
): { attachments: ChatAttachment[]; paper?: ChatPaperMeta } {
  const root = asObject(fields)
  if (!root) {
    return { attachments: [] }
  }
  const structured = parseStructuredAttachments(root.attachments)
  const canonical = parseCanonicalAttachments(root['5'])
  const attachments = mergeAttachments(structured, canonical)
  const paper = parsePaperMeta(root.paper)

  return {
    attachments,
    paper,
  }
}

function parseStructuredAttachments(value: unknown): ChatAttachment[] {
  if (!Array.isArray(value)) {
    return []
  }
  const out: ChatAttachment[] = []
  for (const entry of value) {
    const attachment = asObject(entry)
    if (!attachment) {
      continue
    }
    const name = asNonEmptyString(attachment.name)
    if (!name) {
      continue
    }
    const dataBase64 = asNonEmptyString(attachment.inline_base64)
    const sizeFromPayload =
      typeof attachment.size_bytes === 'number' && Number.isFinite(attachment.size_bytes)
        ? Math.max(0, Math.trunc(attachment.size_bytes))
        : undefined
    out.push({
      name,
      mime: asNonEmptyString(attachment.mime),
      sizeBytes: sizeFromPayload ?? estimateBase64Size(dataBase64),
      dataBase64: dataBase64 ?? undefined,
    })
  }
  return out
}

function parseCanonicalAttachments(value: unknown): ChatAttachment[] {
  if (!Array.isArray(value)) {
    return []
  }
  const out: ChatAttachment[] = []
  for (const entry of value) {
    if (!Array.isArray(entry) || entry.length < 2) {
      continue
    }
    const name = decodeWireText(entry[0]) ?? `Attachment ${out.length + 1}`
    const bytes = decodeWireBytes(entry[1])
    if (!bytes || bytes.length === 0) {
      continue
    }
    out.push({
      name,
      sizeBytes: bytes.length,
      dataBase64: bytesToBase64(bytes),
    })
  }
  return out
}

function mergeAttachments(
  structured: ChatAttachment[],
  canonical: ChatAttachment[],
): ChatAttachment[] {
  if (structured.length === 0) {
    return canonical
  }
  if (canonical.length === 0) {
    return structured
  }
  const seen = new Set(structured.map((attachment) => `${attachment.name}:${attachment.sizeBytes}`))
  const out = [...structured]
  for (const entry of canonical) {
    const key = `${entry.name}:${entry.sizeBytes}`
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    out.push(entry)
  }
  return out
}

function parsePaperMeta(value: unknown): ChatPaperMeta | undefined {
  const paper = asObject(value)
  if (!paper) {
    return undefined
  }
  const title = asNonEmptyString(paper.title)
  const category = asNonEmptyString(paper.category)
  if (!title && !category) {
    return undefined
  }
  return {
    title,
    category,
  }
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null
  }
  return value as Record<string, unknown>
}

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : undefined
}

function decodeWireText(value: unknown): string | null {
  if (typeof value === 'string') {
    const normalized = value.trim()
    return normalized.length > 0 ? normalized : null
  }
  const bytes = decodeWireBytes(value)
  if (!bytes || bytes.length === 0) {
    return null
  }
  try {
    return new TextDecoder().decode(bytes).trim() || null
  } catch {
    return null
  }
}

function decodeWireBytes(value: unknown): Uint8Array | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null
  }
  const bytes = new Uint8Array(value.length)
  for (let index = 0; index < value.length; index += 1) {
    const entry = value[index]
    if (typeof entry !== 'number' || !Number.isFinite(entry) || entry < 0 || entry > 255) {
      return null
    }
    bytes[index] = entry
  }
  return bytes
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}

function estimateBase64Size(value: string | undefined): number {
  if (!value) {
    return 0
  }
  const trimmed = value.trim().replace(/=+$/, '')
  if (!trimmed) {
    return 0
  }
  return Math.max(0, Math.floor((trimmed.length * 3) / 4))
}

function parseSendOutcome(result: unknown): OutboundSendOutcome {
  const paperUri = findPaperUri(result)
  const backendStatus = findStatus(result)
  return {
    paperUri: paperUri ?? undefined,
    backendStatus: backendStatus ?? undefined,
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
  if (typeof value === 'string') {
    const normalized = value.trim()
    return normalized.length > 0 ? normalized : null
  }
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const record = value as Record<string, unknown>
    for (const key of ['status', 'receipt_status', 'state']) {
      const candidate = record[key]
      if (typeof candidate === 'string' && candidate.trim().length > 0) {
        return candidate.trim()
      }
    }
  }
  return null
}
