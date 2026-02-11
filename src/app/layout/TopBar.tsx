import { useCallback, useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import { RefreshCcw, Wifi, WifiOff } from 'lucide-react'
import { daemonStart, probeLxmf } from '../../lib/lxmf-api'

export function TopBar() {
  const [probing, setProbing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isConnected, setIsConnected] = useState(false)

  const refresh = useCallback(async () => {
    try {
      setProbing(true)
      setError(null)
      const probe = await probeLxmf()
      setIsConnected(probe.rpc.reachable && probe.local.running)
    } catch (probeError) {
      setIsConnected(false)
      setError(probeError instanceof Error ? probeError.message : String(probeError))
    } finally {
      setProbing(false)
    }
  }, [])

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

  return (
    <header className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/70 bg-white/80 px-4 py-3 shadow-[0_15px_40px_-32px_rgba(31,41,55,0.55)]">
      <div>
        <p className="text-sm font-semibold text-slate-900">Weft Desktop</p>
        <p className="text-xs text-slate-500">Simple Reticulum chat for everyday users</p>
      </div>

      <div className="flex items-center gap-2">
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
