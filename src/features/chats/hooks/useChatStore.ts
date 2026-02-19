import { type RefObject, useCallback, useEffect, useRef, useState } from 'react'

import { getDataLoadingProfile } from '@shared/runtime/preferences'
import type {
  ChatMessage,
  ChatThread,
  OutboundMessageDraft,
  OutboundSendOutcome,
} from '@shared/types/chat'
import { DISPLAY_NAME_UPDATED_EVENT, getStoredDisplayName, shortHash } from '@shared/utils/identity'

import {
  fetchMessagesPage,
  fetchThreadPage,
  postChatMessage,
  type ThreadSummary,
} from '../services/chatService'
import { deriveReasonCode, deriveReceiptStatus } from '../services/chatThreadBuilders'
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
  THREAD_PREFERENCES_UPDATED_EVENT,
} from '../state/threadPreferences'
import { CHAT_REFRESH_DEBOUNCE_MS, type ChatsState } from '../types'

type SendFailureCallback = (params: {
  threadId: string
  draft: OutboundMessageDraft
  reason: string
  reasonCode?: string
  sourceMessageId?: string
}) => void

type ThreadMessageCache = {
  messages: ChatMessage[]
  nextCursor: string | null
  loadedAtMs: number
}

export type ChatStoreRuntimeContext = {
  threadPreferencesRef: RefObject<Map<string, { pinned: boolean; muted: boolean }>>
  hasLoadedRef: RefObject<boolean>
  lastRefreshAtRef: RefObject<number>
  scheduleRefresh: () => void
  getLastRefreshAt: () => number
  enabled: boolean
}

type UseChatStoreResult = Omit<
  ChatsState,
  'offlineQueue' | 'retryQueueNow' | 'pauseQueue' | 'resumeQueue' | 'removeQueue' | 'clearQueue'
> & {
  selectThread: (threadId?: string) => void
  loadMoreThreadMessages: (threadId: string) => Promise<void>
  loadMoreThreads: () => Promise<void>
  canLoadMoreThreadMessages: (threadId: string) => boolean
  canLoadMoreThreads: () => boolean
  runtime: ChatStoreRuntimeContext
}

export type UseChatStoreParams = {
  onSendFailure: SendFailureCallback
  runtimeEnabled?: boolean
}

export function useChatStore({
  onSendFailure,
  runtimeEnabled = true,
}: UseChatStoreParams): UseChatStoreResult {
  const [threads, setThreads] = useState<ChatThread[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const hasLoadedRef = useRef(false)
  const refreshingRef = useRef(false)
  const lastRefreshAtRef = useRef(0)
  const refreshTimerRef = useRef<number | null>(null)
  const threadPreferencesRef = useRef(getStoredThreadPreferences())
  const draftThreadsRef = useRef<Map<string, ChatThread>>(new Map())
  const threadSummariesRef = useRef<ThreadSummary[]>([])
  const threadCursorRef = useRef<string | null>(null)
  const unreadOverridesRef = useRef<Map<string, number>>(new Map())
  const activeThreadIdRef = useRef<string | null>(null)
  const messageCacheRef = useRef<Map<string, ThreadMessageCache>>(new Map())
  const messageCacheOrderRef = useRef<string[]>([])
  const inFlightMessageFetchRef = useRef<Set<string>>(new Set())

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

  const enforceMessageCacheLimit = useCallback(() => {
    while (messageCacheOrderRef.current.length > MAX_CACHED_THREAD_MESSAGE_SETS) {
      const candidate = messageCacheOrderRef.current[0]
      if (!candidate) {
        break
      }
      if (candidate === activeThreadIdRef.current && messageCacheOrderRef.current.length > 1) {
        messageCacheOrderRef.current.shift()
        messageCacheOrderRef.current.push(candidate)
        continue
      }
      messageCacheOrderRef.current.shift()
      messageCacheRef.current.delete(candidate)
      setThreads(previous =>
        previous.map(thread => (thread.id === candidate ? { ...thread, messages: [] } : thread))
      )
    }

    let totalMessages = countCachedMessages(messageCacheRef.current)
    while (totalMessages > MAX_CACHED_MESSAGES) {
      const candidate = messageCacheOrderRef.current[0]
      if (!candidate) {
        break
      }
      if (candidate === activeThreadIdRef.current) {
        if (messageCacheOrderRef.current.length <= 1) {
          break
        }
        messageCacheOrderRef.current.shift()
        messageCacheOrderRef.current.push(candidate)
        continue
      }
      messageCacheOrderRef.current.shift()
      messageCacheRef.current.delete(candidate)
      totalMessages = countCachedMessages(messageCacheRef.current)
      setThreads(previous =>
        previous.map(thread => (thread.id === candidate ? { ...thread, messages: [] } : thread))
      )
    }
  }, [])

  const touchMessageCache = useCallback(
    (threadId: string) => {
      const normalized = threadId.trim()
      if (!normalized) {
        return
      }
      messageCacheOrderRef.current = [
        ...messageCacheOrderRef.current.filter(value => value !== normalized),
        normalized,
      ]
      enforceMessageCacheLimit()
    },
    [enforceMessageCacheLimit]
  )

  const rewriteSelfAuthors = useCallback((nextAuthor: string) => {
    const normalizedAuthor = nextAuthor.trim() || 'You'
    setThreads(previous => reduceRewriteSelfAuthors(previous, normalizedAuthor))
    const nextCache = new Map<string, ThreadMessageCache>()
    for (const [threadId, cache] of messageCacheRef.current.entries()) {
      nextCache.set(threadId, {
        ...cache,
        messages: cache.messages.map(message =>
          message.sender === 'self' && message.author !== normalizedAuthor
            ? { ...message, author: normalizedAuthor }
            : message
        ),
      })
    }
    messageCacheRef.current = nextCache
  }, [])

  const upsertThreadMessages = useCallback(
    (threadId: string, cache: ThreadMessageCache) => {
      messageCacheRef.current.set(threadId, cache)
      touchMessageCache(threadId)
      setThreads(previous =>
        previous.map(thread =>
          thread.id === threadId ? { ...thread, messages: cache.messages } : thread
        )
      )
    },
    [touchMessageCache]
  )

  const loadInitialThreadMessages = useCallback(
    async (threadId: string) => {
      const normalized = threadId.trim()
      if (!normalized) {
        return
      }
      const lockKey = `${normalized}:head`
      if (inFlightMessageFetchRef.current.has(lockKey)) {
        return
      }
      inFlightMessageFetchRef.current.add(lockKey)
      try {
        const page = await fetchMessagesPage({
          threadId: normalized,
          limit: getDataLoadingProfile().messagePageSize,
        })
        upsertThreadMessages(normalized, {
          messages: dedupeMessages(page.items),
          nextCursor: page.nextCursor,
          loadedAtMs: Date.now(),
        })
      } finally {
        inFlightMessageFetchRef.current.delete(lockKey)
      }
    },
    [upsertThreadMessages]
  )

  const loadMoreThreadMessages = useCallback(
    async (threadId: string) => {
      const normalized = threadId.trim()
      if (!normalized) {
        return
      }
      const cache = messageCacheRef.current.get(normalized)
      if (!cache?.nextCursor) {
        return
      }
      const lockKey = `${normalized}:tail`
      if (inFlightMessageFetchRef.current.has(lockKey)) {
        return
      }
      inFlightMessageFetchRef.current.add(lockKey)
      try {
        const page = await fetchMessagesPage({
          threadId: normalized,
          limit: getDataLoadingProfile().messagePageSize,
          cursor: cache.nextCursor,
        })
        upsertThreadMessages(normalized, {
          messages: dedupeMessages([...page.items, ...cache.messages]),
          nextCursor: page.nextCursor,
          loadedAtMs: Date.now(),
        })
      } finally {
        inFlightMessageFetchRef.current.delete(lockKey)
      }
    },
    [upsertThreadMessages]
  )

  const hydrateThreads = useCallback(
    (summaries: ThreadSummary[]) => {
      const summaryIds = new Set(summaries.map(summary => summary.id))

      for (const threadId of unreadOverridesRef.current.keys()) {
        if (!summaryIds.has(threadId) && !draftThreadsRef.current.has(threadId)) {
          unreadOverridesRef.current.delete(threadId)
        }
      }

      const hydrated = summaries.map(summary => {
        const cachedMessages = messageCacheRef.current.get(summary.id)?.messages ?? []
        const unread = unreadOverridesRef.current.get(summary.id) ?? summary.unread
        return applyThreadMetadata({
          ...summary,
          unread,
          messages: cachedMessages,
        })
      })

      for (const thread of hydrated) {
        draftThreadsRef.current.delete(thread.id)
      }
      const draftThreads = [...draftThreadsRef.current.values()].map(applyThreadMetadata)
      setThreads(reduceHydratedThreads(hydrated, draftThreads))
    },
    [applyThreadMetadata]
  )

  const refresh = useCallback(async () => {
    if (refreshingRef.current) {
      return
    }
    refreshingRef.current = true
    lastRefreshAtRef.current = Date.now()
    try {
      setError(null)
      const page = await fetchThreadPage({
        limit: getDataLoadingProfile().threadPageSize,
      })
      threadSummariesRef.current = dedupeThreadSummaries(page.items)
      threadCursorRef.current = page.nextCursor

      hasLoadedRef.current = true
      hydrateThreads(threadSummariesRef.current)

      const activeThreadId = activeThreadIdRef.current
      if (
        activeThreadId &&
        threadSummariesRef.current.some(summary => summary.id === activeThreadId)
      ) {
        const cache = messageCacheRef.current.get(activeThreadId)
        if (!cache) {
          await loadInitialThreadMessages(activeThreadId)
        }
      }
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : String(refreshError))
    } finally {
      setLoading(false)
      refreshingRef.current = false
    }
  }, [hydrateThreads, loadInitialThreadMessages])

  const loadMoreThreads = useCallback(async () => {
    const cursor = threadCursorRef.current
    if (!cursor) {
      return
    }
    const page = await fetchThreadPage({
      cursor,
      limit: getDataLoadingProfile().threadPageSize,
    })
    threadSummariesRef.current = dedupeThreadSummaries([
      ...threadSummariesRef.current,
      ...page.items,
    ])
    threadCursorRef.current = page.nextCursor
    hydrateThreads(threadSummariesRef.current)
  }, [hydrateThreads])

  const canLoadMoreThreads = useCallback(() => {
    return Boolean(threadCursorRef.current)
  }, [])

  const canLoadMoreThreadMessages = useCallback((threadId: string) => {
    const normalized = threadId.trim()
    if (!normalized) {
      return false
    }
    return Boolean(messageCacheRef.current.get(normalized)?.nextCursor)
  }, [])

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

  const selectThread = useCallback(
    (threadId?: string) => {
      const normalized = threadId?.trim() || ''
      activeThreadIdRef.current = normalized || null
      if (!normalized) {
        enforceMessageCacheLimit()
        return
      }
      const cached = messageCacheRef.current.get(normalized)
      if (!cached) {
        void loadInitialThreadMessages(normalized)
      } else {
        touchMessageCache(normalized)
      }
    },
    [enforceMessageCacheLimit, loadInitialThreadMessages, touchMessageCache]
  )

  const markThreadRead = useCallback((threadId: string) => {
    const id = threadId.trim()
    if (!id) {
      return
    }
    unreadOverridesRef.current.set(id, 0)
    setThreads(previous => reduceMarkThreadRead(previous, id))
  }, [])

  const markAllRead = useCallback(() => {
    setThreads(previous => {
      for (const thread of previous) {
        unreadOverridesRef.current.set(thread.id, 0)
      }
      return reduceMarkAllThreadsRead(previous)
    })
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
        if ((activeThreadIdRef.current ?? '') === threadId.trim()) {
          await loadInitialThreadMessages(threadId)
        }
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
    [loadInitialThreadMessages, onSendFailure, refresh]
  )

  const createThread = useCallback(
    (destination: string, name?: string): string | null => {
      const threadId = destination.trim()
      if (!threadId) {
        setError('Destination is required')
        return null
      }

      setError(null)
      if (threads.some(thread => thread.id === threadId) || draftThreadsRef.current.has(threadId)) {
        return threadId
      }

      const cachedMessages = messageCacheRef.current.get(threadId)?.messages ?? []
      const draft: ChatThread = {
        id: threadId,
        name: name?.trim() || shortHash(threadId),
        destination: shortHash(threadId, 8),
        preview: 'No messages yet',
        unread: 0,
        pinned: false,
        muted: false,
        lastActivity: 'new',
        lastActivityAtMs: Date.now(),
        messages: cachedMessages,
      }
      draftThreadsRef.current.set(threadId, draft)
      unreadOverridesRef.current.set(threadId, 0)
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
    if (!runtimeEnabled) {
      hasLoadedRef.current = false
      activeThreadIdRef.current = null
      messageCacheRef.current.clear()
      messageCacheOrderRef.current = []
      inFlightMessageFetchRef.current.clear()
      draftThreadsRef.current.clear()
      threadSummariesRef.current = []
      threadCursorRef.current = null
      unreadOverridesRef.current.clear()
      if (refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current)
        refreshTimerRef.current = null
      }
      setThreads([])
      setLoading(false)
      setError(null)
      return
    }
    if (refreshingRef.current) {
      return
    }
    setLoading(true)
    void refresh()
  }, [refresh, runtimeEnabled])

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
    const handleThreadPreferenceUpdate = () => {
      threadPreferencesRef.current = getStoredThreadPreferences()
      setThreads(previous => previous.map(thread => applyThreadMetadata(thread)))
    }
    window.addEventListener(THREAD_PREFERENCES_UPDATED_EVENT, handleThreadPreferenceUpdate)
    return () => {
      window.removeEventListener(THREAD_PREFERENCES_UPDATED_EVENT, handleThreadPreferenceUpdate)
    }
  }, [applyThreadMetadata])

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
    selectThread,
    loadMoreThreadMessages,
    loadMoreThreads,
    canLoadMoreThreadMessages,
    canLoadMoreThreads,
    runtime: {
      threadPreferencesRef,
      hasLoadedRef,
      lastRefreshAtRef,
      scheduleRefresh,
      getLastRefreshAt: () => lastRefreshAtRef.current,
      enabled: runtimeEnabled,
    },
  }
}

function isFailedOutboundOutcome(message: OutboundSendOutcome): boolean {
  return deriveReceiptStatus('out', message.backendStatus ?? null) === 'failed'
}

function dedupeMessages(messages: ChatMessage[]): ChatMessage[] {
  const seen = new Set<string>()
  const out: ChatMessage[] = []
  for (const message of messages) {
    if (!message.id || seen.has(message.id)) {
      continue
    }
    seen.add(message.id)
    out.push(message)
  }
  return out
}

const MAX_CACHED_THREAD_MESSAGE_SETS = 2
const MAX_CACHED_MESSAGES = 500

function countCachedMessages(cache: Map<string, ThreadMessageCache>): number {
  let count = 0
  for (const entry of cache.values()) {
    count += entry.messages.length
  }
  return count
}

function dedupeThreadSummaries(summaries: ThreadSummary[]): ThreadSummary[] {
  const seen = new Set<string>()
  const out: ThreadSummary[] = []
  for (const summary of summaries) {
    if (!summary.id || seen.has(summary.id)) {
      continue
    }
    seen.add(summary.id)
    out.push(summary)
  }
  return out
}
