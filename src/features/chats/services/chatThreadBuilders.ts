import type { ChatMessage, ChatThread } from '@shared/types/chat'
import { shortHash } from '@shared/utils/identity'
import { formatClockTime, formatRelativeFromNow } from '@shared/utils/time'
import type { LxmfMessageRecord } from '@lib/lxmf-payloads'

import { parseMessageAssets } from './chatMessageAssets'

export function buildThreads(
  records: LxmfMessageRecord[],
  peerNames: Map<string, string> = new Map(),
  selfAuthor = 'You'
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
    const sorted = [...threadRecords].sort(
      (a, b) => normalizeTimestampMs(a.timestamp) - normalizeTimestampMs(b.timestamp)
    )
    const messages = sorted.map(record => toChatMessage(record, counterparty, selfAuthor))
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
        lastActivityAtMs: lastTimestampMs,
        messages,
      } satisfies ChatThread,
    }
  })

  threadsWithTime.sort((a, b) => b.lastTimestampMs - a.lastTimestampMs)
  return threadsWithTime.map(entry => entry.thread)
}

function latestPreview(record: LxmfMessageRecord | undefined): string {
  if (!record) {
    return 'No messages yet'
  }
  const content = record.content?.trim()
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
  selfAuthor: string
): ChatMessage {
  const timestampMs = normalizeTimestampMs(record.timestamp)
  const statusDetail = normalizeStatusDetail(record.receipt_status)
  const assets = parseMessageAssets(record.fields)
  return {
    id: record.id,
    author: record.direction === 'out' ? selfAuthor : shortHash(counterparty),
    sender: record.direction === 'out' ? 'self' : 'peer',
    body: record.content,
    kind: assets.kind,
    replyToId: assets.replyToId,
    reaction: assets.reaction,
    location: assets.location,
    attachments: assets.attachments,
    paper: assets.paper,
    sentAt: formatClockTime(timestampMs),
    status: deriveReceiptStatus(record.direction, record.receipt_status),
    statusDetail,
    statusReasonCode: deriveReasonCode(statusDetail),
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

export function deriveReceiptStatus(
  direction: string,
  receiptStatus: string | null
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

export function deriveReasonCode(statusDetail: string | undefined): string | undefined {
  if (!statusDetail) {
    return undefined
  }
  const normalized = statusDetail.toLowerCase()
  if (normalized.includes('receipt timeout')) {
    return 'receipt_timeout'
  }
  if (normalized.includes('timeout')) {
    return 'timeout'
  }
  if (
    normalized.includes('no route') ||
    normalized.includes('no path') ||
    normalized.includes('no known path')
  ) {
    return 'no_path'
  }
  if (normalized.includes('no propagation relay selected')) {
    return 'relay_unset'
  }
  if (normalized.includes('retry budget exhausted')) {
    return 'retry_budget_exhausted'
  }
  return undefined
}

function isInternalCommandRecord(record: LxmfMessageRecord): boolean {
  if (record.direction !== 'out') {
    return false
  }
  return record.content.trim().startsWith('\\\\\\\\\\')
}
