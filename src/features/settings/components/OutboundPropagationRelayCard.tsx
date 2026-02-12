import clsx from 'clsx'
import type { SettingsSnapshot } from '../../../shared/types/settings'
import { shortHash } from '../../../shared/utils/identity'

interface OutboundPropagationRelayCardProps {
  settings: SettingsSnapshot
  propagationPeerDraft: string
  savingPropagationPeer: boolean
  onPropagationPeerDraftChange: (next: string) => void
  onSaveRelay: () => void
  onClearRelay: () => void
  onRefreshNodes: () => void
}

export function OutboundPropagationRelayCard({
  settings,
  propagationPeerDraft,
  savingPropagationPeer,
  onPropagationPeerDraftChange,
  onSaveRelay,
  onClearRelay,
  onRefreshNodes,
}: OutboundPropagationRelayCardProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-slate-700">Outbound propagation relay</p>
        <p className="text-xs text-slate-500">
          Current:{' '}
          {settings.connectivity.outboundPropagationPeer
            ? shortHash(settings.connectivity.outboundPropagationPeer, 8)
            : 'None'}
        </p>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Required when delivery falls back to propagated routing.
      </p>
      <label className="mt-3 block text-xs text-slate-600">
        Relay peer hash
        <input
          value={propagationPeerDraft}
          onChange={(event) => onPropagationPeerDraftChange(event.target.value)}
          className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-blue-300"
          placeholder="2331bf796ca1a72451dbaedb05286cb8"
        />
      </label>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={savingPropagationPeer}
          onClick={onSaveRelay}
          className="h-9 rounded-xl bg-slate-900 px-3 text-xs font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {savingPropagationPeer ? 'Saving...' : 'Save relay'}
        </button>
        <button
          type="button"
          disabled={savingPropagationPeer}
          onClick={onClearRelay}
          className="h-9 rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
        >
          Clear relay
        </button>
        <button
          type="button"
          onClick={onRefreshNodes}
          className="h-9 rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          Refresh nodes
        </button>
      </div>

      <div className="mt-3">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Known propagation nodes
        </p>
        {settings.connectivity.propagationNodes.length ? (
          <div className="mt-2 max-h-48 overflow-y-auto rounded-xl border border-slate-200">
            {settings.connectivity.propagationNodes.map((node) => {
              const isSelected = propagationPeerDraft.trim().toLowerCase() === node.peer
              return (
                <button
                  key={node.peer}
                  type="button"
                  onClick={() => onPropagationPeerDraftChange(node.peer)}
                  className={clsx(
                    'flex w-full items-center justify-between gap-3 border-b border-slate-100 px-3 py-2 text-left text-xs transition last:border-b-0',
                    isSelected
                      ? 'bg-blue-50 text-blue-900'
                      : 'bg-white text-slate-700 hover:bg-slate-50',
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">
                      {node.name?.trim() || shortHash(node.peer, 8)}
                    </span>
                    <span className="block truncate text-[11px] text-slate-500">{node.peer}</span>
                  </span>
                  <span className="shrink-0 text-[11px] text-slate-500">
                    {node.selected ? 'Selected' : ''}
                  </span>
                </button>
              )
            })}
          </div>
        ) : (
          <p className="mt-2 text-xs text-slate-500">
            No propagation nodes discovered yet. Refresh after announces are received.
          </p>
        )}
      </div>
    </div>
  )
}

