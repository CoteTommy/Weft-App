import { NavLink } from 'react-router-dom'

import clsx from 'clsx'
import { BellOff, Pin } from 'lucide-react'

import type { ChatThread } from '@shared/types/chat'

interface ThreadListProps {
  threads: ChatThread[]
  compact?: boolean
}

export function ThreadList({ threads, compact = false }: ThreadListProps) {
  return (
    <ul>
      {threads.map(thread => (
        <li key={thread.id} className="py-1">
          <ThreadListRow thread={thread} compact={compact} />
        </li>
      ))}
    </ul>
  )
}

interface ThreadListRowProps {
  thread: ChatThread
  compact?: boolean
}

export function ThreadListRow({ thread, compact = false }: ThreadListRowProps) {
  return (
    <NavLink
      to={`/chats/${thread.id}`}
      className={({ isActive }) =>
        clsx(
          'flex items-start gap-3 rounded-2xl border px-3 py-2.5 transition',
          isActive
            ? 'border-blue-200 bg-blue-50/80'
            : 'border-transparent bg-white hover:border-slate-200 hover:bg-slate-50'
        )
      }
    >
      <div className="mt-0.5 h-8 w-8 shrink-0 rounded-full bg-blue-100 text-center text-xs leading-8 font-semibold text-blue-700">
        {initials(thread.name)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <p className="truncate text-sm font-semibold text-slate-900">{thread.name}</p>
            {thread.pinned ? <Pin className="h-3.5 w-3.5 shrink-0 text-amber-500" /> : null}
            {thread.muted ? <BellOff className="h-3.5 w-3.5 shrink-0 text-slate-400" /> : null}
          </div>
          <span className="text-xs text-slate-400">{thread.lastActivity}</span>
        </div>
        <p className="mt-0.5 truncate text-[11px] text-slate-400">{thread.destination}</p>
        <p className={clsx('mt-0.5 truncate text-slate-500', compact ? 'text-[11px]' : 'text-xs')}>
          {thread.preview}
        </p>
      </div>
      {thread.unread > 0 ? (
        <span className="rounded-full bg-blue-600 px-2 py-0.5 text-xs font-semibold text-white">
          {thread.unread}
        </span>
      ) : null}
    </NavLink>
  )
}

function initials(name: string): string {
  return name
    .split(' ')
    .map(part => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}
