import { useCallback, useEffect, useRef } from 'react'
import { unstable_batchedUpdates } from 'react-dom'

import { startLxmfEventPump, subscribeLxmfEvents } from '@lib/lxmf-api'
import type { LxmfRpcEvent } from '@lib/lxmf-payloads'

import {
  CHAT_EVENT_BATCH_MS,
  CHAT_WATCHDOG_INTERVAL_MS,
  CHAT_WATCHDOG_STALE_MS,
} from './types'

export type UseChatRuntimeEventPumpParams = {
  applyMessageEvent: (event: LxmfRpcEvent) => void
  applyReceiptEvent: (event: LxmfRpcEvent) => void
  scheduleRefresh: () => void
  getLastRefreshAt: () => number
}

export function useChatRuntimeEventPump({
  applyMessageEvent,
  applyReceiptEvent,
  scheduleRefresh,
  getLastRefreshAt,
}: UseChatRuntimeEventPumpParams) {
  const lastEventAtRef = useRef(0)
  const pendingEventsRef = useRef<LxmfRpcEvent[]>([])
  const eventBatchTimerRef = useRef<number | null>(null)

  const flushEventBatch = useCallback(() => {
    eventBatchTimerRef.current = null
    const pending = pendingEventsRef.current
    pendingEventsRef.current = []
    if (pending.length === 0) {
      return
    }
    unstable_batchedUpdates(() => {
      for (const event of pending) {
        if (event.event_type === 'inbound' || event.event_type === 'outbound') {
          applyMessageEvent(event)
          continue
        }
        if (event.event_type === 'receipt') {
          applyReceiptEvent(event)
          continue
        }
        if (event.event_type === 'runtime_started' || event.event_type === 'runtime_stopped') {
          scheduleRefresh()
        }
      }
    })
  }, [applyMessageEvent, applyReceiptEvent, scheduleRefresh])

  const enqueueRuntimeEvent = useCallback((event: LxmfRpcEvent) => {
    lastEventAtRef.current = Date.now()
    pendingEventsRef.current.push(event)
    if (eventBatchTimerRef.current !== null) {
      return
    }
    eventBatchTimerRef.current = window.setTimeout(() => {
      flushEventBatch()
    }, CHAT_EVENT_BATCH_MS)
  }, [flushEventBatch])

  useEffect(() => {
    let unlisten: (() => void) | null = null
    let disposed = false
    void startLxmfEventPump().catch(() => {
      // The provider keeps functioning without streaming event updates.
    })
    void subscribeLxmfEvents((event) => {
      enqueueRuntimeEvent(event)
    })
      .then((stop) => {
        if (disposed) {
          stop()
          return
        }
        unlisten = stop
      })
      .catch(() => {
        // If subscriptions fail, refresh will correct state on next render.
      })

    return () => {
      disposed = true
      unlisten?.()
    }
  }, [enqueueRuntimeEvent])

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      const now = Date.now()
      const freshestAt = Math.max(lastEventAtRef.current, getLastRefreshAt())
      const staleMs = freshestAt === 0 ? Number.POSITIVE_INFINITY : now - freshestAt
      if (staleMs >= CHAT_WATCHDOG_STALE_MS) {
        scheduleRefresh()
      }
    }, CHAT_WATCHDOG_INTERVAL_MS)
    return () => {
      window.clearInterval(intervalId)
    }
  }, [getLastRefreshAt, scheduleRefresh])

  useEffect(() => {
    return () => {
      if (eventBatchTimerRef.current !== null) {
        window.clearTimeout(eventBatchTimerRef.current)
        eventBatchTimerRef.current = null
      }
      pendingEventsRef.current = []
    }
  }, [])
}
