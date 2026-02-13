import {
  type Dispatch,
  type RefObject,
  type SetStateAction,
  useEffect,
  useRef,
  useState,
} from 'react'

import type { ChatThread } from '@shared/types/chat'

import {
  loadStoredOfflineQueue,
  type OfflineQueueEntry,
  persistOfflineQueue,
  syncQueueFromThreads,
} from '../state/offlineQueue'

export type UseChatOfflineQueueParams = {
  threads: ChatThread[]
  ignoredFailedMessageIdsRef: RefObject<Set<string>>
}

export type UseChatOfflineQueueResult = {
  offlineQueue: OfflineQueueEntry[]
  offlineQueueRef: RefObject<OfflineQueueEntry[]>
  setOfflineQueue: Dispatch<SetStateAction<OfflineQueueEntry[]>>
}

export function useChatOfflineQueue({
  threads,
  ignoredFailedMessageIdsRef,
}: UseChatOfflineQueueParams): UseChatOfflineQueueResult {
  const [offlineQueue, setOfflineQueue] = useState<OfflineQueueEntry[]>([])
  const offlineQueueRef = useRef<OfflineQueueEntry[]>(offlineQueue)

  useEffect(() => {
    let disposed = false
    void loadStoredOfflineQueue().then(entries => {
      if (disposed) {
        return
      }
      setOfflineQueue(previous => mergeQueueEntries(previous, entries))
    })
    return () => {
      disposed = true
    }
  }, [])

  useEffect(() => {
    offlineQueueRef.current = offlineQueue
    void persistOfflineQueue(offlineQueue)
  }, [offlineQueue])

  useEffect(() => {
    setOfflineQueue(previous =>
      syncQueueFromThreads(previous, threads, ignoredFailedMessageIdsRef.current)
    )
  }, [threads, ignoredFailedMessageIdsRef])

  return {
    offlineQueue,
    offlineQueueRef,
    setOfflineQueue,
  }
}

function mergeQueueEntries(
  previous: OfflineQueueEntry[],
  incoming: OfflineQueueEntry[]
): OfflineQueueEntry[] {
  if (incoming.length === 0) {
    return previous
  }
  const byId = new Map(previous.map(entry => [entry.id, entry]))
  for (const entry of incoming) {
    if (!byId.has(entry.id)) {
      byId.set(entry.id, entry)
    }
  }
  return [...byId.values()].sort((left, right) => left.nextRetryAtMs - right.nextRetryAtMs)
}
