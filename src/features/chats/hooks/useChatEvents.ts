import { type Dispatch, type RefObject, type SetStateAction, useCallback } from 'react'

import { publishAppNotification } from '@shared/runtime/notifications'
import type { ChatMessage, ChatThread } from '@shared/types/chat'
import { getStoredDisplayName } from '@shared/utils/identity'
import type { LxmfMessageRecord, LxmfRpcEvent } from '@lib/lxmf-payloads'

import { buildThreads } from '../services/chatService'
import { deriveReasonCode, deriveReceiptStatus } from '../services/chatThreadBuilders'
import {
  appendDeliveryTraceEntry,
  reduceReceiptUpdate,
  reduceRuntimeMessage,
} from '../state/chatThreadsReducer'
import { resolveThreadPreference } from '../state/threadPreferences'
import { type IncomingNotificationItem } from '../types'
import { useChatIncomingNotifications } from './useChatIncomingNotifications'
import { useChatRuntimeEventPump } from './useChatRuntimeEventPump'

type StoreRuntimeContext = {
  setThreads: Dispatch<SetStateAction<ChatThread[]>>
  applyThreadMetadata: (thread: ChatThread) => ChatThread
  knownMessageIdsRef: RefObject<Map<string, Set<string>>>
  unreadCountsRef: RefObject<Map<string, number>>
  draftThreadsRef: RefObject<Map<string, ChatThread>>
  threadPreferencesRef: RefObject<Map<string, { pinned: boolean; muted: boolean }>>
  hasLoadedRef: RefObject<boolean>
  scheduleRefresh: () => void
  getLastRefreshAt: () => number
}

export type UseChatEventsResult = {
  notifyIncoming: (items: IncomingNotificationItem[]) => Promise<void>
}

export function useChatEvents({
  setThreads,
  applyThreadMetadata,
  knownMessageIdsRef,
  unreadCountsRef,
  draftThreadsRef,
  threadPreferencesRef,
  hasLoadedRef,
  scheduleRefresh,
  getLastRefreshAt,
}: StoreRuntimeContext): UseChatEventsResult {
  const { emitIncomingNotifications } = useChatIncomingNotifications()

  const notifyIncoming = useCallback(
    async (items: IncomingNotificationItem[]) => {
      for (const item of items) {
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
      if (items.length > 0) {
        await emitIncomingNotifications(items)
      }
    },
    [emitIncomingNotifications]
  )

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
        void notifyIncoming([
          {
            threadId,
            threadName: derivedThread.name,
            latestBody: mergedMessage.body,
            count: 1,
          },
        ])
      }
    },
    [
      applyThreadMetadata,
      draftThreadsRef,
      hasLoadedRef,
      knownMessageIdsRef,
      notifyIncoming,
      scheduleRefresh,
      setThreads,
      threadPreferencesRef,
      unreadCountsRef,
    ]
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
    [scheduleRefresh, setThreads]
  )

  useChatRuntimeEventPump({
    applyMessageEvent,
    applyReceiptEvent,
    scheduleRefresh,
    getLastRefreshAt,
  })

  return {
    notifyIncoming,
  }
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
