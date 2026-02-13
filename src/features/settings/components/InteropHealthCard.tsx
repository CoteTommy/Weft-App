import clsx from 'clsx'

import type { SettingsSnapshot } from '@shared/types/settings'
import { formatRelativeFromNow } from '@shared/utils/time'

interface InteropHealthCardProps {
  interop: SettingsSnapshot['interop']
  onOpenConnectivity: () => void
  onOpenChats: () => void
  onOpenNetwork: () => void
}

export function InteropHealthCard({
  interop,
  onOpenConnectivity,
  onOpenChats,
  onOpenNetwork,
}: InteropHealthCardProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-900">Interop health</p>
          <p className="text-xs text-slate-500">Bidirectional compatibility and route readiness</p>
        </div>
        <span
          className={clsx(
            'rounded-full px-2.5 py-1 text-xs font-semibold',
            interop.status === 'healthy'
              ? 'bg-emerald-100 text-emerald-700'
              : interop.status === 'warning'
                ? 'bg-amber-100 text-amber-800'
                : 'bg-rose-100 text-rose-700'
          )}
        >
          {interop.status === 'healthy'
            ? 'Healthy'
            : interop.status === 'warning'
              ? 'Needs attention'
              : 'Critical'}
        </span>
      </div>

      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
        <Detail label="Expected profile" value={interop.expectedProfile} />
        <Detail label="Active profile" value={interop.actualProfile} warn={!interop.profileMatch} />
        <Detail label="Expected RPC" value={interop.expectedRpc ?? 'auto'} mono />
        <Detail label="Active RPC" value={interop.actualRpc} mono warn={!interop.rpcMatch} />
        <Detail label="Send path" value={interop.sendPath} warn={interop.sendPath !== 'ok'} />
        <Detail
          label="Receive path"
          value={interop.receivePath}
          warn={interop.receivePath === 'blocked' || interop.receivePath === 'degraded'}
        />
        <Detail
          label="RPC reachable"
          value={interop.rpcReachable ? 'yes' : 'no'}
          warn={!interop.rpcReachable}
        />
        <Detail
          label="Events reachable"
          value={interop.eventsReachable ? 'yes' : 'no'}
          warn={!interop.eventsReachable}
        />
        <Detail label="Last inbound" value={formatLastSeen(interop.lastInboundTs)} />
        <Detail label="Last outbound" value={formatLastSeen(interop.lastOutboundTs)} />
        <Detail
          label="Outbound pending"
          value={String(interop.outboundPending)}
          warn={interop.outboundPending > 0}
        />
        <Detail
          label="Outbound failed"
          value={String(interop.outboundFailed)}
          warn={interop.outboundFailed > 0}
        />
        <Detail
          label="Relay selected"
          value={interop.relaySelected ? 'yes' : 'no'}
          warn={!interop.relaySelected}
        />
        <Detail
          label="Propagation nodes"
          value={String(interop.propagationNodes)}
          warn={interop.propagationNodes === 0}
        />
      </div>

      {interop.findings.length > 0 ? (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs font-semibold text-amber-900">Findings</p>
          <ul className="mt-1 space-y-1 text-xs text-amber-900">
            {interop.findings.map(finding => (
              <li key={finding}>{finding}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          No interop blockers detected for this profile/RPC target.
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onOpenConnectivity}
          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          Open connectivity
        </button>
        <button
          type="button"
          onClick={onOpenNetwork}
          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          Open network
        </button>
        <button
          type="button"
          onClick={onOpenChats}
          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          Open chats
        </button>
      </div>
    </div>
  )
}

function Detail({
  label,
  value,
  mono = false,
  warn = false,
}: {
  label: string
  value: string
  mono?: boolean
  warn?: boolean
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p
        className={clsx(
          'mt-0.5 text-xs text-slate-700',
          mono ? 'font-mono break-all' : '',
          warn ? 'text-amber-800' : ''
        )}
      >
        {value}
      </p>
    </div>
  )
}

function formatLastSeen(timestampMs: number | null): string {
  if (!timestampMs) {
    return 'never'
  }
  return `${formatRelativeFromNow(timestampMs)} ago`
}
