import { invoke } from '@tauri-apps/api/core'
import {
  parseLxmfDaemonLocalStatus,
  parseLxmfProbeReport,
  type LxmfDaemonLocalStatus,
  type LxmfProbeReport,
} from './lxmf-contract'
import {
  parseLxmfAnnounceList,
  parseLxmfInterfaceList,
  parseLxmfInterfaceMetrics,
  parseLxmfMessageList,
  parseLxmfPeerList,
  parseLxmfRpcEventOrNull,
  type LxmfAnnounceListResponse,
  type LxmfInterfaceListResponse,
  type LxmfInterfaceMetricsResponse,
  type LxmfMessageListResponse,
  type LxmfPeerListResponse,
  type LxmfRpcEvent,
} from './lxmf-payloads'
import {
  getRuntimeConnectionOptions,
  getRuntimeTransportOption,
} from '../shared/runtime/preferences'

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

export type LxmfSendCommandOptions = ProbeOptions & {
  destination: string
  commands?: string[]
  commandsHex?: string[]
  content?: string
  title?: string
  source?: string
  id?: string
  method?: string
  stampCost?: number
  includeTicket?: boolean
}

export type LxmfRichAttachment = {
  name: string
  dataBase64: string
  mime?: string
  sizeBytes?: number
}

export type LxmfSendRichMessageOptions = ProbeOptions & {
  destination: string
  content: string
  title?: string
  source?: string
  id?: string
  attachments?: LxmfRichAttachment[]
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

export type LxmfProfileInfo = {
  profile: string
  displayName: string | null
  rpc: string
  managed: boolean
}

export async function probeLxmf(options: ProbeOptions = {}): Promise<LxmfProbeReport> {
  const resolved = resolveProbeOptions(options)
  const payload = await invoke<unknown>('daemon_probe', {
    profile: resolved.profile,
    rpc: resolved.rpc,
  })
  return parseLxmfProbeReport(payload)
}

export async function daemonStatus(options: ProbeOptions = {}): Promise<LxmfDaemonLocalStatus> {
  const resolved = resolveProbeOptions(options)
  const payload = await invoke<unknown>('daemon_status', {
    profile: resolved.profile,
    rpc: resolved.rpc,
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

export async function listLxmfMessages(
  options: ProbeOptions = {},
): Promise<LxmfMessageListResponse> {
  const resolved = resolveProbeOptions(options)
  const payload = await invoke<unknown>('lxmf_list_messages', {
    profile: resolved.profile,
    rpc: resolved.rpc,
  })
  return parseLxmfMessageList(payload)
}

export async function listLxmfPeers(options: ProbeOptions = {}): Promise<LxmfPeerListResponse> {
  const resolved = resolveProbeOptions(options)
  const payload = await invoke<unknown>('lxmf_list_peers', {
    profile: resolved.profile,
    rpc: resolved.rpc,
  })
  return parseLxmfPeerList(payload)
}

export async function listLxmfInterfaces(
  options: ProbeOptions = {},
): Promise<LxmfInterfaceListResponse> {
  const resolved = resolveProbeOptions(options)
  const payload = await invoke<unknown>('lxmf_list_interfaces', {
    profile: resolved.profile,
    rpc: resolved.rpc,
  })
  return parseLxmfInterfaceList(payload)
}

export async function listLxmfAnnounces(
  options: ProbeOptions = {},
): Promise<LxmfAnnounceListResponse> {
  const resolved = resolveProbeOptions(options)
  const payload = await invoke<unknown>('lxmf_list_announces', {
    profile: resolved.profile,
    rpc: resolved.rpc,
  })
  return parseLxmfAnnounceList(payload)
}

export async function lxmfInterfaceMetrics(
  options: ProbeOptions = {},
): Promise<LxmfInterfaceMetricsResponse> {
  const resolved = resolveProbeOptions(options)
  const payload = await invoke<unknown>('lxmf_interface_metrics', {
    profile: resolved.profile,
    rpc: resolved.rpc,
  })
  return parseLxmfInterfaceMetrics(payload)
}

export async function announceLxmfNow(options: ProbeOptions = {}): Promise<unknown> {
  const resolved = resolveProbeOptions(options)
  return await invoke<unknown>('lxmf_announce_now', {
    profile: resolved.profile,
    rpc: resolved.rpc,
  })
}

export async function paperIngestUri(
  uri: string,
  options: ProbeOptions = {},
): Promise<unknown> {
  const resolved = resolveProbeOptions(options)
  return await invoke<unknown>('lxmf_paper_ingest_uri', {
    profile: resolved.profile,
    rpc: resolved.rpc,
    uri,
  })
}

export async function pollLxmfEvent(options: ProbeOptions = {}): Promise<LxmfRpcEvent | null> {
  const resolved = resolveProbeOptions(options)
  const payload = await invoke<unknown>('lxmf_poll_event', {
    profile: resolved.profile,
    rpc: resolved.rpc,
  })
  return parseLxmfRpcEventOrNull(payload)
}

export async function getLxmfProfile(options: ProbeOptions = {}): Promise<LxmfProfileInfo> {
  const resolved = resolveProbeOptions(options)
  const payload = await invoke<unknown>('lxmf_get_profile', {
    profile: resolved.profile,
    rpc: resolved.rpc,
  })
  return parseLxmfProfileInfo(payload)
}

export async function setLxmfDisplayName(
  displayName: string | null,
  options: ProbeOptions = {},
): Promise<LxmfProfileInfo> {
  const resolved = resolveProbeOptions(options)
  const payload = await invoke<unknown>('lxmf_set_display_name', {
    profile: resolved.profile,
    rpc: resolved.rpc,
    display_name: displayName,
  })
  return parseLxmfProfileInfo(payload)
}

export async function sendLxmfMessage(
  options: LxmfSendMessageOptions,
): Promise<LxmfSendMessageResponse> {
  const resolved = resolveProbeOptions(options)
  const payload = await invoke<unknown>('lxmf_send_message', {
    profile: resolved.profile,
    rpc: resolved.rpc,
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

export async function sendLxmfCommand(
  options: LxmfSendCommandOptions,
): Promise<LxmfSendMessageResponse> {
  const resolved = resolveProbeOptions(options)
  const payload = await invoke<unknown>('lxmf_send_command', {
    profile: resolved.profile,
    rpc: resolved.rpc,
    destination: options.destination,
    commands: options.commands ?? null,
    commands_hex: options.commandsHex ?? null,
    content: options.content ?? null,
    title: options.title ?? null,
    source: options.source ?? null,
    id: options.id ?? null,
    method: options.method ?? null,
    stamp_cost: options.stampCost ?? null,
    include_ticket: options.includeTicket ?? null,
  })
  return parseLxmfSendMessageResponse(payload)
}

export async function sendLxmfRichMessage(
  options: LxmfSendRichMessageOptions,
): Promise<LxmfSendMessageResponse> {
  const resolved = resolveProbeOptions(options)
  const payload = await invoke<unknown>('lxmf_send_rich_message', {
    profile: resolved.profile,
    rpc: resolved.rpc,
    destination: options.destination,
    content: options.content,
    title: options.title ?? null,
    source: options.source ?? null,
    id: options.id ?? null,
    attachments:
      options.attachments?.map((attachment) => ({
        name: attachment.name,
        data_base64: attachment.dataBase64,
        mime: attachment.mime ?? null,
        size_bytes: attachment.sizeBytes ?? null,
      })) ?? null,
    method: options.method ?? null,
    stamp_cost: options.stampCost ?? null,
    include_ticket: options.includeTicket ?? null,
  })
  return parseLxmfSendMessageResponse(payload)
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

function parseLxmfProfileInfo(value: unknown): LxmfProfileInfo {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('profile response must be an object')
  }
  const record = value as Record<string, unknown>
  if (typeof record.profile !== 'string') {
    throw new Error('profile response.profile must be a string')
  }
  if (typeof record.rpc !== 'string') {
    throw new Error('profile response.rpc must be a string')
  }
  if (typeof record.managed !== 'boolean') {
    throw new Error('profile response.managed must be a boolean')
  }
  if (record.display_name !== null && record.display_name !== undefined && typeof record.display_name !== 'string') {
    throw new Error('profile response.display_name must be a string or null')
  }
  const displayName =
    typeof record.display_name === 'string' ? record.display_name.trim() || null : null
  return {
    profile: record.profile,
    displayName,
    rpc: record.rpc,
    managed: record.managed,
  }
}

async function daemonControlAction(
  tauriCommand: 'daemon_start' | 'daemon_stop' | 'daemon_restart',
  options: DaemonControlOptions | ProbeOptions,
): Promise<LxmfDaemonLocalStatus> {
  const resolved = resolveProbeOptions(options)
  const payload = await invoke<unknown>(tauriCommand, {
    profile: resolved.profile,
    rpc: resolved.rpc,
    managed: 'managed' in options ? options.managed ?? null : null,
    reticulumd: 'reticulumd' in options ? options.reticulumd ?? null : null,
    transport:
      'transport' in options
        ? options.transport ?? getRuntimeTransportOption() ?? null
        : null,
  })
  return parseLxmfDaemonLocalStatus(payload)
}

function resolveProbeOptions(options: ProbeOptions): { profile: string | null; rpc: string | null } {
  const defaults = getRuntimeConnectionOptions()
  return {
    profile: options.profile ?? defaults.profile ?? null,
    rpc: options.rpc ?? defaults.rpc ?? null,
  }
}
