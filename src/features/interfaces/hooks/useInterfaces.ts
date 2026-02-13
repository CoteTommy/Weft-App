import { useCallback, useEffect, useState } from 'react'

import type { InterfaceItem, InterfaceMetrics } from '@shared/types/interfaces'

import { fetchInterfaceSnapshot } from '../services/interfacesService'

interface UseInterfacesState {
  interfaces: InterfaceItem[]
  metrics: InterfaceMetrics
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

export function useInterfaces(): UseInterfacesState {
  const [interfaces, setInterfaces] = useState<InterfaceItem[]>([])
  const [metrics, setMetrics] = useState<InterfaceMetrics>({
    total: 0,
    enabled: 0,
    disabled: 0,
    byType: {},
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setError(null)
      const snapshot = await fetchInterfaceSnapshot()
      setInterfaces(snapshot.interfaces)
      setMetrics(snapshot.metrics)
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
    interfaces,
    metrics,
    loading,
    error,
    refresh,
  }
}
