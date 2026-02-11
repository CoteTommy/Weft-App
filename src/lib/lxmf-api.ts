import { invoke } from '@tauri-apps/api/core'
import {
  parseLxmfDaemonLocalStatus,
  parseLxmfProbeReport,
  type LxmfDaemonLocalStatus,
  type LxmfProbeReport,
} from './lxmf-contract'

export type ProbeOptions = {
  profile?: string
  rpc?: string
}

export type DaemonControlOptions = ProbeOptions & {
  managed?: boolean
  reticulumd?: string
  transport?: string
}

export type LxmfSendMessageOptions = ProbeOptions & {
  destination: string
  content: string
  title?: string
  source?: string
  id?: string
  fields?: unknown
  method?: string
  stampCost?: number
  includeTicket?: boolean
}

export type LxmfSendMessageResponse = {
  result: unknown
  resolved: {
    source: string
    destination: string
  }
}

export type LxmfEvent = {
  event_type: string
  payload: unknown
}

export async function probeLxmf(options: ProbeOptions = {}): Promise<LxmfProbeReport> {
  const payload = await invoke<unknown>('daemon_probe', {
    profile: options.profile ?? null,
    rpc: options.rpc ?? null,
  })
  return parseLxmfProbeReport(payload)
}

export async function daemonStatus(options: ProbeOptions = {}): Promise<LxmfDaemonLocalStatus> {
  const payload = await invoke<unknown>('daemon_status', {
    profile: options.profile ?? null,
    rpc: options.rpc ?? null,
  })
  return parseLxmfDaemonLocalStatus(payload)
}

export async function daemonStart(options: DaemonControlOptions = {}): Promise<LxmfDaemonLocalStatus> {
  return daemonControlAction('daemon_start', options)
}

export async function daemonStop(options: ProbeOptions = {}): Promise<LxmfDaemonLocalStatus> {
  return daemonControlAction('daemon_stop', options)
}

export async function daemonRestart(
  options: DaemonControlOptions = {},
): Promise<LxmfDaemonLocalStatus> {
  return daemonControlAction('daemon_restart', options)
}

export async function listLxmfMessages(options: ProbeOptions = {}): Promise<unknown> {
  return await invoke<unknown>('lxmf_list_messages', {
    profile: options.profile ?? null,
    rpc: options.rpc ?? null,
  })
}

export async function listLxmfPeers(options: ProbeOptions = {}): Promise<unknown> {
  return await invoke<unknown>('lxmf_list_peers', {
    profile: options.profile ?? null,
    rpc: options.rpc ?? null,
  })
}

export async function announceLxmfNow(options: ProbeOptions = {}): Promise<unknown> {
  return await invoke<unknown>('lxmf_announce_now', {
    profile: options.profile ?? null,
    rpc: options.rpc ?? null,
  })
}

export async function pollLxmfEvent(options: ProbeOptions = {}): Promise<LxmfEvent | null> {
  const payload = await invoke<unknown>('lxmf_poll_event', {
    profile: options.profile ?? null,
    rpc: options.rpc ?? null,
  })
  return parseLxmfEvent(payload)
}

export async function sendLxmfMessage(
  options: LxmfSendMessageOptions,
): Promise<LxmfSendMessageResponse> {
  const payload = await invoke<unknown>('lxmf_send_message', {
    profile: options.profile ?? null,
    rpc: options.rpc ?? null,
    destination: options.destination,
    content: options.content,
    title: options.title ?? null,
    source: options.source ?? null,
    id: options.id ?? null,
    fields: options.fields ?? null,
    method: options.method ?? null,
    stamp_cost: options.stampCost ?? null,
    include_ticket: options.includeTicket ?? null,
  })

  return parseLxmfSendMessageResponse(payload)
}

function parseLxmfEvent(value: unknown): LxmfEvent | null {
  if (value === null || value === undefined) {
    return null
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('event must be an object or null')
  }
  const record = value as Record<string, unknown>
  if (typeof record.event_type !== 'string') {
    throw new Error('event.event_type must be a string')
  }
  return {
    event_type: record.event_type,
    payload: record.payload ?? null,
  }
}

function parseLxmfSendMessageResponse(value: unknown): LxmfSendMessageResponse {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('send response must be an object')
  }
  const record = value as Record<string, unknown>
  const resolved = record.resolved
  if (typeof resolved !== 'object' || resolved === null || Array.isArray(resolved)) {
    throw new Error('send response.resolved must be an object')
  }
  const resolvedRecord = resolved as Record<string, unknown>
  if (typeof resolvedRecord.source !== 'string') {
    throw new Error('send response.resolved.source must be a string')
  }
  if (typeof resolvedRecord.destination !== 'string') {
    throw new Error('send response.resolved.destination must be a string')
  }
  return {
    result: record.result ?? null,
    resolved: {
      source: resolvedRecord.source,
      destination: resolvedRecord.destination,
    },
  }
}

async function daemonControlAction(
  tauriCommand: 'daemon_start' | 'daemon_stop' | 'daemon_restart',
  options: DaemonControlOptions | ProbeOptions,
): Promise<LxmfDaemonLocalStatus> {
  const payload = await invoke<unknown>(tauriCommand, {
    profile: options.profile ?? null,
    rpc: options.rpc ?? null,
    managed: 'managed' in options ? options.managed ?? null : null,
    reticulumd: 'reticulumd' in options ? options.reticulumd ?? null : null,
    transport: 'transport' in options ? options.transport ?? null : null,
  })
  return parseLxmfDaemonLocalStatus(payload)
}
