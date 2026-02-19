import { type RefObject, useEffect } from 'react'

import { nextDueQueueEntry, type OfflineQueueEntry } from '../state/offlineQueue'
import { CHAT_QUEUE_RETRY_INTERVAL_MS } from '../types'

export type UseChatQueueRetrySchedulerParams = {
  offlineQueueRef: RefObject<OfflineQueueEntry[]>
  runQueueEntry: (entry: OfflineQueueEntry) => Promise<void>
  enabled?: boolean
}

export function useChatQueueRetryScheduler({
  offlineQueueRef,
  runQueueEntry,
  enabled = true,
}: UseChatQueueRetrySchedulerParams): void {
  useEffect(() => {
    if (!enabled) {
      return
    }
    let timerId: number | null = null
    let intervalMs = CHAT_QUEUE_RETRY_INTERVAL_MS
    let disposed = false

    const scheduleNext = () => {
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
        intervalMs = Math.min(intervalMs * 2, 30_000)
        scheduleNext()
        return
      }
      const due = nextDueQueueEntry(offlineQueueRef.current)
      if (!due) {
        intervalMs = Math.min(intervalMs + 2_000, 15_000)
        scheduleNext()
        return
      }
      void runQueueEntry(due)
      intervalMs = CHAT_QUEUE_RETRY_INTERVAL_MS
      scheduleNext()
    }

    scheduleNext()

    return () => {
      disposed = true
      if (timerId !== null) {
        window.clearTimeout(timerId)
      }
    }
  }, [enabled, offlineQueueRef, runQueueEntry])
}
