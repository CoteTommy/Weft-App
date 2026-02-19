// AUTO-GENERATED FILE. DO NOT EDIT.
// Source: docs/contracts/tauri-ipc.v2.json
// To regenerate: bun run contract:generate

import { invoke } from '@tauri-apps/api/core'

export type IpcV2ErrorCode =
  | 'validation'
  | 'runtime_unavailable'
  | 'upstream_timeout'
  | 'storage_quota'
  | 'internal'

export type IpcV2Meta = {
  request_id: string
  schema_version: 'v2'
}

export type IpcV2Error = {
  code: IpcV2ErrorCode
  message: string
  retryable: boolean
  request_id: string
}

export type IpcV2Envelope<TData> =
  | {
      ok: {
        data: TData
        meta: IpcV2Meta
      }
    }
  | {
      error: IpcV2Error
    }

export const TAURI_IPC_V2_COMMANDS = {
  V2_DAEMON_PROBE: 'v2_daemon_probe',
  V2_DAEMON_STATUS: 'v2_daemon_status',
  V2_DAEMON_START: 'v2_daemon_start',
  V2_DAEMON_STOP: 'v2_daemon_stop',
  V2_DAEMON_RESTART: 'v2_daemon_restart',
} as const

export type TauriIpcV2Command = (typeof TAURI_IPC_V2_COMMANDS)[keyof typeof TAURI_IPC_V2_COMMANDS]
export type TauriIpcV2CommandLiteral =
  | 'v2_daemon_probe'
  | 'v2_daemon_status'
  | 'v2_daemon_start'
  | 'v2_daemon_stop'
  | 'v2_daemon_restart'

export const TAURI_IPC_COMMANDS = {
  DAEMON_PROBE: 'daemon_probe',
  DAEMON_STATUS: 'daemon_status',
  DAEMON_START: 'daemon_start',
  DAEMON_STOP: 'daemon_stop',
  DAEMON_RESTART: 'daemon_restart',
  INDEXING_LXMF_INDEX_STATUS: 'lxmf_index_status',
  INDEXING_GET_RUNTIME_METRICS: 'get_runtime_metrics',
  INDEXING_LXMF_QUERY_THREADS: 'lxmf_query_threads',
  INDEXING_QUERY_THREADS_PAGE: 'query_threads_page',
  INDEXING_LXMF_QUERY_THREAD_MESSAGES: 'lxmf_query_thread_messages',
  INDEXING_QUERY_THREAD_MESSAGES_PAGE: 'query_thread_messages_page',
  INDEXING_LXMF_SEARCH_MESSAGES: 'lxmf_search_messages',
  INDEXING_LXMF_QUERY_FILES: 'lxmf_query_files',
  INDEXING_QUERY_FILES_PAGE: 'query_files_page',
  INDEXING_LXMF_QUERY_MAP_POINTS: 'lxmf_query_map_points',
  INDEXING_LXMF_GET_ATTACHMENT_BLOB: 'lxmf_get_attachment_blob',
  INDEXING_GET_ATTACHMENT_BYTES: 'get_attachment_bytes',
  INDEXING_OPEN_ATTACHMENT_HANDLE: 'open_attachment_handle',
  INDEXING_CLOSE_ATTACHMENT_HANDLE: 'close_attachment_handle',
  INDEXING_LXMF_FORCE_REINDEX: 'lxmf_force_reindex',
  INDEXING_REBUILD_THREAD_SUMMARIES: 'rebuild_thread_summaries',
  LXMF_LIST_MESSAGES: 'lxmf_list_messages',
  LXMF_LIST_PEERS: 'lxmf_list_peers',
  LXMF_LIST_INTERFACES: 'lxmf_list_interfaces',
  LXMF_CLEAR_MESSAGES: 'lxmf_clear_messages',
  LXMF_CLEAR_PEERS: 'lxmf_clear_peers',
  LXMF_SET_INTERFACES: 'lxmf_set_interfaces',
  LXMF_RELOAD_CONFIG: 'lxmf_reload_config',
  LXMF_PEER_SYNC: 'lxmf_peer_sync',
  LXMF_PEER_UNPEER: 'lxmf_peer_unpeer',
  LXMF_LIST_ANNOUNCES: 'lxmf_list_announces',
  LXMF_GET_DELIVERY_POLICY: 'lxmf_get_delivery_policy',
  LXMF_SET_DELIVERY_POLICY: 'lxmf_set_delivery_policy',
  LXMF_PROPAGATION_STATUS: 'lxmf_propagation_status',
  LXMF_PROPAGATION_ENABLE: 'lxmf_propagation_enable',
  LXMF_PROPAGATION_INGEST: 'lxmf_propagation_ingest',
  LXMF_PROPAGATION_FETCH: 'lxmf_propagation_fetch',
  LXMF_STAMP_POLICY_GET: 'lxmf_stamp_policy_get',
  LXMF_STAMP_POLICY_SET: 'lxmf_stamp_policy_set',
  LXMF_TICKET_GENERATE: 'lxmf_ticket_generate',
  LXMF_INTERFACE_METRICS: 'lxmf_interface_metrics',
  LXMF_LIST_PROPAGATION_NODES: 'lxmf_list_propagation_nodes',
  LXMF_GET_OUTBOUND_PROPAGATION_NODE: 'lxmf_get_outbound_propagation_node',
  LXMF_SET_OUTBOUND_PROPAGATION_NODE: 'lxmf_set_outbound_propagation_node',
  LXMF_MESSAGE_DELIVERY_TRACE: 'lxmf_message_delivery_trace',
  LXMF_ANNOUNCE_NOW: 'lxmf_announce_now',
  LXMF_PAPER_INGEST_URI: 'lxmf_paper_ingest_uri',
  LXMF_POLL_EVENT: 'lxmf_poll_event',
  LXMF_START_EVENT_PUMP: 'lxmf_start_event_pump',
  LXMF_SET_EVENT_PUMP_POLICY: 'lxmf_set_event_pump_policy',
  LXMF_STOP_EVENT_PUMP: 'lxmf_stop_event_pump',
  LXMF_GET_PROFILE: 'lxmf_get_profile',
  LXMF_SET_DISPLAY_NAME: 'lxmf_set_display_name',
  LXMF_SEND_MESSAGE: 'lxmf_send_message',
  LXMF_SEND_RICH_MESSAGE: 'lxmf_send_rich_message',
  LXMF_SEND_RICH_MESSAGE_REFS: 'lxmf_send_rich_message_refs',
  LXMF_SEND_COMMAND: 'lxmf_send_command',
  DESKTOP_GET_SHELL_PREFERENCES: 'desktop_get_shell_preferences',
  DESKTOP_SET_SHELL_PREFERENCES: 'desktop_set_shell_preferences',
} as const

export type TauriIpcCommand = (typeof TAURI_IPC_COMMANDS)[keyof typeof TAURI_IPC_COMMANDS]
export type TauriIpcCommandLiteral =
  | 'daemon_probe'
  | 'daemon_status'
  | 'daemon_start'
  | 'daemon_stop'
  | 'daemon_restart'
  | 'lxmf_index_status'
  | 'get_runtime_metrics'
  | 'lxmf_query_threads'
  | 'query_threads_page'
  | 'lxmf_query_thread_messages'
  | 'query_thread_messages_page'
  | 'lxmf_search_messages'
  | 'lxmf_query_files'
  | 'query_files_page'
  | 'lxmf_query_map_points'
  | 'lxmf_get_attachment_blob'
  | 'get_attachment_bytes'
  | 'open_attachment_handle'
  | 'close_attachment_handle'
  | 'lxmf_force_reindex'
  | 'rebuild_thread_summaries'
  | 'lxmf_list_messages'
  | 'lxmf_list_peers'
  | 'lxmf_list_interfaces'
  | 'lxmf_clear_messages'
  | 'lxmf_clear_peers'
  | 'lxmf_set_interfaces'
  | 'lxmf_reload_config'
  | 'lxmf_peer_sync'
  | 'lxmf_peer_unpeer'
  | 'lxmf_list_announces'
  | 'lxmf_get_delivery_policy'
  | 'lxmf_set_delivery_policy'
  | 'lxmf_propagation_status'
  | 'lxmf_propagation_enable'
  | 'lxmf_propagation_ingest'
  | 'lxmf_propagation_fetch'
  | 'lxmf_stamp_policy_get'
  | 'lxmf_stamp_policy_set'
  | 'lxmf_ticket_generate'
  | 'lxmf_interface_metrics'
  | 'lxmf_list_propagation_nodes'
  | 'lxmf_get_outbound_propagation_node'
  | 'lxmf_set_outbound_propagation_node'
  | 'lxmf_message_delivery_trace'
  | 'lxmf_announce_now'
  | 'lxmf_paper_ingest_uri'
  | 'lxmf_poll_event'
  | 'lxmf_start_event_pump'
  | 'lxmf_set_event_pump_policy'
  | 'lxmf_stop_event_pump'
  | 'lxmf_get_profile'
  | 'lxmf_set_display_name'
  | 'lxmf_send_message'
  | 'lxmf_send_rich_message'
  | 'lxmf_send_rich_message_refs'
  | 'lxmf_send_command'
  | 'desktop_get_shell_preferences'
  | 'desktop_set_shell_preferences'

export async function invokeIpcV2<TData>(
  command: TauriIpcV2Command,
  fields: Record<string, unknown> = {}
): Promise<IpcV2Envelope<TData>> {
  const payload = await invoke<unknown>(command, fields)
  return parseIpcV2Envelope<TData>(payload)
}

export async function invokeIpc<TData>(
  command: TauriIpcCommand,
  fields: Record<string, unknown> = {}
): Promise<TData> {
  return await invoke<unknown>(command, fields).then(payload => payload as TData)
}

export function parseIpcV2Envelope<TData>(payload: unknown): IpcV2Envelope<TData> {
  if (!isRecord(payload)) {
    throw new Error('v2 ipc payload must be an object')
  }

  if (isRecord(payload.ok) && isRecord(payload.ok.meta) && 'data' in payload.ok) {
    const requestId = payload.ok.meta.request_id
    const schemaVersion = payload.ok.meta.schema_version
    if (typeof requestId !== 'string' || typeof schemaVersion !== 'string') {
      throw new Error('v2 ipc ok payload meta is invalid')
    }
    if (schemaVersion !== 'v2') {
      throw new Error('v2 ipc schema_version is invalid')
    }
    return payload as IpcV2Envelope<TData>
  }

  if (isRecord(payload.error)) {
    const { code, message, retryable, request_id: requestId } = payload.error
    if (
      typeof code !== 'string' ||
      typeof message !== 'string' ||
      typeof retryable !== 'boolean' ||
      typeof requestId !== 'string'
    ) {
      throw new Error('v2 ipc error payload is invalid')
    }
    return payload as IpcV2Envelope<TData>
  }

  throw new Error('v2 ipc payload is neither ok nor error envelope')
}

export function unwrapIpcV2Envelope<TData>(payload: IpcV2Envelope<TData>): TData {
  if ('ok' in payload) {
    return payload.ok.data
  }
  throw new Error('[' + payload.error.code + '] ' + payload.error.message)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
