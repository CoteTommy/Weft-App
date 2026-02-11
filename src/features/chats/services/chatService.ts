import { listLxmfMessages, sendLxmfMessage } from '../../../lib/lxmf-api'
import type { LxmfMessageRecord } from '../../../lib/lxmf-payloads'
import type { ChatMessage, ChatThread } from '../../../shared/types/chat'
import { shortHash } from '../../../shared/utils/identity'
import { formatClockTime, formatRelativeFromNow } from '../../../shared/utils/time'

export async function fetchChatThreads(): Promise<ChatThread[]> {
  const response = await listLxmfMessages()
  return buildThreads(response.messages)
}

export async function postChatMessage(threadId: string, content: string): Promise<void> {
  const destination = threadId.trim()
  if (!destination) {
    throw new Error('cannot send message without destination')
  }

  await sendLxmfMessage({
    destination,
    content,
  })
}

export function buildThreads(records: LxmfMessageRecord[]): ChatThread[] {
  const byCounterparty = new Map<string, LxmfMessageRecord[]>()

  for (const record of records) {
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
    const messages = sorted.map((record) => toChatMessage(record, counterparty))
    const last = sorted[sorted.length - 1]
    const lastTimestampMs = normalizeTimestampMs(last?.timestamp ?? Date.now())

    return {
      lastTimestampMs,
      thread: {
        id: counterparty,
        name: shortHash(counterparty),
        preview: last?.content ?? 'No messages yet',
        unread: 0,
        lastActivity: formatRelativeFromNow(lastTimestampMs),
        messages,
      } satisfies ChatThread,
    }
  })

  threadsWithTime.sort((a, b) => b.lastTimestampMs - a.lastTimestampMs)
  return threadsWithTime.map((entry) => entry.thread)
}

function toChatMessage(record: LxmfMessageRecord, counterparty: string): ChatMessage {
  const timestampMs = normalizeTimestampMs(record.timestamp)
  return {
    id: record.id,
    author: record.direction === 'out' ? 'You' : shortHash(counterparty),
    sender: record.direction === 'out' ? 'self' : 'peer',
    body: record.content,
    sentAt: formatClockTime(timestampMs),
    status: mapReceiptStatus(record.direction, record.receipt_status),
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
    return 'sent'
  }
  const normalized = receiptStatus.toLowerCase()
  if (normalized.includes('deliver')) {
    return 'delivered'
  }
  if (normalized.includes('fail')) {
    return 'failed'
  }
  if (normalized.includes('send')) {
    return 'sent'
  }
  return 'sending'
}
