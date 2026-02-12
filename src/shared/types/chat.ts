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
  kind?: 'message' | 'reaction' | 'location' | 'command'
  replyToId?: string
  reaction?: {
    to: string
    emoji: string
    sender?: string
  }
  location?: {
    lat: number
    lon: number
  }
  attachments: ChatAttachment[]
  paper?: ChatPaperMeta
  sentAt: string
  status?: 'sending' | 'sent' | 'delivered' | 'failed'
  statusDetail?: string
  deliveryTrace?: Array<{
    status: string
    timestamp: number
  }>
}

export interface ChatThread {
  id: string
  name: string
  destination: string
  preview: string
  unread: number
  pinned: boolean
  muted: boolean
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

export interface OutboundSendOutcome {
  paperUri?: string
  backendStatus?: string
}
