# Weft Tauri IPC + LXMF RPC Contract

This document captures the command surface used by Weft-Web against the embedded
`lxmf-rs` runtime.

## Transport

- Frontend calls Tauri commands via `@tauri-apps/api/core` `invoke`
- Runtime internals route RPC methods to an in-process `reticulumd`-compatible daemon

## Stability target

- LXMF transport and core payload fields target parity with `contract-v2`
- Command set below is used for current app features and intended to remain stable

## Stable command set

### Core lifecycle

- `daemon_probe`
- `daemon_status`
- `daemon_start`
- `daemon_stop`
- `daemon_restart`

### Message and message discovery

- `lxmf_list_messages` (no params) → `list_messages`
- `lxmf_send_message` (legacy shape)
- `lxmf_send_rich_message` (attachment-aware shape)
- `lxmf_clear_messages` (no params)

### Peer and interface management

- `lxmf_list_peers`
- `lxmf_clear_peers`
- `lxmf_list_interfaces`
- `lxmf_set_interfaces`
- `lxmf_peer_sync`
- `lxmf_peer_unpeer`
- `lxmf_reload_config`

### Announces

- `lxmf_list_announces` (params: `limit`, `before_ts`, `cursor`)
- `lxmf_announce_now`
- `lxmf_paper_ingest_uri`

### Propagation

- `lxmf_propagation_status`
- `lxmf_propagation_enable`
- `lxmf_propagation_ingest`
- `lxmf_propagation_fetch`
- `lxmf_list_propagation_nodes`
- `lxmf_get_outbound_propagation_node`
- `lxmf_set_outbound_propagation_node`

### Policy and tickets

- `lxmf_get_delivery_policy`
- `lxmf_set_delivery_policy`
- `lxmf_stamp_policy_get`
- `lxmf_stamp_policy_set`
- `lxmf_ticket_generate`
- `lxmf_message_delivery_trace`

### Eventing

- `lxmf_poll_event`
- `lxmf_start_event_pump`
- `lxmf_stop_event_pump`

### Indexing and search

- `lxmf_query_threads`
- `lxmf_query_thread_messages`
- `lxmf_search_messages`
- `lxmf_query_files`
- `lxmf_query_map_points`
- `lxmf_get_attachment_blob`
- `lxmf_index_status`
- `lxmf_force_reindex`

### Desktop preferences

- `lxmf_get_profile`
- `lxmf_set_display_name`
- `desktop_get_shell_preferences`
- `desktop_set_shell_preferences`
