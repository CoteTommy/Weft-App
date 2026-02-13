import { useCallback, useEffect, useState } from 'react'

import { fetchMapPoints, type MapPoint } from '../services/mapService'

interface UseMapPointsState {
  points: MapPoint[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

export function useMapPoints(): UseMapPointsState {
  const [points, setPoints] = useState<MapPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setError(null)
      const next = await fetchMapPoints()
      setPoints(next)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return {
    points,
    loading,
    error,
    refresh,
  }
}
