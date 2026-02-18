# Weft Desktop

Tauri desktop client for LXMF operations.

## Requirements

- Bun
- Rust toolchain
- Tauri system dependencies for your OS

## Development

Run desktop app (starts Vite automatically through Tauri):

```bash
bun run dev
```

## Build

Build frontend bundle:

```bash
bun run build
```

Build desktop application:

```bash
bun run build:desktop
```

## LXMF Desktop Plumbing

Backend is fully in-process:

- Frontend uses Tauri IPC (`@tauri-apps/api/core` `invoke`)
- Tauri embeds `lxmf-rs` runtime directly (no HTTP bridge, no Bun API server, no sidecar)
- Runtime is managed-only and started/stopped via Tauri commands

Primary IPC commands:

- Core lifecycle
  - `daemon_probe`, `daemon_status`, `daemon_start`, `daemon_stop`, `daemon_restart`
- Message operations
  - `lxmf_list_messages`, `lxmf_send_message`, `lxmf_send_rich_message`, `lxmf_clear_messages`
- Peers and interfaces
  - `lxmf_list_peers`, `lxmf_clear_peers`, `lxmf_peer_sync`, `lxmf_peer_unpeer`
  - `lxmf_list_interfaces`, `lxmf_set_interfaces`
- Announces
  - `lxmf_list_announces`, `lxmf_announce_now`, `lxmf_paper_ingest_uri`
- Policies and tickets
  - `lxmf_get_delivery_policy`, `lxmf_set_delivery_policy`
  - `lxmf_stamp_policy_get`, `lxmf_stamp_policy_set`
  - `lxmf_ticket_generate`, `lxmf_message_delivery_trace`
- Propagation controls
  - `lxmf_propagation_status`, `lxmf_propagation_enable`, `lxmf_propagation_ingest`, `lxmf_propagation_fetch`
  - `lxmf_list_propagation_nodes`, `lxmf_get_outbound_propagation_node`, `lxmf_set_outbound_propagation_node`
- Runtime config
  - `lxmf_reload_config`
- Event and index services
  - `lxmf_poll_event`, `lxmf_start_event_pump`, `lxmf_stop_event_pump`
  - `lxmf_query_threads`, `lxmf_query_thread_messages`, `lxmf_search_messages`
  - `lxmf_query_files`, `lxmf_query_map_points`, `lxmf_get_attachment_blob`
- Search and metadata
  - `lxmf_query_files`, `lxmf_query_map_points`, `lxmf_list_interfaces`, `lxmf_index_status`, `lxmf_force_reindex`
- Profiles and shell preferences
  - `lxmf_get_profile`, `lxmf_set_display_name`, `desktop_get_shell_preferences`, `desktop_set_shell_preferences`
- Config and status
  - `lxmf_get_profile`, `daemon_status`, `daemon_start`, `daemon_stop`, `daemon_restart`
- Runtime helpers
  - `lxmf_get_profile`, `lxmf_set_display_name`, `desktop_set_shell_preferences`
- `lxmf_reload_config`

Payload contract reference:

- `docs/payload-contract.md`
- `docs/rpc-contract.md`

## Scripts

- `bun run dev`: start Tauri desktop dev mode
- `bun run dev:ui`: start Vite UI only
- `bun run build`: typecheck + frontend build
- `bun run build:desktop`: desktop bundle
- `bun run build:desktop:all:quick`: build mac/linux/windows in sequence with summary (`-- --targets=windows` or `-- --fail-fast`)
- `bun run typecheck`: TypeScript check
- `bun run lint`: ESLint
- `bun run test`: Bun tests
