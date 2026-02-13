import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
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
import { useNavigate } from 'react-router-dom'
import {
  daemonStart,
  daemonStatus,
  getLxmfMessageDeliveryTrace,
  getLxmfOutboundPropagationNode,
  getLxmfProfile,
  listLxmfInterfaces,
  listLxmfMessages,
  listLxmfPropagationNodes,
  probeLxmf,
  type LxmfProfileInfo,
} from '../../lib/lxmf-api'
import type { LxmfDaemonLocalStatus, LxmfProbeReport } from '../../lib/lxmf-contract'
import type {
  LxmfDeliveryTraceEntry,
  LxmfInterfaceListResponse,
  LxmfMessageRecord,
  LxmfOutboundPropagationNodeResponse,
  LxmfPropagationNodeListResponse,
} from '../../lib/lxmf-payloads'
import { publishAppNotification } from '../../shared/runtime/notifications'
import {
  getRuntimeConnectionOptions,
  PREFERENCES_UPDATED_EVENT,
  updateWeftPreferences,
} from '../../shared/runtime/preferences'
import { formatRelativeFromNow } from '../../shared/utils/time'
import { useNotificationCenter } from '../state/NotificationCenterProvider'

interface DiagnosticsSnapshot {
  capturedAtMs: number
  status: LxmfDaemonLocalStatus
  probe: LxmfProbeReport
  profile: LxmfProfileInfo | null
  outboundNode: LxmfOutboundPropagationNodeResponse
  propagationNodes: LxmfPropagationNodeListResponse
  interfaces: LxmfInterfaceListResponse
  outboundMessages: DiagnosticsMessageSnapshot[]
}

interface DiagnosticsMessageSnapshot {
  id: string
  destination: string
  timestamp: number
  receiptStatus: string | null
  transitions: LxmfDeliveryTraceEntry[]
}

export function TopBar() {
  const navigate = useNavigate()
  const reduceMotion = useReducedMotion()
  const [probing, setProbing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [notificationMenuOpen, setNotificationMenuOpen] = useState(false)
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false)
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false)
  const [diagnosticsError, setDiagnosticsError] = useState<string | null>(null)
  const [diagnosticsSnapshot, setDiagnosticsSnapshot] = useState<DiagnosticsSnapshot | null>(null)
  const [runtimeTarget, setRuntimeTarget] = useState(() => getRuntimeConnectionOptions())
  const [runtimeMismatch, setRuntimeMismatch] = useState<string | null>(null)
  const notificationMenuRef = useRef<HTMLDivElement | null>(null)
  const diagnosticsRef = useRef<HTMLDivElement | null>(null)
  const hasProbedRef = useRef(false)
  const previousConnectedRef = useRef<boolean | null>(null)
  const previousMismatchRef = useRef<string | null>(null)
  const previousAutoSyncRef = useRef<string | null>(null)
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
      const mismatch = buildRuntimeMismatch(runtimeTarget, probe)
      setIsConnected(nextConnected)
      rememberConnectivity(nextConnected)

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
    } catch (probeError) {
      setIsConnected(false)
      setRuntimeMismatch(null)
      setError(probeError instanceof Error ? probeError.message : String(probeError))
      rememberConnectivity(false)
    } finally {
      setProbing(false)
    }
  }, [rememberConnectivity, runtimeTarget])

  const loadDiagnostics = useCallback(async () => {
    try {
      setDiagnosticsLoading(true)
      setDiagnosticsError(null)
      const [status, probe, profile, outboundNode, propagationNodes, interfaces, messages] = await Promise.all([
        daemonStatus(),
        probeLxmf(),
        getLxmfProfile().catch(() => null),
        getLxmfOutboundPropagationNode().catch(() => ({ peer: null, meta: null })),
        listLxmfPropagationNodes().catch(() => ({ nodes: [], meta: null })),
        listLxmfInterfaces().catch(() => ({ interfaces: [], meta: null })),
        listLxmfMessages().catch(() => ({ messages: [], meta: null })),
      ])
      const messageCandidates = selectDiagnosticsMessages(messages.messages)
      const traceResults = await Promise.all(
        messageCandidates.map(async (message) => {
          const trace = await getLxmfMessageDeliveryTrace(message.id).catch(() => null)
          return {
            id: message.id,
            destination: message.destination,
            timestamp: message.timestamp,
            receiptStatus: message.receipt_status,
            transitions: trace?.transitions ?? [],
          } satisfies DiagnosticsMessageSnapshot
        }),
      )
      setDiagnosticsSnapshot({
        capturedAtMs: Date.now(),
        status,
        probe,
        profile,
        outboundNode,
        propagationNodes,
        interfaces,
        outboundMessages: traceResults,
      })
    } catch (loadError) {
      setDiagnosticsError(loadError instanceof Error ? loadError.message : String(loadError))
    } finally {
      setDiagnosticsLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const interval = window.setInterval(() => {
      void refresh()
    }, 20_000)
    return () => window.clearInterval(interval)
  }, [refresh])

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
    if (!notificationMenuOpen && !diagnosticsOpen) {
      return
    }
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      const inNotifications = notificationMenuRef.current?.contains(target)
      const inDiagnostics = diagnosticsRef.current?.contains(target)
      if (!inNotifications) {
        setNotificationMenuOpen(false)
      }
      if (!inDiagnostics) {
        setDiagnosticsOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setNotificationMenuOpen(false)
        setDiagnosticsOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [diagnosticsOpen, notificationMenuOpen])

  useEffect(() => {
    if (!diagnosticsOpen) {
      return
    }
    if (!diagnosticsSnapshot && !diagnosticsLoading) {
      void loadDiagnostics()
    }
  }, [diagnosticsLoading, diagnosticsOpen, diagnosticsSnapshot, loadDiagnostics])

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
          <AnimatePresence>
            {notificationMenuOpen ? (
              <motion.div
                initial={reduceMotion ? false : { opacity: 0, y: -6, scale: 0.98 }}
                animate={reduceMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
                exit={reduceMotion ? undefined : { opacity: 0, y: -6, scale: 0.985 }}
                transition={{ duration: 0.14 }}
                className="absolute right-0 top-[calc(100%+0.5rem)] z-30 w-[min(360px,92vw)] motion-gpu overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_22px_45px_-28px_rgba(15,23,42,0.55)]"
              >
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
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
        <div className="relative" ref={diagnosticsRef}>
          <button
            className={clsx(
              'inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition',
              diagnosticsOpen
                ? 'border-blue-300 bg-blue-50 text-blue-700'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
            )}
            onClick={() => {
              setDiagnosticsOpen((previous) => !previous)
            }}
          >
            <Activity className="h-3.5 w-3.5" />
            Diagnostics
          </button>
          <AnimatePresence>
            {diagnosticsOpen ? (
              <motion.div
                initial={reduceMotion ? false : { opacity: 0, y: -6, scale: 0.985 }}
                animate={reduceMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
                exit={reduceMotion ? undefined : { opacity: 0, y: -6, scale: 0.985 }}
                transition={{ duration: 0.14 }}
                className="absolute right-0 top-[calc(100%+0.5rem)] z-30 w-[min(420px,94vw)] motion-gpu overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_22px_45px_-28px_rgba(15,23,42,0.55)]"
              >
              <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Runtime diagnostics
                </p>
                <button
                  type="button"
                  onClick={() => {
                    void loadDiagnostics()
                  }}
                  disabled={diagnosticsLoading}
                  className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
                >
                  {diagnosticsLoading ? 'Refreshing...' : 'Refresh'}
                </button>
              </div>
              {diagnosticsError ? (
                <div className="px-3 py-2 text-xs text-rose-700">{diagnosticsError}</div>
              ) : null}
              {diagnosticsSnapshot ? (
                <div className="max-h-96 space-y-2 overflow-y-auto p-3 text-xs text-slate-600">
                  <DetailRowInline label="Captured" value={formatRelativeFromNow(diagnosticsSnapshot.capturedAtMs)} />
                  <DetailRowInline label="Expected profile" value={runtimeTarget.profile ?? 'default'} />
                  <DetailRowInline label="Expected RPC" value={runtimeTarget.rpc ?? 'auto'} mono />
                  <DetailRowInline label="Profile" value={diagnosticsSnapshot.status.profile} />
                  <DetailRowInline label="Display name" value={diagnosticsSnapshot.profile?.displayName ?? '—'} />
                  <DetailRowInline label="RPC endpoint" value={diagnosticsSnapshot.status.rpc} mono />
                  <DetailRowInline
                    label="Connection"
                    value={diagnosticsSnapshot.probe.rpc.reachable && diagnosticsSnapshot.status.running ? 'Healthy' : 'Degraded'}
                  />
                  <DetailRowInline
                    label="RPC latency"
                    value={
                      diagnosticsSnapshot.probe.rpc.roundtrip_ms !== null
                        ? `${diagnosticsSnapshot.probe.rpc.roundtrip_ms} ms`
                        : '—'
                    }
                  />
                  <DetailRowInline
                    label="Identity"
                    value={shortenValue(diagnosticsSnapshot.probe.rpc.identity_hash)}
                    mono
                  />
                  <DetailRowInline
                    label="Selected relay"
                    value={diagnosticsSnapshot.outboundNode.peer ?? 'None selected'}
                    mono
                  />
                  <DetailRowInline
                    label="Propagation nodes"
                    value={String(diagnosticsSnapshot.propagationNodes.nodes.length)}
                  />
                  <DetailRowInline
                    label="Interfaces"
                    value={summarizeInterfaces(diagnosticsSnapshot.interfaces)}
                  />
                  <DetailRowInline
                    label="Last event"
                    value={diagnosticsSnapshot.probe.events.event_type ?? '—'}
                  />
                  {diagnosticsSnapshot.probe.rpc.errors.length > 0 ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-800">
                      {diagnosticsSnapshot.probe.rpc.errors.join(' | ')}
                    </div>
                  ) : null}
                  {runtimeMismatch ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-800">
                      <p className="font-semibold">Runtime mismatch detected</p>
                      <p className="mt-0.5">{runtimeMismatch}</p>
                    </div>
                  ) : null}
                  {diagnosticsSnapshot.outboundMessages.length > 0 ? (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-slate-700">Recent outbound traces</p>
                      {diagnosticsSnapshot.outboundMessages.map((message) => {
                        const latest = message.transitions.at(-1)
                        const latestStatus = latest?.status ?? message.receiptStatus ?? 'unknown'
                        return (
                          <div key={message.id} className="rounded-xl border border-slate-200 bg-slate-50/80 p-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="truncate font-mono text-[11px] text-slate-700">
                                  {shortenValue(message.id)}
                                </p>
                                <p className="truncate text-[11px] text-slate-500">
                                  to {shortenValue(message.destination)}
                                </p>
                              </div>
                              <span
                                className={clsx(
                                  'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold',
                                  statusToneClass(latestStatus),
                                )}
                              >
                                {latestStatus}
                              </span>
                            </div>
                            {message.transitions.length > 0 ? (
                              <div className="mt-2 space-y-1">
                                {message.transitions.slice(-3).map((entry, index) => (
                                  <div key={`${message.id}:${entry.timestamp}:${index}`} className="flex gap-2 text-[10px]">
                                    <span className="w-16 shrink-0 text-slate-400">
                                      {formatRelativeFromNow(entry.timestamp * 1000)}
                                    </span>
                                    <span className="min-w-0 truncate text-slate-600">
                                      {entry.status}
                                      {entry.reason_code ? ` (${entry.reason_code})` : ''}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="mt-2 text-[10px] text-slate-400">
                                No trace transitions recorded yet.
                              </p>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="px-3 py-4 text-xs text-slate-500">
                  {diagnosticsLoading ? 'Loading diagnostics...' : 'No diagnostics loaded.'}
                </div>
              )}
              </motion.div>
            ) : null}
          </AnimatePresence>
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
        {runtimeMismatch ? (
          <button
            type="button"
            onClick={() => {
              void navigate('/settings?section=connectivity')
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
  )
}

function DetailRowInline({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <span className={clsx('max-w-[240px] break-all text-right text-slate-700', mono && 'font-mono text-[11px]')}>
        {value}
      </span>
    </div>
  )
}

function summarizeInterfaces(interfaces: LxmfInterfaceListResponse): string {
  const enabled = interfaces.interfaces.filter((item) => item.enabled).length
  return `${enabled}/${interfaces.interfaces.length} enabled`
}

function shortenValue(value: string | null): string {
  if (!value) {
    return '—'
  }
  if (value.length <= 20) {
    return value
  }
  return `${value.slice(0, 10)}...${value.slice(-8)}`
}

function statusToneClass(status: string): string {
  const normalized = status.trim().toLowerCase()
  if (normalized.startsWith('failed')) {
    return 'bg-rose-100 text-rose-700'
  }
  if (normalized.startsWith('retrying')) {
    return 'bg-amber-100 text-amber-700'
  }
  if (normalized.startsWith('delivered') || normalized.startsWith('sent')) {
    return 'bg-emerald-100 text-emerald-700'
  }
  if (normalized.startsWith('sending') || normalized.startsWith('queued') || normalized.startsWith('outbound')) {
    return 'bg-blue-100 text-blue-700'
  }
  return 'bg-slate-200 text-slate-700'
}

function selectDiagnosticsMessages(messages: LxmfMessageRecord[]): LxmfMessageRecord[] {
  const outbound = messages
    .filter((message) => message.direction === 'out')
    .sort((left, right) => right.timestamp - left.timestamp)
  const priority = outbound.filter((message) => isActionableStatus(message.receipt_status))
  const selected: LxmfMessageRecord[] = []
  const seen = new Set<string>()
  for (const message of [...priority, ...outbound]) {
    if (seen.has(message.id)) {
      continue
    }
    seen.add(message.id)
    selected.push(message)
    if (selected.length >= 4) {
      break
    }
  }
  return selected
}

function isActionableStatus(status: string | null): boolean {
  if (!status) {
    return true
  }
  const normalized = status.trim().toLowerCase()
  return (
    normalized.startsWith('failed') ||
    normalized.startsWith('retrying') ||
    normalized.startsWith('sending') ||
    normalized.startsWith('queued')
  )
}

type RuntimeConnectionTarget = ReturnType<typeof getRuntimeConnectionOptions>

function buildRuntimeMismatch(expected: RuntimeConnectionTarget, probe: LxmfProbeReport): string | null {
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
  right: RuntimeConnectionTarget,
): boolean {
  return (
    normalizeProfile(left.profile) === normalizeProfile(right.profile) &&
    normalizeRpcEndpoint(left.rpc) === normalizeRpcEndpoint(right.rpc)
  )
}
