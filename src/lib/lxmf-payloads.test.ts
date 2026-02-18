import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  parseLxmfAnnounceList,
  parseLxmfInterfaceList,
  parseLxmfMessageDeliveryTrace,
  parseLxmfMessageList,
  parseLxmfOutboundPropagationNode,
  parseLxmfPeerList,
  parseLxmfPropagationNodeList,
  parseLxmfRpcEventOrNull,
} from './lxmf-payloads'

function loadContractFixture(): Record<string, unknown> {
  const fixturePath = join(process.cwd(), 'docs', 'fixtures', 'contract-v2', 'payload-domains.json')
  const raw = readFileSync(fixturePath, 'utf8')
  return JSON.parse(raw) as Record<string, unknown>
}

describe('lxmf payload parsers', () => {
  const fixture = loadContractFixture()

  test('parses announce metadata contract v2', () => {
    const parsed = parseLxmfAnnounceList(fixture.announce_list)

    expect(parsed.announces).toHaveLength(1)
    expect(parsed.announces[0].capabilities).toEqual(['topic_broker', 'telemetry_relay'])
    expect(parsed.announces[0].name).toBe('Hub Node')
    expect(parsed.announces[0].rssi).toBe(-72.5)
    expect(parsed.next_cursor).toBe('1770855200')
    expect(parsed.meta?.contract_version).toBe('v2')
  })

  test('parses message delivery transitions', () => {
    const parsed = parseLxmfMessageDeliveryTrace(fixture.message_delivery_trace)
    expect(parsed.message_id).toBe('lxmf-interop-001')
    expect(parsed.transitions.map(entry => entry.status)).toEqual([
      'queued',
      'retrying: propagated relay',
      'delivered',
    ])
    expect(parsed.transitions[1].reason_code).toBe('timeout')
    expect(parsed.meta?.profile).toBe('weft2')
  })

  test('parses wrapped message delivery transitions', () => {
    const parsed = parseLxmfMessageDeliveryTrace({
      message_delivery_trace: fixture.message_delivery_trace,
    })
    expect(parsed.message_id).toBe('lxmf-interop-001')
    expect(parsed.transitions).toHaveLength(3)
  })

  test('parses message list with every payload domain fixture', () => {
    const parsed = parseLxmfMessageList(fixture.message_list)

    expect(parsed.messages).toHaveLength(1)
    expect(parsed.meta?.contract_version).toBe('v2')
    expect(parsed.meta?.rpc_endpoint).toBe('127.0.0.1:4245')
    expect(parsed.messages[0].fields?.['2']).toBeTruthy()
    expect(parsed.messages[0].fields?.['5']).toBeTruthy()
    expect(parsed.messages[0].fields?.['9']).toBeTruthy()
    expect(parsed.messages[0].fields?.['12']).toBeTruthy()
    expect(parsed.messages[0].fields?.['14']).toBeTruthy()
    expect(parsed.messages[0].fields?.['16']).toBeTruthy()
    expect(parsed.messages[0].fields?.attachments).toBeTruthy()
    expect(parsed.messages[0].fields?.paper).toBeTruthy()
  })

  test('parses peers/interfaces/propagation metadata', () => {
    const peers = parseLxmfPeerList(fixture.peer_list)
    expect(peers.meta?.profile).toBe('weft2')
    expect(peers.peers[0]?.name).toBe('Peer Alpha')

    const interfaces = parseLxmfInterfaceList(fixture.interface_list)
    expect(interfaces.meta?.contract_version).toBe('v2')
    expect(interfaces.interfaces[0]?.name).toBe('rmap.world')

    const nodes = parseLxmfPropagationNodeList(fixture.propagation_node_list)
    expect(nodes.meta?.rpc_endpoint).toBe('127.0.0.1:4245')
    expect(nodes.nodes[0]?.selected).toBe(true)

    const outbound = parseLxmfOutboundPropagationNode(fixture.outbound_propagation_node)
    expect(outbound.meta?.profile).toBe('weft2')
    expect(outbound.peer).toBe('66666666666666666666666666666666')
  })

  test('parses rpc event payload from tauri pump', () => {
    const parsed = parseLxmfRpcEventOrNull(fixture.rpc_event)
    expect(parsed?.event_type).toBe('announce_received')
    expect((parsed?.payload as { peer: string }).peer).toHaveLength(32)
  })
})
