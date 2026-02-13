import { useAsyncResource } from '@shared/runtime/useAsyncResource'
import type { NetworkPeerItem } from '@shared/types/network'

import { fetchNetworkPeers } from '../services/networkService'

interface UseNetworkState {
  peers: NetworkPeerItem[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

export function useNetwork(): UseNetworkState {
  const {
    data: peers,
    loading,
    error,
    refresh,
  } = useAsyncResource<NetworkPeerItem[]>(fetchNetworkPeers, [])

  return {
    peers,
    loading,
    error,
    refresh,
  }
}
