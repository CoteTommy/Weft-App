import type { ChatThread, OutboundMessageDraft, OutboundSendOutcome } from '@shared/types/chat'

import type { OfflineQueueEntry } from '../state/offlineQueue'

export interface ChatsState {
  threads: ChatThread[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  sendMessage: (threadId: string, draft: OutboundMessageDraft) => Promise<OutboundSendOutcome>
  offlineQueue: OfflineQueueEntry[]
  retryQueueNow: (queueId: string) => Promise<void>
  pauseQueue: (queueId: string) => void
  resumeQueue: (queueId: string) => void
  removeQueue: (queueId: string) => void
  clearQueue: () => void
  markThreadRead: (threadId: string) => void
  markAllRead: () => void
  createThread: (destination: string, name?: string) => string | null
  setThreadPinned: (threadId: string, pinned?: boolean) => void
  setThreadMuted: (threadId: string, muted?: boolean) => void
  selectThread: (threadId?: string) => void
  loadMoreThreadMessages: (threadId: string) => Promise<void>
}

export const CHAT_EVENT_BATCH_MS = 80
export const CHAT_REFRESH_DEBOUNCE_MS = 120
export const CHAT_WATCHDOG_INTERVAL_MS = 10_000
export const CHAT_WATCHDOG_STALE_MS = 45_000
export const CHAT_QUEUE_RETRY_INTERVAL_MS = 2_000

export type IncomingNotificationItem = {
  threadId: string
  threadName: string
  latestBody: string
  count: number
}
