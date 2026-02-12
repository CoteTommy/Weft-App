export type AnnouncePriorityLabel = 'Routine' | 'Urgent'

export interface AnnounceItem {
  id: string
  title: string
  body: string
  audience: string
  priority: AnnouncePriorityLabel
  postedAt: string
  source: string
  capabilities: string[]
}
