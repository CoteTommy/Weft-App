import { parseLxmfDaemonLocalStatus, parseLxmfProbeReport, type LxmfDaemonLocalStatus, type LxmfProbeReport } from '../lxmf-contract'
import type { DaemonControlOptions, ProbeOptions } from './types'
import { daemonControlAction, invokeWithProbe } from './common'

export async function probeLxmf(options: ProbeOptions = {}): Promise<LxmfProbeReport> {
  const payload = await invokeWithProbe<unknown>('daemon_probe', options)
  return parseLxmfProbeReport(payload)
}

export async function daemonStatus(options: ProbeOptions = {}): Promise<LxmfDaemonLocalStatus> {
  const payload = await invokeWithProbe<unknown>('daemon_status', options)
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

