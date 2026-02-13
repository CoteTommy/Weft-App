import type { FileItem } from '@shared/types/files'
import type {
  LxmfAttachmentPayload,
  LxmfMessageFields,
  LxmfMessageRecord,
  LxmfPaperPayload,
} from '@lib/lxmf-payloads'

export interface ParsedMapPoint {
  id: string
  label: string
  lat: number
  lon: number
  source: string
  when: string
  direction: 'in' | 'out' | 'unknown'
}

export function extractMapPointsFromMessages(records: LxmfMessageRecord[]): ParsedMapPoint[] {
  const points = records.flatMap(extractPointsFromMessage)
  points.sort(
    (left, right) =>
      timestampFromPointId(right.id) - timestampFromPointId(left.id),
  )
  return points
}

export function extractFilesFromMessages(records: LxmfMessageRecord[]): FileItem[] {
  const files = records.flatMap(extractFilesFromMessage)
  files.sort((left, right) => left.name.localeCompare(right.name))
  return files
}

function extractPointsFromMessage(record: LxmfMessageRecord): ParsedMapPoint[] {
  const points = [
    ...extractFieldLocationPoints(record),
    ...extractGeoUriPoints(record),
    ...extractOsmPoints(record),
    ...extractGooglePoints(record),
  ]
  return dedupePoints(points)
}

function extractFieldLocationPoints(record: LxmfMessageRecord): ParsedMapPoint[] {
  const location = parseLocationMeta(record.fields)
  if (!location || !isValidCoordinate(location.lat, location.lon)) {
    return []
  }
  return [
    buildMapPoint(
      record,
      location.lat,
      location.lon,
      record.title.trim() || firstLine(record.content) || 'Location point',
    ),
  ]
}

function extractGeoUriPoints(record: LxmfMessageRecord): ParsedMapPoint[] {
  const pattern = /geo:([+-]?\d+(?:\.\d+)?),([+-]?\d+(?:\.\d+)?)/gi
  return extractWithPattern(record, pattern)
}

function extractOsmPoints(record: LxmfMessageRecord): ParsedMapPoint[] {
  const pattern = /mlat=([+-]?\d+(?:\.\d+)?).*?mlon=([+-]?\d+(?:\.\d+)?)/gi
  return extractWithPattern(record, pattern)
}

function extractGooglePoints(record: LxmfMessageRecord): ParsedMapPoint[] {
  const pattern = /[?&]q=([+-]?\d+(?:\.\d+)?),([+-]?\d+(?:\.\d+)?)/gi
  return extractWithPattern(record, pattern)
}

function extractWithPattern(record: LxmfMessageRecord, pattern: RegExp): ParsedMapPoint[] {
  const text = `${record.title}\n${record.content}`
  const points: ParsedMapPoint[] = []
  for (const match of text.matchAll(pattern)) {
    const lat = Number(match[1])
    const lon = Number(match[2])
    if (!isValidCoordinate(lat, lon)) {
      continue
    }
    points.push(
      buildMapPoint(
        record,
        lat,
        lon,
        record.title.trim() || firstLine(record.content) || 'Location point',
      ),
    )
  }
  return points
}

function buildMapPoint(
  record: LxmfMessageRecord,
  lat: number,
  lon: number,
  label: string,
): ParsedMapPoint {
  const timestampMs = normalizeTimestampMs(record.timestamp)
  return {
    id: `${record.id}:${timestampMs}:${lat.toFixed(5)}:${lon.toFixed(5)}`,
    label,
    lat,
    lon,
    source: shortHash(record.direction === 'out' ? record.destination : record.source, 8),
    when: new Date(timestampMs).toLocaleString(),
    direction:
      record.direction === 'out'
        ? 'out'
        : record.direction === 'in'
          ? 'in'
          : 'unknown',
  }
}

function dedupePoints(points: ParsedMapPoint[]): ParsedMapPoint[] {
  const seen = new Set<string>()
  const output: ParsedMapPoint[] = []
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

function extractFilesFromMessage(record: LxmfMessageRecord): FileItem[] {
  const fields = asFields(record.fields)
  if (!fields) {
    return []
  }

  const owner = shortHash(record.source)
  const items: FileItem[] = []

  const attachments = Array.isArray(fields.attachments) ? fields.attachments : []
  for (const attachment of attachments) {
    const parsed = asAttachment(attachment)
    if (!parsed?.name) {
      continue
    }
    items.push({
      id: `${record.id}:${parsed.name}`,
      name: parsed.name,
      kind: kindFromMime(parsed.mime),
      sizeLabel: sizeLabel(parsed.size_bytes),
      owner,
      mime: parsed.mime,
      dataBase64: parsed.inline_base64,
    })
  }

  for (const attachment of parseCanonicalAttachments(fields['5'])) {
    items.push({
      id: `${record.id}:${attachment.name}:${attachment.sizeBytes}`,
      name: attachment.name,
      kind: kindFromMime(attachment.mime),
      sizeLabel: sizeLabel(attachment.sizeBytes),
      owner,
      mime: attachment.mime,
      dataBase64: attachment.dataBase64,
    })
  }

  const paper = asPaper(fields.paper)
  if (paper) {
    items.push({
      id: `${record.id}:paper`,
      name: paper.title ?? paper.uri ?? `Note ${shortHash(record.id, 4)}`,
      kind: 'Note',
      sizeLabel: '—',
      owner,
      paperUri: paper.uri,
      paperTitle: paper.title,
      paperCategory: paper.category,
    })
  }

  return items
}

function parseLocationMeta(
  fields: LxmfMessageRecord['fields'],
): { lat: number; lon: number } | undefined {
  const root = asObject(fields)
  if (!root) {
    return undefined
  }

  const location = asObject(root.location)
  const lat = asNumber(location?.lat) ?? asNumber(location?.latitude)
  const lon =
    asNumber(location?.lon) ??
    asNumber(location?.lng) ??
    asNumber(location?.longitude)
  if (lat !== undefined && lon !== undefined) {
    return { lat, lon }
  }

  const telemetry = asObject(root['2'])
  const telemetryNested = asObject(telemetry?.location)
  const telemetryLat =
    asNumber(telemetry?.lat) ??
    asNumber(telemetry?.latitude) ??
    asNumber(telemetryNested?.lat) ??
    asNumber(telemetryNested?.latitude)
  const telemetryLon =
    asNumber(telemetry?.lon) ??
    asNumber(telemetry?.lng) ??
    asNumber(telemetry?.longitude) ??
    asNumber(telemetryNested?.lon) ??
    asNumber(telemetryNested?.lng) ??
    asNumber(telemetryNested?.longitude)
  if (telemetryLat !== undefined && telemetryLon !== undefined) {
    return { lat: telemetryLat, lon: telemetryLon }
  }

  const telemetryArray = Array.isArray(root['2']) ? root['2'] : null
  if (telemetryArray && telemetryArray.length >= 2) {
    const latFromArray = asNumber(telemetryArray[0])
    const lonFromArray = asNumber(telemetryArray[1])
    if (latFromArray !== undefined && lonFromArray !== undefined) {
      return { lat: latFromArray, lon: lonFromArray }
    }
  }

  return undefined
}

function parseCanonicalAttachments(
  value: unknown,
): Array<{ name: string; sizeBytes: number; dataBase64: string; mime?: string }> {
  if (!Array.isArray(value)) {
    return []
  }
  const out: Array<{ name: string; sizeBytes: number; dataBase64: string; mime?: string }> = []
  for (const entry of value) {
    if (!Array.isArray(entry) || entry.length < 2) {
      continue
    }
    const name = decodeWireText(entry[0]) ?? `Attachment ${out.length + 1}`
    const bytes = decodeWireBytes(entry[1])
    if (!bytes || bytes.length === 0) {
      continue
    }
    out.push({
      name,
      sizeBytes: bytes.length,
      dataBase64: bytesToBase64(bytes),
    })
  }
  return out
}

function asFields(value: LxmfMessageRecord['fields']): LxmfMessageFields | null {
  return value ?? null
}

function asAttachment(value: unknown): LxmfAttachmentPayload | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null
  }
  return value as LxmfAttachmentPayload
}

function asPaper(value: unknown): LxmfPaperPayload | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null
  }
  return value as LxmfPaperPayload
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null
  }
  return value as Record<string, unknown>
}

function asNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined
  }
  return value
}

function kindFromMime(mime: string | undefined): FileItem['kind'] {
  if (!mime) {
    return 'Document'
  }
  if (mime.startsWith('image/')) {
    return 'Image'
  }
  if (mime.startsWith('audio/')) {
    return 'Audio'
  }
  if (mime.includes('zip') || mime.includes('tar')) {
    return 'Archive'
  }
  return 'Document'
}

function sizeLabel(sizeBytes: number | undefined): string {
  if (!sizeBytes || sizeBytes <= 0) {
    return '—'
  }
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`
  }
  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`
  }
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`
}

function shortHash(value: string, visible = 6): string {
  const trimmed = value.trim()
  if (trimmed.length <= visible * 2) {
    return trimmed
  }
  return `${trimmed.slice(0, visible)}...${trimmed.slice(-visible)}`
}

function normalizeTimestampMs(value: number): number {
  if (!Number.isFinite(value)) {
    return Date.now()
  }
  return value < 1_000_000_000_000 ? value * 1000 : value
}

function timestampFromPointId(id: string): number {
  const parsed = Number(id.split(':')[1] ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function firstLine(value: string): string {
  return value.split('\n')[0]?.trim() ?? ''
}

function isValidCoordinate(lat: number, lon: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  )
}

function decodeWireText(value: unknown): string | null {
  if (typeof value === 'string') {
    const normalized = value.trim()
    return normalized.length > 0 ? normalized : null
  }
  const bytes = decodeWireBytes(value)
  if (!bytes || bytes.length === 0) {
    return null
  }
  try {
    return new TextDecoder().decode(bytes).trim() || null
  } catch {
    return null
  }
}

function decodeWireBytes(value: unknown): Uint8Array | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null
  }
  const bytes = new Uint8Array(value.length)
  for (let index = 0; index < value.length; index += 1) {
    const entry = value[index]
    if (typeof entry !== 'number' || !Number.isFinite(entry) || entry < 0 || entry > 255) {
      return null
    }
    bytes[index] = entry
  }
  return bytes
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}
