import { type RefObject, useCallback } from 'react'

import { publishAppNotification } from '@shared/runtime/notifications'
import { shortHash } from '@shared/utils/identity'
import type { LxmfMessageRecord, LxmfRpcEvent } from '@lib/lxmf-payloads'

import { resolveThreadPreference } from '../state/threadPreferences'
import { type IncomingNotificationItem } from '../types'
import { useChatIncomingNotifications } from './useChatIncomingNotifications'
import { useChatRuntimeEventPump } from './useChatRuntimeEventPump'

type StoreRuntimeContext = {
  threadPreferencesRef: RefObject<Map<string, { pinned: boolean; muted: boolean }>>
  hasLoadedRef: RefObject<boolean>
  scheduleRefresh: () => void
  getLastRefreshAt: () => number
  enabled?: boolean
}

export type UseChatEventsResult = {
  notifyIncoming: (items: IncomingNotificationItem[]) => Promise<void>
}

export function useChatEvents({
  threadPreferencesRef,
  hasLoadedRef,
  scheduleRefresh,
  getLastRefreshAt,
  enabled = true,
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
      scheduleRefresh()
      if (!hasLoadedRef.current || record.direction === 'out') {
        return
      }
      const threadId = record.source.trim() || record.destination.trim()
      if (!threadId) {
        return
      }
      const preference = resolveThreadPreference(threadPreferencesRef.current, threadId)
      if (preference.muted) {
        return
      }
      void notifyIncoming([
        {
          threadId,
          threadName: shortHash(threadId),
          latestBody: record.content,
          count: 1,
        },
      ])
    },
    [hasLoadedRef, notifyIncoming, scheduleRefresh, threadPreferencesRef]
  )

  const applyReceiptEvent = useCallback(() => {
    scheduleRefresh()
  }, [scheduleRefresh])

  useChatRuntimeEventPump({
    applyMessageEvent,
    applyReceiptEvent,
    scheduleRefresh,
    getLastRefreshAt,
    enabled,
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
