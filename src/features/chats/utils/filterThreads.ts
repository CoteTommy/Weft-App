import type { ChatThread } from '../../../shared/types/chat'

export function filterThreads(threads: ChatThread[], query: string): ChatThread[] {
  const normalized = query.trim().toLowerCase()
  if (!normalized) {
    return threads
  }
  return threads.filter((thread) => {
    const haystack = `${thread.name} ${thread.destination} ${thread.preview}`.toLowerCase()
    return haystack.includes(normalized)
  })
}
