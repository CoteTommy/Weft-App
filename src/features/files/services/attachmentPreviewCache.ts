const MAX_ENTRIES = 3
const MAX_TOTAL_BYTES = 20 * 1024 * 1024

export type AttachmentPreviewEntry = {
  key: string
  blob: Blob
  objectUrl: string
  sizeBytes: number
  lastAccessedAt: number
}

const byKey = new Map<string, AttachmentPreviewEntry>()
let totalBytes = 0

export async function getOrCreateAttachmentPreviewBlob(input: {
  key: string
  mime?: string | null
  dataBase64: string
}): Promise<AttachmentPreviewEntry> {
  const key = input.key.trim()
  if (!key) {
    throw new Error('Attachment preview key is required.')
  }

  const existing = byKey.get(key)
  if (existing) {
    existing.lastAccessedAt = Date.now()
    return existing
  }

  const blob = decodeBase64Blob(input.dataBase64, input.mime ?? 'application/octet-stream')
  if (!blob) {
    throw new Error('Attachment payload could not be decoded.')
  }

  const entry: AttachmentPreviewEntry = {
    key,
    blob,
    objectUrl: URL.createObjectURL(blob),
    sizeBytes: blob.size,
    lastAccessedAt: Date.now(),
  }

  byKey.set(key, entry)
  totalBytes += entry.sizeBytes
  enforceCacheLimits()
  return entry
}

export function clearAttachmentPreviewCache(): void {
  for (const entry of byKey.values()) {
    URL.revokeObjectURL(entry.objectUrl)
  }
  byKey.clear()
  totalBytes = 0
}

export function getAttachmentPreviewCacheStats(): { count: number; totalBytes: number } {
  return {
    count: byKey.size,
    totalBytes,
  }
}

function enforceCacheLimits(): void {
  if (byKey.size <= MAX_ENTRIES && totalBytes <= MAX_TOTAL_BYTES) {
    return
  }
  const sorted = [...byKey.values()].sort(
    (left, right) => left.lastAccessedAt - right.lastAccessedAt
  )
  for (const entry of sorted) {
    if (byKey.size <= MAX_ENTRIES && totalBytes <= MAX_TOTAL_BYTES) {
      break
    }
    byKey.delete(entry.key)
    totalBytes = Math.max(0, totalBytes - entry.sizeBytes)
    URL.revokeObjectURL(entry.objectUrl)
  }
}

function decodeBase64Blob(dataBase64: string, mime: string): Blob | null {
  try {
    const binary = atob(dataBase64)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index)
    }
    return new Blob([bytes], { type: mime || 'application/octet-stream' })
  } catch {
    return null
  }
}
