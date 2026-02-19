import { useCallback, useEffect, useRef } from 'react'
import { unstable_batchedUpdates } from 'react-dom'

import { useLxmfEventHub } from '@app/state/LxmfEventHubProvider'
import type { LxmfRpcEvent } from '@lib/lxmf-payloads'

import { CHAT_EVENT_BATCH_MS, CHAT_WATCHDOG_INTERVAL_MS, CHAT_WATCHDOG_STALE_MS } from '../types'

export type UseChatRuntimeEventPumpParams = {
  applyMessageEvent: (event: LxmfRpcEvent) => void
  applyReceiptEvent: (event: LxmfRpcEvent) => void
  scheduleRefresh: () => void
  getLastRefreshAt: () => number
  enabled?: boolean
}

export function useChatRuntimeEventPump({
  applyMessageEvent,
  applyReceiptEvent,
  scheduleRefresh,
  getLastRefreshAt,
  enabled = true,
}: UseChatRuntimeEventPumpParams) {
  const { subscribe, getLastEventAtMs } = useLxmfEventHub()
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
        if (
          event.event_type === 'runtime_started' ||
          event.event_type === 'runtime_stopped' ||
          event.event_type === 'peer_sync' ||
          event.event_type === 'peer_unpeer' ||
          event.event_type === 'interfaces_updated' ||
          event.event_type === 'config_reloaded' ||
          event.event_type === 'propagation_node_selected'
        ) {
          scheduleRefresh()
        }
      }
    })
  }, [applyMessageEvent, applyReceiptEvent, scheduleRefresh])

  const enqueueRuntimeEvent = useCallback(
    (event: LxmfRpcEvent) => {
      if (!enabled || document.visibilityState !== 'visible') {
        scheduleRefresh()
        return
      }
      lastEventAtRef.current = Date.now()
      pendingEventsRef.current.push(event)
      if (eventBatchTimerRef.current !== null) {
        return
      }
      eventBatchTimerRef.current = window.setTimeout(() => {
        flushEventBatch()
      }, CHAT_EVENT_BATCH_MS)
    },
    [enabled, flushEventBatch, scheduleRefresh]
  )

  useEffect(() => {
    if (!enabled) {
      return
    }
    const unlisten = subscribe(event => {
      enqueueRuntimeEvent(event)
    })

    return () => {
      unlisten()
    }
  }, [enabled, enqueueRuntimeEvent, subscribe])

  useEffect(() => {
    if (!enabled) {
      return
    }
    let timerId: number | null = null
    let intervalMs = CHAT_WATCHDOG_INTERVAL_MS
    let disposed = false

    const scheduleTick = () => {
      if (disposed) {
        return
      }
      timerId = window.setTimeout(runTick, intervalMs)
    }

    const runTick = () => {
      if (disposed) {
        return
      }
      if (document.visibilityState !== 'visible') {
        intervalMs = Math.min(intervalMs * 2, 60_000)
        scheduleTick()
        return
      }
      const now = Date.now()
      const freshestAt = Math.max(lastEventAtRef.current, getLastEventAtMs(), getLastRefreshAt())
      const staleMs = freshestAt === 0 ? Number.POSITIVE_INFINITY : now - freshestAt
      if (staleMs >= CHAT_WATCHDOG_STALE_MS) {
        scheduleRefresh()
        intervalMs = CHAT_WATCHDOG_INTERVAL_MS
      } else {
        intervalMs = Math.min(intervalMs + 5_000, 30_000)
      }
      scheduleTick()
    }

    scheduleTick()

    return () => {
      disposed = true
      if (timerId !== null) {
        window.clearTimeout(timerId)
      }
    }
  }, [enabled, getLastEventAtMs, getLastRefreshAt, scheduleRefresh])

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
