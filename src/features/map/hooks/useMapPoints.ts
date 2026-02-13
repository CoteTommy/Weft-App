import { useAsyncResource } from '@shared/runtime/useAsyncResource'

import { fetchMapPoints, type MapPoint } from '../services/mapService'

interface UseMapPointsState {
  points: MapPoint[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

export function useMapPoints(): UseMapPointsState {
  const { data: points, loading, error, refresh } = useAsyncResource<MapPoint[]>(fetchMapPoints, [])

  return {
    points,
    loading,
    error,
    refresh,
  }
}
