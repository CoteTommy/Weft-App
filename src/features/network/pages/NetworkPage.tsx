import { useEffect, useMemo, useRef, useState } from 'react'

import clsx from 'clsx'

import { FOCUS_SEARCH_EVENT } from '@shared/runtime/shortcuts'
import { PageHeading } from '@shared/ui/PageHeading'
import { Panel } from '@shared/ui/Panel'
import { matchesQuery } from '@shared/utils/search'

import { useNetwork } from '../hooks/useNetwork'

export function NetworkPage() {
  const { peers, loading, error, refresh } = useNetwork()
  const [query, setQuery] = useState('')
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const filteredPeers = useMemo(
    () =>
      peers.filter(peer =>
        matchesQuery(query, [
          peer.name,
          peer.id,
          peer.status,
          peer.trust,
          peer.firstSeen,
          peer.lastSeen,
          peer.seenCount,
        ])
      ),
    [peers, query]
  )
  const totalPeers = filteredPeers.length
  const activePeers = filteredPeers.filter(peer => peer.status === 'Active').length
  const verifiedPeers = filteredPeers.filter(peer => peer.trust === 'Verified').length

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
        title="Network"
        subtitle="Peer visibility and session health"
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
        <SummaryTile label="Total peers" value={totalPeers} />
        <SummaryTile label="Active peers" value={activePeers} />
        <SummaryTile label="Verified peers" value={verifiedPeers} />
      </div>
      <input
        ref={searchInputRef}
        value={query}
        onChange={event => setQuery(event.target.value)}
        className="mb-3 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-700 outline-none transition focus:border-blue-300"
        placeholder="Search peers by name, hash, trust, or status"
      />

      {loading ? <p className="text-sm text-slate-500">Loading network peers...</p> : null}
      {error ? (
        <p className="mb-2 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>
      ) : null}
      {!loading && peers.length === 0 ? (
        <p className="text-sm text-slate-500">No peers reported yet.</p>
      ) : null}
      {!loading && peers.length > 0 && filteredPeers.length === 0 ? (
        <p className="text-sm text-slate-500">No peers match your search.</p>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <ul className="space-y-2">
          {filteredPeers.map(peer => (
            <li
              key={peer.id}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 transition-colors hover:border-slate-300 hover:bg-slate-50/70"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{peer.name}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Seen {peer.seenCount} times • first seen {peer.firstSeen} • last seen{' '}
                    {peer.lastSeen}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <span
                    className={clsx(
                      'rounded-full px-2 py-1 text-xs font-semibold',
                      peer.status === 'Active'
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-slate-100 text-slate-700'
                    )}
                  >
                    {peer.status}
                  </span>
                  <span className="rounded-full bg-sky-100 px-2 py-1 text-xs font-semibold text-sky-700">
                    {peer.trust}
                  </span>
                </div>
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
