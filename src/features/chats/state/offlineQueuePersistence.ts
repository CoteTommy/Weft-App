import {
  readStoredJson,
  removeStoredKey,
  type StorageWriteResult,
  writeStoredJson,
} from '@shared/runtime/storage'
import type { OutboundAttachmentDraft, OutboundMessageDraft } from '@shared/types/chat'

import {
  loadOfflineAttachment,
  pruneOfflineAttachments,
  storeOfflineAttachment,
} from './offlineQueueAttachmentStore'
import {
  limitQueue,
  MAX_IGNORED_FAILED_IDS,
  type OfflineQueueEntry,
  type OfflineQueueSource,
  type OfflineQueueStatus,
} from './offlineQueueStore'

type StoredOfflineQueueAttachment = {
  name: string
  sizeBytes: number
  mime?: string
  dataBase64?: string
  blobKey?: string
}

type StoredOfflineQueueDraft = {
  text: string
  attachments?: StoredOfflineQueueAttachment[]
  paper?: {
    title?: string
    category?: string
  }
}

type StoredOfflineQueueEntry = Omit<OfflineQueueEntry, 'draft'> & {
  draft: StoredOfflineQueueDraft
}

const OFFLINE_QUEUE_KEY = 'weft.chat.offline-queue.v2'
const OFFLINE_QUEUE_LEGACY_KEY = 'weft.chat.offline-queue.v1'
const OFFLINE_QUEUE_IGNORED_KEY = 'weft.chat.offline-queue-ignored.v1'
const INLINE_ATTACHMENT_STORAGE_LIMIT_BYTES = 16 * 1024

export async function loadStoredOfflineQueue(): Promise<OfflineQueueEntry[]> {
  if (typeof window === 'undefined') {
    return []
  }

  const storedV2 = readStoredJson<unknown>(OFFLINE_QUEUE_KEY)
  const storedV1 = storedV2 ? null : readStoredJson<unknown>(OFFLINE_QUEUE_LEGACY_KEY)
  const source = storedV2 ?? storedV1
  if (!Array.isArray(source)) {
    return []
  }

  const parsed = source
    .map(value => parseStoredQueueEntry(value))
    .filter((entry): entry is StoredOfflineQueueEntry => entry !== null)

  const hydrated = (await Promise.all(parsed.map(entry => hydrateStoredEntry(entry)))).filter(
    (entry): entry is OfflineQueueEntry => entry !== null
  )

  const normalized = limitQueue(hydrated)

  if (normalized.length > 0 || storedV1) {
    await persistOfflineQueue(normalized)
  }
  if (storedV1) {
    removeStoredKey(OFFLINE_QUEUE_LEGACY_KEY)
  }

  return normalized
}

export function getStoredOfflineQueue(): OfflineQueueEntry[] {
  // Legacy sync API retained for compatibility in test/setup code.
  return []
}

export async function persistOfflineQueue(
  entries: OfflineQueueEntry[]
): Promise<StorageWriteResult> {
  const normalized = limitQueue(entries)
  const stored = await Promise.all(normalized.map(entry => serializeQueueEntry(entry)))
  const activeBlobKeys = new Set<string>()
  for (const entry of stored) {
    const attachments = entry.draft.attachments ?? []
    for (const attachment of attachments) {
      if (attachment.blobKey) {
        activeBlobKeys.add(attachment.blobKey)
      }
    }
  }

  const result = writeStoredJson(OFFLINE_QUEUE_KEY, stored)
  if (result.ok) {
    removeStoredKey(OFFLINE_QUEUE_LEGACY_KEY)
  }

  await pruneOfflineAttachments(activeBlobKeys)

  return result
}

export function getIgnoredFailedMessageIds(): Set<string> {
  if (typeof window === 'undefined') {
    return new Set()
  }
  const parsed = readStoredJson<unknown>(OFFLINE_QUEUE_IGNORED_KEY)
  if (!Array.isArray(parsed)) {
    return new Set()
  }
  return new Set(
    parsed
      .map(value => (typeof value === 'string' ? value.trim() : ''))
      .filter(value => value.length > 0)
      .slice(0, MAX_IGNORED_FAILED_IDS)
  )
}

export function persistIgnoredFailedMessageIds(ids: Set<string>): StorageWriteResult {
  return writeStoredJson(OFFLINE_QUEUE_IGNORED_KEY, [...ids].slice(0, MAX_IGNORED_FAILED_IDS))
}

async function serializeQueueEntry(entry: OfflineQueueEntry): Promise<StoredOfflineQueueEntry> {
  const draft = await serializeQueueDraft(entry.id, entry.draft)
  return {
    ...entry,
    draft,
  }
}

async function serializeQueueDraft(
  queueId: string,
  draft: OutboundMessageDraft
): Promise<StoredOfflineQueueDraft> {
  const attachments = await Promise.all(
    (draft.attachments ?? []).map(async (attachment, index) => {
      const blobKey = buildAttachmentBlobKey(queueId, index)
      const stored = await storeOfflineAttachment(blobKey, attachment)
      if (stored) {
        return {
          name: attachment.name,
          mime: attachment.mime,
          sizeBytes: attachment.sizeBytes,
          blobKey,
        } satisfies StoredOfflineQueueAttachment
      }
      if (attachment.sizeBytes <= INLINE_ATTACHMENT_STORAGE_LIMIT_BYTES) {
        return {
          name: attachment.name,
          mime: attachment.mime,
          sizeBytes: attachment.sizeBytes,
          dataBase64: attachment.dataBase64,
        } satisfies StoredOfflineQueueAttachment
      }
      return {
        name: attachment.name,
        mime: attachment.mime,
        sizeBytes: attachment.sizeBytes,
        dataBase64: attachment.dataBase64,
      } satisfies StoredOfflineQueueAttachment
    })
  )

  return {
    text: draft.text,
    attachments: attachments.length > 0 ? attachments : undefined,
    paper: draft.paper
      ? {
          title: draft.paper.title,
          category: draft.paper.category,
        }
      : undefined,
  }
}

async function hydrateStoredEntry(
  entry: StoredOfflineQueueEntry
): Promise<OfflineQueueEntry | null> {
  const draft = await hydrateStoredDraft(entry.draft)
  if (!draft) {
    return null
  }
  return {
    ...entry,
    draft,
  }
}

async function hydrateStoredDraft(
  draft: StoredOfflineQueueDraft
): Promise<OutboundMessageDraft | null> {
  const attachments = await Promise.all(
    (draft.attachments ?? []).map(async attachment => {
      const inline = normalizeString(attachment.dataBase64)
      if (inline) {
        return {
          name: attachment.name,
          mime: attachment.mime,
          sizeBytes: attachment.sizeBytes,
          dataBase64: inline,
        } satisfies OutboundAttachmentDraft
      }
      const blobKey = normalizeString(attachment.blobKey)
      if (!blobKey) {
        return null
      }
      const loaded = await loadOfflineAttachment(blobKey)
      if (!loaded) {
        return null
      }
      return {
        name: attachment.name,
        mime: attachment.mime ?? loaded.mime,
        sizeBytes: attachment.sizeBytes,
        dataBase64: loaded.dataBase64,
      } satisfies OutboundAttachmentDraft
    })
  )

  if (attachments.some(attachment => attachment === null)) {
    return null
  }

  const text = draft.text
  const resolvedAttachments = attachments.length
    ? (attachments as OutboundAttachmentDraft[])
    : undefined
  const paper = draft.paper
    ? {
        title: draft.paper.title,
        category: draft.paper.category,
      }
    : undefined

  if (!text.trim() && (!resolvedAttachments || resolvedAttachments.length === 0) && !paper) {
    return null
  }

  return {
    text,
    attachments: resolvedAttachments,
    paper,
  }
}

function parseStoredQueueEntry(value: unknown): StoredOfflineQueueEntry | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null
  }
  const record = value as Record<string, unknown>
  const id = normalizeString(record.id)
  const source = normalizeQueueSource(record.source)
  const threadId = normalizeString(record.threadId)
  const destination = normalizeString(record.destination)
  const status = normalizeQueueStatus(record.status)
  const draft = parseStoredDraft(record.draft)
  const nextRetryAtMs = normalizeNumber(record.nextRetryAtMs)
  const attempts = normalizeNumber(record.attempts)
  const createdAtMs = normalizeNumber(record.createdAtMs)
  const updatedAtMs = normalizeNumber(record.updatedAtMs)
  if (!id || !source || !threadId || !destination || !status || !draft) {
    return null
  }
  return {
    id,
    source,
    threadId,
    destination,
    draft,
    sourceMessageId: normalizeString(record.sourceMessageId),
    reason: normalizeString(record.reason),
    reasonCode: normalizeString(record.reasonCode),
    attempts: attempts ?? 0,
    nextRetryAtMs: nextRetryAtMs ?? Date.now(),
    createdAtMs: createdAtMs ?? Date.now(),
    updatedAtMs: updatedAtMs ?? Date.now(),
    status,
    lastError: normalizeString(record.lastError),
  }
}

function parseStoredDraft(value: unknown): StoredOfflineQueueDraft | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null
  }
  const record = value as Record<string, unknown>
  const text = typeof record.text === 'string' ? record.text : ''
  const attachments = Array.isArray(record.attachments)
    ? record.attachments
        .map(parseStoredAttachment)
        .filter((entry): entry is StoredOfflineQueueAttachment => entry !== null)
    : undefined
  const paper =
    record.paper && typeof record.paper === 'object' && !Array.isArray(record.paper)
      ? {
          title:
            typeof (record.paper as Record<string, unknown>).title === 'string'
              ? ((record.paper as Record<string, unknown>).title as string)
              : undefined,
          category:
            typeof (record.paper as Record<string, unknown>).category === 'string'
              ? ((record.paper as Record<string, unknown>).category as string)
              : undefined,
        }
      : undefined
  if (!text.trim() && (!attachments || attachments.length === 0) && !paper) {
    return null
  }
  return {
    text,
    attachments: attachments?.length ? attachments : undefined,
    paper,
  }
}

function parseStoredAttachment(value: unknown): StoredOfflineQueueAttachment | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null
  }
  const record = value as Record<string, unknown>
  if (
    typeof record.name !== 'string' ||
    typeof record.sizeBytes !== 'number' ||
    !Number.isFinite(record.sizeBytes)
  ) {
    return null
  }
  const dataBase64 = normalizeString(record.dataBase64)
  const blobKey = normalizeString(record.blobKey)
  if (!dataBase64 && !blobKey) {
    return null
  }
  return {
    name: record.name,
    sizeBytes: record.sizeBytes,
    mime: typeof record.mime === 'string' ? record.mime : undefined,
    dataBase64,
    blobKey,
  }
}

function normalizeQueueSource(value: unknown): OfflineQueueSource | null {
  return value === 'send_error' || value === 'failed_message' ? value : null
}

function normalizeQueueStatus(value: unknown): OfflineQueueStatus | null {
  return value === 'queued' || value === 'paused' || value === 'sending' ? value : null
}

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : undefined
}

function normalizeNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function buildAttachmentBlobKey(queueId: string, index: number): string {
  return `queue:${queueId}:attachment:${index}`
}
