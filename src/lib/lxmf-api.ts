import { invoke } from '@tauri-apps/api/core'
import {
  parseLxmfDaemonLocalStatus,
  parseLxmfProbeReport,
  type LxmfDaemonLocalStatus,
  type LxmfProbeReport,
} from '../../shared/lxmf-probe'

export type ProbeOptions = {
  profile?: string
  rpc?: string
}

export type DaemonControlOptions = ProbeOptions & {
  managed?: boolean
  reticulumd?: string
  transport?: string
}

export async function probeLxmf(options: ProbeOptions = {}): Promise<LxmfProbeReport> {
  if (isTauriRuntime()) {
    const payload = await invoke<unknown>('daemon_probe', {
      profile: options.profile ?? null,
      rpc: options.rpc ?? null,
    })
    return parseLxmfProbeReport(payload)
  }

  const query = new URLSearchParams()
  if (options.profile) {
    query.set('profile', options.profile)
  }
  if (options.rpc) {
    query.set('rpc', options.rpc)
  }

  const response = await fetch(`/api/lxmf/probe${query.size ? `?${query.toString()}` : ''}`)
  if (!response.ok) {
    const detail = await readErrorDetail(response)
    throw new Error(detail ?? `probe request failed with status ${response.status}`)
  }

  const payload = await response.json()
  return parseLxmfProbeReport(payload)
}

export async function daemonStatus(options: ProbeOptions = {}): Promise<LxmfDaemonLocalStatus> {
  if (isTauriRuntime()) {
    const payload = await invoke<unknown>('daemon_status', {
      profile: options.profile ?? null,
      rpc: options.rpc ?? null,
    })
    return parseLxmfDaemonLocalStatus(payload)
  }

  const response = await fetch(buildApiPath('/api/lxmf/daemon/status', options))
  if (!response.ok) {
    const detail = await readErrorDetail(response)
    throw new Error(detail ?? `daemon status request failed with status ${response.status}`)
  }
  return parseLxmfDaemonLocalStatus(await response.json())
}

export async function daemonStart(options: DaemonControlOptions = {}): Promise<LxmfDaemonLocalStatus> {
  return daemonControlAction('/api/lxmf/daemon/start', 'daemon_start', options)
}

export async function daemonStop(options: ProbeOptions = {}): Promise<LxmfDaemonLocalStatus> {
  return daemonControlAction('/api/lxmf/daemon/stop', 'daemon_stop', options)
}

export async function daemonRestart(
  options: DaemonControlOptions = {},
): Promise<LxmfDaemonLocalStatus> {
  return daemonControlAction('/api/lxmf/daemon/restart', 'daemon_restart', options)
}

async function readErrorDetail(response: Response): Promise<string | null> {
  try {
    const body = (await response.json()) as { error?: unknown }
    if (typeof body.error === 'string' && body.error.trim().length > 0) {
      return body.error
    }
    return null
  } catch {
    return null
  }
}

function isTauriRuntime(): boolean {
  if (typeof window === 'undefined') {
    return false
  }
  return Boolean((window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__)
}

function buildApiPath(path: string, options: ProbeOptions): string {
  const query = new URLSearchParams()
  if (options.profile) {
    query.set('profile', options.profile)
  }
  if (options.rpc) {
    query.set('rpc', options.rpc)
  }
  return query.size > 0 ? `${path}?${query.toString()}` : path
}

async function daemonControlAction(
  path: string,
  tauriCommand: 'daemon_start' | 'daemon_stop' | 'daemon_restart',
  options: DaemonControlOptions | ProbeOptions,
): Promise<LxmfDaemonLocalStatus> {
  if (isTauriRuntime()) {
    const payload = await invoke<unknown>(tauriCommand, {
      profile: options.profile ?? null,
      rpc: options.rpc ?? null,
      managed: 'managed' in options ? options.managed ?? null : null,
      reticulumd: 'reticulumd' in options ? options.reticulumd ?? null : null,
      transport: 'transport' in options ? options.transport ?? null : null,
    })
    return parseLxmfDaemonLocalStatus(payload)
  }

  const response = await fetch(buildApiPath(path, options), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      managed: 'managed' in options ? options.managed : undefined,
      reticulumd: 'reticulumd' in options ? options.reticulumd : undefined,
      transport: 'transport' in options ? options.transport : undefined,
    }),
  })

  if (!response.ok) {
    const detail = await readErrorDetail(response)
    throw new Error(detail ?? `${path} failed with status ${response.status}`)
  }

  return parseLxmfDaemonLocalStatus(await response.json())
}
