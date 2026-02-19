import type { FileItem } from '@shared/types/files'
import {
  closeAttachmentHandle,
  getAttachmentBytes,
  openAttachmentHandle,
  queryFilesPage,
} from '@lib/lxmf-api'
import { toTauriFileUrl } from '@lib/tauri-runtime'

export async function fetchFiles(): Promise<FileItem[]> {
  const items: FileItem[] = []
  let cursor: string | undefined
  let pages = 0

  while (pages < MAX_PAGES) {
    const response = await queryFilesPage(
      {},
      {
        limit: PAGE_SIZE,
        cursor,
        includeBytes: false,
      }
    )
    items.push(
      ...response.items.map(item => ({
        id: item.id,
        name: item.name,
        kind: normalizeKind(item.kind),
        sizeLabel: item.sizeLabel,
        sizeBytes: item.sizeBytes,
        createdAtMs: item.createdAtMs,
        owner: item.owner,
        mime: item.mime,
        hasInlineData: item.hasInlineData,
        dataBase64: undefined,
        paperUri: item.paperUri,
        paperTitle: item.paperTitle,
        paperCategory: item.paperCategory,
      }))
    )
    cursor = response.nextCursor ?? undefined
    pages += 1
    if (!cursor) {
      break
    }
  }

  return items
}

export async function fetchFileAttachmentBytes(file: FileItem): Promise<{
  mime: string | null
  sizeBytes: number
  dataBase64: string
}> {
  if (file.kind === 'Note') {
    throw new Error('Notes do not have attachment bytes.')
  }
  if (!/^\d+$/.test(file.id)) {
    throw new Error('Attachment bytes unavailable for this file item.')
  }
  const result = await getAttachmentBytes(file.id)
  return {
    mime: result.mime,
    sizeBytes: result.sizeBytes,
    dataBase64: result.dataBase64,
  }
}

export async function openFileAttachmentHandle(
  file: FileItem,
  disposition: 'preview' | 'download' = 'download'
): Promise<{
  handleId: string
  url: string
  mime: string | null
  sizeBytes: number
  expiresAtMs: number
  close: () => Promise<void>
}> {
  if (file.kind === 'Note') {
    throw new Error('Notes do not have attachment bytes.')
  }
  if (!/^\d+$/.test(file.id)) {
    throw new Error('Attachment handle unavailable for this file item.')
  }
  const handle = await openAttachmentHandle(file.id, disposition)
  return {
    handleId: handle.handleId,
    url: toAttachmentHandleUrl(handle.path),
    mime: handle.mime,
    sizeBytes: handle.sizeBytes,
    expiresAtMs: handle.expiresAtMs,
    close: async () => {
      await closeAttachmentHandle(handle.handleId).catch(() => ({ closed: false }))
    },
  }
}

function normalizeKind(value: string): FileItem['kind'] {
  if (value === 'Image' || value === 'Audio' || value === 'Archive' || value === 'Note') {
    return value
  }
  return 'Document'
}

const PAGE_SIZE = 250
const MAX_PAGES = 8

function toAttachmentHandleUrl(path: string): string {
  return toTauriFileUrl(path)
}
