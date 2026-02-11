export type DeliveryMethod = 'opportunistic' | 'direct' | 'propagated' | 'paper'

export interface LxmfAttachmentPayload {
  id?: string
  name: string
  mime?: string
  size_bytes?: number
  sha256?: string
  uri?: string
  inline_base64?: string
}

export interface LxmfPaperPayload {
  uri?: string
  transient_id?: string
  title?: string
  category?: string
  revision?: string
}

export interface LxmfAnnouncePayload {
  title?: string
  body?: string
  audience?: string
  priority?: 'routine' | 'urgent'
  ttl_secs?: number
  posted_at?: number
}

export interface LxmfPeerSnapshotPayload {
  peer?: string
  endpoint?: string
  transport?: string
  latency_ms?: number
  queue_depth?: number
}

export interface LxmfInterfaceSnapshotPayload {
  name?: string
  type?: string
  enabled?: boolean
  host?: string
  port?: number
}

export interface LxmfFieldOptions {
  method?: DeliveryMethod
  stamp_cost?: number
  include_ticket?: boolean
}

export type LxmfMessageFields = Record<string, unknown> & {
  _lxmf?: LxmfFieldOptions
  attachments?: LxmfAttachmentPayload[]
  paper?: LxmfPaperPayload
  announce?: LxmfAnnouncePayload
  peer_snapshot?: LxmfPeerSnapshotPayload
  interface_snapshot?: LxmfInterfaceSnapshotPayload
}

export interface LxmfMessageRecord {
  id: string
  source: string
  destination: string
  title: string
  content: string
  timestamp: number
  direction: 'in' | 'out' | string
  fields: LxmfMessageFields | null
  receipt_status: string | null
}

export interface LxmfPeerRecord {
  peer: string
  last_seen: number
  name: string | null
  name_source: string | null
  first_seen: number
  seen_count: number
}

export interface LxmfInterfaceRecord {
  type: string
  enabled: boolean
  host: string | null
  port: number | null
  name: string | null
}

export interface LxmfDeliveryPolicy {
  auth_required: boolean
  allowed_destinations: string[]
  denied_destinations: string[]
  ignored_destinations: string[]
  prioritised_destinations: string[]
}

export interface LxmfPropagationState {
  enabled: boolean
  store_root: string | null
  target_cost: number
  total_ingested: number
  last_ingest_count: number
}

export interface LxmfStampPolicy {
  target_cost: number
  flexibility: number
}

export interface LxmfTicketRecord {
  destination: string
  ticket: string
  expires_at: number
}

export interface LxmfRpcEvent<TPayload = unknown> {
  event_type: string
  payload: TPayload
}

export interface LxmfMessageListResponse {
  messages: LxmfMessageRecord[]
}

export interface LxmfPeerListResponse {
  peers: LxmfPeerRecord[]
}

export interface LxmfInterfaceListResponse {
  interfaces: LxmfInterfaceRecord[]
}

export function parseLxmfMessageList(value: unknown): LxmfMessageListResponse {
  const root = asObject(value, 'messages')
  const rawList = Array.isArray(root.messages)
    ? root.messages
    : Array.isArray(value)
      ? value
      : null
  if (!rawList) {
    throw new Error('messages must be an array')
  }
  return {
    messages: rawList.map((entry, index) => parseMessageRecord(entry, `messages[${index}]`)),
  }
}

export function parseLxmfPeerList(value: unknown): LxmfPeerListResponse {
  const root = asObject(value, 'peers')
  const rawList = Array.isArray(root.peers) ? root.peers : null
  if (!rawList) {
    throw new Error('peers must be an array')
  }
  return {
    peers: rawList.map((entry, index) => parsePeerRecord(entry, `peers[${index}]`)),
  }
}

export function parseLxmfRpcEventOrNull(value: unknown): LxmfRpcEvent | null {
  if (value === null || value === undefined) {
    return null
  }
  const event = asObject(value, 'event')
  return {
    event_type: asString(event.event_type, 'event.event_type'),
    payload: event.payload ?? null,
  }
}

function parseMessageRecord(value: unknown, path: string): LxmfMessageRecord {
  const record = asObject(value, path)
  return {
    id: asString(record.id, `${path}.id`),
    source: asString(record.source, `${path}.source`),
    destination: asString(record.destination, `${path}.destination`),
    title: asString(record.title, `${path}.title`),
    content: asString(record.content, `${path}.content`),
    timestamp: asNumber(record.timestamp, `${path}.timestamp`),
    direction: asString(record.direction, `${path}.direction`),
    fields: asNullableObject(record.fields, `${path}.fields`) as LxmfMessageFields | null,
    receipt_status: asNullableString(record.receipt_status, `${path}.receipt_status`),
  }
}

function parsePeerRecord(value: unknown, path: string): LxmfPeerRecord {
  const record = asObject(value, path)
  return {
    peer: asString(record.peer, `${path}.peer`),
    last_seen: asNumber(record.last_seen, `${path}.last_seen`),
    name: asNullableString(record.name, `${path}.name`),
    name_source: asNullableString(record.name_source, `${path}.name_source`),
    first_seen: asNumber(record.first_seen, `${path}.first_seen`),
    seen_count: asNumber(record.seen_count, `${path}.seen_count`),
  }
}

function asObject(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${path} must be an object`)
  }
  return value as Record<string, unknown>
}

function asString(value: unknown, path: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${path} must be a string`)
  }
  return value
}

function asNullableString(value: unknown, path: string): string | null {
  if (value === null || value === undefined) {
    return null
  }
  return asString(value, path)
}

function asNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${path} must be a finite number`)
  }
  return value
}

function asNullableObject(value: unknown, path: string): Record<string, unknown> | null {
  if (value === null || value === undefined) {
    return null
  }
  return asObject(value, path)
}
