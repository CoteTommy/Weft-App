import { listLxmfMessages } from '../../../lib/lxmf-api'
import type {
  LxmfAttachmentPayload,
  LxmfMessageFields,
  LxmfMessageRecord,
  LxmfPaperPayload,
} from '../../../lib/lxmf-payloads'
import type { FileItem } from '../../../shared/types/files'
import { shortHash } from '../../../shared/utils/identity'

export async function fetchFiles(): Promise<FileItem[]> {
  const response = await listLxmfMessages()
  const files = response.messages.flatMap(extractFilesFromMessage)
  files.sort((a, b) => a.name.localeCompare(b.name))
  return files
}

function extractFilesFromMessage(record: LxmfMessageRecord): FileItem[] {
  const fields = asFields(record.fields)
  if (!fields) {
    return []
  }

  const owner = shortHash(record.source)
  const items: FileItem[] = []

  const attachments = Array.isArray(fields.attachments) ? fields.attachments : []
  for (const attachment of attachments) {
    const parsed = asAttachment(attachment)
    if (!parsed?.name) {
      continue
    }
    items.push({
      id: `${record.id}:${parsed.name}`,
      name: parsed.name,
      kind: kindFromMime(parsed.mime),
      sizeLabel: sizeLabel(parsed.size_bytes),
      owner,
      mime: parsed.mime,
      dataBase64: parsed.inline_base64,
    })
  }
  for (const attachment of parseCanonicalAttachments(fields['5'])) {
    items.push({
      id: `${record.id}:${attachment.name}:${attachment.sizeBytes}`,
      name: attachment.name,
      kind: kindFromMime(attachment.mime),
      sizeLabel: sizeLabel(attachment.sizeBytes),
      owner,
      mime: attachment.mime,
      dataBase64: attachment.dataBase64,
    })
  }

  const paper = asPaper(fields.paper)
  if (paper) {
    items.push({
      id: `${record.id}:paper`,
      name: paper.title ?? paper.uri ?? `Note ${shortHash(record.id, 4)}`,
      kind: 'Note',
      sizeLabel: '—',
      owner,
      paperUri: paper.uri,
      paperTitle: paper.title,
      paperCategory: paper.category,
    })
  }

  return items
}

function asFields(value: LxmfMessageRecord['fields']): LxmfMessageFields | null {
  return value ?? null
}

function asAttachment(value: unknown): LxmfAttachmentPayload | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null
  }
  return value as LxmfAttachmentPayload
}

function asPaper(value: unknown): LxmfPaperPayload | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null
  }
  return value as LxmfPaperPayload
}

function kindFromMime(mime: string | undefined): FileItem['kind'] {
  if (!mime) {
    return 'Document'
  }
  if (mime.startsWith('image/')) {
    return 'Image'
  }
  if (mime.startsWith('audio/')) {
    return 'Audio'
  }
  if (mime.includes('zip') || mime.includes('tar')) {
    return 'Archive'
  }
  return 'Document'
}

function sizeLabel(sizeBytes: number | undefined): string {
  if (!sizeBytes || sizeBytes <= 0) {
    return '—'
  }
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`
  }
  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`
  }
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`
}

function parseCanonicalAttachments(
  value: unknown,
): Array<{ name: string; sizeBytes: number; dataBase64: string; mime?: string }> {
  if (!Array.isArray(value)) {
    return []
  }
  const out: Array<{ name: string; sizeBytes: number; dataBase64: string; mime?: string }> = []
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
