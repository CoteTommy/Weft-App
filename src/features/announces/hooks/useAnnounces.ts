import { useCallback, useEffect, useRef, useState } from 'react'

import type { AnnounceItem } from '@shared/types/announces'
import { startLxmfEventPump, subscribeLxmfEvents } from '@lib/lxmf-api'

import {
  fetchAnnouncesPage,
  mapAnnounceEventPayload,
  triggerAnnounceNow,
} from '../services/announcesService'

const ANNOUNCE_EVENT_BATCH_MS = 90
const ANNOUNCE_REFRESH_DEBOUNCE_MS = 140
const ANNOUNCE_WATCHDOG_INTERVAL_MS = 10_000
const ANNOUNCE_WATCHDOG_STALE_MS = 45_000

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
  const lastEventAtRef = useRef(0)
  const lastRefreshAtRef = useRef(0)
  const listenerHealthyRef = useRef(false)
  const refreshTimerRef = useRef<number | null>(null)
  const announceBatchTimerRef = useRef<number | null>(null)
  const pendingAnnouncesRef = useRef<AnnounceItem[]>([])

  const refresh = useCallback(async () => {
    if (refreshingRef.current) {
      return
    }
    refreshingRef.current = true
    lastRefreshAtRef.current = Date.now()
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

  const scheduleRefresh = useCallback(
    (delayMs = ANNOUNCE_REFRESH_DEBOUNCE_MS) => {
      if (refreshTimerRef.current !== null) {
        return
      }
      refreshTimerRef.current = window.setTimeout(() => {
        refreshTimerRef.current = null
        void refresh()
      }, delayMs)
    },
    [refresh]
  )

  const enqueueAnnounce = useCallback((announce: AnnounceItem) => {
    pendingAnnouncesRef.current.push(announce)
    if (announceBatchTimerRef.current !== null) {
      return
    }
    announceBatchTimerRef.current = window.setTimeout(() => {
      announceBatchTimerRef.current = null
      const pending = pendingAnnouncesRef.current
      pendingAnnouncesRef.current = []
      if (pending.length === 0) {
        return
      }
      setAnnounces(existing => mergeAnnounces(existing, pending))
    }, ANNOUNCE_EVENT_BATCH_MS)
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
      setAnnounces(previous => {
        const seen = new Set(previous.map(entry => entry.id))
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
      listenerHealthyRef.current = false
    })
    void subscribeLxmfEvents(event => {
      lastEventAtRef.current = Date.now()
      if (event.event_type === 'announce_received') {
        const mapped = mapAnnounceEventPayload(event.payload)
        if (mapped) {
          enqueueAnnounce(mapped)
          return
        }
        scheduleRefresh()
        return
      }
      if (event.event_type === 'announce_sent' || event.event_type === 'runtime_started') {
        scheduleRefresh()
      }
    })
      .then(stop => {
        if (disposed) {
          stop()
          return
        }
        listenerHealthyRef.current = true
        unlisten = stop
      })
      .catch(() => {
        listenerHealthyRef.current = false
      })

    const intervalId = window.setInterval(() => {
      const now = Date.now()
      const freshestAt = Math.max(lastEventAtRef.current, lastRefreshAtRef.current)
      const staleMs = freshestAt === 0 ? Number.POSITIVE_INFINITY : now - freshestAt
      if (!listenerHealthyRef.current || staleMs >= ANNOUNCE_WATCHDOG_STALE_MS) {
        scheduleRefresh()
      }
    }, ANNOUNCE_WATCHDOG_INTERVAL_MS)

    return () => {
      disposed = true
      listenerHealthyRef.current = false
      unlisten?.()
      window.clearInterval(intervalId)
      if (refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current)
        refreshTimerRef.current = null
      }
      if (announceBatchTimerRef.current !== null) {
        window.clearTimeout(announceBatchTimerRef.current)
        announceBatchTimerRef.current = null
      }
      pendingAnnouncesRef.current = []
    }
  }, [enqueueAnnounce, refresh, scheduleRefresh])

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

function mergeAnnounces(existing: AnnounceItem[], incoming: AnnounceItem[]): AnnounceItem[] {
  if (incoming.length === 0) {
    return existing
  }
  let merged = existing
  for (const item of incoming) {
    merged = [item, ...merged.filter(entry => entry.id !== item.id)]
  }
  return merged
}
