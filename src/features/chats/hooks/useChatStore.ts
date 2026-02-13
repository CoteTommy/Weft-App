import {
  type Dispatch,
  type SetStateAction,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'

import type { ChatThread, OutboundMessageDraft, OutboundSendOutcome } from '@shared/types/chat'
import { DISPLAY_NAME_UPDATED_EVENT, getStoredDisplayName, shortHash } from '@shared/utils/identity'

import { fetchChatThreads, postChatMessage } from '../services/chatService'
import { deriveReasonCode, deriveReceiptStatus } from '../services/chatThreadBuilders'
import { selectThreadById } from '../state/chatSelectors'
import {
  reduceCreateDraftThread,
  reduceHydratedThreads,
  reduceMarkAllThreadsRead,
  reduceMarkThreadRead,
  reduceRewriteSelfAuthors,
  reduceSetThreadMuted,
  reduceSetThreadPinned,
} from '../state/chatThreadsReducer'
import {
  getStoredThreadPreferences,
  persistThreadPreferences,
  resolveThreadPreference,
} from '../state/threadPreferences'
import { CHAT_REFRESH_DEBOUNCE_MS, type ChatsState, type IncomingNotificationItem } from '../types'

type SendFailureCallback = (params: {
  threadId: string
  draft: OutboundMessageDraft
  reason: string
  reasonCode?: string
  sourceMessageId?: string
}) => void

type IncomingNotificationCallback = (items: IncomingNotificationItem[]) => Promise<void>

export type ChatStoreRuntimeContext = {
  setThreads: Dispatch<SetStateAction<ChatThread[]>>
  applyThreadMetadata: (thread: ChatThread) => ChatThread
  knownMessageIdsRef: RefObject<Map<string, Set<string>>>
  unreadCountsRef: RefObject<Map<string, number>>
  draftThreadsRef: RefObject<Map<string, ChatThread>>
  threadPreferencesRef: RefObject<Map<string, { pinned: boolean; muted: boolean }>>
  hasLoadedRef: RefObject<boolean>
  lastRefreshAtRef: RefObject<number>
  scheduleRefresh: () => void
  getLastRefreshAt: () => number
}

type UseChatStoreResult = Omit<
  ChatsState,
  'offlineQueue' | 'retryQueueNow' | 'pauseQueue' | 'resumeQueue' | 'removeQueue' | 'clearQueue'
> & {
  runtime: ChatStoreRuntimeContext
}

export type UseChatStoreParams = {
  onIncomingNotifications: IncomingNotificationCallback
  onSendFailure: SendFailureCallback
}

export function useChatStore({
  onIncomingNotifications,
  onSendFailure,
}: UseChatStoreParams): UseChatStoreResult {
  const [threads, setThreads] = useState<ChatThread[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const knownMessageIdsRef = useRef<Map<string, Set<string>>>(new Map())
  const unreadCountsRef = useRef<Map<string, number>>(new Map())
  const draftThreadsRef = useRef<Map<string, ChatThread>>(new Map())
  const hasLoadedRef = useRef(false)
  const refreshingRef = useRef(false)
  const lastRefreshAtRef = useRef(0)
  const refreshTimerRef = useRef<number | null>(null)
  const threadPreferencesRef = useRef(getStoredThreadPreferences())

  const applyThreadMetadata = useCallback((thread: ChatThread): ChatThread => {
    const preference = resolveThreadPreference(threadPreferencesRef.current, thread.id)
    if (thread.pinned === preference.pinned && thread.muted === preference.muted) {
      return thread
    }
    return {
      ...thread,
      pinned: preference.pinned,
      muted: preference.muted,
    }
  }, [])

  const rewriteSelfAuthors = useCallback((nextAuthor: string) => {
    const normalizedAuthor = nextAuthor.trim() || 'You'
    setThreads(previous => reduceRewriteSelfAuthors(previous, normalizedAuthor))
  }, [])

  const refresh = useCallback(async () => {
    if (refreshingRef.current) {
      return
    }
    refreshingRef.current = true
    lastRefreshAtRef.current = Date.now()
    try {
      setError(null)
      const loaded = await fetchChatThreads()
      const pendingNotifications: IncomingNotificationItem[] = []
      const activeIds = new Set([
        ...loaded.map(thread => thread.id),
        ...draftThreadsRef.current.keys(),
      ])

      for (const knownId of knownMessageIdsRef.current.keys()) {
        if (!activeIds.has(knownId)) {
          knownMessageIdsRef.current.delete(knownId)
          unreadCountsRef.current.delete(knownId)
        }
      }

      for (const thread of loaded) {
        const knownIds = knownMessageIdsRef.current.get(thread.id)
        if (!knownIds) {
          const seeded = new Set(thread.messages.map(message => message.id))
          knownMessageIdsRef.current.set(thread.id, seeded)
          if (!hasLoadedRef.current) {
            unreadCountsRef.current.set(thread.id, 0)
          } else {
            const incoming = thread.messages.filter(message => message.sender === 'peer').length
            unreadCountsRef.current.set(thread.id, incoming)
          }
          continue
        }

        let incomingCount = 0
        let latestIncoming = ''
        for (const message of thread.messages) {
          if (knownIds.has(message.id)) {
            continue
          }
          knownIds.add(message.id)
          if (message.sender === 'peer') {
            incomingCount += 1
            latestIncoming = message.body
          }
        }

        if (incomingCount > 0) {
          unreadCountsRef.current.set(
            thread.id,
            (unreadCountsRef.current.get(thread.id) ?? 0) + incomingCount
          )
          const preference = resolveThreadPreference(threadPreferencesRef.current, thread.id)
          if (hasLoadedRef.current && !preference.muted) {
            pendingNotifications.push({
              threadId: thread.id,
              threadName: thread.name,
              latestBody: latestIncoming,
              count: incomingCount,
            })
          }
        } else if (!unreadCountsRef.current.has(thread.id)) {
          unreadCountsRef.current.set(thread.id, 0)
        }
      }

      hasLoadedRef.current = true
      const hydratedThreads = loaded
        .map(thread => ({
          ...thread,
          unread: unreadCountsRef.current.get(thread.id) ?? 0,
        }))
        .map(applyThreadMetadata)

      for (const thread of hydratedThreads) {
        draftThreadsRef.current.delete(thread.id)
      }
      const draftThreads = [...draftThreadsRef.current.values()].map(applyThreadMetadata)
      setThreads(reduceHydratedThreads(hydratedThreads, draftThreads))

      if (pendingNotifications.length > 0) {
        void onIncomingNotifications(pendingNotifications)
      }
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : String(refreshError))
    } finally {
      setLoading(false)
      refreshingRef.current = false
    }
  }, [applyThreadMetadata, onIncomingNotifications])

  const scheduleRefresh = useCallback(
    (delayMs = CHAT_REFRESH_DEBOUNCE_MS) => {
      if (refreshTimerRef.current !== null) {
        return
      }
      refreshTimerRef.current = window.setTimeout(() => {
        refreshTimerRef.current = null
        void refresh()
      }, delayMs)
    },
    [refresh]
  )

  const markThreadRead = useCallback((threadId: string) => {
    const id = threadId.trim()
    if (!id) {
      return
    }
    if ((unreadCountsRef.current.get(id) ?? 0) === 0) {
      return
    }
    unreadCountsRef.current.set(id, 0)
    setThreads(previous => reduceMarkThreadRead(previous, id))
  }, [])

  const markAllRead = useCallback(() => {
    let hasUnread = false
    for (const [threadId, unread] of unreadCountsRef.current.entries()) {
      if (unread > 0) {
        hasUnread = true
        unreadCountsRef.current.set(threadId, 0)
      }
    }
    if (!hasUnread) {
      return
    }
    setThreads(previous => reduceMarkAllThreadsRead(previous))
  }, [])

  const sendMessage = useCallback(
    async (threadId: string, draft: OutboundMessageDraft): Promise<OutboundSendOutcome> => {
      try {
        setError(null)
        const outcome = await postChatMessage(threadId, draft)
        if (isFailedOutboundOutcome(outcome)) {
          const message = outcome.backendStatus?.trim() || 'failed: backend rejected send'
          setError(message)
          onSendFailure({
            threadId,
            draft,
            reason: message,
            reasonCode: deriveReasonCode(message),
            ...(outcome.messageId ? { sourceMessageId: outcome.messageId } : {}),
          })
          return {}
        }
        await refresh()
        return outcome
      } catch (sendError) {
        const message = sendError instanceof Error ? sendError.message : String(sendError)
        setError(message)
        onSendFailure({
          threadId,
          draft,
          reason: message,
          reasonCode: deriveReasonCode(message),
        })
        return {}
      }
    },
    [onSendFailure, refresh]
  )

  const createThread = useCallback(
    (destination: string, name?: string): string | null => {
      const threadId = destination.trim()
      if (!threadId) {
        setError('Destination is required')
        return null
      }

      setError(null)
      const existing = selectThreadById(threads, threadId)
      if (existing) {
        return existing.id
      }
      if (draftThreadsRef.current.has(threadId)) {
        return threadId
      }

      const draft: ChatThread = {
        id: threadId,
        name: name?.trim() || shortHash(threadId),
        destination: shortHash(threadId, 8),
        preview: 'No messages yet',
        unread: 0,
        pinned: false,
        muted: false,
        lastActivity: 'new',
        messages: [],
      }
      draftThreadsRef.current.set(threadId, draft)
      knownMessageIdsRef.current.set(threadId, new Set())
      unreadCountsRef.current.set(threadId, 0)
      setThreads(previous => reduceCreateDraftThread(previous, applyThreadMetadata(draft)))
      return threadId
    },
    [applyThreadMetadata, threads]
  )

  const setThreadPinned = useCallback((threadId: string, pinned?: boolean) => {
    const id = threadId.trim()
    if (!id) {
      return
    }
    const current = resolveThreadPreference(threadPreferencesRef.current, id)
    const nextPinned = typeof pinned === 'boolean' ? pinned : !current.pinned
    if (nextPinned === current.pinned) {
      return
    }
    const next = {
      ...current,
      pinned: nextPinned,
    }
    if (!next.pinned && !next.muted) {
      threadPreferencesRef.current.delete(id)
    } else {
      threadPreferencesRef.current.set(id, next)
    }
    persistThreadPreferences(threadPreferencesRef.current)
    setThreads(previous => reduceSetThreadPinned(previous, id, nextPinned))
  }, [])

  const setThreadMuted = useCallback((threadId: string, muted?: boolean) => {
    const id = threadId.trim()
    if (!id) {
      return
    }
    const current = resolveThreadPreference(threadPreferencesRef.current, id)
    const nextMuted = typeof muted === 'boolean' ? muted : !current.muted
    if (nextMuted === current.muted) {
      return
    }
    const next = {
      ...current,
      muted: nextMuted,
    }
    if (!next.pinned && !next.muted) {
      threadPreferencesRef.current.delete(id)
    } else {
      threadPreferencesRef.current.set(id, next)
    }
    persistThreadPreferences(threadPreferencesRef.current)
    setThreads(previous => reduceSetThreadMuted(previous, id, nextMuted))
  }, [])

  useEffect(() => {
    if (refreshingRef.current) {
      return
    }
    void refresh()
  }, [refresh])

  useEffect(() => {
    const handleDisplayNameUpdate = () => {
      rewriteSelfAuthors(getStoredDisplayName() ?? 'You')
    }
    window.addEventListener(DISPLAY_NAME_UPDATED_EVENT, handleDisplayNameUpdate)
    return () => {
      window.removeEventListener(DISPLAY_NAME_UPDATED_EVENT, handleDisplayNameUpdate)
    }
  }, [rewriteSelfAuthors])

  useEffect(() => {
    return () => {
      if (refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current)
        refreshTimerRef.current = null
      }
    }
  }, [])

  return {
    threads,
    loading,
    error,
    refresh,
    sendMessage,
    markThreadRead,
    markAllRead,
    createThread,
    setThreadPinned,
    setThreadMuted,
    runtime: {
      setThreads,
      applyThreadMetadata,
      knownMessageIdsRef,
      unreadCountsRef,
      draftThreadsRef,
      threadPreferencesRef,
      hasLoadedRef,
      lastRefreshAtRef,
      scheduleRefresh,
      getLastRefreshAt: () => lastRefreshAtRef.current,
    },
  }
}

function isFailedOutboundOutcome(message: OutboundSendOutcome): boolean {
  return deriveReceiptStatus('out', message.backendStatus ?? null) === 'failed'
}
