import clsx from 'clsx'
import { NavLink } from 'react-router-dom'
import type { ChatThread } from '../../../shared/types/chat'

interface ThreadListProps {
  threads: ChatThread[]
  compact?: boolean
}

export function ThreadList({ threads, compact = false }: ThreadListProps) {
  return (
    <ul className="space-y-2">
      {threads.map((thread) => (
        <li key={thread.id}>
          <NavLink
            to={`/chats/${thread.id}`}
            className={({ isActive }) =>
              clsx(
                'flex items-start gap-3 rounded-2xl border px-3 py-2.5 transition',
                isActive
                  ? 'border-blue-200 bg-blue-50/80'
                  : 'border-transparent bg-white hover:border-slate-200 hover:bg-slate-50',
              )
            }
          >
            <div className="mt-0.5 h-8 w-8 shrink-0 rounded-full bg-blue-100 text-center text-xs leading-8 font-semibold text-blue-700">
              {initials(thread.name)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-semibold text-slate-900">{thread.name}</p>
                <span className="text-xs text-slate-400">{thread.lastActivity}</span>
              </div>
              {!compact ? <p className="mt-0.5 truncate text-xs text-slate-500">{thread.preview}</p> : null}
            </div>
            {thread.unread > 0 ? (
              <span className="rounded-full bg-blue-600 px-2 py-0.5 text-xs font-semibold text-white">
                {thread.unread}
              </span>
            ) : null}
          </NavLink>
        </li>
      ))}
    </ul>
  )
}

function initials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}
