import { useAsyncResource } from '@shared/runtime/useAsyncResource'
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
  const { data, loading, error, refresh } = useAsyncResource(fetchInterfaceSnapshot, {
    interfaces: [] as InterfaceItem[],
    metrics: {
      total: 0,
      enabled: 0,
      disabled: 0,
      byType: {} as InterfaceMetrics['byType'],
    },
  })

  return {
    interfaces: data.interfaces,
    metrics: data.metrics,
    loading,
    error,
    refresh,
  }
}
