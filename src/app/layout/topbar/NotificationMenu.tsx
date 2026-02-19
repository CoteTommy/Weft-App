import { useEffect, useMemo, useRef, useState } from 'react'

import clsx from 'clsx'
import { Bell, BellRing, CheckCheck, CircleAlert, MessageSquare, Trash2 } from 'lucide-react'

import type { AppNotification } from '@shared/runtime/notifications'
import { formatRelativeFromNow } from '@shared/utils/time'

type NotificationMenuProps = {
  notifications: AppNotification[]
  unreadCount: number
  onMarkRead: (id: string) => void
  onMarkAllRead: () => void
  onClearAll: () => void
  onOpenThread: (threadId: string) => void
}

export function NotificationMenu({
  notifications,
  unreadCount,
  onMarkRead,
  onMarkAllRead,
  onClearAll,
  onOpenThread,
}: NotificationMenuProps) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const recentNotifications = useMemo(() => notifications.slice(0, 40), [notifications])

  useEffect(() => {
    if (!open) {
      return
    }
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      const inNotifications = menuRef.current?.contains(target)
      if (!inNotifications) {
        setOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div className="relative" ref={menuRef}>
      <button
        className={clsx(
          'inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition',
          open
            ? 'border-blue-300 bg-blue-50 text-blue-700'
            : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
        )}
        onClick={() => {
          setOpen(previous => !previous)
        }}
      >
        {unreadCount > 0 ? <BellRing className="h-3.5 w-3.5" /> : <Bell className="h-3.5 w-3.5" />}
        Notifications
        {unreadCount > 0 ? (
          <span className="rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] leading-none text-white">
            {unreadCount}
          </span>
        ) : null}
      </button>
      <div
        aria-hidden={!open}
        className={clsx(
          'motion-gpu absolute top-[calc(100%+0.5rem)] right-0 z-30 w-[min(360px,92vw)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_22px_45px_-28px_rgba(15,23,42,0.55)] transition duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
          open
            ? 'pointer-events-auto visible translate-y-0 scale-100 opacity-100'
            : 'pointer-events-none invisible -translate-y-1 scale-[0.985] opacity-0'
        )}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
          <p className="text-xs font-semibold tracking-[0.14em] text-slate-500 uppercase">Inbox</p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onMarkAllRead}
              className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              <CheckCheck className="mr-1 inline h-3 w-3" />
              Read
            </button>
            <button
              type="button"
              onClick={onClearAll}
              className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              <Trash2 className="mr-1 inline h-3 w-3" />
              Clear
            </button>
          </div>
        </div>
        {recentNotifications.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-slate-500">No notifications yet.</div>
        ) : (
          <div className="max-h-80 overflow-y-auto p-2">
            <div className="space-y-1.5">
              {recentNotifications.map(notification => (
                <div
                  key={notification.id}
                  className={clsx(
                    'rounded-xl border px-2.5 py-2 transition',
                    notification.read
                      ? 'border-slate-100 bg-slate-50/50'
                      : 'border-blue-100 bg-blue-50/60'
                  )}
                >
                  <div className="flex items-start gap-2">
                    <div className="mt-0.5 rounded-full bg-slate-100 p-1 text-slate-500">
                      {notification.kind === 'message' ? (
                        <MessageSquare className="h-3.5 w-3.5" />
                      ) : (
                        <CircleAlert className="h-3.5 w-3.5" />
                      )}
                    </div>
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => {
                        onMarkRead(notification.id)
                        if (notification.threadId) {
                          onOpenThread(notification.threadId)
                          setOpen(false)
                        }
                      }}
                    >
                      <p className="truncate text-xs font-semibold text-slate-900">
                        {notification.title}
                      </p>
                      <p className="mt-0.5 line-clamp-2 text-xs text-slate-600">
                        {notification.body}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-400">
                        {formatRelativeFromNow(notification.createdAtMs)}
                      </p>
                    </button>
                    {!notification.read ? (
                      <button
                        type="button"
                        onClick={() => {
                          onMarkRead(notification.id)
                        }}
                        className="rounded-lg border border-slate-200 px-1.5 py-1 text-[10px] font-semibold text-slate-500 transition hover:bg-white"
                      >
                        Mark
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
