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
import {
  startLxmfEventPump,
  subscribeLxmfEvents,
} from '../../../lib/lxmf-api'
import type { LxmfMessageRecord, LxmfRpcEvent } from '../../../lib/lxmf-payloads'
import type {
  ChatThread,
  ChatMessage,
  OutboundMessageDraft,
  OutboundSendOutcome,
} from '../../../shared/types/chat'
import {
  DISPLAY_NAME_UPDATED_EVENT,
  getStoredDisplayName,
  shortHash,
} from '../../../shared/utils/identity'
import {
  getWeftPreferences,
  PREFERENCES_UPDATED_EVENT,
} from '../../../shared/runtime/preferences'
import { publishAppNotification } from '../../../shared/runtime/notifications'
import { fetchChatThreads, postChatMessage, buildThreads } from '../services/chatService'
import { deriveReasonCode, deriveReceiptStatus } from '../services/chatThreadBuilders'
import {
  getStoredThreadPreferences,
  persistThreadPreferences,
  resolveThreadPreference,
} from './threadPreferences'

interface ChatsState {
  threads: ChatThread[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  sendMessage: (threadId: string, draft: OutboundMessageDraft) => Promise<OutboundSendOutcome>
  markThreadRead: (threadId: string) => void
  markAllRead: () => void
  createThread: (destination: string, name?: string) => string | null
  setThreadPinned: (threadId: string, pinned?: boolean) => void
  setThreadMuted: (threadId: string, muted?: boolean) => void
}

const ChatsContext = createContext<ChatsState | undefined>(undefined)

export function ChatsProvider({ children }: PropsWithChildren) {
  const [threads, setThreads] = useState<ChatThread[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const knownMessageIdsRef = useRef<Map<string, Set<string>>>(new Map())
  const unreadCountsRef = useRef<Map<string, number>>(new Map())
  const draftThreadsRef = useRef<Map<string, ChatThread>>(new Map())
  const hasLoadedRef = useRef(false)
  const refreshingRef = useRef(false)
  const notificationsEnabledRef = useRef(getWeftPreferences().notificationsEnabled)
  const messageNotificationsEnabledRef = useRef(getWeftPreferences().messageNotificationsEnabled)
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

  const emitIncomingNotifications = useCallback(
    async (items: Array<{ threadId: string; threadName: string; latestBody: string; count: number }>) => {
      if (typeof window === 'undefined' || !('Notification' in window) || items.length === 0) {
        return
      }
      if (!notificationsEnabledRef.current) {
        return
      }
      if (!messageNotificationsEnabledRef.current) {
        return
      }
      if (document.visibilityState === 'visible' && document.hasFocus()) {
        return
      }

      let permission = Notification.permission
      if (permission === 'default') {
        permission = await Notification.requestPermission()
      }
      if (permission !== 'granted') {
        return
      }

      for (const item of items) {
        const body =
          item.count > 1
            ? `${item.count} new messages in ${item.threadName}`
            : item.latestBody || `New message in ${item.threadName}`
        const notification = new Notification(item.threadName, {
          body,
          tag: `thread:${item.threadId}`,
        })
        notification.onclick = () => {
          window.focus()
          window.dispatchEvent(
            new CustomEvent('weft:open-thread', {
              detail: { threadId: item.threadId },
            }),
          )
          notification.close()
        }
      }
    },
    [],
  )

  const rewriteSelfAuthors = useCallback((nextAuthor: string) => {
    const normalizedAuthor = nextAuthor.trim() || 'You'
    setThreads((previous) => {
      let changed = false
      const updated = previous.map((thread) => {
        let threadChanged = false
        const messages = thread.messages.map((message) => {
          if (message.sender !== 'self' || message.author === normalizedAuthor) {
            return message
          }
          changed = true
          threadChanged = true
          return {
            ...message,
            author: normalizedAuthor,
          }
        })
        return threadChanged
          ? {
              ...thread,
              messages,
            }
          : thread
      })
      return changed ? updated : previous
    })
  }, [])

  const refresh = useCallback(async () => {
    if (refreshingRef.current) {
      return
    }
    refreshingRef.current = true
    try {
      setError(null)
      const loaded = await fetchChatThreads()
      const pendingNotifications: Array<{
        threadId: string
        threadName: string
        latestBody: string
        count: number
      }> = []
      const activeIds = new Set([
        ...loaded.map((thread) => thread.id),
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
          const seeded = new Set(thread.messages.map((message) => message.id))
          knownMessageIdsRef.current.set(thread.id, seeded)
          if (!hasLoadedRef.current) {
            unreadCountsRef.current.set(thread.id, 0)
          } else {
            const incoming = thread.messages.filter((message) => message.sender === 'peer').length
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
            (unreadCountsRef.current.get(thread.id) ?? 0) + incomingCount,
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
        .map((thread) => ({
          ...thread,
          unread: unreadCountsRef.current.get(thread.id) ?? 0,
        }))
        .map(applyThreadMetadata)

      for (const thread of hydratedThreads) {
        draftThreadsRef.current.delete(thread.id)
      }

      const draftThreads = [...draftThreadsRef.current.values()].map(applyThreadMetadata)
      setThreads(orderThreads([...draftThreads, ...hydratedThreads]))
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

  const markThreadRead = useCallback((threadId: string) => {
    const id = threadId.trim()
    if (!id) {
      return
    }
    if ((unreadCountsRef.current.get(id) ?? 0) === 0) {
      return
    }
    unreadCountsRef.current.set(id, 0)
    setThreads((previous) =>
      previous.map((thread) =>
        thread.id === id && thread.unread > 0
          ? {
              ...thread,
              unread: 0,
            }
          : thread,
      ),
    )
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
    setThreads((previous) =>
      previous.map((thread) =>
        thread.unread > 0
          ? {
              ...thread,
              unread: 0,
            }
          : thread,
      ),
    )
  }, [])

  const sendMessage = useCallback(
    async (threadId: string, draft: OutboundMessageDraft) => {
      try {
        setError(null)
        const outcome = await postChatMessage(threadId, draft)
        await refresh()
        return outcome
      } catch (sendError) {
        const message = sendError instanceof Error ? sendError.message : String(sendError)
        setError(message)
        publishAppNotification({
          kind: 'system',
          title: 'Message failed',
          body: message,
          threadId,
        })
        return {}
      }
    },
    [refresh],
  )

  const createThread = useCallback((destination: string, name?: string): string | null => {
    const threadId = destination.trim()
    if (!threadId) {
      setError('Destination is required')
      return null
    }

    setError(null)
    const existing = threads.find((thread) => thread.id === threadId)
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
    setThreads((previous) => {
      if (previous.some((thread) => thread.id === threadId)) {
        return previous
      }
      return orderThreads([applyThreadMetadata(draft), ...previous])
    })
    return threadId
  }, [applyThreadMetadata, threads])

  const setThreadPinned = useCallback(
    (threadId: string, pinned?: boolean) => {
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
      setThreads((previous) =>
        orderThreads(
          previous.map((thread) =>
            thread.id === id
              ? {
                  ...thread,
                  pinned: nextPinned,
                }
              : thread,
          ),
        ),
      )
    },
    [],
  )

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
    setThreads((previous) =>
      previous.map((thread) =>
        thread.id === id
          ? {
              ...thread,
              muted: nextMuted,
            }
          : thread,
      ),
    )
  }, [])

  const applyMessageEvent = useCallback(
    (event: LxmfRpcEvent) => {
      const record = extractEventMessageRecord(event)
      if (!record) {
        void refresh()
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

      const threadId = derivedThread.id
      const knownIds = knownMessageIdsRef.current.get(threadId) ?? new Set<string>()
      const isNewMessage = !knownIds.has(incomingMessage.id)
      if (isNewMessage) {
        knownIds.add(incomingMessage.id)
      }
      knownMessageIdsRef.current.set(threadId, knownIds)
      draftThreadsRef.current.delete(threadId)

      const isIncoming = incomingMessage.sender === 'peer' && isNewMessage
      if (isIncoming) {
        unreadCountsRef.current.set(
          threadId,
          (unreadCountsRef.current.get(threadId) ?? 0) + 1,
        )
      } else if (!unreadCountsRef.current.has(threadId)) {
        unreadCountsRef.current.set(threadId, 0)
      }

      const preference = resolveThreadPreference(threadPreferencesRef.current, threadId)
      setThreads((previous) => {
        const index = previous.findIndex((thread) => thread.id === threadId)
        if (index < 0) {
          const nextUnread = unreadCountsRef.current.get(threadId) ?? 0
          return orderThreads([
            applyThreadMetadata({
              ...derivedThread,
              unread: nextUnread,
            }),
            ...previous,
          ])
        }

        const existing = previous[index]
        const messages = upsertThreadMessages(existing.messages, incomingMessage)
        const updatedThread = applyThreadMetadata({
          ...existing,
          preview: previewFromMessage(messages[messages.length - 1]),
          lastActivity: derivedThread.lastActivity,
          messages,
          unread: unreadCountsRef.current.get(threadId) ?? existing.unread,
        })
        const next = [...previous]
        next[index] = updatedThread
        return orderThreads(next)
      })

      if (isIncoming && hasLoadedRef.current && !preference.muted) {
        publishAppNotification({
          kind: 'message',
          title: derivedThread.name,
          body: incomingMessage.body || 'New incoming message',
          threadId,
        })
        void emitIncomingNotifications([
          {
            threadId,
            threadName: derivedThread.name,
            latestBody: incomingMessage.body,
            count: 1,
          },
        ])
      }
    },
    [applyThreadMetadata, emitIncomingNotifications, refresh],
  )

  const applyReceiptEvent = useCallback(
    (event: LxmfRpcEvent) => {
      const receipt = extractReceiptUpdate(event)
      if (!receipt) {
        void refresh()
        return
      }

      let found = false
      setThreads((previous) => {
        const next = previous.map((thread) => {
          let changed = false
          const messages = thread.messages.map((message) => {
            if (message.id !== receipt.messageId) {
              return message
            }
            found = true
            changed = true
            const statusDetail = receipt.status ?? message.statusDetail
            const reasonCode = receipt.reasonCode ?? deriveReasonCode(statusDetail)
            const status = deriveReceiptStatus('out', statusDetail ?? null) ?? message.status
            return {
              ...message,
              status,
              statusDetail,
              statusReasonCode: reasonCode,
              deliveryTrace: appendDeliveryTraceEntry(message, statusDetail),
            }
          })
          if (!changed) {
            return thread
          }
          return {
            ...thread,
            preview: previewFromMessage(messages[messages.length - 1]),
            messages,
          }
        })
        return next
      })

      if (!found) {
        void refresh()
      }
    },
    [refresh],
  )

  useEffect(() => {
    void refresh()
    const intervalId = window.setInterval(() => {
      void refresh()
    }, 15_000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [refresh])

  useEffect(() => {
    let unlisten: (() => void) | null = null
    let disposed = false
    void startLxmfEventPump().catch(() => {
      // Fallback interval refresh still keeps data current.
    })
    void subscribeLxmfEvents((event) => {
      if (event.event_type === 'inbound' || event.event_type === 'outbound') {
        applyMessageEvent(event)
        return
      }
      if (event.event_type === 'receipt') {
        applyReceiptEvent(event)
        return
      }
      if (event.event_type === 'runtime_started' || event.event_type === 'runtime_stopped') {
        void refresh()
      }
    })
      .then((stop) => {
        if (disposed) {
          stop()
          return
        }
        unlisten = stop
      })
      .catch(() => {
        // Ignore listener errors; fallback polling refresh still runs.
      })

    return () => {
      disposed = true
      unlisten?.()
    }
  }, [applyMessageEvent, applyReceiptEvent, refresh])

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
    const handlePreferencesUpdate = () => {
      const preferences = getWeftPreferences()
      notificationsEnabledRef.current = preferences.notificationsEnabled
      messageNotificationsEnabledRef.current = preferences.messageNotificationsEnabled
    }
    window.addEventListener(PREFERENCES_UPDATED_EVENT, handlePreferencesUpdate)
    return () => {
      window.removeEventListener(PREFERENCES_UPDATED_EVENT, handlePreferencesUpdate)
    }
  }, [])

  const value = useMemo(
    () => ({
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
    }),
    [
      createThread,
      error,
      loading,
      markAllRead,
      markThreadRead,
      refresh,
      sendMessage,
      setThreadMuted,
      setThreadPinned,
      threads,
    ],
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

function orderThreads(threads: ChatThread[]): ChatThread[] {
  return [...threads].sort((left, right) => Number(right.pinned) - Number(left.pinned))
}

function upsertThreadMessages(
  messages: ChatMessage[],
  incoming: ChatMessage,
): ChatMessage[] {
  const index = messages.findIndex((message) => message.id === incoming.id)
  if (index < 0) {
    return [...messages, incoming]
  }
  const next = [...messages]
  next[index] = {
    ...messages[index],
    ...incoming,
  }
  return next
}

function previewFromMessage(message: ChatMessage | undefined): string {
  if (!message) {
    return 'No messages yet'
  }
  const body = message.body.trim()
  if (body.length > 0) {
    return body
  }
  if (message.attachments.length > 0) {
    return message.attachments.length === 1
      ? `Attachment: ${message.attachments[0].name}`
      : `${message.attachments.length} attachments`
  }
  if (message.paper?.title) {
    return `Paper: ${message.paper.title}`
  }
  return 'No messages yet'
}

function appendDeliveryTraceEntry(
  message: ChatMessage,
  statusDetail: string | undefined,
): ChatMessage['deliveryTrace'] {
  if (!statusDetail) {
    return message.deliveryTrace
  }
  const existing = message.deliveryTrace ?? []
  const timestamp = Math.floor(Date.now() / 1000)
  const next = [...existing, { status: statusDetail, timestamp }]
  return next.slice(-32)
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

function extractReceiptUpdate(
  event: LxmfRpcEvent,
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
