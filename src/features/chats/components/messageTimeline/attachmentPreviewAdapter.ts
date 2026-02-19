import { getOrCreateAttachmentPreviewBlob } from '@features/files/services/attachmentPreviewCache'
import type { ChatMessage } from '@shared/types/chat'
import { closeAttachmentHandle, lxmfGetAttachmentBlob, openAttachmentHandle } from '@lib/lxmf-api'
import { toTauriFileUrl } from '@lib/tauri-runtime'

type AttachmentRef = ChatMessage['attachments'][number]

export async function loadAttachmentPreview(
  messageId: string,
  attachment: AttachmentRef
): Promise<{ objectUrl: string; blob: Blob }> {
  const attachmentId = attachment.id?.trim()
  if (attachmentId) {
    try {
      const handle = await openAttachmentHandle(attachmentId, 'preview')
      const objectUrl = toAttachmentHandleUrl(handle.path)
      window.setTimeout(() => {
        void closeAttachmentHandle(handle.handleId)
      }, 30_000)
      return {
        objectUrl,
        blob: new Blob([], { type: attachment.mime ?? handle.mime ?? 'application/octet-stream' }),
      }
    } catch {
      // Fallback to legacy base64 attachment fetch.
    }
  }

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

function toAttachmentHandleUrl(path: string): string {
  return toTauriFileUrl(path)
}
