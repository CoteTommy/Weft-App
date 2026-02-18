import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import clsx from 'clsx'
import {
  Activity,
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

import { OPEN_THREAD_EVENT } from '@app/config/events'
import { SETTINGS_CONNECTIVITY_ROUTE } from '@app/config/routes'
import { useRuntimeHealth } from '@app/state/RuntimeHealthProvider'
import { useChatActions, useOfflineQueueState } from '@features/chats/state/ChatsProvider'
import { publishAppNotification } from '@shared/runtime/notifications'
import {
  getRuntimeConnectionOptions,
  PREFERENCES_UPDATED_EVENT,
  updateWeftPreferences,
} from '@shared/runtime/preferences'
import { formatRelativeFromNow } from '@shared/utils/time'
import { daemonRestart, daemonStart, probeLxmf } from '@lib/lxmf-api'
import type { LxmfProbeReport } from '@lib/lxmf-contract'

import { useNotificationCenter } from '../state/NotificationCenterProvider'
import { useDeliveryDiagnostics } from './topbar/useDeliveryDiagnostics'
import { useRelayRecovery } from './topbar/useRelayRecovery'

const DeliveryDiagnosticsDrawer = lazy(() =>
  import('./DeliveryDiagnosticsDrawer').then(module => ({
    default: module.DeliveryDiagnosticsDrawer,
  }))
)

function preloadDeliveryDiagnosticsDrawer() {
  void import('./DeliveryDiagnosticsDrawer')
}

export function TopBar() {
  const navigate = useNavigate()
  const [notificationMenuOpen, setNotificationMenuOpen] = useState(false)
  const [runtimeTarget, setRuntimeTarget] = useState(() => getRuntimeConnectionOptions())
  const [runtimeMismatch, setRuntimeMismatch] = useState<string | null>(null)
  const notificationMenuRef = useRef<HTMLDivElement | null>(null)
  const hasProbedRef = useRef(false)
  const previousConnectedRef = useRef<boolean | null>(null)
  const previousMismatchRef = useRef<string | null>(null)
  const previousAutoSyncRef = useRef<string | null>(null)
  const runtimeRecoveryRef = useRef<Set<string>>(new Set())
  const { notifications, unreadCount, markRead, markAllRead, clearAll } = useNotificationCenter()
  const offlineQueue = useOfflineQueueState()
  const { retryQueueNow, pauseQueue, resumeQueue, removeQueue, clearQueue } = useChatActions()
  const {
    snapshot: runtimeSnapshot,
    loading: probing,
    error,
    refresh: refreshRuntimeHealth,
  } = useRuntimeHealth()
  const isConnected = Boolean(
    runtimeSnapshot?.probe.rpc.reachable && runtimeSnapshot?.probe.local.running
  )
  const { recoveryEvents, appendRecoveryEvent, attemptRelayRecovery } =
    useRelayRecovery(offlineQueue)
  const {
    diagnosticsOpen,
    hasOpenedDiagnostics,
    diagnosticsLoading,
    diagnosticsError,
    diagnosticsSnapshot,
    openDiagnostics,
    closeDiagnostics,
    loadDiagnostics,
  } = useDeliveryDiagnostics()

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

  const attemptRuntimeRecovery = useCallback(
    async (probe: LxmfProbeReport, mismatch: string): Promise<boolean> => {
      const signature = [
        normalizeProfile(runtimeTarget.profile),
        normalizeRpcEndpoint(runtimeTarget.rpc) ?? '',
        normalizeProfile(probe.local.profile),
        normalizeRpcEndpoint(probe.local.rpc) ?? '',
      ].join('|')
      if (runtimeRecoveryRef.current.has(signature)) {
        return false
      }
      runtimeRecoveryRef.current.add(signature)
      appendRecoveryEvent({
        category: mismatch.toLowerCase().includes('profile') ? 'profile' : 'runtime',
        status: 'running',
        detail: 'Detected mismatch, restarting runtime on requested target.',
      })
      try {
        await daemonRestart({
          managed: true,
          profile: runtimeTarget.profile,
          rpc: runtimeTarget.rpc,
        })
        const after = await probeLxmf()
        const stillMismatched = buildRuntimeMismatch(runtimeTarget, after)
        if (!stillMismatched) {
          setRuntimeMismatch(null)
          appendRecoveryEvent({
            category: mismatch.toLowerCase().includes('profile') ? 'profile' : 'runtime',
            status: 'success',
            detail: 'Runtime target recovered automatically.',
          })
          return true
        }
        appendRecoveryEvent({
          category: mismatch.toLowerCase().includes('profile') ? 'profile' : 'runtime',
          status: 'failed',
          detail: `Automatic restart did not resolve mismatch (${stillMismatched}).`,
        })
        return false
      } catch (recoveryError) {
        appendRecoveryEvent({
          category: mismatch.toLowerCase().includes('profile') ? 'profile' : 'runtime',
          status: 'failed',
          detail: recoveryError instanceof Error ? recoveryError.message : String(recoveryError),
        })
        return false
      }
    },
    [appendRecoveryEvent, runtimeTarget]
  )

  const reconcileRuntimeProbe = useCallback(
    async (probe: LxmfProbeReport) => {
      const nextConnected = probe.rpc.reachable && probe.local.running
      const mismatch = buildRuntimeMismatch(runtimeTarget, probe)
      rememberConnectivity(nextConnected)

      if (mismatch && nextConnected) {
        const recovered = await attemptRuntimeRecovery(probe, mismatch)
        if (recovered) {
          setRuntimeMismatch(null)
          previousMismatchRef.current = null
          return
        }
      }

      if (mismatch && nextConnected) {
        const syncedTarget = buildSyncedTarget(probe)
        if (!isSameRuntimeTarget(runtimeTarget, syncedTarget)) {
          const signature = [
            normalizeProfile(syncedTarget.profile),
            normalizeRpcEndpoint(syncedTarget.rpc) ?? '',
          ].join('|')
          if (previousAutoSyncRef.current !== signature) {
            previousAutoSyncRef.current = signature
            updateWeftPreferences(syncedTarget)
            setRuntimeTarget(syncedTarget)
            setRuntimeMismatch(null)
            previousMismatchRef.current = null
            appendRecoveryEvent({
              category: mismatch.toLowerCase().includes('profile') ? 'profile' : 'runtime',
              status: 'success',
              detail: `Auto-synced runtime target to ${normalizeProfile(syncedTarget.profile)}.`,
            })
            publishAppNotification({
              kind: 'system',
              title: 'Runtime target auto-synced',
              body: `Now using profile ${normalizeProfile(syncedTarget.profile)} at ${
                syncedTarget.rpc ?? 'auto RPC'
              }.`,
            })
            return
          }
        }
      }

      setRuntimeMismatch(mismatch)
      if (mismatch && mismatch !== previousMismatchRef.current) {
        publishAppNotification({
          kind: 'system',
          title: 'Runtime target mismatch',
          body: mismatch,
        })
      }
      previousMismatchRef.current = mismatch
    },
    [appendRecoveryEvent, attemptRuntimeRecovery, rememberConnectivity, runtimeTarget]
  )

  const refresh = useCallback(async () => {
    const next = await refreshRuntimeHealth()
    if (!next) {
      setRuntimeMismatch(null)
      rememberConnectivity(false)
      return
    }
    await reconcileRuntimeProbe(next.probe)
  }, [reconcileRuntimeProbe, refreshRuntimeHealth, rememberConnectivity])

  const runAutoRecoveryNow = useCallback(async () => {
    await refresh()
    await attemptRelayRecovery(true)
    await loadDiagnostics()
  }, [attemptRelayRecovery, loadDiagnostics, refresh])

  useEffect(() => {
    if (!runtimeSnapshot) {
      if (error) {
        rememberConnectivity(false)
      }
      return
    }
    const timeoutId = window.setTimeout(() => {
      void reconcileRuntimeProbe(runtimeSnapshot.probe)
    }, 0)
    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [error, reconcileRuntimeProbe, rememberConnectivity, runtimeSnapshot])

  useEffect(() => {
    const syncTarget = () => {
      setRuntimeTarget(getRuntimeConnectionOptions())
    }
    syncTarget()
    window.addEventListener(PREFERENCES_UPDATED_EVENT, syncTarget)
    return () => {
      window.removeEventListener(PREFERENCES_UPDATED_EVENT, syncTarget)
    }
  }, [])

  useEffect(() => {
    if (!isConnected) {
      return
    }
    void attemptRelayRecovery(false)
  }, [attemptRelayRecovery, isConnected, offlineQueue])

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
      const target = event.target as Node
      const inNotifications = notificationMenuRef.current?.contains(target)
      if (!inNotifications) {
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

  useEffect(() => {
    if (!diagnosticsOpen) {
      return
    }
    if (!diagnosticsSnapshot && !diagnosticsLoading) {
      void loadDiagnostics()
    }
  }, [diagnosticsLoading, diagnosticsOpen, diagnosticsSnapshot, loadDiagnostics])

  return (
    <>
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
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              )}
              onClick={() => {
                setNotificationMenuOpen(previous => !previous)
              }}
            >
              {unreadCount > 0 ? (
                <BellRing className="h-3.5 w-3.5" />
              ) : (
                <Bell className="h-3.5 w-3.5" />
              )}
              Notifications
              {unreadCount > 0 ? (
                <span className="rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] leading-none text-white">
                  {unreadCount}
                </span>
              ) : null}
            </button>
            <div
              aria-hidden={!notificationMenuOpen}
              className={clsx(
                'motion-gpu absolute top-[calc(100%+0.5rem)] right-0 z-30 w-[min(360px,92vw)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_22px_45px_-28px_rgba(15,23,42,0.55)] transition duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
                notificationMenuOpen
                  ? 'pointer-events-auto visible translate-y-0 scale-100 opacity-100'
                  : 'pointer-events-none invisible -translate-y-1 scale-[0.985] opacity-0'
              )}
            >
              <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
                <p className="text-xs font-semibold tracking-[0.14em] text-slate-500 uppercase">
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
                <div className="px-4 py-6 text-center text-sm text-slate-500">
                  No notifications yet.
                </div>
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
                              markRead(notification.id)
                              if (notification.threadId) {
                                window.dispatchEvent(
                                  new CustomEvent(OPEN_THREAD_EVENT, {
                                    detail: { threadId: notification.threadId },
                                  })
                                )
                                setNotificationMenuOpen(false)
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
          </div>
          <button
            className={clsx(
              'inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition',
              diagnosticsOpen
                ? 'border-blue-300 bg-blue-50 text-blue-700'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
            )}
            onMouseEnter={preloadDeliveryDiagnosticsDrawer}
            onFocus={preloadDeliveryDiagnosticsDrawer}
            onClick={() => {
              openDiagnostics()
            }}
          >
            <Activity className="h-3.5 w-3.5" />
            Diagnostics
            {offlineQueue.length > 0 ? (
              <span className="rounded-full bg-amber-200 px-1.5 py-0.5 text-[10px] text-amber-800">
                {offlineQueue.length}
              </span>
            ) : null}
          </button>
          <span
            className={clsx(
              'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold',
              isConnected ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
            )}
          >
            {isConnected ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
            {statusText}
          </span>
          {runtimeMismatch ? (
            <button
              type="button"
              onClick={() => {
                void navigate(SETTINGS_CONNECTIVITY_ROUTE)
              }}
              className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 transition hover:bg-amber-100"
            >
              <CircleAlert className="h-3.5 w-3.5" />
              Resolve runtime target
            </button>
          ) : null}
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

      {hasOpenedDiagnostics ? (
        <Suspense fallback={null}>
          <DeliveryDiagnosticsDrawer
            open={diagnosticsOpen}
            loading={diagnosticsLoading}
            error={diagnosticsError}
            snapshot={diagnosticsSnapshot}
            runtimeTarget={runtimeTarget}
            runtimeMismatch={runtimeMismatch}
            recoveryEvents={recoveryEvents}
            queueEntries={offlineQueue}
            onClose={() => {
              closeDiagnostics()
            }}
            onRefresh={() => {
              void loadDiagnostics()
            }}
            onOpenConnectivity={() => {
              void navigate(SETTINGS_CONNECTIVITY_ROUTE)
            }}
            onRunRecovery={() => {
              void runAutoRecoveryNow()
            }}
            onQueueRetryNow={queueId => {
              void retryQueueNow(queueId)
            }}
            onQueuePause={pauseQueue}
            onQueueResume={resumeQueue}
            onQueueRemove={removeQueue}
            onQueueClear={clearQueue}
          />
        </Suspense>
      ) : null}
    </>
  )
}

type RuntimeConnectionTarget = ReturnType<typeof getRuntimeConnectionOptions>

function buildRuntimeMismatch(
  expected: RuntimeConnectionTarget,
  probe: LxmfProbeReport
): string | null {
  const expectedProfile = normalizeProfile(expected.profile)
  const actualProfile = normalizeProfile(probe.local.profile)
  const expectedRpc = normalizeRpcEndpoint(expected.rpc)
  const localRpc = normalizeRpcEndpoint(probe.local.rpc)
  const probeRpc = normalizeRpcEndpoint(probe.rpc.endpoint)

  const parts: string[] = []
  if (expectedProfile !== actualProfile) {
    parts.push(`profile is "${actualProfile}" (expected "${expectedProfile}")`)
  }
  if (expectedRpc && expectedRpc !== localRpc && expectedRpc !== probeRpc) {
    parts.push(`rpc is "${probe.local.rpc}" (expected "${expected.rpc}")`)
  }
  if (parts.length === 0) {
    return null
  }
  return `Runtime ${parts.join(' and ')}. Open Connectivity settings to align profile/RPC.`
}

function normalizeProfile(value: string | undefined | null): string {
  const normalized = value?.trim().toLowerCase()
  if (!normalized || normalized === 'default') {
    return 'default'
  }
  return normalized
}

function normalizeRpcEndpoint(value: string | undefined | null): string | null {
  if (!value) {
    return null
  }
  let normalized = value.trim().toLowerCase()
  if (!normalized) {
    return null
  }
  if (normalized.startsWith('http://')) {
    normalized = normalized.slice('http://'.length)
  }
  if (normalized.startsWith('https://')) {
    normalized = normalized.slice('https://'.length)
  }
  normalized = normalized.replace(/\/+$/, '')
  return normalized || null
}

function buildSyncedTarget(probe: LxmfProbeReport): RuntimeConnectionTarget {
  return {
    profile: toPreferenceProfile(probe.local.profile),
    rpc: toPreferenceRpc(probe.local.rpc),
  }
}

function toPreferenceProfile(value: string): string | undefined {
  const normalized = value.trim()
  if (!normalized || normalized.toLowerCase() === 'default') {
    return undefined
  }
  return normalized
}

function toPreferenceRpc(value: string): string | undefined {
  const normalized = value.trim()
  return normalized ? normalized : undefined
}

function isSameRuntimeTarget(
  left: RuntimeConnectionTarget,
  right: RuntimeConnectionTarget
): boolean {
  return (
    normalizeProfile(left.profile) === normalizeProfile(right.profile) &&
    normalizeRpcEndpoint(left.rpc) === normalizeRpcEndpoint(right.rpc)
  )
}
