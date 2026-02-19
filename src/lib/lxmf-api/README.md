# LXMF API Layer

This layer is the single frontend entrypoint to Tauri IPC.

## Rules

1. Prefer `v2_*` command wrappers with typed envelope handling.
2. Keep legacy command fallbacks for one release cycle.
3. Keep generated contract bindings in `generated/` and regenerate with `bun run contract:generate`.
