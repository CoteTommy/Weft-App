/* eslint-disable react-refresh/only-export-components */
import { createContext, type PropsWithChildren, useContext, useEffect, useRef } from 'react'
import { Outlet } from 'react-router-dom'

import type { OutboundMessageDraft } from '@shared/types/chat'

import { useChatEvents } from '../hooks/useChatEvents'
import { useChatStore } from '../hooks/useChatStore'
import { useOfflineQueue } from '../hooks/useOfflineQueue'
import { type ChatsState, type IncomingNotificationItem } from '../types'

const ChatsContext = createContext<ChatsState | undefined>(undefined)

export function ChatsProvider({ children }: PropsWithChildren) {
  const notifyIncomingRef = useRef<(items: IncomingNotificationItem[]) => Promise<void>>(
    async () => {}
  )
  const sendFailureRef = useRef<(params: SendFailureParams) => void>(() => {})

  const store = useChatStore({
    onIncomingNotifications: items => notifyIncomingRef.current(items),
    onSendFailure: params => sendFailureRef.current(params),
  })
  const events = useChatEvents(store.runtime)
  const queue = useOfflineQueue({ threads: store.threads, refresh: store.refresh })

  useEffect(() => {
    notifyIncomingRef.current = events.notifyIncoming
    sendFailureRef.current = queue.enqueueSendFailure
  }, [events.notifyIncoming, queue.enqueueSendFailure])

  const value: ChatsState = {
    threads: store.threads,
    loading: store.loading,
    error: store.error,
    refresh: store.refresh,
    sendMessage: store.sendMessage,
    offlineQueue: queue.offlineQueue,
    retryQueueNow: queue.retryQueueNow,
    pauseQueue: queue.pauseQueue,
    resumeQueue: queue.resumeQueue,
    removeQueue: queue.removeQueue,
    clearQueue: queue.clearQueue,
    markThreadRead: store.markThreadRead,
    markAllRead: store.markAllRead,
    createThread: store.createThread,
    setThreadPinned: store.setThreadPinned,
    setThreadMuted: store.setThreadMuted,
  }

  return <ChatsContext.Provider value={value}>{children}</ChatsContext.Provider>
}

export function useChatsState(): ChatsState {
  const value = useContext(ChatsContext)
  if (!value) {
    throw new Error('useChatsState must be used within ChatsProvider')
  }
  return value
}

export function ChatsStateLayout() {
  return (
    <ChatsProvider>
      <Outlet />
    </ChatsProvider>
  )
}

type SendFailureParams = {
  threadId: string
  draft: OutboundMessageDraft
  reason: string
  reasonCode?: string
  sourceMessageId?: string
}
