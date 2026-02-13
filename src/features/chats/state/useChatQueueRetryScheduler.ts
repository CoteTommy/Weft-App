import { useEffect, type MutableRefObject } from 'react'

import { nextDueQueueEntry, type OfflineQueueEntry } from './offlineQueue'
import { CHAT_QUEUE_RETRY_INTERVAL_MS } from './types'

export type UseChatQueueRetrySchedulerParams = {
  offlineQueueRef: MutableRefObject<OfflineQueueEntry[]>
  runQueueEntry: (entry: OfflineQueueEntry) => Promise<void>
}

export function useChatQueueRetryScheduler({
  offlineQueueRef,
  runQueueEntry,
}: UseChatQueueRetrySchedulerParams): void {
  useEffect(() => {
    const intervalId = window.setInterval(() => {
      const due = nextDueQueueEntry(offlineQueueRef.current)
      if (!due) {
        return
      }
      void runQueueEntry(due)
    }, CHAT_QUEUE_RETRY_INTERVAL_MS)
    return () => {
      window.clearInterval(intervalId)
    }
  }, [offlineQueueRef, runQueueEntry])
}
