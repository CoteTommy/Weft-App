export interface ChatMessage {
  id: string
  author: string
  sender: 'self' | 'peer'
  body: string
  sentAt: string
  status?: 'sending' | 'sent' | 'delivered' | 'failed'
}

export interface ChatThread {
  id: string
  name: string
  preview: string
  unread: number
  lastActivity: string
  messages: ChatMessage[]
}
