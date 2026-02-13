import { invoke } from '@tauri-apps/api/core'

import { getRuntimeConnectionOptions, getRuntimeTransportOption } from '@shared/runtime/preferences'

import { type LxmfDaemonLocalStatus, parseLxmfDaemonLocalStatus } from '../lxmf-contract'
import type {
  DaemonControlOptions,
  LxmfEventPumpStatus,
  LxmfProfileInfo,
  LxmfSendMessageResponse,
  ProbeOptions,
} from './types'

export function resolveProbeOptions(options: ProbeOptions): {
  profile: string | null
  rpc: string | null
} {
  const defaults = getRuntimeConnectionOptions()
  return {
    profile: options.profile ?? defaults.profile ?? null,
    rpc: options.rpc ?? defaults.rpc ?? null,
  }
}

export async function invokeWithProbe<TPayload = unknown>(
  command: string,
  options: ProbeOptions = {},
  fields: Record<string, unknown> = {}
): Promise<TPayload> {
  const resolved = resolveProbeOptions(options)
  return await invoke<TPayload>(command, {
    profile: resolved.profile,
    rpc: resolved.rpc,
    ...fields,
  })
}

export async function daemonControlAction(
  tauriCommand: 'daemon_start' | 'daemon_stop' | 'daemon_restart',
  options: DaemonControlOptions | ProbeOptions
): Promise<LxmfDaemonLocalStatus> {
  const resolved = resolveProbeOptions(options)
  const payload = await invoke<unknown>(tauriCommand, {
    profile: resolved.profile,
    rpc: resolved.rpc,
    managed: 'managed' in options ? (options.managed ?? null) : null,
    reticulumd: 'reticulumd' in options ? (options.reticulumd ?? null) : null,
    transport:
      'transport' in options ? (options.transport ?? getRuntimeTransportOption() ?? null) : null,
  })
  return parseLxmfDaemonLocalStatus(payload)
}

export function parseLxmfSendMessageResponse(value: unknown): LxmfSendMessageResponse {
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

export function parseLxmfProfileInfo(value: unknown): LxmfProfileInfo {
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
  if (
    record.display_name !== null &&
    record.display_name !== undefined &&
    typeof record.display_name !== 'string'
  ) {
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

export function parseEventPumpStatus(value: unknown): LxmfEventPumpStatus {
  const record = asObject(value, 'event_pump_status')
  return {
    running: asBoolean(record.running, 'event_pump_status.running'),
    intervalMs: asOptionalNumber(record.interval_ms, 'event_pump_status.interval_ms'),
  }
}

export function asObject(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${path} must be an object`)
  }
  return value as Record<string, unknown>
}

function asBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`${path} must be a boolean`)
  }
  return value
}

function asOptionalNumber(value: unknown, path: string): number | undefined {
  if (value === null || value === undefined) {
    return undefined
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${path} must be a finite number`)
  }
  return value
}
