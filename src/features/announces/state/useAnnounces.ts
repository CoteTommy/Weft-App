import { useCallback, useEffect, useRef, useState } from 'react'
import { startLxmfEventPump, subscribeLxmfEvents } from '../../../lib/lxmf-api'
import type { AnnounceItem } from '../../../shared/types/announces'
import {
  fetchAnnouncesPage,
  mapAnnounceEventPayload,
  triggerAnnounceNow,
} from '../services/announcesService'

interface UseAnnouncesState {
  announces: AnnounceItem[]
  loading: boolean
  loadingMore: boolean
  hasMore: boolean
  announcing: boolean
  error: string | null
  refresh: () => Promise<void>
  loadMore: () => Promise<void>
  announceNow: () => Promise<void>
}

export function useAnnounces(): UseAnnouncesState {
  const [announces, setAnnounces] = useState<AnnounceItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [announcing, setAnnouncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const refreshingRef = useRef(false)
  const nextCursorRef = useRef<string | null>(null)

  const refresh = useCallback(async () => {
    if (refreshingRef.current) {
      return
    }
    refreshingRef.current = true
    try {
      setError(null)
      const page = await fetchAnnouncesPage()
      nextCursorRef.current = page.nextCursor
      setHasMore(Boolean(page.nextCursor))
      setAnnounces(page.announces)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError))
    } finally {
      setLoading(false)
      refreshingRef.current = false
    }
  }, [])

  const loadMore = useCallback(async () => {
    if (loadingMore || refreshingRef.current) {
      return
    }
    const cursor = nextCursorRef.current
    if (!cursor) {
      setHasMore(false)
      return
    }

    setLoadingMore(true)
    try {
      setError(null)
      const page = await fetchAnnouncesPage(cursor)
      nextCursorRef.current = page.nextCursor
      setHasMore(Boolean(page.nextCursor))
      setAnnounces((previous) => {
        const seen = new Set(previous.map((entry) => entry.id))
        const merged = [...previous]
        for (const item of page.announces) {
          if (!seen.has(item.id)) {
            merged.push(item)
          }
        }
        return merged
      })
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError))
    } finally {
      setLoadingMore(false)
    }
  }, [loadingMore])

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
      if (event.event_type === 'announce_received') {
        const mapped = mapAnnounceEventPayload(event.payload)
        if (mapped) {
          setAnnounces((existing) => {
            const next = existing.filter((entry) => entry.id !== mapped.id)
            next.unshift(mapped)
            return next
          })
          return
        }
        void refresh()
        return
      }
      if (event.event_type === 'announce_sent' || event.event_type === 'runtime_started') {
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
    loadingMore,
    hasMore,
    announcing,
    error,
    refresh,
    loadMore,
    announceNow,
  }
}
