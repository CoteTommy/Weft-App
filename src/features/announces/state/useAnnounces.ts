import { useCallback, useEffect, useRef, useState } from 'react'
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
    void refresh()
    const intervalId = window.setInterval(() => {
      void refresh()
    }, 6_000)

    return () => {
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
