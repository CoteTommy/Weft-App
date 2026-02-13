import {
  announceLxmfNow,
  daemonRestart,
  daemonStart,
  daemonStatus,
  daemonStop,
  listLxmfAnnounces,
  listLxmfPeers,
  listLxmfPropagationNodes,
  probeLxmf,
  sendLxmfCommand,
} from '@lib/lxmf-api'
import type { LxmfAnnounceRecord, LxmfPeerRecord, LxmfPropagationNodeRecord } from '@lib/lxmf-payloads'
import type { LxmfDaemonLocalStatus, LxmfProbeReport } from '@lib/lxmf-contract'

export interface CommandCenterSnapshot {
  status: LxmfDaemonLocalStatus
  probe: LxmfProbeReport
  peers: LxmfPeerRecord[]
  announces: LxmfAnnounceRecord[]
  propagationNodes: LxmfPropagationNodeRecord[]
}

export async function fetchCommandCenterSnapshot(): Promise<CommandCenterSnapshot> {
  const [status, probe, peers, announces, propagationNodes] = await Promise.all([
    daemonStatus(),
    probeLxmf(),
    listLxmfPeers().catch(() => ({ peers: [], meta: null })),
    listLxmfAnnounces({}, { limit: 60 }).catch(() => ({ announces: [], next_cursor: null, meta: null })),
    listLxmfPropagationNodes().catch(() => ({ nodes: [], meta: null })),
  ])
  return {
    status,
    probe,
    peers: peers.peers,
    announces: announces.announces,
    propagationNodes: propagationNodes.nodes,
  }
}

export async function runCommandCenterAction(
  action: 'announce_now' | 'daemon_start' | 'daemon_stop' | 'daemon_restart',
): Promise<void> {
  if (action === 'announce_now') {
    await announceLxmfNow()
    return
  }
  if (action === 'daemon_start') {
    await daemonStart({ managed: true })
    return
  }
  if (action === 'daemon_stop') {
    await daemonStop()
    return
  }
  await daemonRestart({ managed: true })
}

export async function dispatchRawCommand(input: {
  destination: string
  commandsText?: string
  commandsHexText?: string
  content?: string
  title?: string
}): Promise<string> {
  const destination = input.destination.trim().toLowerCase()
  if (!destination) {
    throw new Error('Destination is required.')
  }
  const commands = parseCsv(input.commandsText)
  const commandsHex = parseCsv(input.commandsHexText)
  if (commands.length === 0 && commandsHex.length === 0) {
    throw new Error('Enter at least one command token.')
  }
  const response = await sendLxmfCommand({
    destination,
    commands: commands.length > 0 ? commands : undefined,
    commandsHex: commandsHex.length > 0 ? commandsHex : undefined,
    content: input.content?.trim() || undefined,
    title: input.title?.trim() || undefined,
  })
  return response.resolved.destination
}

function parseCsv(value: string | undefined): string[] {
  if (!value) {
    return []
  }
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
}
