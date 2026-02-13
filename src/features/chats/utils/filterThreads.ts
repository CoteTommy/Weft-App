import type { ChatThread } from '@shared/types/chat'
import {
  filterIndexedItems,
  type IndexedSearchItem,
  indexSearchItems,
} from '@shared/utils/search'

export function indexThreads(threads: ChatThread[]): IndexedSearchItem<ChatThread>[] {
  return indexSearchItems(
    threads,
    (thread) => [
      thread.name,
      thread.destination,
      thread.preview,
      thread.lastActivity,
    ],
    { cacheKey: 'threads' },
  )
}

export function filterThreadIndex(
  indexedThreads: IndexedSearchItem<ChatThread>[],
  query: string,
): ChatThread[] {
  return filterIndexedItems(indexedThreads, query)
}

export function filterThreads(threads: ChatThread[], query: string): ChatThread[] {
  return filterThreadIndex(indexThreads(threads), query)
}
