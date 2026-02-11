export interface LxmfProbeReport {
  profile: string
  local: LxmfDaemonLocalStatus
  rpc: LxmfRpcProbe
  events: LxmfEventsProbe
}

export interface LxmfDaemonLocalStatus {
  running: boolean
  pid: number | null
  rpc: string
  profile: string
  managed: boolean
  transport: string | null
  transport_inferred: boolean
  log_path: string
}

export interface LxmfRpcProbe {
  reachable: boolean
  endpoint: string
  method: string | null
  roundtrip_ms: number | null
  identity_hash: string | null
  status: unknown | null
  errors: string[]
}

export interface LxmfEventsProbe {
  reachable: boolean
  endpoint: string
  roundtrip_ms: number | null
  event_type: string | null
  payload: unknown | null
  error: string | null
}

export function parseLxmfProbeReport(value: unknown): LxmfProbeReport {
  const root = expectObject(value, 'probe')
  return {
    profile: expectString(root.profile, 'probe.profile'),
    local: parseLxmfDaemonLocalStatus(root.local),
    rpc: parseRpcProbe(root.rpc),
    events: parseEventsProbe(root.events),
  }
}

export function parseLxmfDaemonLocalStatus(value: unknown): LxmfDaemonLocalStatus {
  const local = expectObject(value, 'probe.local')
  return {
    running: expectBoolean(local.running, 'probe.local.running'),
    pid: expectNullableNumber(local.pid, 'probe.local.pid'),
    rpc: expectString(local.rpc, 'probe.local.rpc'),
    profile: expectString(local.profile, 'probe.local.profile'),
    managed: expectBoolean(local.managed, 'probe.local.managed'),
    transport: expectNullableString(local.transport, 'probe.local.transport'),
    transport_inferred: expectBoolean(local.transport_inferred, 'probe.local.transport_inferred'),
    log_path: expectString(local.log_path, 'probe.local.log_path'),
  }
}

function parseRpcProbe(value: unknown): LxmfRpcProbe {
  const rpc = expectObject(value, 'probe.rpc')
  return {
    reachable: expectBoolean(rpc.reachable, 'probe.rpc.reachable'),
    endpoint: expectString(rpc.endpoint, 'probe.rpc.endpoint'),
    method: expectNullableString(rpc.method, 'probe.rpc.method'),
    roundtrip_ms: expectNullableNumber(rpc.roundtrip_ms, 'probe.rpc.roundtrip_ms'),
    identity_hash: expectNullableString(rpc.identity_hash, 'probe.rpc.identity_hash'),
    status: rpc.status ?? null,
    errors: expectStringArray(rpc.errors, 'probe.rpc.errors'),
  }
}

function parseEventsProbe(value: unknown): LxmfEventsProbe {
  const events = expectObject(value, 'probe.events')
  return {
    reachable: expectBoolean(events.reachable, 'probe.events.reachable'),
    endpoint: expectString(events.endpoint, 'probe.events.endpoint'),
    roundtrip_ms: expectNullableNumber(events.roundtrip_ms, 'probe.events.roundtrip_ms'),
    event_type: expectNullableString(events.event_type, 'probe.events.event_type'),
    payload: events.payload ?? null,
    error: expectNullableString(events.error, 'probe.events.error'),
  }
}

function expectObject(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${path} must be an object`)
  }
  return value as Record<string, unknown>
}

function expectString(value: unknown, path: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${path} must be a string`)
  }
  return value
}

function expectNullableString(value: unknown, path: string): string | null {
  if (value === null || value === undefined) {
    return null
  }
  return expectString(value, path)
}

function expectBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`${path} must be a boolean`)
  }
  return value
}

function expectNullableNumber(value: unknown, path: string): number | null {
  if (value === null || value === undefined) {
    return null
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${path} must be a finite number or null`)
  }
  return value
}

function expectStringArray(value: unknown, path: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${path} must be an array`)
  }
  return value.map((entry, index) => expectString(entry, `${path}[${index}]`))
}
