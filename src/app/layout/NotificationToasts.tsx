import clsx from 'clsx'
import { useEffect, useMemo, useRef, useState } from 'react'
import { BellRing, CircleAlert, MessageSquare, X } from 'lucide-react'
import type { AppNotification } from '../../shared/runtime/notifications'
import { formatRelativeFromNow } from '../../shared/utils/time'
import { useChatsState } from '../../features/chats/state/ChatsProvider'
import { useNotificationCenter } from '../state/NotificationCenterProvider'

const MAX_TOASTS = 4

interface ToastView extends AppNotification {
  openedAtMs: number
}

export function NotificationToasts() {
  const { notifications, markRead } = useNotificationCenter()
  const { setThreadMuted } = useChatsState()
  const [toasts, setToasts] = useState<ToastView[]>([])
  const seenIdsRef = useRef<Set<string>>(new Set())
  const initializedRef = useRef(false)

  useEffect(() => {
    if (!initializedRef.current) {
      for (const notification of notifications) {
        seenIdsRef.current.add(notification.id)
      }
      initializedRef.current = true
      return
    }
    const additions: ToastView[] = []
    for (const notification of notifications) {
      if (seenIdsRef.current.has(notification.id)) {
        continue
      }
      seenIdsRef.current.add(notification.id)
      if (!notification.read) {
        additions.push({
          ...notification,
          openedAtMs: Date.now(),
        })
      }
    }
    if (additions.length === 0) {
      return
    }
    queueMicrotask(() => {
      setToasts((previous) => [...additions, ...previous].slice(0, MAX_TOASTS))
    })
  }, [notifications])

  const sortedToasts = useMemo(
    () => [...toasts].sort((left, right) => right.openedAtMs - left.openedAtMs),
    [toasts],
  )

  const dismiss = (id: string) => {
    setToasts((previous) => previous.filter((toast) => toast.id !== id))
  }

  if (sortedToasts.length === 0) {
    return null
  }

  const openThread = (threadId?: string) => {
    const id = threadId?.trim()
    if (!id) {
      return
    }
    window.dispatchEvent(
      new CustomEvent('weft:open-thread', {
        detail: { threadId: id },
      }),
    )
  }

  return (
    <div className="pointer-events-none absolute bottom-4 right-4 z-40 w-[min(340px,calc(100vw-2rem))] space-y-2">
      {sortedToasts.map((toast) => (
        <ToastCard
          key={toast.id}
          toast={toast}
          onClose={() => {
            markRead(toast.id)
            dismiss(toast.id)
          }}
          onOpen={() => {
            markRead(toast.id)
            openThread(toast.threadId)
            dismiss(toast.id)
          }}
          onReply={() => {
            markRead(toast.id)
            openThread(toast.threadId)
            dismiss(toast.id)
          }}
          onMuteThread={() => {
            const threadId = toast.threadId?.trim()
            if (!threadId) {
              return
            }
            setThreadMuted(threadId, true)
            markRead(toast.id)
            dismiss(toast.id)
          }}
        />
      ))}
    </div>
  )
}

interface ToastCardProps {
  toast: ToastView
  onClose: () => void
  onOpen: () => void
  onReply: () => void
  onMuteThread: () => void
}

function ToastCard({ toast, onClose, onOpen, onReply, onMuteThread }: ToastCardProps) {
  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      onClose()
    }, 6_500)
    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [onClose])

  return (
    <article className="pointer-events-auto overflow-hidden rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-[0_20px_40px_-28px_rgba(15,23,42,0.65)] backdrop-blur">
      <div className="flex items-start gap-2.5">
        <div
          className={clsx(
            'mt-0.5 rounded-full p-1.5',
            toast.kind === 'message'
              ? 'bg-blue-100 text-blue-700'
              : toast.kind === 'connection'
                ? 'bg-amber-100 text-amber-700'
                : 'bg-slate-100 text-slate-700',
          )}
        >
          {toast.kind === 'message' ? (
            <MessageSquare className="h-3.5 w-3.5" />
          ) : toast.kind === 'connection' ? (
            <BellRing className="h-3.5 w-3.5" />
          ) : (
            <CircleAlert className="h-3.5 w-3.5" />
          )}
        </div>
        <button type="button" className="min-w-0 flex-1 text-left" onClick={onOpen}>
          <p className="truncate text-xs font-semibold text-slate-900">{toast.title}</p>
          <p className="mt-0.5 line-clamp-2 text-xs text-slate-600">{toast.body}</p>
          <p className="mt-1 text-[11px] text-slate-400">{formatRelativeFromNow(toast.createdAtMs)}</p>
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-slate-200 p-1 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
          aria-label="Dismiss notification"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {toast.kind === 'message' && toast.threadId ? (
        <div className="mt-2 flex items-center gap-2 pl-9">
          <button
            type="button"
            onClick={onReply}
            className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700 transition hover:bg-blue-100"
          >
            Reply
          </button>
          <button
            type="button"
            onClick={onMuteThread}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50"
          >
            Mute thread
          </button>
        </div>
      ) : null}
    </article>
  )
}
