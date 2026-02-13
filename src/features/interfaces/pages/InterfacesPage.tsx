import { useEffect, useMemo, useRef, useState } from 'react'

import clsx from 'clsx'

import { type ConnectivityMode, updateWeftPreferences } from '@shared/runtime/preferences'
import { FOCUS_SEARCH_EVENT } from '@shared/runtime/shortcuts'
import { PageHeading } from '@shared/ui/PageHeading'
import { Panel } from '@shared/ui/Panel'
import { matchesQuery } from '@shared/utils/search'
import { daemonRestart } from '@lib/lxmf-api'

import { useInterfaces } from '../state/useInterfaces'

export function InterfacesPage() {
  const { interfaces, metrics, loading, error, refresh } = useInterfaces()
  const [query, setQuery] = useState('')
  const [wizardMode, setWizardMode] = useState<ConnectivityMode>('automatic')
  const [wizardProfile, setWizardProfile] = useState('default')
  const [wizardRpc, setWizardRpc] = useState('')
  const [wizardTransport, setWizardTransport] = useState('')
  const [applying, setApplying] = useState(false)
  const [wizardFeedback, setWizardFeedback] = useState<string | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const filteredInterfaces = useMemo(
    () =>
      interfaces.filter((iface) =>
        matchesQuery(query, [iface.name, iface.type, iface.address, iface.status, iface.source]),
      ),
    [interfaces, query],
  )

  useEffect(() => {
    const onFocusSearch = () => {
      searchInputRef.current?.focus()
      searchInputRef.current?.select()
    }
    window.addEventListener(FOCUS_SEARCH_EVENT, onFocusSearch)
    return () => {
      window.removeEventListener(FOCUS_SEARCH_EVENT, onFocusSearch)
    }
  }, [])

  return (
    <Panel className="flex h-full min-h-0 flex-col">
      <PageHeading
        title="Interfaces"
        subtitle="Transport interfaces seen by the daemon"
        action={
          <button
            onClick={() => {
              void refresh()
            }}
            className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-700"
          >
            Refresh
          </button>
        }
      />
      <div className="mb-4 grid gap-2 md:grid-cols-3">
        <SummaryTile label="Total interfaces" value={metrics.total} />
        <SummaryTile label="Enabled" value={metrics.enabled} />
        <SummaryTile label="Disabled" value={metrics.disabled} />
      </div>
      <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
        <p className="text-sm font-semibold text-slate-900">Interface Setup Wizard</p>
        <p className="mt-1 text-xs text-slate-600">
          Apply a connectivity profile and restart runtime in one step.
        </p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {[
            { mode: 'automatic', label: 'Automatic', transport: '' },
            { mode: 'local_only', label: 'Local only', transport: '127.0.0.1:0' },
            { mode: 'lan_shared', label: 'LAN shared', transport: '0.0.0.0:0' },
            { mode: 'custom', label: 'Custom', transport: '' },
          ].map((preset) => (
            <button
              key={preset.mode}
              type="button"
              onClick={() => {
                setWizardMode(preset.mode as ConnectivityMode)
                if (preset.mode !== 'custom') {
                  setWizardTransport(preset.transport)
                }
              }}
              className={clsx(
                'rounded-xl border px-3 py-2 text-left text-xs font-semibold transition',
                wizardMode === preset.mode
                  ? 'border-blue-300 bg-blue-50 text-blue-700'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
              )}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <input
            value={wizardProfile}
            onChange={(event) => setWizardProfile(event.target.value)}
            className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-700 outline-none transition focus:border-blue-300"
            placeholder="Profile (default)"
          />
          <input
            value={wizardRpc}
            onChange={(event) => setWizardRpc(event.target.value)}
            className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-700 outline-none transition focus:border-blue-300"
            placeholder="RPC endpoint"
          />
          <input
            value={wizardTransport}
            onChange={(event) => setWizardTransport(event.target.value)}
            className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-700 outline-none transition focus:border-blue-300"
            placeholder="Transport bind"
          />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={applying}
            onClick={() => {
              void (async () => {
                try {
                  setApplying(true)
                  setWizardFeedback(null)
                  const profile = wizardProfile.trim() || 'default'
                  const rpc = wizardRpc.trim() || undefined
                  const transport = wizardTransport.trim() || undefined
                  updateWeftPreferences({
                    connectivityMode: wizardMode,
                    profile,
                    rpc,
                    transport,
                  })
                  await daemonRestart({
                    managed: true,
                    profile,
                    rpc,
                    transport,
                  })
                  await refresh()
                  setWizardFeedback('Profile applied and daemon restarted.')
                } catch (applyError) {
                  setWizardFeedback(applyError instanceof Error ? applyError.message : String(applyError))
                } finally {
                  setApplying(false)
                }
              })()
            }}
            className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {applying ? 'Applying...' : 'Apply profile'}
          </button>
          {wizardFeedback ? <p className="text-xs text-slate-600">{wizardFeedback}</p> : null}
        </div>
      </div>
      <input
        ref={searchInputRef}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        className="mb-3 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-700 outline-none transition focus:border-blue-300"
        placeholder="Search interfaces by name, type, status, or address"
      />
      {Object.keys(metrics.byType).length > 0 ? (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {Object.entries(metrics.byType).map(([kind, count]) => (
            <span
              key={kind}
              className="rounded-full border border-slate-200 bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700"
            >
              {kind}: {count}
            </span>
          ))}
        </div>
      ) : null}
      {loading ? <p className="text-sm text-slate-500">Loading interfaces...</p> : null}
      {error ? <p className="mb-2 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p> : null}
      {!loading && interfaces.length === 0 ? (
        <p className="text-sm text-slate-500">No interface data is available yet.</p>
      ) : null}
      {!loading && interfaces.length > 0 && filteredInterfaces.length === 0 ? (
        <p className="text-sm text-slate-500">No interfaces match your search.</p>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <ul className="space-y-2">
          {filteredInterfaces.map((iface) => (
            <li
              key={iface.id}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 transition-colors hover:border-slate-300 hover:bg-slate-50/70"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">{iface.name}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {iface.type} • {iface.address} • {iface.source}
                  </p>
                </div>
                <span
                  className={clsx(
                    'rounded-full px-2 py-1 text-xs font-semibold',
                    iface.status === 'Enabled'
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-slate-100 text-slate-700',
                  )}
                >
                  {iface.status}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Panel>
  )
}

interface SummaryTileProps {
  label: string
  value: number
}

function SummaryTile({ label, value }: SummaryTileProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
    </div>
  )
}
