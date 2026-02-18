import { describe, expect, test } from 'bun:test'

import { parseLxmfProbeReport } from './lxmf-contract'

describe('parseLxmfProbeReport', () => {
  test('accepts probe payloads with nullable optional fields', () => {
    const parsed = parseLxmfProbeReport({
      profile: 'default',
      local: {
        running: true,
        pid: 1234,
        rpc: '127.0.0.1:4243',
        profile: 'default',
        managed: true,
        transport: '127.0.0.1:0',
        transport_inferred: false,
        log_path: '/tmp/daemon.log',
      },
      rpc: {
        reachable: true,
        endpoint: '127.0.0.1:4243',
        method: 'daemon_status_ex',
        roundtrip_ms: 5,
        identity_hash: '00112233445566778899aabbccddeeff',
        status: { ok: true },
        errors: [],
      },
      events: {
        reachable: true,
        endpoint: '127.0.0.1:4243',
        roundtrip_ms: 1,
        event_type: null,
        payload: null,
        error: null,
      },
    })

    expect(parsed.profile).toBe('default')
    expect(parsed.rpc.reachable).toBe(true)
    expect(parsed.events.event_type).toBeNull()
  })

  test('parses daemon_status_ex capabilities', () => {
    const parsed = parseLxmfProbeReport({
      profile: 'default',
      local: {
        running: true,
        pid: 4321,
        rpc: '127.0.0.1:4243',
        profile: 'default',
        managed: true,
        transport: null,
        transport_inferred: false,
        log_path: '/tmp/daemon.log',
      },
      rpc: {
        reachable: true,
        endpoint: '127.0.0.1:4243',
        method: 'daemon_status_ex',
        roundtrip_ms: 4,
        identity_hash: 'cafebabe',
        status: {
          identity_hash: 'cafebabe',
          running: true,
          peer_count: 7,
          capabilities: ['daemon_status_ex', 'list_messages', 'propagation_status'],
        },
        errors: [],
      },
      events: {
        reachable: true,
        endpoint: '127.0.0.1:4243',
        roundtrip_ms: 1,
        event_type: null,
        payload: null,
        error: null,
      },
    })

    expect(parsed.rpc.status?.identity_hash).toBe('cafebabe')
    expect(parsed.rpc.status?.running).toBe(true)
    expect(parsed.rpc.status?.capabilities).toEqual([
      'daemon_status_ex',
      'list_messages',
      'propagation_status',
    ])
  })

  test('rejects invalid profile type', () => {
    expect(() =>
      parseLxmfProbeReport({
        profile: 9,
        local: {},
        rpc: {},
        events: {},
      })
    ).toThrow('probe.profile must be a string')
  })
})
