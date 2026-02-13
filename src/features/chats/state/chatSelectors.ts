import type { ChatThread } from '../../../shared/types/chat'

export function selectThreadById(
  threads: ChatThread[],
  threadId: string,
): ChatThread | undefined {
  return threads.find((thread) => thread.id === threadId)
}

export function selectThreadExists(threads: ChatThread[], threadId: string): boolean {
  return threads.some((thread) => thread.id === threadId)
}
