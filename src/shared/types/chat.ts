export interface ChatAttachment {
  name: string
  sizeBytes: number
  mime?: string
  dataBase64?: string
}

export interface ChatPaperMeta {
  title?: string
  category?: string
}

export interface ChatMessage {
  id: string
  author: string
  sender: 'self' | 'peer'
  body: string
  attachments: ChatAttachment[]
  paper?: ChatPaperMeta
  sentAt: string
  status?: 'sending' | 'sent' | 'delivered' | 'failed'
  statusDetail?: string
}

export interface ChatThread {
  id: string
  name: string
  destination: string
  preview: string
  unread: number
  lastActivity: string
  messages: ChatMessage[]
}

export interface OutboundAttachmentDraft {
  name: string
  mime?: string
  sizeBytes: number
  dataBase64: string
}

export interface OutboundPaperDraft {
  title?: string
  category?: string
}

export interface OutboundMessageDraft {
  text: string
  attachments?: OutboundAttachmentDraft[]
  paper?: OutboundPaperDraft
}
