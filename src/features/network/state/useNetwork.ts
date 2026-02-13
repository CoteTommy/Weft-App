import { useCallback, useEffect, useState } from 'react'
import type { NetworkPeerItem } from '@shared/types/network'
import { fetchNetworkPeers } from '../services/networkService'

interface UseNetworkState {
  peers: NetworkPeerItem[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

export function useNetwork(): UseNetworkState {
  const [peers, setPeers] = useState<NetworkPeerItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setError(null)
      const items = await fetchNetworkPeers()
      setPeers(items)
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
    peers,
    loading,
    error,
    refresh,
  }
}
