import type { SettingsSnapshot } from '@shared/types/settings'
import type { LxmfProbeReport } from '@lib/lxmf-contract'
import type { LxmfMessageRecord } from '@lib/lxmf-payloads'

export function buildInteropSnapshot(input: {
  expectedProfile?: string
  expectedRpc?: string
  actualProfile: string
  actualRpc: string
  probe: LxmfProbeReport
  relaySelected: boolean
  propagationNodes: number
  messages: LxmfMessageRecord[]
  runtimeConnected: boolean
}): SettingsSnapshot['interop'] {
  const expectedProfile = normalizeProfileForCompare(input.expectedProfile)
  const actualProfile = normalizeProfileForCompare(input.actualProfile)
  const expectedRpc = normalizeRpcForCompare(input.expectedRpc)
  const actualRpc = normalizeRpcForCompare(input.actualRpc)
  const probeRpc = normalizeRpcForCompare(input.probe.rpc.endpoint)

  const profileMatch = expectedProfile === actualProfile
  const rpcMatch = !expectedRpc || expectedRpc === actualRpc || expectedRpc === probeRpc

  let lastInboundTs: number | null = null
  let lastOutboundTs: number | null = null
  let outboundPending = 0
  let outboundFailed = 0

  for (const message of input.messages) {
    const direction = String(message.direction || '')
      .trim()
      .toLowerCase()
    const ts = normalizeTimestamp(message.timestamp)
    if (direction === 'in') {
      if (ts !== null && (lastInboundTs === null || ts > lastInboundTs)) {
        lastInboundTs = ts
      }
      continue
    }
    if (direction === 'out') {
      if (ts !== null && (lastOutboundTs === null || ts > lastOutboundTs)) {
        lastOutboundTs = ts
      }
      const status = (message.receipt_status || '').trim().toLowerCase()
      if (isPendingStatus(status)) {
        outboundPending += 1
      } else if (isFailedStatus(status)) {
        outboundFailed += 1
      }
    }
  }

  const now = Date.now()
  const inboundAgeMs = lastInboundTs ? now - lastInboundTs : null
  const hasRelayUnsetFailure = input.messages.some(message => {
    const direction = String(message.direction || '')
      .trim()
      .toLowerCase()
    if (direction !== 'out') {
      return false
    }
    const status = (message.receipt_status || '').trim().toLowerCase()
    return status.startsWith('failed') && status.includes('no propagation relay selected')
  })

  const sendPath: SettingsSnapshot['interop']['sendPath'] =
    !input.runtimeConnected ||
    !input.probe.rpc.reachable ||
    !profileMatch ||
    !rpcMatch ||
    hasRelayUnsetFailure
      ? 'blocked'
      : outboundPending > 0 || outboundFailed > 0
        ? 'degraded'
        : 'ok'

  const receivePath: SettingsSnapshot['interop']['receivePath'] =
    !input.runtimeConnected ||
    !input.probe.rpc.reachable ||
    !input.probe.events.reachable ||
    !profileMatch ||
    !rpcMatch
      ? 'blocked'
      : inboundAgeMs === null
        ? 'unknown'
        : inboundAgeMs > 1000 * 60 * 60 * 24
          ? 'degraded'
          : 'ok'

  const findings: string[] = []
  if (!input.runtimeConnected) {
    findings.push('Runtime is offline. Start/restart daemon before testing interop.')
  }
  if (!input.probe.rpc.reachable) {
    findings.push('RPC endpoint is unreachable from Weft.')
  }
  if (!input.probe.events.reachable) {
    findings.push('Event stream is unreachable. Inbound updates may not appear in real time.')
  }
  if (!profileMatch) {
    findings.push(`Active profile is ${input.actualProfile}, expected ${expectedProfile}.`)
  }
  if (!rpcMatch) {
    findings.push(`Active RPC is ${input.actualRpc}, expected ${input.expectedRpc ?? 'auto'}.`)
  }
  if (hasRelayUnsetFailure) {
    findings.push('Outbound failed because no propagation relay is selected.')
  }
  if (!input.relaySelected && input.propagationNodes > 0) {
    findings.push('Propagation relay is not selected; opportunistic sends may fail offline.')
  }
  if (input.relaySelected && input.propagationNodes === 0) {
    findings.push('Relay is selected but no propagation nodes are currently announced.')
  }
  if (outboundPending > 0) {
    findings.push(`${outboundPending} outbound message(s) are still pending delivery.`)
  }
  if (outboundFailed > 0) {
    findings.push(`${outboundFailed} outbound message(s) are in failed state.`)
  }
  if (receivePath === 'degraded') {
    findings.push('No inbound messages seen recently; verify peer announces and route visibility.')
  }

  const status: SettingsSnapshot['interop']['status'] =
    sendPath === 'blocked' || receivePath === 'blocked'
      ? 'critical'
      : sendPath === 'degraded' || receivePath === 'degraded' || findings.length > 0
        ? 'warning'
        : 'healthy'

  return {
    status,
    expectedProfile,
    expectedRpc,
    actualProfile: input.actualProfile,
    actualRpc: input.actualRpc,
    profileMatch,
    rpcMatch,
    rpcReachable: input.probe.rpc.reachable,
    eventsReachable: input.probe.events.reachable,
    sendPath,
    receivePath,
    outboundPending,
    outboundFailed,
    lastInboundTs,
    lastOutboundTs,
    relaySelected: input.relaySelected,
    propagationNodes: input.propagationNodes,
    findings,
  }
}

function normalizeProfileForCompare(value: string | undefined | null): string {
  const normalized = value?.trim().toLowerCase()
  if (!normalized || normalized === 'default') {
    return 'default'
  }
  return normalized
}

function normalizeRpcForCompare(value: string | undefined | null): string | null {
  if (!value) {
    return null
  }
  let normalized = value.trim().toLowerCase()
  if (!normalized) {
    return null
  }
  if (normalized.startsWith('http://')) {
    normalized = normalized.slice('http://'.length)
  }
  if (normalized.startsWith('https://')) {
    normalized = normalized.slice('https://'.length)
  }
  normalized = normalized.replace(/\/+$/, '')
  return normalized || null
}

function normalizeTimestamp(value: number): number | null {
  if (!Number.isFinite(value)) {
    return null
  }
  if (value > 1_000_000_000_000) {
    return Math.trunc(value)
  }
  return Math.trunc(value * 1000)
}

function isPendingStatus(status: string): boolean {
  return status === 'queued' || status === 'sending' || status.startsWith('retrying')
}

function isFailedStatus(status: string): boolean {
  return status.startsWith('failed')
}
