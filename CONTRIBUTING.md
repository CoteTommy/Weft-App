# Contributing

## Development Setup

1. Install Bun `1.3.x` and Rust `1.77.2`.
2. Install dependencies: `bun install --frozen-lockfile`.
3. Start app: `bun run dev`.

## Required Checks

Before opening a PR, run:

- `bun run lint`
- `bun run typecheck`
- `bun run test`
- `bun run contract:check`
- `cargo fmt --all -- --check` (from `src-tauri`)
- `cargo clippy --all-targets --all-features -- -D warnings` (from `src-tauri`)
- `cargo test --all-targets --all-features` (from `src-tauri`)

## PR Requirements

- Keep changes scoped and include tests for behavior changes.
- Update docs/contracts when IPC surface changes.
- Keep backward compatibility for legacy Tauri commands for one release cycle when introducing `v2` commands.
