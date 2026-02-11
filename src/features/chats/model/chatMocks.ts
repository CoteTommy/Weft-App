import type { ChatThread } from '../../../shared/types/chat'

export const chatThreads: ChatThread[] = [
  {
    id: 'north-relay',
    name: 'North Relay Crew',
    preview: 'Ack. Route lock enabled for 30 minutes.',
    unread: 3,
    lastActivity: '2m',
    messages: [
      {
        id: 'm1',
        author: 'relay.alpha',
        sender: 'peer',
        body: 'Morning sweep complete. Two transient drops on path C12.',
        sentAt: '08:41',
      },
      {
        id: 'm2',
        author: 'You',
        sender: 'self',
        body: 'Ack. Route lock enabled for 30 minutes while we test handoff.',
        sentAt: '08:46',
        status: 'delivered',
      },
    ],
  },
  {
    id: 'bluebird',
    name: 'Bluebird Logistics',
    preview: 'Manifest received. Dispatching payload hash now.',
    unread: 0,
    lastActivity: '18m',
    messages: [
      {
        id: 'm3',
        author: 'You',
        sender: 'self',
        body: 'Manifest received. Dispatching payload hash now.',
        sentAt: '07:22',
        status: 'sent',
      },
      {
        id: 'm4',
        author: 'bluebird.ops',
        sender: 'peer',
        body: 'Received. Confirming lockers 8 through 12 are synced.',
        sentAt: '07:25',
      },
    ],
  },
  {
    id: 'echo-field',
    name: 'Field Team Echo',
    preview: 'Low visibility in corridor 9. Switching to burst mode.',
    unread: 1,
    lastActivity: '31m',
    messages: [
      {
        id: 'm5',
        author: 'echo.1',
        sender: 'peer',
        body: 'Low visibility in corridor 9. Switching to burst messaging.',
        sentAt: '06:58',
      },
      {
        id: 'm6',
        author: 'You',
        sender: 'self',
        body: 'Use narrowcast and keep payloads under 12KB until link clears.',
        sentAt: '07:02',
        status: 'delivered',
      },
    ],
  },
]

export function findThreadById(threadId: string | undefined): ChatThread | undefined {
  if (!threadId) {
    return undefined
  }
  return chatThreads.find((thread) => thread.id === threadId)
}
