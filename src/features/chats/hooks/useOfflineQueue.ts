import { useCallback, useRef } from 'react'

import { publishAppNotification } from '@shared/runtime/notifications'
import type { ChatThread, OutboundMessageDraft } from '@shared/types/chat'
import { shortHash } from '@shared/utils/identity'

import { postChatMessage } from '../services/chatService'
import { deriveReceiptStatus } from '../services/chatThreadBuilders'
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
} from '../state/offlineQueue'
import { useChatOfflineQueue } from './useChatOfflineQueue'
import { useChatQueueRetryScheduler } from './useChatQueueRetryScheduler'

type QueueFailure = {
  threadId: string
  draft: OutboundMessageDraft
  reason: string
  reasonCode?: string
  sourceMessageId?: string
}

export type UseOfflineQueueResult = {
  offlineQueue: OfflineQueueEntry[]
  retryQueueNow: (queueId: string) => Promise<void>
  pauseQueue: (queueId: string) => void
  resumeQueue: (queueId: string) => void
  removeQueue: (queueId: string) => void
  clearQueue: () => void
  enqueueSendFailure: (params: QueueFailure) => void
}

export type UseOfflineQueueParams = {
  threads: ChatThread[]
  refresh: () => Promise<void>
  runtimeEnabled?: boolean
}

export function useOfflineQueue({
  threads,
  refresh,
  runtimeEnabled = true,
}: UseOfflineQueueParams): UseOfflineQueueResult {
  const ignoredFailedMessageIdsRef = useRef<Set<string>>(getIgnoredFailedMessageIds())
  const queueInFlightRef = useRef<Set<string>>(new Set())
  const { offlineQueue, offlineQueueRef, setOfflineQueue } = useChatOfflineQueue({
    threads,
    ignoredFailedMessageIdsRef,
  })

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
    [offlineQueueRef, runQueueEntry, setOfflineQueue]
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

  const enqueueSendFailure = useCallback(
    ({ threadId, draft, reason, reasonCode, sourceMessageId }: QueueFailure) => {
      const message = reason.trim() || 'failed: backend rejected send'
      if (sourceMessageId) {
        markFailedMessagesIgnored([sourceMessageId])
      }
      publishAppNotification({
        kind: 'system',
        title: 'Message failed',
        body: `${message}. Added to offline queue.`,
        threadId,
      })
      setOfflineQueue(previous =>
        enqueueSendError(previous, {
          threadId,
          destination: threadId,
          draft,
          reason: message,
          reasonCode,
        })
      )
    },
    [markFailedMessagesIgnored, setOfflineQueue]
  )

  useChatQueueRetryScheduler({ offlineQueueRef, runQueueEntry, enabled: runtimeEnabled })

  return {
    offlineQueue,
    retryQueueNow,
    pauseQueue,
    resumeQueue,
    removeQueue,
    clearQueue,
    enqueueSendFailure,
  }
}

function isFailedOutboundOutcome(message: { backendStatus?: string | null }): boolean {
  if (!message.backendStatus) {
    return false
  }
  return deriveReceiptStatus('out', message.backendStatus) === 'failed'
}
