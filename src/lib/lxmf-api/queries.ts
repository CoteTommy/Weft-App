import {
  type LxmfAnnounceListResponse,
  type LxmfInterfaceListResponse,
  type LxmfInterfaceMetricsResponse,
  type LxmfMessageDeliveryTraceResponse,
  type LxmfMessageListResponse,
  type LxmfOutboundPropagationNodeResponse,
  type LxmfPeerListResponse,
  type LxmfPropagationNodeListResponse,
  parseLxmfAnnounceList,
  parseLxmfInterfaceList,
  parseLxmfInterfaceMetrics,
  parseLxmfMessageDeliveryTrace,
  parseLxmfMessageList,
  parseLxmfOutboundPropagationNode,
  parseLxmfPeerList,
  parseLxmfPropagationNodeList,
} from '../lxmf-payloads'
import { invokeWithProbe } from './common'
import type { ProbeOptions } from './types'

export async function listLxmfMessages(
  options: ProbeOptions = {}
): Promise<LxmfMessageListResponse> {
  const payload = await invokeWithProbe<unknown>('lxmf_list_messages', options)
  return parseLxmfMessageList(payload)
}

export async function listLxmfPeers(options: ProbeOptions = {}): Promise<LxmfPeerListResponse> {
  const payload = await invokeWithProbe<unknown>('lxmf_list_peers', options)
  return parseLxmfPeerList(payload)
}

export async function listLxmfInterfaces(
  options: ProbeOptions = {}
): Promise<LxmfInterfaceListResponse> {
  const payload = await invokeWithProbe<unknown>('lxmf_list_interfaces', options)
  return parseLxmfInterfaceList(payload)
}

export type ListLxmfAnnouncesParams = {
  limit?: number
  beforeTs?: number
  cursor?: string
}

export async function listLxmfAnnounces(
  options: ProbeOptions = {},
  params: ListLxmfAnnouncesParams = {}
): Promise<LxmfAnnounceListResponse> {
  const fields: Record<string, unknown> = {}
  if (typeof params.limit === 'number' && Number.isFinite(params.limit)) {
    fields.limit = Math.trunc(params.limit)
  }
  if (typeof params.beforeTs === 'number' && Number.isFinite(params.beforeTs)) {
    fields.before_ts = Math.trunc(params.beforeTs)
  }
  if (typeof params.cursor === 'string' && params.cursor.trim().length > 0) {
    fields.cursor = params.cursor.trim()
  }
  const payload = await invokeWithProbe<unknown>('lxmf_list_announces', options, fields)
  return parseLxmfAnnounceList(payload)
}

export async function lxmfInterfaceMetrics(
  options: ProbeOptions = {}
): Promise<LxmfInterfaceMetricsResponse> {
  const payload = await invokeWithProbe<unknown>('lxmf_interface_metrics', options)
  return parseLxmfInterfaceMetrics(payload)
}

export async function listLxmfPropagationNodes(
  options: ProbeOptions = {}
): Promise<LxmfPropagationNodeListResponse> {
  const payload = await invokeWithProbe<unknown>('lxmf_list_propagation_nodes', options)
  return parseLxmfPropagationNodeList(payload)
}

export async function getLxmfOutboundPropagationNode(
  options: ProbeOptions = {}
): Promise<LxmfOutboundPropagationNodeResponse> {
  const payload = await invokeWithProbe<unknown>('lxmf_get_outbound_propagation_node', options)
  return parseLxmfOutboundPropagationNode(payload)
}

export async function setLxmfOutboundPropagationNode(
  peer: string | null,
  options: ProbeOptions = {}
): Promise<LxmfOutboundPropagationNodeResponse> {
  const payload = await invokeWithProbe<unknown>('lxmf_set_outbound_propagation_node', options, {
    peer,
  })
  return parseLxmfOutboundPropagationNode(payload)
}

export async function getLxmfMessageDeliveryTrace(
  messageId: string,
  options: ProbeOptions = {}
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
