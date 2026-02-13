import type { OutboundAttachmentDraft } from '@shared/types/chat'

const DB_NAME = 'weft.chat.offline-attachments.v1'
const DB_VERSION = 1
const STORE_NAME = 'attachments'
const MAX_ATTACHMENT_CACHE_BYTES = 48 * 1024 * 1024

interface OfflineAttachmentRecord {
  key: string
  name: string
  mime?: string
  sizeBytes: number
  dataBase64: string
  updatedAtMs: number
}

export async function storeOfflineAttachment(
  key: string,
  attachment: OutboundAttachmentDraft
): Promise<boolean> {
  const db = await openDb()
  if (!db) {
    return false
  }
  const record: OfflineAttachmentRecord = {
    key,
    name: attachment.name,
    mime: attachment.mime,
    sizeBytes: attachment.sizeBytes,
    dataBase64: attachment.dataBase64,
    updatedAtMs: Date.now(),
  }
  const ok = await putRecord(db, record)
  if (ok) {
    await enforceAttachmentCacheLimit(db, MAX_ATTACHMENT_CACHE_BYTES)
  }
  db.close()
  return ok
}

export async function loadOfflineAttachment(key: string): Promise<OutboundAttachmentDraft | null> {
  const db = await openDb()
  if (!db) {
    return null
  }
  const record = await getRecord(db, key)
  if (!record) {
    db.close()
    return null
  }
  await putRecord(db, {
    ...record,
    updatedAtMs: Date.now(),
  })
  db.close()
  return {
    name: record.name,
    mime: record.mime,
    sizeBytes: record.sizeBytes,
    dataBase64: record.dataBase64,
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
  if (typeof window === 'undefined' || typeof indexedDB === 'undefined') {
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
      resolve(value as OfflineAttachmentRecord)
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
