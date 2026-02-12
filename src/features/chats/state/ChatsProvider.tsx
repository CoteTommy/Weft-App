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
import { pollLxmfEvent } from '../../../lib/lxmf-api'
import type {
  ChatThread,
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
import { fetchChatThreads, postChatMessage } from '../services/chatService'
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
  }, [emitIncomingNotifications])

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

  useEffect(() => {
    void refresh()
    const intervalId = window.setInterval(() => {
      void refresh()
    }, 8_000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [refresh])

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void (async () => {
        try {
          const event = await pollLxmfEvent()
          if (event) {
            await refresh()
          }
        } catch {
          // Ignore event-probe errors; periodic refresh keeps threads current.
        }
      })()
    }, 2_500)

    return () => {
      window.clearInterval(intervalId)
    }
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
    const handlePreferencesUpdate = () => {
      notificationsEnabledRef.current = getWeftPreferences().notificationsEnabled
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
