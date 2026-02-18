/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from 'react'
import { Outlet } from 'react-router-dom'

import type { ChatThread, OutboundMessageDraft, OutboundSendOutcome } from '@shared/types/chat'

import { useChatEvents } from '../hooks/useChatEvents'
import { useChatStore } from '../hooks/useChatStore'
import { useOfflineQueue } from '../hooks/useOfflineQueue'
import { type ChatsState, type IncomingNotificationItem } from '../types'
import type { OfflineQueueEntry } from './offlineQueue'

interface ChatsSnapshot {
  threads: ChatThread[]
  loading: boolean
  error: string | null
  offlineQueue: OfflineQueueEntry[]
}

interface ChatsActions {
  refresh: () => Promise<void>
  sendMessage: (threadId: string, draft: OutboundMessageDraft) => Promise<OutboundSendOutcome>
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
}

interface ChatsStoreContextValue {
  subscribe: (listener: () => void) => () => void
  getSnapshot: () => ChatsSnapshot
  actions: ChatsActions
}

const ChatsStoreContext = createContext<ChatsStoreContextValue | undefined>(undefined)

const EMPTY_SNAPSHOT: ChatsSnapshot = {
  threads: [],
  loading: true,
  error: null,
  offlineQueue: [],
}

export function ChatsProvider({ children }: PropsWithChildren) {
  const notifyIncomingRef = useRef<(items: IncomingNotificationItem[]) => Promise<void>>(
    async () => {}
  )
  const sendFailureRef = useRef<(params: SendFailureParams) => void>(() => {})
  const subscribersRef = useRef<Set<() => void>>(new Set())
  const snapshotRef = useRef<ChatsSnapshot>(EMPTY_SNAPSHOT)

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

  const snapshot = useMemo<ChatsSnapshot>(
    () => ({
      threads: store.threads,
      loading: store.loading,
      error: store.error,
      offlineQueue: queue.offlineQueue,
    }),
    [queue.offlineQueue, store.error, store.loading, store.threads]
  )

  useEffect(() => {
    snapshotRef.current = snapshot
    for (const listener of subscribersRef.current) {
      listener()
    }
  }, [snapshot])

  const actions = useMemo<ChatsActions>(
    () => ({
      refresh: store.refresh,
      sendMessage: store.sendMessage,
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
    }),
    [
      queue.clearQueue,
      queue.pauseQueue,
      queue.removeQueue,
      queue.resumeQueue,
      queue.retryQueueNow,
      store.createThread,
      store.markAllRead,
      store.markThreadRead,
      store.refresh,
      store.sendMessage,
      store.setThreadMuted,
      store.setThreadPinned,
    ]
  )

  const value = useMemo<ChatsStoreContextValue>(
    () => ({
      subscribe: listener => {
        subscribersRef.current.add(listener)
        return () => {
          subscribersRef.current.delete(listener)
        }
      },
      getSnapshot: () => snapshotRef.current,
      actions,
    }),
    [actions]
  )

  return <ChatsStoreContext.Provider value={value}>{children}</ChatsStoreContext.Provider>
}

function useChatsStore(): ChatsStoreContextValue {
  const value = useContext(ChatsStoreContext)
  if (!value) {
    throw new Error('Chat state hooks must be used within ChatsProvider')
  }
  return value
}

function useChatsSelector<T>(selector: (snapshot: ChatsSnapshot) => T): T {
  const store = useChatsStore()
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.getSnapshot()),
    () => selector(store.getSnapshot())
  )
}

export function useChatThreads(): ChatThread[] {
  return useChatsSelector(snapshot => snapshot.threads)
}

export function useChatThread(threadId: string | undefined): ChatThread | undefined {
  return useChatsSelector(snapshot => {
    if (!threadId) {
      return undefined
    }
    return snapshot.threads.find(thread => thread.id === threadId)
  })
}

export function useOfflineQueueState(): OfflineQueueEntry[] {
  return useChatsSelector(snapshot => snapshot.offlineQueue)
}

export function useChatActions(): ChatsActions {
  return useChatsStore().actions
}

export function useChatsState(): ChatsState {
  const snapshot = useChatsSelector(state => state)
  const actions = useChatActions()
  return {
    threads: snapshot.threads,
    loading: snapshot.loading,
    error: snapshot.error,
    refresh: actions.refresh,
    sendMessage: actions.sendMessage,
    offlineQueue: snapshot.offlineQueue,
    retryQueueNow: actions.retryQueueNow,
    pauseQueue: actions.pauseQueue,
    resumeQueue: actions.resumeQueue,
    removeQueue: actions.removeQueue,
    clearQueue: actions.clearQueue,
    markThreadRead: actions.markThreadRead,
    markAllRead: actions.markAllRead,
    createThread: actions.createThread,
    setThreadPinned: actions.setThreadPinned,
    setThreadMuted: actions.setThreadMuted,
  }
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
