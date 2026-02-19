# Tauri Backend Structure

This backend is organized around:

- `actor.rs`: runtime worker lifecycle and RPC command execution.
- `commands.rs`: Tauri command handlers and compatibility adapters.
- `index_store/`: indexed query/pagination/search and attachment data access.
- `ipc_v2.rs`: v2 response envelope and shared error taxonomy.
- `mod.rs`: application wiring and invoke handler registration.

Refactor direction: move command handlers from `commands.rs` into domain modules under `commands/` while preserving command compatibility.
