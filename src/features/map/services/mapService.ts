import { listLxmfMessages, sendLxmfMessage } from '../../../lib/lxmf-api'
import type { LxmfMessageRecord } from '../../../lib/lxmf-payloads'
import { shortHash } from '../../../shared/utils/identity'

export interface MapPoint {
  id: string
  label: string
  lat: number
  lon: number
  source: string
  when: string
  direction: 'in' | 'out' | 'unknown'
}

export async function fetchMapPoints(): Promise<MapPoint[]> {
  const response = await listLxmfMessages()
  const points = response.messages.flatMap(extractPointsFromMessage)
  points.sort((a, b) => Number(b.id.split(':')[1] ?? 0) - Number(a.id.split(':')[1] ?? 0))
  return points
}

export async function sendLocationToDestination(input: {
  destination: string
  lat: number
  lon: number
  label?: string
}): Promise<void> {
  const headline = input.label?.trim() || 'Shared location'
  const content = `${headline}\ngeo:${input.lat.toFixed(6)},${input.lon.toFixed(6)}`
  await sendLxmfMessage({
    destination: input.destination,
    title: 'Location',
    content,
    fields: {
      location: {
        lat: input.lat,
        lon: input.lon,
      },
    },
  })
}

function extractPointsFromMessage(record: LxmfMessageRecord): MapPoint[] {
  const points = [
    ...extractGeoUriPoints(record),
    ...extractOsmPoints(record),
    ...extractGooglePoints(record),
  ]
  return dedupePoints(points)
}

function extractGeoUriPoints(record: LxmfMessageRecord): MapPoint[] {
  const pattern = /geo:([+-]?\d+(?:\.\d+)?),([+-]?\d+(?:\.\d+)?)/gi
  return extractWithPattern(record, pattern)
}

function extractOsmPoints(record: LxmfMessageRecord): MapPoint[] {
  const pattern = /mlat=([+-]?\d+(?:\.\d+)?).*?mlon=([+-]?\d+(?:\.\d+)?)/gi
  const fromContent = extractWithPattern(record, pattern)
  return fromContent
}

function extractGooglePoints(record: LxmfMessageRecord): MapPoint[] {
  const pattern = /[?&]q=([+-]?\d+(?:\.\d+)?),([+-]?\d+(?:\.\d+)?)/gi
  return extractWithPattern(record, pattern)
}

function extractWithPattern(record: LxmfMessageRecord, pattern: RegExp): MapPoint[] {
  const text = `${record.title}\n${record.content}`
  const points: MapPoint[] = []
  for (const match of text.matchAll(pattern)) {
    const lat = Number(match[1])
    const lon = Number(match[2])
    if (!isValidCoordinate(lat, lon)) {
      continue
    }
    points.push({
      id: `${record.id}:${normalizeTimestampMs(record.timestamp)}:${lat.toFixed(5)}:${lon.toFixed(5)}`,
      label: record.title.trim() || firstLine(record.content) || 'Location point',
      lat,
      lon,
      source: shortHash(record.direction === 'out' ? record.destination : record.source, 8),
      when: formatWhen(record.timestamp),
      direction: record.direction === 'out' ? 'out' : record.direction === 'in' ? 'in' : 'unknown',
    })
  }
  return points
}

function dedupePoints(points: MapPoint[]): MapPoint[] {
  const seen = new Set<string>()
  const output: MapPoint[] = []
  for (const point of points) {
    const key = `${point.lat.toFixed(5)}:${point.lon.toFixed(5)}:${point.source}:${point.when}`
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    output.push(point)
  }
  return output
}

function normalizeTimestampMs(value: number): number {
  if (!Number.isFinite(value)) {
    return Date.now()
  }
  return value < 1_000_000_000_000 ? value * 1000 : value
}

function formatWhen(timestamp: number): string {
  const date = new Date(normalizeTimestampMs(timestamp))
  return date.toLocaleString()
}

function firstLine(value: string): string {
  return value.split('\n')[0]?.trim() ?? ''
}

function isValidCoordinate(lat: number, lon: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180
}
