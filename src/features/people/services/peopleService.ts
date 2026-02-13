import { listLxmfPeers } from '@lib/lxmf-api'
import type { LxmfPeerRecord } from '@lib/lxmf-payloads'
import type { PersonItem, PersonTrust } from '@shared/types/people'
import { shortHash } from '@shared/utils/identity'
import { formatRelativeFromNow } from '@shared/utils/time'

export async function fetchPeople(): Promise<PersonItem[]> {
  const response = await listLxmfPeers()
  return response.peers.map(mapPeerToPerson).sort((a, b) => a.name.localeCompare(b.name))
}

function mapPeerToPerson(peer: LxmfPeerRecord): PersonItem {
  const trust = trustFromSeenCount(peer.seen_count)
  return {
    id: peer.peer,
    name: peer.name ?? shortHash(peer.peer),
    trust,
    lastSeen: formatRelativeFromNow(peer.last_seen * 1000),
  }
}

function trustFromSeenCount(seenCount: number): PersonTrust {
  if (seenCount >= 10) {
    return 'Verified'
  }
  if (seenCount >= 3) {
    return 'Known'
  }
  return 'New'
}
