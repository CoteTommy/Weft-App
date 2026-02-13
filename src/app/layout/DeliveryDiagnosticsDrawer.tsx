import { useEffect, useMemo } from 'react'
import clsx from 'clsx'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { CircleAlert, Loader2, ShieldCheck, Wrench } from 'lucide-react'
import type { LxmfDaemonLocalStatus, LxmfProbeReport } from '../../lib/lxmf-contract'
import type {
  LxmfDeliveryTraceEntry,
  LxmfInterfaceListResponse,
  LxmfOutboundPropagationNodeResponse,
  LxmfPropagationNodeListResponse,
} from '../../lib/lxmf-payloads'
import type { LxmfProfileInfo } from '../../lib/lxmf-api'
import { formatRelativeFromNow } from '../../shared/utils/time'
import type { OfflineQueueEntry } from '../../features/chats/state/offlineQueue'

export interface DeliveryDiagnosticsSnapshot {
  capturedAtMs: number
  status: LxmfDaemonLocalStatus
  probe: LxmfProbeReport
  profile: LxmfProfileInfo | null
  outboundNode: LxmfOutboundPropagationNodeResponse
  propagationNodes: LxmfPropagationNodeListResponse
  interfaces: LxmfInterfaceListResponse
  outboundMessages: DeliveryDiagnosticsMessageSnapshot[]
}

export interface DeliveryDiagnosticsMessageSnapshot {
  id: string
  destination: string
  timestamp: number
  receiptStatus: string | null
  transitions: LxmfDeliveryTraceEntry[]
}

export interface RecoveryEvent {
  id: string
  category: 'runtime' | 'profile' | 'relay'
  status: 'success' | 'failed' | 'running' | 'info'
  detail: string
  atMs: number
}

interface DeliveryDiagnosticsDrawerProps {
  open: boolean
  loading: boolean
  error: string | null
  snapshot: DeliveryDiagnosticsSnapshot | null
  runtimeTarget: { profile?: string; rpc?: string }
  runtimeMismatch: string | null
  recoveryEvents: RecoveryEvent[]
  queueEntries: OfflineQueueEntry[]
  onClose: () => void
  onRefresh: () => void
  onOpenConnectivity: () => void
  onRunRecovery: () => void
  onQueueRetryNow: (queueId: string) => void
  onQueuePause: (queueId: string) => void
  onQueueResume: (queueId: string) => void
  onQueueRemove: (queueId: string) => void
  onQueueClear: () => void
}

export function DeliveryDiagnosticsDrawer({
  open,
  loading,
  error,
  snapshot,
  runtimeTarget,
  runtimeMismatch,
  recoveryEvents,
  queueEntries,
  onClose,
  onRefresh,
  onOpenConnectivity,
  onRunRecovery,
  onQueueRetryNow,
  onQueuePause,
  onQueueResume,
  onQueueRemove,
  onQueueClear,
}: DeliveryDiagnosticsDrawerProps) {
  const reduceMotion = useReducedMotion()
  const queuePending = useMemo(
    () => queueEntries.filter((entry) => entry.status === 'queued').length,
    [queueEntries],
  )

  useEffect(() => {
    if (!open) {
      return
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose, open])

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-50 flex justify-end bg-slate-950/28"
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={reduceMotion ? undefined : { opacity: 1 }}
          exit={reduceMotion ? undefined : { opacity: 0 }}
          onClick={onClose}
        >
          <motion.aside
            className="h-full w-[min(520px,100vw)] border-l border-slate-200 bg-white shadow-[0_24px_55px_-26px_rgba(15,23,42,0.5)]"
            initial={reduceMotion ? false : { x: 28, opacity: 0.96 }}
            animate={reduceMotion ? undefined : { x: 0, opacity: 1 }}
            exit={reduceMotion ? undefined : { x: 32, opacity: 0.96 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex h-full min-h-0 flex-col">
              <header className="border-b border-slate-200 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Delivery diagnostics</p>
                    <p className="text-xs text-slate-500">
                      Path + fallback + recovery + offline queue controls
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    Close
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={onRefresh}
                    disabled={loading}
                    className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
                  >
                    {loading ? 'Refreshing...' : 'Refresh'}
                  </button>
                  <button
                    type="button"
                    onClick={onRunRecovery}
                    className="inline-flex items-center gap-1 rounded-lg border border-blue-300 bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-100"
                  >
                    <Wrench className="h-3.5 w-3.5" />
                    Run auto recovery
                  </button>
                  {runtimeMismatch ? (
                    <button
                      type="button"
                      onClick={onOpenConnectivity}
                      className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-800 transition hover:bg-amber-100"
                    >
                      <CircleAlert className="h-3.5 w-3.5" />
                      Resolve runtime target
                    </button>
                  ) : null}
                </div>
              </header>

              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
                {error ? (
                  <section className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                    {error}
                  </section>
                ) : null}

                <section className="rounded-2xl border border-slate-200 bg-slate-50/75 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                    Runtime
                  </p>
                  <div className="mt-2 space-y-1.5 text-xs text-slate-700">
                    <DetailRow label="Expected profile" value={runtimeTarget.profile ?? 'default'} />
                    <DetailRow label="Expected RPC" value={runtimeTarget.rpc ?? 'auto'} mono />
                    <DetailRow label="Queue pending" value={String(queuePending)} />
                    <DetailRow
                      label="Captured"
                      value={snapshot ? formatRelativeFromNow(snapshot.capturedAtMs) : '—'}
                    />
                    {snapshot ? (
                      <>
                        <DetailRow label="Runtime profile" value={snapshot.status.profile} />
                        <DetailRow label="Runtime RPC" value={snapshot.status.rpc} mono />
                        <DetailRow label="Display name" value={snapshot.profile?.displayName ?? '—'} />
                        <DetailRow label="Relay selected" value={snapshot.outboundNode.peer ?? 'none'} mono />
                      </>
                    ) : null}
                  </div>
                  {runtimeMismatch ? (
                    <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-900">
                      {runtimeMismatch}
                    </p>
                  ) : null}
                </section>

                <section className="rounded-2xl border border-slate-200 bg-white p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                      Auto Recovery
                    </p>
                    <ShieldCheck className="h-4 w-4 text-slate-400" />
                  </div>
                  {recoveryEvents.length === 0 ? (
                    <p className="mt-2 text-xs text-slate-500">No automatic recovery actions yet.</p>
                  ) : (
                    <ul className="mt-2 space-y-1.5">
                      {recoveryEvents.slice(0, 8).map((entry) => (
                        <li
                          key={entry.id}
                          className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 text-[11px]"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className={clsx('font-semibold', recoveryToneClass(entry.status))}>
                              {entry.category} • {entry.status}
                            </span>
                            <span className="text-slate-400">{formatRelativeFromNow(entry.atMs)}</span>
                          </div>
                          <p className="mt-1 text-slate-600">{entry.detail}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section className="rounded-2xl border border-slate-200 bg-white p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                    Delivery traces
                  </p>
                  {!snapshot || snapshot.outboundMessages.length === 0 ? (
                    <p className="mt-2 text-xs text-slate-500">No outbound traces loaded.</p>
                  ) : (
                    <div className="mt-2 space-y-2">
                      {snapshot.outboundMessages.map((message) => {
                        const diagnostics = summarizeTrace(message)
                        return (
                          <article key={message.id} className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="truncate font-mono text-[11px] text-slate-700">{message.id}</p>
                                <p className="truncate text-[11px] text-slate-500">
                                  to {shortHash(message.destination)}
                                </p>
                              </div>
                              <span
                                className={clsx(
                                  'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                                  statusToneClass(diagnostics.latestStatus),
                                )}
                              >
                                {diagnostics.latestStatus}
                              </span>
                            </div>
                            <div className="mt-2 space-y-1 text-[11px] text-slate-600">
                              <DetailRow label="Path used" value={diagnostics.pathUsed} />
                              <DetailRow label="Fallback step" value={diagnostics.fallbackStep} />
                              <DetailRow label="Latest failure reason" value={diagnostics.latestFailureReason} />
                            </div>
                          </article>
                        )
                      })}
                    </div>
                  )}
                </section>

                <section className="rounded-2xl border border-slate-200 bg-white p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                      Offline queue
                    </p>
                    {queueEntries.length > 0 ? (
                      <button
                        type="button"
                        onClick={onQueueClear}
                        className="rounded-lg border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50"
                      >
                        Clear all
                      </button>
                    ) : null}
                  </div>
                  {queueEntries.length === 0 ? (
                    <p className="mt-2 text-xs text-slate-500">Offline queue is empty.</p>
                  ) : (
                    <ul className="mt-2 space-y-2">
                      {queueEntries.map((entry) => (
                        <li key={entry.id} className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate font-mono text-[11px] text-slate-700">{entry.id}</p>
                              <p className="truncate text-[11px] text-slate-500">{shortHash(entry.destination)}</p>
                            </div>
                            <span
                              className={clsx(
                                'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                                queueStatusToneClass(entry.status),
                              )}
                            >
                              {entry.status}
                            </span>
                          </div>
                          <div className="mt-2 space-y-1 text-[11px] text-slate-600">
                            <DetailRow label="Attempts" value={String(entry.attempts)} />
                            <DetailRow label="Next retry" value={formatRelativeFromNow(entry.nextRetryAtMs)} />
                            <DetailRow label="Reason" value={entry.reason ?? entry.lastError ?? '—'} />
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            <button
                              type="button"
                              onClick={() => onQueueRetryNow(entry.id)}
                              className="rounded-lg border border-blue-300 bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700 transition hover:bg-blue-100"
                            >
                              Retry now
                            </button>
                            {entry.status === 'paused' ? (
                              <button
                                type="button"
                                onClick={() => onQueueResume(entry.id)}
                                className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-100"
                              >
                                Resume
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => onQueuePause(entry.id)}
                                className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-100"
                              >
                                Pause
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => onQueueRemove(entry.id)}
                              className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-100"
                            >
                              Remove
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>

              {loading ? (
                <div className="border-t border-slate-200 px-4 py-2 text-xs text-slate-500">
                  <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" />
                  Loading diagnostics...
                </div>
              ) : null}
            </div>
          </motion.aside>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

function summarizeTrace(message: DeliveryDiagnosticsMessageSnapshot): {
  latestStatus: string
  pathUsed: string
  fallbackStep: string
  latestFailureReason: string
} {
  const transitions = message.transitions
  const latest = transitions.at(-1)
  const latestStatus = latest?.status ?? message.receiptStatus ?? 'unknown'
  const methods = uniqueMethods(transitions, message.receiptStatus)
  const pathUsed = methods.length > 0 ? methods[methods.length - 1] : 'unknown'
  const fallbackStep =
    methods.length > 1 ? `${methods[0]} -> ${methods[methods.length - 1]}` : 'none'
  const latestFailureReason =
    latestFailure(transitions) ?? (isFailureStatus(latestStatus) ? latestStatus : '—')
  return {
    latestStatus,
    pathUsed,
    fallbackStep,
    latestFailureReason,
  }
}

function uniqueMethods(transitions: LxmfDeliveryTraceEntry[], receiptStatus: string | null): string[] {
  const statuses = transitions.map((entry) => entry.status)
  if (receiptStatus) {
    statuses.push(receiptStatus)
  }
  const methods: string[] = []
  for (const status of statuses) {
    const method = methodFromStatus(status)
    if (!method || methods.includes(method)) {
      continue
    }
    methods.push(method)
  }
  return methods
}

function methodFromStatus(status: string): string | null {
  const normalized = status.toLowerCase()
  if (normalized.includes('propagated') || normalized.includes('relay')) {
    return 'propagated relay'
  }
  if (normalized.includes('opportunistic')) {
    return 'opportunistic'
  }
  if (normalized.includes('direct') || normalized.includes('link')) {
    return 'direct link'
  }
  if (normalized.includes('paper')) {
    return 'paper'
  }
  return null
}

function latestFailure(transitions: LxmfDeliveryTraceEntry[]): string | null {
  for (let index = transitions.length - 1; index >= 0; index -= 1) {
    const entry = transitions[index]
    if (entry.reason_code) {
      return entry.reason_code
    }
    if (isFailureStatus(entry.status)) {
      return entry.status
    }
  }
  return null
}

function isFailureStatus(status: string): boolean {
  const normalized = status.toLowerCase()
  return normalized.startsWith('failed') || normalized.includes('error')
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

function recoveryToneClass(status: RecoveryEvent['status']): string {
  if (status === 'success') {
    return 'text-emerald-700'
  }
  if (status === 'failed') {
    return 'text-rose-700'
  }
  if (status === 'running') {
    return 'text-blue-700'
  }
  return 'text-slate-700'
}

function queueStatusToneClass(status: OfflineQueueEntry['status']): string {
  if (status === 'sending') {
    return 'bg-blue-100 text-blue-700'
  }
  if (status === 'paused') {
    return 'bg-slate-200 text-slate-700'
  }
  return 'bg-amber-100 text-amber-700'
}

function DetailRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <p className="flex items-start justify-between gap-2">
      <span className="text-slate-500">{label}</span>
      <span className={clsx('text-right text-slate-700', mono && 'font-mono text-[11px]')}>{value}</span>
    </p>
  )
}

function shortHash(value: string): string {
  const normalized = value.trim()
  if (normalized.length <= 16) {
    return normalized
  }
  return `${normalized.slice(0, 8)}...${normalized.slice(-6)}`
}
