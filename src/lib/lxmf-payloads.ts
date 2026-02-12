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
  capabilities?: string[]
  name?: string
  name_source?: string
  first_seen?: number
  seen_count?: number
  app_data_hex?: string
  signal?: {
    rssi?: number
    snr?: number
    q?: number
  }
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

export interface LxmfAnnounceRecord {
  id: string
  source: string
  destination: string
  title: string
  content: string
  timestamp: number
  announce: LxmfAnnouncePayload
}

export interface LxmfAnnounceListResponse {
  announces: LxmfAnnounceRecord[]
}

export interface LxmfInterfaceMetricsResponse {
  total: number
  enabled: number
  disabled: number
  by_type: Record<string, number>
  interfaces: LxmfInterfaceRecord[]
}

export interface LxmfPropagationNodeRecord {
  peer: string
  name: string | null
  last_seen: number
  capabilities: string[]
  selected: boolean
}

export interface LxmfPropagationNodeListResponse {
  nodes: LxmfPropagationNodeRecord[]
}

export interface LxmfOutboundPropagationNodeResponse {
  peer: string | null
}

export interface LxmfDeliveryTraceEntry {
  status: string
  timestamp: number
}

export interface LxmfMessageDeliveryTraceResponse {
  message_id: string
  transitions: LxmfDeliveryTraceEntry[]
}

export function parseLxmfMessageList(value: unknown): LxmfMessageListResponse {
  const rawList = readArrayField(value, 'messages')
  if (!rawList) {
    throw new Error('messages must be an array')
  }
  return {
    messages: rawList.map((entry, index) => parseMessageRecord(entry, `messages[${index}]`)),
  }
}

export function parseLxmfPeerList(value: unknown): LxmfPeerListResponse {
  const rawList = readArrayField(value, 'peers')
  if (!rawList) {
    throw new Error('peers must be an array')
  }
  return {
    peers: rawList.map((entry, index) => parsePeerRecord(entry, `peers[${index}]`)),
  }
}

export function parseLxmfInterfaceList(value: unknown): LxmfInterfaceListResponse {
  const rawList = readArrayField(value, 'interfaces')
  if (!rawList) {
    throw new Error('interfaces must be an array')
  }
  return {
    interfaces: rawList.map((entry, index) =>
      parseInterfaceRecord(entry, `interfaces[${index}]`),
    ),
  }
}

export function parseLxmfAnnounceList(value: unknown): LxmfAnnounceListResponse {
  const rawList = readArrayField(value, 'announces')
  if (!rawList) {
    throw new Error('announces must be an array')
  }
  return {
    announces: rawList.map((entry, index) =>
      parseAnnounceRecord(entry, `announces[${index}]`),
    ),
  }
}

export function parseLxmfInterfaceMetrics(value: unknown): LxmfInterfaceMetricsResponse {
  const root = asObject(value, 'interface_metrics')
  const interfaces = parseLxmfInterfaceList({
    interfaces: root.interfaces,
  }).interfaces
  return {
    total: asNumber(root.total, 'interface_metrics.total'),
    enabled: asNumber(root.enabled, 'interface_metrics.enabled'),
    disabled: asNumber(root.disabled, 'interface_metrics.disabled'),
    by_type: asNumberMap(root.by_type, 'interface_metrics.by_type'),
    interfaces,
  }
}

export function parseLxmfPropagationNodeList(
  value: unknown,
): LxmfPropagationNodeListResponse {
  const rawList = readArrayField(value, 'nodes')
  if (!rawList) {
    throw new Error('nodes must be an array')
  }
  return {
    nodes: rawList.map((entry, index) =>
      parsePropagationNodeRecord(entry, `nodes[${index}]`),
    ),
  }
}

export function parseLxmfOutboundPropagationNode(
  value: unknown,
): LxmfOutboundPropagationNodeResponse {
  const root = asObject(value, 'outbound_propagation_node')
  return {
    peer: asNullableString(root.peer, 'outbound_propagation_node.peer'),
  }
}

export function parseLxmfMessageDeliveryTrace(
  value: unknown,
): LxmfMessageDeliveryTraceResponse {
  const root = asObject(value, 'message_delivery_trace')
  const transitionsRaw = readArrayField(root, 'transitions') ?? []
  return {
    message_id: asString(root.message_id, 'message_delivery_trace.message_id'),
    transitions: transitionsRaw.map((entry, index) => {
      const trace = asObject(entry, `message_delivery_trace.transitions[${index}]`)
      return {
        status: asString(trace.status, `message_delivery_trace.transitions[${index}].status`),
        timestamp: asNumber(
          trace.timestamp,
          `message_delivery_trace.transitions[${index}].timestamp`,
        ),
      }
    }),
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

function parseInterfaceRecord(value: unknown, path: string): LxmfInterfaceRecord {
  const record = asObject(value, path)
  return {
    type: asString(record.type, `${path}.type`),
    enabled: asBoolean(record.enabled, `${path}.enabled`),
    host: asNullableString(record.host, `${path}.host`),
    port: asNullableNumber(record.port, `${path}.port`),
    name: asNullableString(record.name, `${path}.name`),
  }
}

function parseAnnounceRecord(value: unknown, path: string): LxmfAnnounceRecord {
  const record = asObject(value, path)
  const announce = asObject(record.announce, `${path}.announce`)
  return {
    id: asString(record.id, `${path}.id`),
    source: asString(record.source, `${path}.source`),
    destination: asString(record.destination, `${path}.destination`),
    title: asString(record.title, `${path}.title`),
    content: asString(record.content, `${path}.content`),
    timestamp: asNumber(record.timestamp, `${path}.timestamp`),
    announce: {
      title: asOptionalString(announce.title, `${path}.announce.title`),
      body: asOptionalString(announce.body, `${path}.announce.body`),
      audience: asOptionalString(announce.audience, `${path}.announce.audience`),
      priority: asOptionalPriority(announce.priority, `${path}.announce.priority`),
      ttl_secs: asOptionalNumber(announce.ttl_secs, `${path}.announce.ttl_secs`),
      posted_at: asOptionalNumber(announce.posted_at, `${path}.announce.posted_at`),
      capabilities: asOptionalCapabilities(announce.capabilities),
      name: asOptionalString(announce.name, `${path}.announce.name`),
      name_source: asOptionalString(announce.name_source, `${path}.announce.name_source`),
      first_seen: asOptionalNumber(announce.first_seen, `${path}.announce.first_seen`),
      seen_count: asOptionalNumber(announce.seen_count, `${path}.announce.seen_count`),
      app_data_hex: asOptionalString(announce.app_data_hex, `${path}.announce.app_data_hex`),
      signal: parseOptionalSignal(announce.signal, `${path}.announce.signal`),
    },
  }
}

function parseOptionalSignal(
  value: unknown,
  path: string,
): LxmfAnnouncePayload['signal'] | undefined {
  if (value === null || value === undefined) {
    return undefined
  }
  const signal = asObject(value, path)
  return {
    rssi: asOptionalNumber(signal.rssi, `${path}.rssi`),
    snr: asOptionalNumber(signal.snr, `${path}.snr`),
    q: asOptionalNumber(signal.q, `${path}.q`),
  }
}

function parsePropagationNodeRecord(
  value: unknown,
  path: string,
): LxmfPropagationNodeRecord {
  const record = asObject(value, path)
  return {
    peer: asString(record.peer, `${path}.peer`),
    name: asNullableString(record.name, `${path}.name`),
    last_seen: asNumber(record.last_seen, `${path}.last_seen`),
    capabilities: asOptionalCapabilities(record.capabilities) ?? [],
    selected: asBoolean(record.selected, `${path}.selected`),
  }
}

function readArrayField(value: unknown, field: string): unknown[] | null {
  if (Array.isArray(value)) {
    return value
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null
  }
  const record = value as Record<string, unknown>
  return Array.isArray(record[field]) ? record[field] : null
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

function asBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`${path} must be a boolean`)
  }
  return value
}

function asNullableNumber(value: unknown, path: string): number | null {
  if (value === null || value === undefined) {
    return null
  }
  return asNumber(value, path)
}

function asOptionalNumber(value: unknown, path: string): number | undefined {
  if (value === null || value === undefined) {
    return undefined
  }
  return asNumber(value, path)
}

function asOptionalString(value: unknown, path: string): string | undefined {
  if (value === null || value === undefined) {
    return undefined
  }
  return asString(value, path)
}

function asOptionalPriority(
  value: unknown,
  path: string,
): LxmfAnnouncePayload['priority'] | undefined {
  if (value === null || value === undefined) {
    return undefined
  }
  if (value === 'routine' || value === 'urgent') {
    return value
  }
  throw new Error(`${path} must be "routine" or "urgent"`)
}

function asOptionalCapabilities(value: unknown): string[] | undefined {
  if (value === null || value === undefined) {
    return undefined
  }
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const record = value as Record<string, unknown>
    if (Array.isArray(record.caps)) {
      return asOptionalCapabilities(record.caps)
    }
    if (Array.isArray(record.capabilities)) {
      return asOptionalCapabilities(record.capabilities)
    }
    return undefined
  }
  if (!Array.isArray(value)) {
    return undefined
  }
  const capabilities = value
    .map((entry) => {
      if (typeof entry === 'string') {
        return entry.trim()
      }
      if (typeof entry === 'number' || typeof entry === 'boolean') {
        return String(entry)
      }
      return ''
    })
    .filter((entry) => entry.length > 0)
  return capabilities.length > 0 ? capabilities : undefined
}

function asNumberMap(value: unknown, path: string): Record<string, number> {
  const record = asObject(value, path)
  const output: Record<string, number> = {}
  for (const [key, raw] of Object.entries(record)) {
    output[key] = asNumber(raw, `${path}.${key}`)
  }
  return output
}

function asNullableObject(value: unknown, path: string): Record<string, unknown> | null {
  if (value === null || value === undefined) {
    return null
  }
  return asObject(value, path)
}
