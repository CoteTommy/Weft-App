export type NetworkPeerTrust = 'Verified' | 'Known' | 'New'
export type NetworkPeerStatus = 'Active' | 'Idle'

export interface NetworkPeerItem {
  id: string
  name: string
  seenCount: number
  firstSeen: string
  lastSeen: string
  trust: NetworkPeerTrust
  status: NetworkPeerStatus
}
