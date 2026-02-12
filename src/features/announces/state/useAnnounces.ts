import { useCallback, useEffect, useRef, useState } from 'react'
import { startLxmfEventPump, subscribeLxmfEvents } from '../../../lib/lxmf-api'
import type { AnnounceItem } from '../../../shared/types/announces'
import { fetchAnnounces, triggerAnnounceNow } from '../services/announcesService'

interface UseAnnouncesState {
  announces: AnnounceItem[]
  loading: boolean
  announcing: boolean
  error: string | null
  refresh: () => Promise<void>
  announceNow: () => Promise<void>
}

export function useAnnounces(): UseAnnouncesState {
  const [announces, setAnnounces] = useState<AnnounceItem[]>([])
  const [loading, setLoading] = useState(true)
  const [announcing, setAnnouncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const refreshingRef = useRef(false)

  const refresh = useCallback(async () => {
    if (refreshingRef.current) {
      return
    }
    refreshingRef.current = true
    try {
      setError(null)
      const items = await fetchAnnounces()
      setAnnounces(items)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError))
    } finally {
      setLoading(false)
      refreshingRef.current = false
    }
  }, [])

  const announceNow = useCallback(async () => {
    try {
      setError(null)
      setAnnouncing(true)
      await triggerAnnounceNow()
      await refresh()
    } catch (announceError) {
      setError(announceError instanceof Error ? announceError.message : String(announceError))
    } finally {
      setAnnouncing(false)
    }
  }, [refresh])

  useEffect(() => {
    let unlisten: (() => void) | null = null
    let disposed = false
    void refresh()
    void startLxmfEventPump().catch(() => {
      // Periodic fallback refresh remains active.
    })
    void subscribeLxmfEvents((event) => {
      if (
        event.event_type === 'announce_received' ||
        event.event_type === 'announce_sent' ||
        event.event_type === 'runtime_started'
      ) {
        void refresh()
      }
    })
      .then((stop) => {
        if (disposed) {
          stop()
          return
        }
        unlisten = stop
      })
      .catch(() => {
        // Ignore listener errors; fallback polling refresh still runs.
      })

    const intervalId = window.setInterval(() => {
      void refresh()
    }, 20_000)

    return () => {
      disposed = true
      unlisten?.()
      window.clearInterval(intervalId)
    }
  }, [refresh])

  return {
    announces,
    loading,
    announcing,
    error,
    refresh,
    announceNow,
  }
}
