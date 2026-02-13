import type { NetworkPeerItem, NetworkPeerStatus, NetworkPeerTrust } from '@shared/types/network'
import { shortHash } from '@shared/utils/identity'
import { formatRelativeFromNow } from '@shared/utils/time'
import { listLxmfPeers } from '@lib/lxmf-api'
import type { LxmfPeerRecord } from '@lib/lxmf-payloads'

export async function fetchNetworkPeers(): Promise<NetworkPeerItem[]> {
  const response = await listLxmfPeers()
  const peers = response.peers.map(mapPeer)
  peers.sort((a, b) => {
    if (a.status !== b.status) {
      return a.status === 'Active' ? -1 : 1
    }
    return b.seenCount - a.seenCount
  })
  return peers
}

function mapPeer(peer: LxmfPeerRecord): NetworkPeerItem {
  const lastSeenMs = peer.last_seen * 1000
  return {
    id: peer.peer,
    name: peer.name ?? shortHash(peer.peer),
    seenCount: peer.seen_count,
    firstSeen: formatShortDate(peer.first_seen * 1000),
    lastSeen: formatRelativeFromNow(lastSeenMs),
    trust: trustFromSeenCount(peer.seen_count),
    status: statusFromLastSeen(lastSeenMs),
  }
}

function trustFromSeenCount(seenCount: number): NetworkPeerTrust {
  if (seenCount >= 10) {
    return 'Verified'
  }
  if (seenCount >= 3) {
    return 'Known'
  }
  return 'New'
}

function statusFromLastSeen(lastSeenMs: number): NetworkPeerStatus {
  const thirtyMinutesMs = 30 * 60 * 1000
  return Date.now() - lastSeenMs <= thirtyMinutesMs ? 'Active' : 'Idle'
}

function formatShortDate(timestampMs: number): string {
  return new Date(timestampMs).toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}
