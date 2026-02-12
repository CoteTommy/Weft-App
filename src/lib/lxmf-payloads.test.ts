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
          source: 'a'.repeat(32),
          destination: '',
          title: 'Announce',
          content: 'Peer seen',
          timestamp: 1_770_855_315,
          announce: {
            title: 'Announce',
            body: 'Peer seen',
            audience: 'local',
            priority: 'routine',
            posted_at: 1_770_855_315,
            capabilities: ['topic_broker', 'telemetry_relay'],
            name: 'Hub',
            name_source: 'pn_meta',
            first_seen: 1_770_855_300,
            seen_count: 5,
            app_data_hex: 'deadbeef',
            signal: {
              rssi: -70.5,
              snr: 11.25,
              q: 0.92,
            },
          },
        },
      ],
    })

    expect(parsed.announces).toHaveLength(1)
    expect(parsed.announces[0].announce.capabilities).toEqual([
      'topic_broker',
      'telemetry_relay',
    ])
    expect(parsed.announces[0].announce.name).toBe('Hub')
    expect(parsed.announces[0].announce.signal?.rssi).toBe(-70.5)
  })

  test('parses message delivery transitions', () => {
    const parsed = parseLxmfMessageDeliveryTrace({
      message_id: 'lxmf-123',
      transitions: [
        { status: 'queued', timestamp: 1_770_855_315 },
        { status: 'retrying: propagated relay', timestamp: 1_770_855_320 },
      ],
    })
    expect(parsed.message_id).toBe('lxmf-123')
    expect(parsed.transitions.map((entry) => entry.status)).toEqual([
      'queued',
      'retrying: propagated relay',
    ])
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
