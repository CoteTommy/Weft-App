import type { AnnounceItem, AnnouncePriorityLabel } from '@shared/types/announces'
import { announceLxmfNow, listLxmfAnnounces, sendLxmfCommand } from '@lib/lxmf-api'
import type { LxmfAnnounceRecord } from '@lib/lxmf-payloads'

interface DerivedAnnounce extends AnnounceItem {
  postedAtMs: number
}

export interface FetchAnnouncesPageResult {
  announces: AnnounceItem[]
  nextCursor: string | null
}

export async function fetchAnnouncesPage(
  cursor?: string | null
): Promise<FetchAnnouncesPageResult> {
  const response = await listLxmfAnnounces(
    {},
    {
      limit: 200,
      cursor: cursor ?? undefined,
    }
  )
  const announces = response.announces.map(mapRecordToAnnounce)
  announces.sort((a, b) => b.postedAtMs - a.postedAtMs)
  return {
    announces: announces.map(toAnnounceItem),
    nextCursor: response.next_cursor,
  }
}

export async function fetchAnnounces(): Promise<AnnounceItem[]> {
  const page = await fetchAnnouncesPage()
  return page.announces
}

export async function triggerAnnounceNow(): Promise<void> {
  await announceLxmfNow()
}

export async function sendHubJoin(destination: string): Promise<void> {
  const normalizedDestination = destination.trim()
  if (!normalizedDestination) {
    throw new Error('Destination is required')
  }

  try {
    await announceLxmfNow()
  } catch {
    // Continue anyway; explicit join should still be attempted.
  }

  await sendLxmfCommand({
    destination: normalizedDestination,
    commands: ['join'],
  })
}

function mapRecordToAnnounce(record: LxmfAnnounceRecord): DerivedAnnounce {
  const postedAtMs = normalizeTimestampMs(record.timestamp)
  const name = record.name?.trim()
  const source = record.peer.trim()
  return {
    id: record.id || `${source}:${record.timestamp}:announce`,
    title: name?.length ? name : 'Announce',
    body: `Peer seen ${record.seen_count} time(s)`,
    audience: 'network',
    priority: toPriorityLabel(undefined),
    postedAt: formatAnnounceDate(postedAtMs),
    source,
    capabilities: normalizeCapabilities(record.capabilities),
    postedAtMs,
  }
}

function toAnnounceItem(announce: DerivedAnnounce): AnnounceItem {
  return {
    id: announce.id,
    title: announce.title,
    body: announce.body,
    audience: announce.audience,
    priority: announce.priority,
    postedAt: announce.postedAt,
    source: announce.source,
    capabilities: announce.capabilities,
  }
}

function toPriorityLabel(value: string | undefined): AnnouncePriorityLabel {
  return value === 'urgent' ? 'Urgent' : 'Routine'
}

export function mapAnnounceEventPayload(payload: unknown): AnnounceItem | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null
  }
  const record = payload as Record<string, unknown>
  const peer = typeof record.peer === 'string' ? record.peer.trim() : ''
  if (!peer) {
    return null
  }
  const timestamp =
    typeof record.timestamp === 'number' && Number.isFinite(record.timestamp)
      ? record.timestamp
      : Date.now() / 1000
  const seenCount =
    typeof record.seen_count === 'number' && Number.isFinite(record.seen_count)
      ? Math.max(0, Math.trunc(record.seen_count))
      : 1
  const capabilities = normalizeCapabilities(
    Array.isArray(record.capabilities)
      ? record.capabilities.filter((entry): entry is string => typeof entry === 'string')
      : []
  )
  const name = typeof record.name === 'string' ? record.name.trim() : ''
  const postedAtMs = normalizeTimestampMs(timestamp)
  return {
    id:
      typeof record.id === 'string' && record.id.trim().length > 0
        ? record.id.trim()
        : `${peer}:${timestamp}:announce`,
    title: name || 'Announce',
    body: `Peer seen ${seenCount} time(s)`,
    audience: 'network',
    priority: 'Routine',
    postedAt: formatAnnounceDate(postedAtMs),
    source: peer,
    capabilities,
  }
}

function normalizeTimestampMs(value: number): number {
  if (!Number.isFinite(value)) {
    return Date.now()
  }
  if (value < 1_000_000_000_000) {
    return value * 1000
  }
  return value
}

function formatAnnounceDate(timestampMs: number): string {
  return new Date(timestampMs).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function normalizeCapabilities(value: string[] | undefined): string[] {
  if (!value || value.length === 0) {
    return []
  }
  const deduped = new Set<string>()
  for (const entry of value) {
    const normalized = entry.trim()
    if (normalized.length > 0) {
      deduped.add(normalized)
    }
  }
  return [...deduped]
}
