import { useCallback, useEffect, useMemo, useState } from 'react'

import clsx from 'clsx'

import { PageHeading } from '@shared/ui/PageHeading'
import { Panel } from '@shared/ui/Panel'
import { VirtualizedList } from '@shared/ui/VirtualizedList'
import { shortHash } from '@shared/utils/identity'

import {
  type CommandCenterSnapshot,
  dispatchRawCommand,
  fetchCommandCenterSnapshot,
  runCommandCenterAction,
} from '../services/commandCenterService'

const COMMAND_PRESETS = ['join', 'status', 'sync', 'ping']

export function CommandCenterPage() {
  const [snapshot, setSnapshot] = useState<CommandCenterSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [workingAction, setWorkingAction] = useState<string | null>(null)
  const [destination, setDestination] = useState('')
  const [commandsText, setCommandsText] = useState('join')
  const [commandsHexText, setCommandsHexText] = useState('')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')

  const refresh = useCallback(async () => {
    try {
      setError(null)
      const next = await fetchCommandCenterSnapshot()
      setSnapshot(next)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const targetCandidates = useMemo(() => {
    if (!snapshot) {
      return []
    }
    const map = new Map<string, { value: string; label: string; hint: string }>()
    for (const announce of snapshot.announces) {
      const value = announce.peer.trim().toLowerCase()
      if (!value || map.has(value)) {
        continue
      }
      map.set(value, {
        value,
        label: announce.name?.trim() || shortHash(value, 8),
        hint: 'announce',
      })
    }
    for (const node of snapshot.propagationNodes) {
      const value = node.peer.trim().toLowerCase()
      if (!value || map.has(value)) {
        continue
      }
      map.set(value, {
        value,
        label: node.name?.trim() || shortHash(value, 8),
        hint: 'relay',
      })
    }
    for (const peer of snapshot.peers) {
      const value = peer.peer.trim().toLowerCase()
      if (!value || map.has(value)) {
        continue
      }
      map.set(value, {
        value,
        label: peer.name?.trim() || shortHash(value, 8),
        hint: 'peer',
      })
    }
    return [...map.values()].slice(0, 300)
  }, [snapshot])

  const runAction = async (
    action: 'announce_now' | 'daemon_start' | 'daemon_stop' | 'daemon_restart',
    doneMessage: string
  ) => {
    try {
      setWorkingAction(action)
      setFeedback(null)
      await runCommandCenterAction(action)
      setFeedback(doneMessage)
      await refresh()
    } catch (actionError) {
      setFeedback(actionError instanceof Error ? actionError.message : String(actionError))
    } finally {
      setWorkingAction(null)
    }
  }

  return (
    <div className="grid h-full min-h-0 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <Panel className="flex min-h-0 flex-col">
        <PageHeading
          title="Command Center"
          subtitle="Runtime controls and raw LXMF command dispatch"
          action={
            <button
              type="button"
              onClick={() => {
                void refresh()
              }}
              className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-700"
            >
              Refresh
            </button>
          }
        />
        {error ? (
          <p className="mb-3 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>
        ) : null}
        {feedback ? (
          <p className="mb-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
            {feedback}
          </p>
        ) : null}
        {loading ? <p className="text-sm text-slate-500">Loading command center...</p> : null}

        {snapshot ? (
          <>
            <div className="mb-3 grid gap-2 md:grid-cols-3">
              <SummaryTile
                label="Runtime"
                value={snapshot.status.running ? 'Running' : 'Stopped'}
                tone={snapshot.status.running ? 'ok' : 'warn'}
              />
              <SummaryTile label="Peers" value={String(snapshot.peers.length)} />
              <SummaryTile label="Relays" value={String(snapshot.propagationNodes.length)} />
            </div>

            <div className="mb-3 rounded-2xl border border-slate-200 bg-white p-3">
              <p className="text-xs font-semibold tracking-[0.14em] text-slate-500 uppercase">
                Quick controls
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <ActionButton
                  busy={workingAction === 'announce_now'}
                  onClick={() => {
                    void runAction('announce_now', 'Announce sent.')
                  }}
                >
                  Announce now
                </ActionButton>
                <ActionButton
                  busy={workingAction === 'daemon_start'}
                  onClick={() => {
                    void runAction('daemon_start', 'Daemon started.')
                  }}
                >
                  Start daemon
                </ActionButton>
                <ActionButton
                  busy={workingAction === 'daemon_restart'}
                  onClick={() => {
                    void runAction('daemon_restart', 'Daemon restarted.')
                  }}
                >
                  Restart daemon
                </ActionButton>
                <ActionButton
                  busy={workingAction === 'daemon_stop'}
                  onClick={() => {
                    void runAction('daemon_stop', 'Daemon stopped.')
                  }}
                  warn
                >
                  Stop daemon
                </ActionButton>
              </div>
            </div>

            <form
              className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-3"
              onSubmit={event => {
                event.preventDefault()
                void (async () => {
                  try {
                    setWorkingAction('send')
                    setFeedback(null)
                    const resolved = await dispatchRawCommand({
                      destination,
                      commandsText,
                      commandsHexText,
                      title,
                      content,
                    })
                    setFeedback(`Command queued to ${shortHash(resolved, 8)}.`)
                    setContent('')
                    await refresh()
                  } catch (sendError) {
                    setFeedback(sendError instanceof Error ? sendError.message : String(sendError))
                  } finally {
                    setWorkingAction(null)
                  }
                })()
              }}
            >
              <p className="text-xs font-semibold tracking-[0.14em] text-slate-500 uppercase">
                Raw command dispatch
              </p>
              <input
                value={destination}
                onChange={event => setDestination(event.target.value)}
                className="h-10 rounded-xl border border-slate-200 px-3 text-sm text-slate-800 transition outline-none focus:border-blue-300"
                placeholder="Destination hash"
              />
              <div className="flex flex-wrap gap-1.5">
                {COMMAND_PRESETS.map(preset => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      setCommandsText(current => {
                        const existing = current
                          .split(',')
                          .map(entry => entry.trim())
                          .filter(Boolean)
                        if (existing.includes(preset)) {
                          return current
                        }
                        return [...existing, preset].join(', ')
                      })
                    }}
                    className="rounded-full border border-slate-300 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-100"
                  >
                    + {preset}
                  </button>
                ))}
              </div>
              <input
                value={commandsText}
                onChange={event => setCommandsText(event.target.value)}
                className="h-10 rounded-xl border border-slate-200 px-3 text-sm text-slate-800 transition outline-none focus:border-blue-300"
                placeholder="Commands (comma separated), e.g. join,status"
              />
              <input
                value={commandsHexText}
                onChange={event => setCommandsHexText(event.target.value)}
                className="h-10 rounded-xl border border-slate-200 px-3 font-mono text-sm text-slate-800 transition outline-none focus:border-blue-300"
                placeholder="Optional command hex values, e.g. 0a,0b"
              />
              <input
                value={title}
                onChange={event => setTitle(event.target.value)}
                className="h-10 rounded-xl border border-slate-200 px-3 text-sm text-slate-800 transition outline-none focus:border-blue-300"
                placeholder="Optional title"
              />
              <textarea
                value={content}
                onChange={event => setContent(event.target.value)}
                rows={3}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 transition outline-none focus:border-blue-300"
                placeholder="Optional content body"
              />
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-slate-500">
                  Profile: {snapshot.status.profile} • RPC: {snapshot.status.rpc}
                </p>
                <button
                  type="submit"
                  disabled={workingAction === 'send'}
                  className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {workingAction === 'send' ? 'Sending...' : 'Send command'}
                </button>
              </div>
            </form>
          </>
        ) : null}
      </Panel>

      <Panel className="flex min-h-0 flex-col">
        <PageHeading title="Targets" subtitle="Click to set destination quickly" />
        {!snapshot ? <p className="text-sm text-slate-500">No snapshot yet.</p> : null}
        {snapshot && targetCandidates.length === 0 ? (
          <p className="text-sm text-slate-500">No announce/peer targets available yet.</p>
        ) : null}
        {snapshot && targetCandidates.length > 0 ? (
          <VirtualizedList
            items={targetCandidates}
            estimateItemHeight={68}
            className="min-h-0 flex-1 overflow-y-auto pr-1"
            listClassName="pb-1"
            getKey={entry => entry.value}
            renderItem={entry => (
              <div className="py-1">
                <button
                  type="button"
                  onClick={() => {
                    setDestination(entry.value)
                    setFeedback(`Target selected from ${entry.hint}: ${shortHash(entry.value, 8)}`)
                  }}
                  className={clsx(
                    'w-full rounded-xl border px-3 py-2 text-left transition',
                    destination.trim().toLowerCase() === entry.value
                      ? 'border-blue-300 bg-blue-50'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                  )}
                >
                  <p className="truncate text-sm font-semibold text-slate-900">{entry.label}</p>
                  <p className="truncate text-[11px] text-slate-500">{entry.value}</p>
                  <p className="mt-0.5 text-[11px] font-semibold tracking-wide text-slate-400 uppercase">
                    {entry.hint}
                  </p>
                </button>
              </div>
            )}
          />
        ) : null}
        {snapshot ? (
          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
            <p>Probe RTT: {snapshot.probe.rpc.roundtrip_ms ?? '—'} ms</p>
            <p>Last event: {snapshot.probe.events.event_type ?? '—'}</p>
            <p>Events endpoint: {snapshot.probe.events.endpoint}</p>
          </div>
        ) : null}
      </Panel>
    </div>
  )
}

function ActionButton({
  children,
  busy,
  warn = false,
  onClick,
}: {
  children: string
  busy?: boolean
  warn?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      className={clsx(
        'rounded-xl border px-3 py-2 text-xs font-semibold transition',
        warn
          ? 'border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100'
          : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
        busy ? 'cursor-not-allowed opacity-60' : ''
      )}
    >
      {busy ? 'Working...' : children}
    </button>
  )
}

function SummaryTile({
  label,
  value,
  tone = 'neutral',
}: {
  label: string
  value: string
  tone?: 'neutral' | 'ok' | 'warn'
}) {
  return (
    <div
      className={clsx(
        'rounded-xl border bg-white px-3 py-2',
        tone === 'ok' ? 'border-emerald-200' : '',
        tone === 'warn' ? 'border-amber-200' : 'border-slate-200'
      )}
    >
      <p className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-900">{value}</p>
    </div>
  )
}
