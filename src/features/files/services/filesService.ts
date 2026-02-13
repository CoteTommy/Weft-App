import { listLxmfMessages } from '@lib/lxmf-api'
import type { FileItem } from '@shared/types/files'
import { parseFileItemsOffThread } from '@features/messages/services/payloadParseWorker'

export async function fetchFiles(): Promise<FileItem[]> {
  const response = await listLxmfMessages()
  return await parseFileItemsOffThread(response.messages)
}
