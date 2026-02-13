import { type Dispatch, type MutableRefObject, type RefObject, type SetStateAction,useEffect, useRef, useState } from 'react'

import type { ChatThread } from '@shared/types/chat'

import { getStoredOfflineQueue, type OfflineQueueEntry,persistOfflineQueue, syncQueueFromThreads } from '../state/offlineQueue'

export type UseChatOfflineQueueParams = {
  threads: ChatThread[]
  ignoredFailedMessageIdsRef: RefObject<Set<string>>
}

export type UseChatOfflineQueueResult = {
  offlineQueue: OfflineQueueEntry[]
  offlineQueueRef: MutableRefObject<OfflineQueueEntry[]>
  setOfflineQueue: Dispatch<SetStateAction<OfflineQueueEntry[]>>
}

export function useChatOfflineQueue({
  threads,
  ignoredFailedMessageIdsRef,
}: UseChatOfflineQueueParams): UseChatOfflineQueueResult {
  const [offlineQueue, setOfflineQueue] = useState<OfflineQueueEntry[]>(() =>
    getStoredOfflineQueue(),
  )
  const offlineQueueRef = useRef<OfflineQueueEntry[]>(offlineQueue)

  useEffect(() => {
    offlineQueueRef.current = offlineQueue
    persistOfflineQueue(offlineQueue)
  }, [offlineQueue])

  useEffect(() => {
    setOfflineQueue((previous) => syncQueueFromThreads(previous, threads, ignoredFailedMessageIdsRef.current))
  }, [threads, ignoredFailedMessageIdsRef])

  return {
    offlineQueue,
    offlineQueueRef,
    setOfflineQueue,
  }
}
