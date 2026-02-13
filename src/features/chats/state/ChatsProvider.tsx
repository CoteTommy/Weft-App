/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Outlet } from 'react-router-dom'

import { publishAppNotification } from '@shared/runtime/notifications'
import type {
  ChatMessage,
  ChatThread,
  OutboundMessageDraft,
  OutboundSendOutcome,
} from '@shared/types/chat'
import { DISPLAY_NAME_UPDATED_EVENT, getStoredDisplayName, shortHash } from '@shared/utils/identity'
import type { LxmfMessageRecord, LxmfRpcEvent } from '@lib/lxmf-payloads'

import { useChatIncomingNotifications } from '../hooks/useChatIncomingNotifications'
import { useChatOfflineQueue } from '../hooks/useChatOfflineQueue'
import { useChatQueueRetryScheduler } from '../hooks/useChatQueueRetryScheduler'
import { useChatRuntimeEventPump } from '../hooks/useChatRuntimeEventPump'
import { buildThreads, fetchChatThreads, postChatMessage } from '../services/chatService'
import { deriveReasonCode, deriveReceiptStatus } from '../services/chatThreadBuilders'
import { CHAT_REFRESH_DEBOUNCE_MS, type ChatsState, type IncomingNotificationItem } from '../types'
import { selectThreadById } from './chatSelectors'
import {
  appendDeliveryTraceEntry,
  reduceCreateDraftThread,
  reduceHydratedThreads,
  reduceMarkAllThreadsRead,
  reduceMarkThreadRead,
  reduceReceiptUpdate,
  reduceRewriteSelfAuthors,
  reduceRuntimeMessage,
  reduceSetThreadMuted,
  reduceSetThreadPinned,
} from './chatThreadsReducer'
import {
  clearOfflineQueue,
  enqueueSendError,
  extendIgnoredFailedMessageIds,
  getIgnoredFailedMessageIds,
  markQueueEntryAttemptFailed,
  markQueueEntryDelivered,
  markQueueEntrySending,
  type OfflineQueueEntry,
  pauseQueueEntry,
  persistIgnoredFailedMessageIds,
  removeQueueEntry,
  resumeQueueEntry,
  retryQueueEntryNow,
} from './offlineQueue'
import {
  getStoredThreadPreferences,
  persistThreadPreferences,
  resolveThreadPreference,
} from './threadPreferences'

const ChatsContext = createContext<ChatsState | undefined>(undefined)

export function ChatsProvider({ children }: PropsWithChildren) {
  const [threads, setThreads] = useState<ChatThread[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const knownMessageIdsRef = useRef<Map<string, Set<string>>>(new Map())
  const unreadCountsRef = useRef<Map<string, number>>(new Map())
  const draftThreadsRef = useRef<Map<string, ChatThread>>(new Map())
  const ignoredFailedMessageIdsRef = useRef<Set<string>>(getIgnoredFailedMessageIds())
  const queueInFlightRef = useRef<Set<string>>(new Set())
  const hasLoadedRef = useRef(false)
  const refreshingRef = useRef(false)
  const lastRefreshAtRef = useRef(0)
  const refreshTimerRef = useRef<number | null>(null)
  const threadPreferencesRef = useRef(getStoredThreadPreferences())
  const { offlineQueue, offlineQueueRef, setOfflineQueue } = useChatOfflineQueue({
    threads,
    ignoredFailedMessageIdsRef,
  })
  const { emitIncomingNotifications } = useChatIncomingNotifications()

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
        for (const item of pendingNotifications) {
          publishAppNotification({
            kind: 'message',
            title: item.threadName,
            body:
              item.count > 1
                ? `${item.count} new messages`
                : item.latestBody || 'New incoming message',
            threadId: item.threadId,
          })
        }
        void emitIncomingNotifications(pendingNotifications)
      }
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : String(refreshError))
    } finally {
      setLoading(false)
      refreshingRef.current = false
    }
  }, [applyThreadMetadata, emitIncomingNotifications])

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

  const markFailedMessagesIgnored = useCallback((messageIds: string[]) => {
    const next = extendIgnoredFailedMessageIds(ignoredFailedMessageIdsRef.current, messageIds)
    ignoredFailedMessageIdsRef.current = next
    persistIgnoredFailedMessageIds(next)
  }, [])

  const runQueueEntry = useCallback(
    async (entry: OfflineQueueEntry) => {
      if (queueInFlightRef.current.has(entry.id)) {
        return
      }
      queueInFlightRef.current.add(entry.id)
      setOfflineQueue(previous => markQueueEntrySending(previous, entry.id))
      try {
        const outcome = await postChatMessage(entry.threadId, entry.draft)
        if (isFailedOutboundOutcome(outcome)) {
          const backendStatus = outcome.backendStatus?.trim() || 'failed: backend rejected send'
          if (outcome.messageId) {
            markFailedMessagesIgnored([outcome.messageId])
          }
          setOfflineQueue(previous =>
            markQueueEntryAttemptFailed(previous, entry.id, backendStatus)
          )
          return
        }
        setOfflineQueue(previous => markQueueEntryDelivered(previous, entry.id))
        if (entry.sourceMessageId) {
          markFailedMessagesIgnored([entry.sourceMessageId])
        }
        publishAppNotification({
          kind: 'system',
          title: 'Queued message sent',
          body: `Recovered delivery to ${shortHash(entry.destination, 8)}.`,
          threadId: entry.threadId,
        })
        await refresh()
      } catch (queueError) {
        const message = queueError instanceof Error ? queueError.message : String(queueError)
        setOfflineQueue(previous => markQueueEntryAttemptFailed(previous, entry.id, message))
      } finally {
        queueInFlightRef.current.delete(entry.id)
      }
    },
    [markFailedMessagesIgnored, refresh, setOfflineQueue]
  )

  const retryQueueNow = useCallback(
    async (queueId: string) => {
      const id = queueId.trim()
      if (!id) {
        return
      }
      setOfflineQueue(previous => retryQueueEntryNow(previous, id))
      const entry = offlineQueueRef.current.find(candidate => candidate.id === id)
      if (!entry) {
        return
      }
      await runQueueEntry(entry)
    },
    [runQueueEntry, offlineQueueRef, setOfflineQueue]
  )

  const pauseQueue = useCallback(
    (queueId: string) => {
      const id = queueId.trim()
      if (!id) {
        return
      }
      setOfflineQueue(previous => pauseQueueEntry(previous, id))
    },
    [setOfflineQueue]
  )

  const resumeQueue = useCallback(
    (queueId: string) => {
      const id = queueId.trim()
      if (!id) {
        return
      }
      setOfflineQueue(previous => resumeQueueEntry(previous, id))
    },
    [setOfflineQueue]
  )

  const removeQueue = useCallback(
    (queueId: string) => {
      const id = queueId.trim()
      if (!id) {
        return
      }
      const entry = offlineQueueRef.current.find(candidate => candidate.id === id)
      if (entry?.sourceMessageId) {
        markFailedMessagesIgnored([entry.sourceMessageId])
      }
      setOfflineQueue(previous => removeQueueEntry(previous, id))
    },
    [markFailedMessagesIgnored, offlineQueueRef, setOfflineQueue]
  )

  const clearQueue = useCallback(() => {
    const ignoredIds = offlineQueueRef.current
      .map(entry => entry.sourceMessageId)
      .filter((entry): entry is string => Boolean(entry))
    if (ignoredIds.length > 0) {
      markFailedMessagesIgnored(ignoredIds)
    }
    setOfflineQueue(clearOfflineQueue())
  }, [markFailedMessagesIgnored, offlineQueueRef, setOfflineQueue])

  useEffect(() => {
    return () => {
      if (refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current)
        refreshTimerRef.current = null
      }
    }
  }, [])

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
    async (threadId: string, draft: OutboundMessageDraft) => {
      try {
        setError(null)
        const outcome = await postChatMessage(threadId, draft)
        if (isFailedOutboundOutcome(outcome)) {
          if (outcome.messageId) {
            markFailedMessagesIgnored([outcome.messageId])
          }
          throw new Error(outcome.backendStatus?.trim() || 'failed: backend rejected send')
        }
        await refresh()
        return outcome
      } catch (sendError) {
        const message = sendError instanceof Error ? sendError.message : String(sendError)
        setError(message)
        publishAppNotification({
          kind: 'system',
          title: 'Message failed',
          body: `${message}. Added to offline queue.`,
          threadId,
        })
        const reasonCode = deriveReasonCode(message)
        setOfflineQueue(previous =>
          enqueueSendError(previous, {
            threadId,
            destination: threadId,
            draft,
            reason: message,
            reasonCode,
          })
        )
        return {}
      }
    },
    [markFailedMessagesIgnored, refresh, setOfflineQueue]
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

  const applyMessageEvent = useCallback(
    (event: LxmfRpcEvent) => {
      const record = extractEventMessageRecord(event)
      if (!record) {
        scheduleRefresh()
        return
      }

      const selfAuthor = getStoredDisplayName() ?? 'You'
      const derivedThread = buildThreads([record], new Map(), selfAuthor)[0]
      if (!derivedThread) {
        return
      }
      const incomingMessage = derivedThread.messages[0]
      if (!incomingMessage) {
        return
      }
      const statusHints = extractEventStatusHints(event)
      const mergedMessage: ChatMessage =
        incomingMessage.sender !== 'self'
          ? incomingMessage
          : {
              ...incomingMessage,
              statusDetail: statusHints.statusDetail ?? incomingMessage.statusDetail,
              status:
                deriveReceiptStatus(
                  'out',
                  statusHints.statusDetail ?? incomingMessage.statusDetail ?? null
                ) ?? incomingMessage.status,
              statusReasonCode:
                statusHints.reasonCode ??
                deriveReasonCode(statusHints.statusDetail ?? incomingMessage.statusDetail),
              deliveryTrace: appendDeliveryTraceEntry(
                incomingMessage,
                statusHints.statusDetail,
                statusHints.reasonCode
              ),
            }

      const threadId = derivedThread.id
      const knownIds = knownMessageIdsRef.current.get(threadId) ?? new Set<string>()
      const isNewMessage = !knownIds.has(mergedMessage.id)
      if (isNewMessage) {
        knownIds.add(mergedMessage.id)
      }
      knownMessageIdsRef.current.set(threadId, knownIds)
      draftThreadsRef.current.delete(threadId)

      const isIncoming = mergedMessage.sender === 'peer' && isNewMessage
      if (isIncoming) {
        unreadCountsRef.current.set(threadId, (unreadCountsRef.current.get(threadId) ?? 0) + 1)
      } else if (!unreadCountsRef.current.has(threadId)) {
        unreadCountsRef.current.set(threadId, 0)
      }

      const preference = resolveThreadPreference(threadPreferencesRef.current, threadId)
      setThreads(previous =>
        reduceRuntimeMessage(previous, {
          applyThreadMetadata,
          derivedThread,
          mergedMessage,
          unread: unreadCountsRef.current.get(threadId),
        })
      )

      if (isIncoming && hasLoadedRef.current && !preference.muted) {
        publishAppNotification({
          kind: 'message',
          title: derivedThread.name,
          body: mergedMessage.body || 'New incoming message',
          threadId,
        })
        void emitIncomingNotifications([
          {
            threadId,
            threadName: derivedThread.name,
            latestBody: mergedMessage.body,
            count: 1,
          },
        ])
      }
    },
    [applyThreadMetadata, emitIncomingNotifications, scheduleRefresh]
  )

  const applyReceiptEvent = useCallback(
    (event: LxmfRpcEvent) => {
      const receipt = extractReceiptUpdate(event)
      if (!receipt) {
        scheduleRefresh()
        return
      }

      let found = false
      setThreads(previous => {
        const next = reduceReceiptUpdate(previous, receipt)
        found = next.found
        return next.threads
      })

      if (!found) {
        scheduleRefresh()
      }
    },
    [scheduleRefresh]
  )

  useChatRuntimeEventPump({
    applyMessageEvent,
    applyReceiptEvent,
    scheduleRefresh,
    getLastRefreshAt: () => lastRefreshAtRef.current,
  })

  useEffect(() => {
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

  useChatQueueRetryScheduler({ offlineQueueRef, runQueueEntry })

  const value = useMemo(
    () => ({
      threads,
      loading,
      error,
      refresh,
      sendMessage,
      offlineQueue,
      retryQueueNow,
      pauseQueue,
      resumeQueue,
      removeQueue,
      clearQueue,
      markThreadRead,
      markAllRead,
      createThread,
      setThreadPinned,
      setThreadMuted,
    }),
    [
      createThread,
      error,
      offlineQueue,
      loading,
      markAllRead,
      markThreadRead,
      pauseQueue,
      removeQueue,
      refresh,
      resumeQueue,
      retryQueueNow,
      sendMessage,
      clearQueue,
      setThreadMuted,
      setThreadPinned,
      threads,
    ]
  )

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

function extractEventMessageRecord(event: LxmfRpcEvent): LxmfMessageRecord | null {
  if (!event.payload || typeof event.payload !== 'object' || Array.isArray(event.payload)) {
    return null
  }
  const payload = event.payload as Record<string, unknown>
  if (!payload.message || typeof payload.message !== 'object' || Array.isArray(payload.message)) {
    return null
  }
  const message = payload.message as Record<string, unknown>
  if (
    typeof message.id !== 'string' ||
    typeof message.source !== 'string' ||
    typeof message.destination !== 'string' ||
    typeof message.title !== 'string' ||
    typeof message.content !== 'string' ||
    typeof message.direction !== 'string' ||
    typeof message.timestamp !== 'number'
  ) {
    return null
  }

  return {
    id: message.id,
    source: message.source,
    destination: message.destination,
    title: message.title,
    content: message.content,
    timestamp: message.timestamp,
    direction: message.direction,
    fields:
      message.fields && typeof message.fields === 'object' && !Array.isArray(message.fields)
        ? (message.fields as LxmfMessageRecord['fields'])
        : null,
    receipt_status:
      typeof message.receipt_status === 'string'
        ? message.receipt_status
        : message.receipt_status === null
          ? null
          : null,
  }
}

function isFailedOutboundOutcome(outcome: OutboundSendOutcome): boolean {
  return deriveReceiptStatus('out', outcome.backendStatus ?? null) === 'failed'
}

function extractReceiptUpdate(
  event: LxmfRpcEvent
): { messageId: string; status?: string; reasonCode?: string } | null {
  if (!event.payload || typeof event.payload !== 'object' || Array.isArray(event.payload)) {
    return null
  }
  const payload = event.payload as Record<string, unknown>
  if (typeof payload.message_id !== 'string' || payload.message_id.trim().length === 0) {
    return null
  }
  const status =
    typeof payload.status === 'string' && payload.status.trim().length > 0
      ? payload.status.trim()
      : undefined
  const reasonCode =
    typeof payload.reason_code === 'string' && payload.reason_code.trim().length > 0
      ? payload.reason_code.trim()
      : undefined

  return {
    messageId: payload.message_id.trim(),
    status,
    reasonCode,
  }
}

function extractEventStatusHints(event: LxmfRpcEvent): {
  statusDetail?: string
  reasonCode?: string
} {
  if (!event.payload || typeof event.payload !== 'object' || Array.isArray(event.payload)) {
    return {}
  }
  const payload = event.payload as Record<string, unknown>
  const reasonCode =
    typeof payload.reason_code === 'string' && payload.reason_code.trim().length > 0
      ? payload.reason_code.trim()
      : undefined

  if (typeof payload.error === 'string' && payload.error.trim().length > 0) {
    return {
      statusDetail: `failed: ${payload.error.trim()}`,
      reasonCode: reasonCode ?? deriveReasonCode(payload.error.trim()),
    }
  }
  if (typeof payload.method === 'string' && payload.method.trim().length > 0) {
    return {
      statusDetail: `sent: ${payload.method.trim()}`,
      reasonCode,
    }
  }
  return { reasonCode }
}
