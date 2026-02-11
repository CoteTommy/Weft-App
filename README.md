# Weft Web

React + Bun frontend for LXMF operations, with a Bun API bridge that probes local `lxmf` daemon connectivity.

## Dev setup

1. Start API bridge:

```bash
bun run dev:api
```

2. Start frontend:

```bash
bun run dev:web
```

Vite proxies `/api/*` to `http://127.0.0.1:8787`.

Desktop mode:

```bash
LXMF_BIN=/Users/tommy/Documents/TAK/LXMF-rs/target/debug/lxmf bun run dev:desktop
```

## LXMF probe plumbing

- API endpoint: `GET /api/lxmf/probe`
- Backend command: `lxmf --json --profile <profile> [--rpc <host:port>] daemon probe`
- Shared contract parser: `shared/lxmf-probe.ts`
- Frontend client helper: `src/lib/lxmf-api.ts`

Query params:

- `profile` (optional, default `default`)
- `rpc` (optional override)

Environment:

- `LXMF_BIN` (optional, default `lxmf`)
- `WEFT_API_HOST` (optional, default `127.0.0.1`)
- `WEFT_API_PORT` (optional, default `8787`)

In Tauri desktop mode, frontend calls Rust IPC directly (no HTTP bridge). In browser mode, frontend uses the `/api` bridge.

## Commands

- `bun run dev:web`: run Vite app
- `bun run dev:api`: run Bun API bridge
- `bun run dev:desktop`: run Tauri desktop app
- `bun run build`: production build
- `bun run build:desktop`: bundle desktop app
- `bun run typecheck`: TypeScript project references check
- `bun run test`: Bun tests (shared contract parser)
