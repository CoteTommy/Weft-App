import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import clsx from 'clsx'
import { Activity, CircleAlert, RefreshCcw, Wifi, WifiOff } from 'lucide-react'

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
import { daemonRestart, daemonStart, probeLxmf } from '@lib/lxmf-api'
import type { LxmfProbeReport } from '@lib/lxmf-contract'

import { useNotificationCenter } from '../state/NotificationCenterProvider'
import { NotificationMenu } from './topbar/NotificationMenu'
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
  const [runtimeTarget, setRuntimeTarget] = useState(() => getRuntimeConnectionOptions())
  const [runtimeMismatch, setRuntimeMismatch] = useState<string | null>(null)
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
          <NotificationMenu
            notifications={notifications}
            unreadCount={unreadCount}
            onMarkRead={markRead}
            onMarkAllRead={markAllRead}
            onClearAll={clearAll}
            onOpenThread={threadId => {
              window.dispatchEvent(
                new CustomEvent(OPEN_THREAD_EVENT, {
                  detail: { threadId },
                })
              )
            }}
          />
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
