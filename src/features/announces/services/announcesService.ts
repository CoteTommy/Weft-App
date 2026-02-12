import { announceLxmfNow, listLxmfAnnounces, sendLxmfCommand } from '../../../lib/lxmf-api'
import type { LxmfAnnounceRecord } from '../../../lib/lxmf-payloads'
import type { AnnounceItem, AnnouncePriorityLabel } from '../../../shared/types/announces'

interface DerivedAnnounce extends AnnounceItem {
  postedAtMs: number
}

export async function fetchAnnounces(): Promise<AnnounceItem[]> {
  const response = await listLxmfAnnounces()
  const announces = response.announces.map(mapRecordToAnnounce)
  announces.sort((a, b) => b.postedAtMs - a.postedAtMs)
  return announces.map(toAnnounceItem)
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
  const postedAtMs = normalizeTimestampMs(record.announce.posted_at ?? record.timestamp)
  return {
    id: `${record.id}:announce`,
    title: record.announce.title?.trim() || record.title || 'Announcement',
    body: record.announce.body?.trim() || record.content || 'No details',
    audience: record.announce.audience?.trim() || 'public',
    priority: toPriorityLabel(record.announce.priority),
    postedAt: formatAnnounceDate(postedAtMs),
    source: record.source.trim(),
    capabilities: normalizeCapabilities(record.announce.capabilities),
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
