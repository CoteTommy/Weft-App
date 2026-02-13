import { parseFileItemsOffThread } from '@features/messages/services/payloadParseWorker'
import type { FileItem } from '@shared/types/files'
import { listLxmfMessages } from '@lib/lxmf-api'

export async function fetchFiles(): Promise<FileItem[]> {
  const response = await listLxmfMessages()
  return await parseFileItemsOffThread(response.messages)
}
