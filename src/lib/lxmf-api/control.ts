import {
  type LxmfDaemonLocalStatus,
  type LxmfProbeReport,
  parseLxmfDaemonLocalStatus,
  parseLxmfProbeReport,
} from '../lxmf-contract'
import { daemonControlAction, invokeDaemonProbeOrStatusV2 } from './common'
import type { DaemonControlOptions, ProbeOptions } from './types'

export async function probeLxmf(options: ProbeOptions = {}): Promise<LxmfProbeReport> {
  const payload = await invokeDaemonProbeOrStatusV2<unknown>('probe', options)
  return parseLxmfProbeReport(payload)
}

export async function daemonStatus(options: ProbeOptions = {}): Promise<LxmfDaemonLocalStatus> {
  const payload = await invokeDaemonProbeOrStatusV2<unknown>('status', options)
  return parseLxmfDaemonLocalStatus(payload)
}

export async function daemonStart(
  options: DaemonControlOptions = {}
): Promise<LxmfDaemonLocalStatus> {
  return daemonControlAction('daemon_start', options)
}

export async function daemonStop(options: ProbeOptions = {}): Promise<LxmfDaemonLocalStatus> {
  return daemonControlAction('daemon_stop', options)
}

export async function daemonRestart(
  options: DaemonControlOptions = {}
): Promise<LxmfDaemonLocalStatus> {
  return daemonControlAction('daemon_restart', options)
}
