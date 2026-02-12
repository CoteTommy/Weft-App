import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import {
  Bell,
  BellRing,
  CheckCheck,
  CircleAlert,
  MessageSquare,
  RefreshCcw,
  Trash2,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { daemonStart, probeLxmf } from '../../lib/lxmf-api'
import { publishAppNotification } from '../../shared/runtime/notifications'
import { formatRelativeFromNow } from '../../shared/utils/time'
import { useNotificationCenter } from '../state/NotificationCenterProvider'

export function TopBar() {
  const [probing, setProbing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [notificationMenuOpen, setNotificationMenuOpen] = useState(false)
  const notificationMenuRef = useRef<HTMLDivElement | null>(null)
  const hasProbedRef = useRef(false)
  const previousConnectedRef = useRef<boolean | null>(null)
  const { notifications, unreadCount, markRead, markAllRead, clearAll } = useNotificationCenter()

  const rememberConnectivity = useCallback((connected: boolean) => {
    const previous = previousConnectedRef.current
    previousConnectedRef.current = connected
    if (!hasProbedRef.current) {
      hasProbedRef.current = true
      return
    }
    if (previous === connected) {
      return
    }
    publishAppNotification({
      kind: 'connection',
      title: connected ? 'Connection restored' : 'Connection lost',
      body: connected
        ? 'Daemon and RPC are reachable again.'
        : 'Daemon or RPC is unreachable. Messages will queue until connection returns.',
    })
  }, [])

  const refresh = useCallback(async () => {
    try {
      setProbing(true)
      setError(null)
      const probe = await probeLxmf()
      const nextConnected = probe.rpc.reachable && probe.local.running
      setIsConnected(nextConnected)
      rememberConnectivity(nextConnected)
    } catch (probeError) {
      setIsConnected(false)
      setError(probeError instanceof Error ? probeError.message : String(probeError))
      rememberConnectivity(false)
    } finally {
      setProbing(false)
    }
  }, [rememberConnectivity])

  useEffect(() => {
    void refresh()
    const interval = window.setInterval(() => {
      void refresh()
    }, 20_000)
    return () => window.clearInterval(interval)
  }, [refresh])

  const statusText = useMemo(() => {
    if (probing) {
      return 'Checking connection...'
    }
    if (isConnected) {
      return 'Connected'
    }
    return error ? 'Offline' : 'Connecting...'
  }, [error, isConnected, probing])

  const recentNotifications = useMemo(() => notifications.slice(0, 40), [notifications])

  useEffect(() => {
    if (!notificationMenuOpen) {
      return
    }
    const onPointerDown = (event: MouseEvent) => {
      if (!notificationMenuRef.current?.contains(event.target as Node)) {
        setNotificationMenuOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setNotificationMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [notificationMenuOpen])

  return (
    <header className="relative mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/70 bg-white/80 px-4 py-3 shadow-[0_15px_40px_-32px_rgba(31,41,55,0.55)]">
      <div>
        <p className="text-sm font-semibold text-slate-900">Weft Desktop</p>
        <p className="text-xs text-slate-500">Simple Reticulum chat for everyday users</p>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative" ref={notificationMenuRef}>
          <button
            className={clsx(
              'inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition',
              notificationMenuOpen
                ? 'border-blue-300 bg-blue-50 text-blue-700'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
            )}
            onClick={() => {
              setNotificationMenuOpen((previous) => !previous)
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
          {notificationMenuOpen ? (
            <div className="absolute right-0 top-[calc(100%+0.5rem)] z-30 w-[min(360px,92vw)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_22px_45px_-28px_rgba(15,23,42,0.55)]">
              <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Inbox
                </p>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      markAllRead()
                    }}
                    className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50"
                  >
                    <CheckCheck className="mr-1 inline h-3 w-3" />
                    Read
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      clearAll()
                    }}
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
                    {recentNotifications.map((notification) => (
                      <div
                        key={notification.id}
                        className={clsx(
                          'rounded-xl border px-2.5 py-2 transition',
                          notification.read
                            ? 'border-slate-100 bg-slate-50/50'
                            : 'border-blue-100 bg-blue-50/60',
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
                              markRead(notification.id)
                              if (notification.threadId) {
                                window.dispatchEvent(
                                  new CustomEvent('weft:open-thread', {
                                    detail: { threadId: notification.threadId },
                                  }),
                                )
                                setNotificationMenuOpen(false)
                              }
                            }}
                          >
                            <p className="truncate text-xs font-semibold text-slate-900">
                              {notification.title}
                            </p>
                            <p className="mt-0.5 line-clamp-2 text-xs text-slate-600">{notification.body}</p>
                            <p className="mt-1 text-[11px] text-slate-400">
                              {formatRelativeFromNow(notification.createdAtMs)}
                            </p>
                          </button>
                          {!notification.read ? (
                            <button
                              type="button"
                              onClick={() => {
                                markRead(notification.id)
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
          ) : null}
        </div>
        <span
          className={clsx(
            'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold',
            isConnected ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700',
          )}
        >
          {isConnected ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
          {statusText}
        </span>
        <button
          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
          disabled={probing}
          onClick={() => {
            void refresh()
          }}
        >
          <RefreshCcw className="h-3.5 w-3.5" />
          Refresh
        </button>
        {!isConnected ? (
          <button
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-700"
            onClick={() => {
              void daemonStart({ managed: true }).then(() => refresh())
            }}
          >
            Reconnect
          </button>
        ) : null}
      </div>
    </header>
  )
}
