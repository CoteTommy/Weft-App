import { describe, expect, test } from 'bun:test'

import type { LxmfProbeReport } from '@lib/lxmf-contract'
import type { LxmfMessageRecord } from '@lib/lxmf-payloads'

import { buildInteropSnapshot } from '../services/interopHealth'

function makeProbe(partial?: Partial<LxmfProbeReport>): LxmfProbeReport {
  return {
    profile: 'weft2',
    local: {
      running: true,
      pid: 1,
      rpc: '127.0.0.1:4245',
      profile: 'weft2',
      managed: true,
      transport: '127.0.0.1:0',
      transport_inferred: false,
      log_path: '/tmp/weft.log',
    },
    rpc: {
      reachable: true,
      endpoint: '127.0.0.1:4245',
      method: 'status',
      roundtrip_ms: 2,
      identity_hash: 'aa'.repeat(16),
      status: null,
      errors: [],
    },
    events: {
      reachable: true,
      endpoint: 'ws://127.0.0.1:4245/events',
      roundtrip_ms: 3,
      event_type: null,
      payload: null,
      error: null,
    },
    ...partial,
  }
}

function makeMessage(input: {
  id: string
  direction: 'in' | 'out'
  timestamp: number
  receipt_status?: string | null
}): LxmfMessageRecord {
  return {
    id: input.id,
    source: 'src',
    destination: 'dst',
    title: '',
    content: '',
    timestamp: input.timestamp,
    direction: input.direction,
    fields: null,
    receipt_status: input.receipt_status ?? null,
  }
}

describe('buildInteropSnapshot', () => {
  test('marks healthy when profile/rpc match and flow is stable', () => {
    const nowSec = Math.floor(Date.now() / 1000)
    const result = buildInteropSnapshot({
      expectedProfile: 'weft2',
      expectedRpc: '127.0.0.1:4245',
      actualProfile: 'weft2',
      actualRpc: '127.0.0.1:4245',
      probe: makeProbe(),
      relaySelected: true,
      propagationNodes: 3,
      runtimeConnected: true,
      messages: [
        makeMessage({ id: 'in-1', direction: 'in', timestamp: nowSec - 60 }),
        makeMessage({
          id: 'out-1',
          direction: 'out',
          timestamp: nowSec - 50,
          receipt_status: 'delivered',
        }),
      ],
    })

    expect(result.status).toBe('healthy')
    expect(result.sendPath).toBe('ok')
    expect(result.receivePath).toBe('ok')
    expect(result.findings).toEqual([])
  })

  test('flags critical on profile mismatch and offline runtime', () => {
    const result = buildInteropSnapshot({
      expectedProfile: 'weft2',
      expectedRpc: '127.0.0.1:4245',
      actualProfile: 'default',
      actualRpc: '127.0.0.1:4242',
      probe: makeProbe({
        rpc: { ...makeProbe().rpc, reachable: false, endpoint: '127.0.0.1:9999' },
        events: { ...makeProbe().events, reachable: false },
      }),
      relaySelected: false,
      propagationNodes: 0,
      runtimeConnected: false,
      messages: [],
    })

    expect(result.status).toBe('critical')
    expect(result.sendPath).toBe('blocked')
    expect(result.receivePath).toBe('blocked')
    expect(result.profileMatch).toBe(false)
    expect(result.rpcMatch).toBe(false)
    expect(result.findings.some((item) => item.includes('Runtime is offline'))).toBe(true)
  })

  test('detects relay-unset failures and pending outbound queue', () => {
    const nowSec = Math.floor(Date.now() / 1000)
    const result = buildInteropSnapshot({
      expectedProfile: 'weft2',
      expectedRpc: '127.0.0.1:4245',
      actualProfile: 'weft2',
      actualRpc: '127.0.0.1:4245',
      probe: makeProbe(),
      relaySelected: false,
      propagationNodes: 2,
      runtimeConnected: true,
      messages: [
        makeMessage({
          id: 'out-1',
          direction: 'out',
          timestamp: nowSec - 120,
          receipt_status: 'failed: no propagation relay selected',
        }),
        makeMessage({
          id: 'out-2',
          direction: 'out',
          timestamp: nowSec - 100,
          receipt_status: 'retrying: propagated relay',
        }),
      ],
    })

    expect(result.sendPath).toBe('blocked')
    expect(result.outboundPending).toBe(1)
    expect(result.outboundFailed).toBe(1)
    expect(result.findings.some((item) => item.includes('no propagation relay'))).toBe(true)
  })
})
