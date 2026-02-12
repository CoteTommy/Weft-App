import {
  parseLxmfAnnounceList,
  parseLxmfInterfaceList,
  parseLxmfInterfaceMetrics,
  parseLxmfMessageDeliveryTrace,
  parseLxmfMessageList,
  parseLxmfOutboundPropagationNode,
  parseLxmfPeerList,
  parseLxmfPropagationNodeList,
  type LxmfAnnounceListResponse,
  type LxmfInterfaceListResponse,
  type LxmfInterfaceMetricsResponse,
  type LxmfMessageDeliveryTraceResponse,
  type LxmfMessageListResponse,
  type LxmfOutboundPropagationNodeResponse,
  type LxmfPeerListResponse,
  type LxmfPropagationNodeListResponse,
} from '../lxmf-payloads'
import type { ProbeOptions } from './types'
import { invokeWithProbe } from './common'

export async function listLxmfMessages(options: ProbeOptions = {}): Promise<LxmfMessageListResponse> {
  const payload = await invokeWithProbe<unknown>('lxmf_list_messages', options)
  return parseLxmfMessageList(payload)
}

export async function listLxmfPeers(options: ProbeOptions = {}): Promise<LxmfPeerListResponse> {
  const payload = await invokeWithProbe<unknown>('lxmf_list_peers', options)
  return parseLxmfPeerList(payload)
}

export async function listLxmfInterfaces(options: ProbeOptions = {}): Promise<LxmfInterfaceListResponse> {
  const payload = await invokeWithProbe<unknown>('lxmf_list_interfaces', options)
  return parseLxmfInterfaceList(payload)
}

export async function listLxmfAnnounces(options: ProbeOptions = {}): Promise<LxmfAnnounceListResponse> {
  const payload = await invokeWithProbe<unknown>('lxmf_list_announces', options)
  return parseLxmfAnnounceList(payload)
}

export async function lxmfInterfaceMetrics(
  options: ProbeOptions = {},
): Promise<LxmfInterfaceMetricsResponse> {
  const payload = await invokeWithProbe<unknown>('lxmf_interface_metrics', options)
  return parseLxmfInterfaceMetrics(payload)
}

export async function listLxmfPropagationNodes(
  options: ProbeOptions = {},
): Promise<LxmfPropagationNodeListResponse> {
  const payload = await invokeWithProbe<unknown>('lxmf_list_propagation_nodes', options)
  return parseLxmfPropagationNodeList(payload)
}

export async function getLxmfOutboundPropagationNode(
  options: ProbeOptions = {},
): Promise<LxmfOutboundPropagationNodeResponse> {
  const payload = await invokeWithProbe<unknown>('lxmf_get_outbound_propagation_node', options)
  return parseLxmfOutboundPropagationNode(payload)
}

export async function setLxmfOutboundPropagationNode(
  peer: string | null,
  options: ProbeOptions = {},
): Promise<LxmfOutboundPropagationNodeResponse> {
  const payload = await invokeWithProbe<unknown>('lxmf_set_outbound_propagation_node', options, {
    peer,
  })
  return parseLxmfOutboundPropagationNode(payload)
}

export async function getLxmfMessageDeliveryTrace(
  messageId: string,
  options: ProbeOptions = {},
): Promise<LxmfMessageDeliveryTraceResponse> {
  const payload = await invokeWithProbe<unknown>('lxmf_message_delivery_trace', options, {
    message_id: messageId,
  })
  return parseLxmfMessageDeliveryTrace(payload)
}

export async function announceLxmfNow(options: ProbeOptions = {}): Promise<unknown> {
  return await invokeWithProbe<unknown>('lxmf_announce_now', options)
}

export async function paperIngestUri(uri: string, options: ProbeOptions = {}): Promise<unknown> {
  return await invokeWithProbe<unknown>('lxmf_paper_ingest_uri', options, { uri })
}

