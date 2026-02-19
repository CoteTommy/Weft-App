import { getOrCreateAttachmentPreviewBlob } from '@features/files/services/attachmentPreviewCache'
import type { ChatMessage } from '@shared/types/chat'
import { lxmfGetAttachmentBlob } from '@lib/lxmf-api'

type AttachmentRef = ChatMessage['attachments'][number]

export async function loadAttachmentPreview(
  messageId: string,
  attachment: AttachmentRef
): Promise<{ objectUrl: string; blob: Blob }> {
  let dataBase64 = attachment.dataBase64

  if (!dataBase64) {
    const blob = await lxmfGetAttachmentBlob(messageId, attachment.name)
    dataBase64 = blob.dataBase64
  }

  if (!dataBase64) {
    throw new Error('Attachment payload unavailable.')
  }

  return await getOrCreateAttachmentPreviewBlob({
    key: `chat:${messageId}:${attachment.name}`,
    mime: attachment.mime,
    dataBase64,
  })
}
