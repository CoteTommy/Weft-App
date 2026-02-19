export type ThreadPage<TThread> = {
  items: TThread[]
  nextCursor: string | null
}

export type MessagePage<TMessage> = {
  items: TMessage[]
  nextCursor: string | null
}

export type FilePage<TFile> = {
  items: TFile[]
  nextCursor: string | null
}

export type AttachmentHandle = {
  handleId: string
  path: string
  mime: string | null
  sizeBytes: number
  expiresAtMs: number
}

export type RuntimeMetricsSnapshot = {
  rssBytes: number | null
  dbSizeBytes: number
  queueSize: number
  messageCount: number
  threadCount: number
  eventPumpIntervalMs: number | null
  attachmentHandleCount: number
  indexLastSyncMs: number | null
}
