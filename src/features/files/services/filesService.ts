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
