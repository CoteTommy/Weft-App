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

- `daemon_probe`, `daemon_status`, `daemon_start`, `daemon_stop`, `daemon_restart`
- `lxmf_list_messages`, `lxmf_list_peers`, `lxmf_send_message`, `lxmf_announce_now`, `lxmf_poll_event`

## Scripts

- `bun run dev`: start Tauri desktop dev mode
- `bun run dev:ui`: start Vite UI only
- `bun run build`: typecheck + frontend build
- `bun run build:desktop`: desktop bundle
- `bun run typecheck`: TypeScript check
- `bun run lint`: ESLint
- `bun run test`: Bun tests
