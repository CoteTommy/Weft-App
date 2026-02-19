import type { OutboundAttachmentDraft } from '@shared/types/chat'

const DB_NAME = 'weft.chat.offline-attachments.v1'
const DB_VERSION = 1
const STORE_NAME = 'attachments'
const MAX_ATTACHMENT_CACHE_BYTES = 64 * 1024 * 1024

interface OfflineAttachmentRecord {
  key: string
  name: string
  mime?: string
  sizeBytes: number
  blob?: Blob
  dataBase64?: string
  updatedAtMs: number
}

type StoreOfflineAttachmentInput = Pick<
  OutboundAttachmentDraft,
  'name' | 'mime' | 'sizeBytes' | 'dataBase64'
> & {
  blob?: Blob
}

type OfflineAttachmentBlobEntry = {
  name: string
  mime?: string
  sizeBytes: number
  blob: Blob
}

export function isOfflineAttachmentStoreSupported(): boolean {
  return typeof window !== 'undefined' && typeof indexedDB !== 'undefined'
}

export async function storeOfflineAttachment(
  key: string,
  attachment: StoreOfflineAttachmentInput
): Promise<boolean> {
  const blob = await resolveAttachmentBlob(attachment)
  if (!blob) {
    return false
  }
  const db = await openDb()
  if (!db) {
    return false
  }
  const record: OfflineAttachmentRecord = {
    key,
    name: attachment.name,
    mime: attachment.mime,
    sizeBytes: attachment.sizeBytes,
    blob,
    updatedAtMs: Date.now(),
  }
  const ok = await putRecord(db, record)
  if (ok) {
    await enforceAttachmentCacheLimit(db, MAX_ATTACHMENT_CACHE_BYTES)
  }
  db.close()
  return ok
}

export async function loadOfflineAttachment(
  key: string
): Promise<OfflineAttachmentBlobEntry | null> {
  const db = await openDb()
  if (!db) {
    return null
  }
  const record = await getRecord(db, key)
  if (!record) {
    db.close()
    return null
  }
  const blob = await getRecordBlob(record)
  if (!blob) {
    db.close()
    return null
  }
  const migratedRecord = {
    ...record,
    blob,
    dataBase64: undefined,
    updatedAtMs: Date.now(),
  } satisfies OfflineAttachmentRecord
  await putRecord(db, migratedRecord)
  db.close()
  return {
    name: record.name,
    mime: record.mime,
    sizeBytes: record.sizeBytes,
    blob,
  }
}

export async function loadOfflineAttachmentAsBase64(
  key: string
): Promise<OutboundAttachmentDraft | null> {
  const loaded = await loadOfflineAttachment(key)
  if (!loaded) {
    return null
  }
  return {
    name: loaded.name,
    mime: loaded.mime,
    sizeBytes: loaded.sizeBytes,
    dataBase64: await blobToBase64(loaded.blob),
  }
}

export async function pruneOfflineAttachments(activeKeys: Set<string>): Promise<void> {
  const db = await openDb()
  if (!db) {
    return
  }
  const all = await getAllRecords(db)
  if (!all) {
    db.close()
    return
  }
  await Promise.all(
    all.filter(record => !activeKeys.has(record.key)).map(record => deleteRecord(db, record.key))
  )
  db.close()
}

async function openDb(): Promise<IDBDatabase | null> {
  if (!isOfflineAttachmentStoreSupported()) {
    return null
  }
  return await new Promise(resolve => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' })
      }
    }
    request.onsuccess = () => {
      resolve(request.result)
    }
    request.onerror = () => {
      resolve(null)
    }
  })
}

async function putRecord(db: IDBDatabase, record: OfflineAttachmentRecord): Promise<boolean> {
  return await new Promise(resolve => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(record)
    tx.oncomplete = () => resolve(true)
    tx.onerror = () => resolve(false)
    tx.onabort = () => resolve(false)
  })
}

async function getRecord(db: IDBDatabase, key: string): Promise<OfflineAttachmentRecord | null> {
  return await new Promise(resolve => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const request = tx.objectStore(STORE_NAME).get(key)
    request.onsuccess = () => {
      const value = request.result
      if (!value || typeof value !== 'object') {
        resolve(null)
        return
      }
      const record = value as OfflineAttachmentRecord
      if (
        typeof record.key !== 'string' ||
        typeof record.name !== 'string' ||
        typeof record.sizeBytes !== 'number'
      ) {
        resolve(null)
        return
      }
      resolve(record)
    }
    request.onerror = () => {
      resolve(null)
    }
  })
}

async function deleteRecord(db: IDBDatabase, key: string): Promise<boolean> {
  return await new Promise(resolve => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).delete(key)
    tx.oncomplete = () => resolve(true)
    tx.onerror = () => resolve(false)
    tx.onabort = () => resolve(false)
  })
}

async function getAllRecords(db: IDBDatabase): Promise<OfflineAttachmentRecord[] | null> {
  return await new Promise(resolve => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const request = tx.objectStore(STORE_NAME).getAll()
    request.onsuccess = () => {
      const value = request.result
      if (!Array.isArray(value)) {
        resolve([])
        return
      }
      resolve(
        value.filter(
          entry =>
            entry &&
            typeof entry === 'object' &&
            typeof (entry as OfflineAttachmentRecord).key === 'string'
        ) as OfflineAttachmentRecord[]
      )
    }
    request.onerror = () => resolve(null)
  })
}

async function enforceAttachmentCacheLimit(db: IDBDatabase, maxBytes: number): Promise<void> {
  const all = await getAllRecords(db)
  if (!all || all.length === 0) {
    return
  }
  let total = all.reduce((sum, record) => sum + Math.max(record.sizeBytes, 0), 0)
  if (total <= maxBytes) {
    return
  }
  const sorted = [...all].sort((left, right) => left.updatedAtMs - right.updatedAtMs)
  for (const record of sorted) {
    if (total <= maxBytes) {
      break
    }
    const deleted = await deleteRecord(db, record.key)
    if (deleted) {
      total -= Math.max(record.sizeBytes, 0)
    }
  }
}

async function resolveAttachmentBlob(input: StoreOfflineAttachmentInput): Promise<Blob | null> {
  if (input.blob instanceof Blob) {
    return input.blob
  }
  const payload = input.dataBase64?.trim()
  if (!payload) {
    return null
  }
  return decodeBase64ToBlob(payload, input.mime)
}

async function getRecordBlob(record: OfflineAttachmentRecord): Promise<Blob | null> {
  if (record.blob instanceof Blob) {
    return record.blob
  }
  const payload = record.dataBase64?.trim()
  if (!payload) {
    return null
  }
  return decodeBase64ToBlob(payload, record.mime)
}

function decodeBase64ToBlob(payload: string, mime?: string): Blob | null {
  try {
    const binary = atob(payload)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index)
    }
    return new Blob([bytes], {
      type: mime || 'application/octet-stream',
    })
  } catch {
    return null
  }
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}
