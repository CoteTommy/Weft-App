import { describe, expect, test } from 'bun:test'
import {
  parseLxmfAnnounceList,
  parseLxmfMessageDeliveryTrace,
  parseLxmfRpcEventOrNull,
} from './lxmf-payloads'

describe('lxmf payload parsers', () => {
  test('parses announce metadata contract v2', () => {
    const parsed = parseLxmfAnnounceList({
      announces: [
        {
          id: 'announce-1',
          peer: 'a'.repeat(32),
          timestamp: 1_770_855_315,
          name: 'Hub',
          name_source: 'pn_meta',
          first_seen: 1_770_855_300,
          seen_count: 5,
          app_data_hex: 'deadbeef',
          capabilities: ['topic_broker', 'telemetry_relay'],
          rssi: -70.5,
          snr: 11.25,
          q: 0.92,
        },
      ],
      next_cursor: '1770855300',
      meta: {
        contract_version: 'v2',
        profile: null,
        rpc_endpoint: null,
      },
    })

    expect(parsed.announces).toHaveLength(1)
    expect(parsed.announces[0].capabilities).toEqual([
      'topic_broker',
      'telemetry_relay',
    ])
    expect(parsed.announces[0].name).toBe('Hub')
    expect(parsed.announces[0].rssi).toBe(-70.5)
    expect(parsed.next_cursor).toBe('1770855300')
    expect(parsed.meta?.contract_version).toBe('v2')
  })

  test('parses message delivery transitions', () => {
    const parsed = parseLxmfMessageDeliveryTrace({
      message_id: 'lxmf-123',
      transitions: [
        { status: 'queued', timestamp: 1_770_855_315 },
        {
          status: 'retrying: propagated relay',
          timestamp: 1_770_855_320,
          reason_code: 'timeout',
        },
      ],
    })
    expect(parsed.message_id).toBe('lxmf-123')
    expect(parsed.transitions.map((entry) => entry.status)).toEqual([
      'queued',
      'retrying: propagated relay',
    ])
    expect(parsed.transitions[1].reason_code).toBe('timeout')
  })

  test('parses rpc event payload from tauri pump', () => {
    const parsed = parseLxmfRpcEventOrNull({
      event_type: 'announce_received',
      payload: {
        peer: 'a'.repeat(32),
      },
    })
    expect(parsed?.event_type).toBe('announce_received')
    expect((parsed?.payload as { peer: string }).peer).toHaveLength(32)
  })
})
