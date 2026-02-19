# Runtime Health Contract (Local-First)

## Purpose

Define a stable local diagnostics contract that supports incident triage without requiring remote telemetry.

## Health Snapshot Fields

- `timestamp_ms`: capture time in epoch milliseconds.
- `profile`: active LXMF profile.
- `rpc_endpoint`: active runtime endpoint.
- `runtime.running`: whether embedded runtime is active.
- `runtime.error_code`: optional normalized error code.
- `index.ready`: index readiness flag.
- `index.message_count`: indexed message count.
- `index.thread_count`: indexed thread count.
- `index.last_sync_ms`: last successful index sync.
- `resources.rss_bytes`: desktop process RSS.
- `resources.js_heap_used_bytes`: webview used heap.
- `resources.js_heap_limit_bytes`: webview heap limit.
- `queue.pending_count`: offline queue pending count.
- `queue.paused_count`: offline queue paused count.
- `attachments.active_handle_count`: open attachment handle count.

## Transport

- Default: local persisted JSON snapshots (`reports/runtime-health/*.json`).
- Optional enterprise export hook: disabled by default; exports redacted snapshots to customer-controlled collector.

## Error Taxonomy

- `validation`
- `runtime_unavailable`
- `upstream_timeout`
- `storage_quota`
- `internal`

## Retention

- Keep the latest 72 hourly snapshots locally.
- Rotate older files with size cap enforcement.
