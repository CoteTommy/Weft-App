/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'

import { PREFERENCES_UPDATED_EVENT } from '@shared/runtime/preferences'
import { daemonStatus, getLxmfProfile, probeLxmf } from '@lib/lxmf-api'
import type { LxmfProfileInfo } from '@lib/lxmf-api/types'
import type { LxmfDaemonLocalStatus, LxmfProbeReport } from '@lib/lxmf-contract'

const RUNTIME_HEALTH_POLL_INTERVAL_MS = 60_000

export interface RuntimeHealthSnapshot {
  status: LxmfDaemonLocalStatus
  probe: LxmfProbeReport
  profile: LxmfProfileInfo | null
}

interface RuntimeHealthContextValue {
  snapshot: RuntimeHealthSnapshot | null
  loading: boolean
  error: string | null
  refreshedAtMs: number
  refresh: () => Promise<RuntimeHealthSnapshot | null>
}

const RuntimeHealthContext = createContext<RuntimeHealthContextValue | undefined>(undefined)

export function RuntimeHealthProvider({ children }: PropsWithChildren) {
  const [snapshot, setSnapshot] = useState<RuntimeHealthSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshedAtMs, setRefreshedAtMs] = useState(0)
  const refreshingRef = useRef(false)
  const snapshotRef = useRef<RuntimeHealthSnapshot | null>(null)

  useEffect(() => {
    snapshotRef.current = snapshot
  }, [snapshot])

  const refresh = useCallback(async () => {
    if (refreshingRef.current) {
      return snapshotRef.current
    }
    refreshingRef.current = true
    setLoading(true)
    try {
      setError(null)
      const [status, probe, profile] = await Promise.all([
        daemonStatus(),
        probeLxmf(),
        getLxmfProfile().catch(() => null),
      ])
      const next = { status, probe, profile }
      setSnapshot(next)
      setRefreshedAtMs(Date.now())
      return next
    } catch (runtimeError) {
      setError(runtimeError instanceof Error ? runtimeError.message : String(runtimeError))
      return null
    } finally {
      setLoading(false)
      refreshingRef.current = false
    }
  }, [])

  useEffect(() => {
    void refresh()
    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== 'visible') {
        return
      }
      void refresh()
    }, RUNTIME_HEALTH_POLL_INTERVAL_MS)

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void refresh()
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [refresh])

  useEffect(() => {
    const onPreferencesUpdate = () => {
      void refresh()
    }
    window.addEventListener(PREFERENCES_UPDATED_EVENT, onPreferencesUpdate)
    return () => {
      window.removeEventListener(PREFERENCES_UPDATED_EVENT, onPreferencesUpdate)
    }
  }, [refresh])

  return (
    <RuntimeHealthContext.Provider
      value={{
        snapshot,
        loading,
        error,
        refreshedAtMs,
        refresh,
      }}
    >
      {children}
    </RuntimeHealthContext.Provider>
  )
}

export function useRuntimeHealth(): RuntimeHealthContextValue {
  const value = useContext(RuntimeHealthContext)
  if (!value) {
    throw new Error('useRuntimeHealth must be used within RuntimeHealthProvider')
  }
  return value
}
