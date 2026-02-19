import {
  type LxmfAnnounceListResponse,
  type LxmfClearResponse,
  type LxmfDeliveryPolicyResponse,
  type LxmfInterfaceListResponse,
  type LxmfInterfaceMetricsResponse,
  type LxmfMessageDeliveryTraceResponse,
  type LxmfMessageListResponse,
  type LxmfOutboundPropagationNodeResponse,
  type LxmfPeerListResponse,
  type LxmfPeerSyncResponse,
  type LxmfPeerUnpeerResponse,
  type LxmfPropagationFetchResponse,
  type LxmfPropagationIngestResponse,
  type LxmfPropagationNodeListResponse,
  type LxmfPropagationStatusResponse,
  type LxmfReloadConfigResponse,
  type LxmfStampPolicyResponse,
  type LxmfTicketGenerateResponse,
  parseLxmfAnnounceList,
  parseLxmfClearResponse,
  parseLxmfDeliveryPolicyResponse,
  parseLxmfInterfaceList,
  parseLxmfInterfaceMetrics,
  parseLxmfMessageDeliveryTrace,
  parseLxmfMessageList,
  parseLxmfOutboundPropagationNode,
  parseLxmfPeerList,
  parseLxmfPeerSyncResponse,
  parseLxmfPeerUnpeerResponse,
  parseLxmfPropagationFetchResponse,
  parseLxmfPropagationIngestResponse,
  parseLxmfPropagationNodeList,
  parseLxmfPropagationStatusResponse,
  parseLxmfReloadConfigResponse,
  parseLxmfSetInterfacesResponse,
  parseLxmfStampPolicyResponse,
  parseLxmfTicketGenerateResponse,
} from '../lxmf-payloads'
import { asObject, invokeWithProbe } from './common'
import type {
  LxmfAttachmentBlobResponse,
  LxmfAttachmentBytesResponse,
  LxmfAttachmentHandle,
  LxmfDeliveryPolicyUpdate,
  LxmfFilesQueryResponse,
  LxmfIndexStatus,
  LxmfMapPointsQueryResponse,
  LxmfPropagationEnableInput,
  LxmfPropagationFetchInput,
  LxmfPropagationIngestInput,
  LxmfRuntimeMetrics,
  LxmfSearchResponse,
  LxmfSetInterfacesInput,
  LxmfSetInterfacesResponse,
  LxmfStampPolicyUpdate,
  LxmfThreadMessageQueryResponse,
  LxmfThreadQueryResponse,
  LxmfTicketGenerateInput,
  ProbeOptions,
} from './types'

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

export async function clearLxmfMessages(options: ProbeOptions = {}): Promise<LxmfClearResponse> {
  const payload = await invokeWithProbe<unknown>('lxmf_clear_messages', options)
  return parseLxmfClearResponse(payload)
}

export async function clearLxmfPeers(options: ProbeOptions = {}): Promise<LxmfClearResponse> {
  const payload = await invokeWithProbe<unknown>('lxmf_clear_peers', options)
  return parseLxmfClearResponse(payload)
}

export async function setLxmfInterfaces(
  interfaces: LxmfSetInterfacesInput[],
  options: ProbeOptions = {}
): Promise<LxmfSetInterfacesResponse> {
  const payload = await invokeWithProbe<unknown>('lxmf_set_interfaces', options, {
    interfaces: interfaces.map(interfaceEntry => ({
      kind: interfaceEntry.kind,
      enabled: interfaceEntry.enabled,
      host: interfaceEntry.host ?? null,
      port: interfaceEntry.port ?? null,
    })),
  })
  return parseLxmfSetInterfacesResponse(payload)
}

export async function reloadLxmfConfig(
  options: ProbeOptions = {}
): Promise<LxmfReloadConfigResponse> {
  const payload = await invokeWithProbe<unknown>('lxmf_reload_config', options)
  return parseLxmfReloadConfigResponse(payload)
}

export async function syncLxmfPeer(
  peer: string,
  options: ProbeOptions = {}
): Promise<LxmfPeerSyncResponse> {
  const payload = await invokeWithProbe<unknown>('lxmf_peer_sync', options, {
    peer,
  })
  return parseLxmfPeerSyncResponse(payload)
}

export async function unpeerLxmfPeer(
  peer: string,
  options: ProbeOptions = {}
): Promise<LxmfPeerUnpeerResponse> {
  const payload = await invokeWithProbe<unknown>('lxmf_peer_unpeer', options, {
    peer,
  })
  return parseLxmfPeerUnpeerResponse(payload)
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
    fields.beforeTs = Math.trunc(params.beforeTs)
  }
  if (typeof params.cursor === 'string' && params.cursor.trim().length > 0) {
    fields.cursor = params.cursor.trim()
  }
  const payload = await invokeWithProbe<unknown>('lxmf_list_announces', options, fields)
  return parseLxmfAnnounceList(payload)
}

export async function getLxmfDeliveryPolicy(
  options: ProbeOptions = {}
): Promise<LxmfDeliveryPolicyResponse> {
  const payload = await invokeWithProbe<unknown>('lxmf_get_delivery_policy', options)
  return parseLxmfDeliveryPolicyResponse(payload)
}

export async function setLxmfDeliveryPolicy(
  input: LxmfDeliveryPolicyUpdate,
  options: ProbeOptions = {}
): Promise<LxmfDeliveryPolicyResponse> {
  const payload = await invokeWithProbe<unknown>('lxmf_set_delivery_policy', options, {
    policy: {
      auth_required: input.authRequired ?? null,
      allowed_destinations: input.allowedDestinations ?? null,
      denied_destinations: input.deniedDestinations ?? null,
      ignored_destinations: input.ignoredDestinations ?? null,
      prioritised_destinations: input.prioritisedDestinations ?? null,
    },
  })
  return parseLxmfDeliveryPolicyResponse(payload)
}

export async function getLxmfPropagationStatus(
  options: ProbeOptions = {}
): Promise<LxmfPropagationStatusResponse> {
  const payload = await invokeWithProbe<unknown>('lxmf_propagation_status', options)
  return parseLxmfPropagationStatusResponse(payload)
}

export async function setLxmfPropagationStatus(
  input: LxmfPropagationEnableInput,
  options: ProbeOptions = {}
): Promise<LxmfPropagationStatusResponse> {
  const payload = await invokeWithProbe<unknown>('lxmf_propagation_enable', options, {
    enabled: input.enabled,
    storeRoot: input.storeRoot ?? null,
    targetCost: input.targetCost ?? null,
  })
  return parseLxmfPropagationStatusResponse(payload)
}

export async function ingestLxmfPropagation(
  input: LxmfPropagationIngestInput,
  options: ProbeOptions = {}
): Promise<LxmfPropagationIngestResponse> {
  const payload = await invokeWithProbe<unknown>('lxmf_propagation_ingest', options, {
    transientId: input.transientId ?? null,
    payloadHex: input.payloadHex ?? null,
  })
  return parseLxmfPropagationIngestResponse(payload)
}

export async function fetchLxmfPropagation(
  input: LxmfPropagationFetchInput,
  options: ProbeOptions = {}
): Promise<LxmfPropagationFetchResponse> {
  const payload = await invokeWithProbe<unknown>('lxmf_propagation_fetch', options, {
    transientId: input.transientId,
  })
  return parseLxmfPropagationFetchResponse(payload)
}

export async function lxmfInterfaceMetrics(
  options: ProbeOptions = {}
): Promise<LxmfInterfaceMetricsResponse> {
  const payload = await invokeWithProbe<unknown>('lxmf_interface_metrics', options)
  return parseLxmfInterfaceMetrics(payload)
}

export async function getLxmfStampPolicy(
  options: ProbeOptions = {}
): Promise<LxmfStampPolicyResponse> {
  const payload = await invokeWithProbe<unknown>('lxmf_stamp_policy_get', options)
  return parseLxmfStampPolicyResponse(payload)
}

export async function setLxmfStampPolicy(
  input: LxmfStampPolicyUpdate,
  options: ProbeOptions = {}
): Promise<LxmfStampPolicyResponse> {
  const payload = await invokeWithProbe<unknown>('lxmf_stamp_policy_set', options, {
    targetCost: input.targetCost ?? null,
    flexibility: input.flexibility ?? null,
  })
  return parseLxmfStampPolicyResponse(payload)
}

export async function generateLxmfTicket(
  input: LxmfTicketGenerateInput,
  options: ProbeOptions = {}
): Promise<LxmfTicketGenerateResponse> {
  const payload = await invokeWithProbe<unknown>('lxmf_ticket_generate', options, {
    destination: input.destination,
    ttlSecs: input.ttlSecs ?? null,
  })
  return parseLxmfTicketGenerateResponse(payload)
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
    messageId,
  })
  return parseLxmfMessageDeliveryTrace(payload)
}

export async function announceLxmfNow(options: ProbeOptions = {}): Promise<unknown> {
  return await invokeWithProbe<unknown>('lxmf_announce_now', options)
}

export async function paperIngestUri(uri: string, options: ProbeOptions = {}): Promise<unknown> {
  return await invokeWithProbe<unknown>('lxmf_paper_ingest_uri', options, { uri })
}

export async function lxmfIndexStatus(options: ProbeOptions = {}): Promise<LxmfIndexStatus> {
  const payload = await invokeWithProbe<unknown>('lxmf_index_status', options)
  return parseIndexStatus(payload)
}

export async function lxmfQueryThreads(
  options: ProbeOptions = {},
  params: {
    query?: string
    limit?: number
    cursor?: string
    pinnedOnly?: boolean
  } = {}
): Promise<LxmfThreadQueryResponse> {
  return queryThreadsPage(options, params)
}

export async function queryThreadsPage(
  options: ProbeOptions = {},
  params: {
    query?: string
    limit?: number
    cursor?: string
    pinnedOnly?: boolean
  } = {}
): Promise<LxmfThreadQueryResponse> {
  const payload = await invokeWithProbe<unknown>('query_threads_page', options, {
    query: params.query ?? null,
    limit: params.limit ?? null,
    cursor: params.cursor ?? null,
    pinnedOnly: params.pinnedOnly ?? null,
  })
  return parseThreadQueryResponse(payload)
}

export async function lxmfQueryThreadMessages(
  threadId: string,
  options: ProbeOptions = {},
  params: {
    query?: string
    limit?: number
    cursor?: string
  } = {}
): Promise<LxmfThreadMessageQueryResponse> {
  return queryThreadMessagesPage(threadId, options, params)
}

export async function queryThreadMessagesPage(
  threadId: string,
  options: ProbeOptions = {},
  params: {
    query?: string
    limit?: number
    cursor?: string
  } = {}
): Promise<LxmfThreadMessageQueryResponse> {
  const payload = await invokeWithProbe<unknown>('query_thread_messages_page', options, {
    threadId,
    query: params.query ?? null,
    limit: params.limit ?? null,
    cursor: params.cursor ?? null,
  })
  return parseThreadMessageQueryResponse(payload)
}

export async function lxmfSearchMessages(
  query: string,
  options: ProbeOptions = {},
  params: {
    threadId?: string
    limit?: number
    cursor?: string
  } = {}
): Promise<LxmfSearchResponse> {
  const payload = await invokeWithProbe<unknown>('lxmf_search_messages', options, {
    query,
    threadId: params.threadId ?? null,
    limit: params.limit ?? null,
    cursor: params.cursor ?? null,
  })
  return parseSearchResponse(payload)
}

export async function lxmfQueryFiles(
  options: ProbeOptions = {},
  params: {
    query?: string
    kind?: string
    limit?: number
    cursor?: string
    includeBytes?: boolean
  } = {}
): Promise<LxmfFilesQueryResponse> {
  return queryFilesPage(options, params)
}

export async function queryFilesPage(
  options: ProbeOptions = {},
  params: {
    query?: string
    kind?: string
    limit?: number
    cursor?: string
    includeBytes?: boolean
  } = {}
): Promise<LxmfFilesQueryResponse> {
  const payload = await invokeWithProbe<unknown>('query_files_page', options, {
    query: params.query ?? null,
    kind: params.kind ?? null,
    limit: params.limit ?? null,
    cursor: params.cursor ?? null,
    includeBytes: params.includeBytes ?? null,
  })
  return parseFilesQueryResponse(payload)
}

export async function lxmfQueryMapPoints(
  options: ProbeOptions = {},
  params: {
    query?: string
    limit?: number
    cursor?: string
  } = {}
): Promise<LxmfMapPointsQueryResponse> {
  const payload = await invokeWithProbe<unknown>('lxmf_query_map_points', options, {
    query: params.query ?? null,
    limit: params.limit ?? null,
    cursor: params.cursor ?? null,
  })
  return parseMapPointsQueryResponse(payload)
}

export async function lxmfGetAttachmentBlob(
  messageId: string,
  attachmentName: string,
  options: ProbeOptions = {}
): Promise<LxmfAttachmentBlobResponse> {
  const payload = await invokeWithProbe<unknown>('lxmf_get_attachment_blob', options, {
    messageId,
    attachmentName,
  })
  return parseAttachmentBlobResponse(payload)
}

export async function getAttachmentBytes(
  attachmentId: string,
  options: ProbeOptions = {}
): Promise<LxmfAttachmentBytesResponse> {
  const payload = await invokeWithProbe<unknown>('get_attachment_bytes', options, {
    attachmentId,
  })
  return parseAttachmentBytesResponse(payload)
}

export async function openAttachmentHandle(
  attachmentId: string,
  disposition: 'preview' | 'download' = 'preview',
  options: ProbeOptions = {}
): Promise<LxmfAttachmentHandle> {
  const payload = await invokeWithProbe<unknown>('open_attachment_handle', options, {
    attachmentId,
    disposition,
  })
  return parseAttachmentHandleResponse(payload)
}

export async function closeAttachmentHandle(
  handleId: string,
  options: ProbeOptions = {}
): Promise<{ closed: boolean }> {
  const payload = await invokeWithProbe<unknown>('close_attachment_handle', options, {
    handleId,
  })
  const root = asIndexedQueryPayload(payload, 'attachment_handle_close')
  return {
    closed: Boolean(root.closed),
  }
}

export async function getRuntimeMetrics(options: ProbeOptions = {}): Promise<LxmfRuntimeMetrics> {
  const payload = await invokeWithProbe<unknown>('get_runtime_metrics', options)
  const root = asIndexedQueryPayload(payload, 'runtime_metrics')
  return {
    rssBytes: asNullableFiniteNumber(root.rss_bytes),
    dbSizeBytes: asFiniteNumber(root.db_size_bytes, 'runtime_metrics.db_size_bytes'),
    queueSize: asFiniteNumber(root.queue_size, 'runtime_metrics.queue_size'),
    messageCount: asFiniteNumber(root.message_count, 'runtime_metrics.message_count'),
    threadCount: asFiniteNumber(root.thread_count, 'runtime_metrics.thread_count'),
    eventPumpIntervalMs: asNullableFiniteNumber(root.event_pump_interval_ms),
    attachmentHandleCount: asFiniteNumber(
      root.attachment_handle_count,
      'runtime_metrics.attachment_handle_count'
    ),
    indexLastSyncMs: asNullableFiniteNumber(root.index_last_sync_ms),
  }
}

export async function rebuildThreadSummaries(
  options: ProbeOptions = {}
): Promise<{ rebuilt: boolean }> {
  const payload = await invokeWithProbe<unknown>('rebuild_thread_summaries', options)
  const root = asIndexedQueryPayload(payload, 'rebuild_thread_summaries')
  return {
    rebuilt: Boolean(root.rebuilt),
  }
}

export async function lxmfForceReindex(options: ProbeOptions = {}): Promise<{ started: boolean }> {
  const payload = await invokeWithProbe<unknown>('lxmf_force_reindex', options)
  const root = asIndexedQueryPayload(payload, 'force_reindex')
  return {
    started: Boolean(root.started),
  }
}

function parseIndexStatus(value: unknown): LxmfIndexStatus {
  const root = asIndexedQueryPayload(value, 'index_status')
  return {
    ready: Boolean(root.ready),
    messageCount: asFiniteNumber(root.message_count, 'index_status.message_count'),
    threadCount: asFiniteNumber(root.thread_count, 'index_status.thread_count'),
    lastSyncMs: asNullableFiniteNumber(root.last_sync_ms),
  }
}

function parseThreadQueryResponse(value: unknown): LxmfThreadQueryResponse {
  const root = asIndexedQueryPayload(value, 'thread_query')
  const itemsRaw = Array.isArray(root.items) ? root.items : []
  return {
    items: itemsRaw.map((entry, index) => {
      const row = asObject(entry, `thread_query.items[${index}]`)
      return {
        threadId: asString(row.thread_id, `thread_query.items[${index}].thread_id`),
        name: asString(row.name, `thread_query.items[${index}].name`),
        destination: asString(row.destination, `thread_query.items[${index}].destination`),
        preview: asString(row.preview, `thread_query.items[${index}].preview`),
        unread: asFiniteNumber(row.unread, `thread_query.items[${index}].unread`),
        pinned: Boolean(row.pinned),
        muted: Boolean(row.muted),
        lastMessageId: asNullableString(row.last_message_id),
        lastActivityMs: asFiniteNumber(
          row.last_activity_ms,
          `thread_query.items[${index}].last_activity_ms`
        ),
      }
    }),
    nextCursor: asNullableString(root.next_cursor),
  }
}

function parseThreadMessageQueryResponse(value: unknown): LxmfThreadMessageQueryResponse {
  const root = asIndexedQueryPayload(value, 'thread_message_query')
  const itemsRaw = Array.isArray(root.items) ? root.items : []
  return {
    items: itemsRaw.map((entry, index) => {
      const row = asObject(entry, `thread_message_query.items[${index}]`)
      return {
        id: asString(row.id, `thread_message_query.items[${index}].id`),
        source: asString(row.source, `thread_message_query.items[${index}].source`),
        destination: asString(row.destination, `thread_message_query.items[${index}].destination`),
        title: asString(row.title, `thread_message_query.items[${index}].title`),
        content: asString(row.content, `thread_message_query.items[${index}].content`),
        timestamp: asFiniteNumber(row.timestamp, `thread_message_query.items[${index}].timestamp`),
        direction: asString(row.direction, `thread_message_query.items[${index}].direction`),
        fields:
          row.fields && typeof row.fields === 'object' && !Array.isArray(row.fields)
            ? (row.fields as Record<string, unknown>)
            : null,
        receiptStatus: asNullableString(row.receipt_status),
      }
    }),
    nextCursor: asNullableString(root.next_cursor),
  }
}

function parseSearchResponse(value: unknown): LxmfSearchResponse {
  const root = asIndexedQueryPayload(value, 'thread_message_query', 'search_messages')
  const itemsRaw = Array.isArray(root.items) ? root.items : []
  return {
    items: itemsRaw.map((entry, index) => {
      const row = asObject(entry, `thread_message_query.items[${index}]`)
      return {
        id: asString(row.id, `thread_message_query.items[${index}].id`),
        source: asString(row.source, `thread_message_query.items[${index}].source`),
        destination: asString(row.destination, `thread_message_query.items[${index}].destination`),
        title: asString(row.title, `thread_message_query.items[${index}].title`),
        content: asString(row.content, `thread_message_query.items[${index}].content`),
        timestamp: asFiniteNumber(row.timestamp, `thread_message_query.items[${index}].timestamp`),
        direction: asString(row.direction, `thread_message_query.items[${index}].direction`),
        fields:
          row.fields && typeof row.fields === 'object' && !Array.isArray(row.fields)
            ? (row.fields as Record<string, unknown>)
            : null,
        receiptStatus: asNullableString(row.receipt_status),
      }
    }),
    nextCursor: asNullableString(root.next_cursor),
  }
}

function parseFilesQueryResponse(value: unknown): LxmfFilesQueryResponse {
  const root = asIndexedQueryPayload(value, 'files_query')
  const itemsRaw = Array.isArray(root.items) ? root.items : []
  return {
    items: itemsRaw.map((entry, index) => {
      const row = asObject(entry, `files_query.items[${index}]`)
      return {
        id: asString(row.id, `files_query.items[${index}].id`),
        name: asString(row.name, `files_query.items[${index}].name`),
        kind: asString(row.kind, `files_query.items[${index}].kind`),
        sizeLabel: asString(row.size_label, `files_query.items[${index}].size_label`),
        sizeBytes: asFiniteNumber(row.size_bytes, `files_query.items[${index}].size_bytes`),
        createdAtMs: asFiniteNumber(row.created_at_ms, `files_query.items[${index}].created_at_ms`),
        owner: asString(row.owner, `files_query.items[${index}].owner`),
        mime: asNullableString(row.mime) ?? undefined,
        hasInlineData: Boolean(row.has_inline_data),
        dataBase64: asNullableString(row.data_base64) ?? undefined,
        paperUri: asNullableString(row.paper_uri) ?? undefined,
        paperTitle: asNullableString(row.paper_title) ?? undefined,
        paperCategory: asNullableString(row.paper_category) ?? undefined,
      }
    }),
    nextCursor: asNullableString(root.next_cursor),
  }
}

function parseMapPointsQueryResponse(value: unknown): LxmfMapPointsQueryResponse {
  const root = asIndexedQueryPayload(value, 'map_points_query')
  const itemsRaw = Array.isArray(root.items) ? root.items : []
  return {
    items: itemsRaw.map((entry, index) => {
      const row = asObject(entry, `map_points_query.items[${index}]`)
      const direction = asString(row.direction, `map_points_query.items[${index}].direction`)
      return {
        id: asString(row.id, `map_points_query.items[${index}].id`),
        label: asString(row.label, `map_points_query.items[${index}].label`),
        lat: asFiniteNumber(row.lat, `map_points_query.items[${index}].lat`),
        lon: asFiniteNumber(row.lon, `map_points_query.items[${index}].lon`),
        source: asString(row.source, `map_points_query.items[${index}].source`),
        when: asString(row.when, `map_points_query.items[${index}].when`),
        direction:
          direction === 'in' || direction === 'out' || direction === 'unknown'
            ? direction
            : 'unknown',
      }
    }),
    nextCursor: asNullableString(root.next_cursor),
  }
}

function parseAttachmentBlobResponse(value: unknown): LxmfAttachmentBlobResponse {
  const root = asIndexedQueryPayload(value, 'attachment_blob')
  return {
    mime: asNullableString(root.mime),
    sizeBytes: asFiniteNumber(root.size_bytes, 'attachment_blob.size_bytes'),
    dataBase64: asString(root.data_base64, 'attachment_blob.data_base64'),
  }
}

function parseAttachmentBytesResponse(value: unknown): LxmfAttachmentBytesResponse {
  const root = asIndexedQueryPayload(value, 'attachment_bytes')
  return {
    attachmentId: asString(root.attachment_id, 'attachment_bytes.attachment_id'),
    mime: asNullableString(root.mime),
    sizeBytes: asFiniteNumber(root.size_bytes, 'attachment_bytes.size_bytes'),
    dataBase64: asString(root.data_base64, 'attachment_bytes.data_base64'),
  }
}

function parseAttachmentHandleResponse(value: unknown): LxmfAttachmentHandle {
  const root = asIndexedQueryPayload(value, 'attachment_handle')
  return {
    handleId: asString(root.handle_id, 'attachment_handle.handle_id'),
    path: asString(root.path, 'attachment_handle.path'),
    mime: asNullableString(root.mime),
    sizeBytes: asFiniteNumber(root.size_bytes, 'attachment_handle.size_bytes'),
    expiresAtMs: asFiniteNumber(root.expires_at_ms, 'attachment_handle.expires_at_ms'),
  }
}

function asIndexedQueryPayload(
  value: unknown,
  wrapperLabel: string,
  fallbackLabel?: string
): Record<string, unknown> {
  const root = asObject(value, wrapperLabel)
  const labels = [wrapperLabel]
  if (fallbackLabel) {
    labels.push(fallbackLabel)
  }
  for (const label of labels) {
    const wrapped = root[label]
    if (
      wrapped !== null &&
      wrapped !== undefined &&
      typeof wrapped === 'object' &&
      !Array.isArray(wrapped)
    ) {
      return asObject(wrapped, label)
    }
  }
  return root
}

function asString(value: unknown, path: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${path} must be a string`)
  }
  return value
}

function asNullableString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null
  }
  return typeof value === 'string' ? value : null
}

function asFiniteNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${path} must be a finite number`)
  }
  return value
}

function asNullableFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null
  }
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}
