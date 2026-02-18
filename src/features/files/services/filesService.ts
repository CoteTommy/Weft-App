import type { FileItem } from '@shared/types/files'
import { lxmfQueryFiles } from '@lib/lxmf-api'

export async function fetchFiles(): Promise<FileItem[]> {
  const response = await lxmfQueryFiles({}, { limit: 1500 })
  return response.items.map(item => ({
    id: item.id,
    name: item.name,
    kind: normalizeKind(item.kind),
    sizeLabel: item.sizeLabel,
    owner: item.owner,
    mime: item.mime,
    dataBase64: item.dataBase64,
    paperUri: item.paperUri,
    paperTitle: item.paperTitle,
    paperCategory: item.paperCategory,
  }))
}

function normalizeKind(value: string): FileItem['kind'] {
  if (value === 'Image' || value === 'Audio' || value === 'Archive' || value === 'Note') {
    return value
  }
  return 'Document'
}
