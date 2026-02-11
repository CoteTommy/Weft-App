# LXMF Payload Contract (Desktop)

This document declares payload shapes used by Weft Desktop and the embedded `lxmf-rs` runtime.

## 1) Core Envelopes

- `RpcRequest`
```json
{
  "id": 1,
  "method": "string",
  "params": { "optional": "object" }
}
```

- `RpcResponse`
```json
{
  "id": 1,
  "result": {},
  "error": null
}
```

- `RpcEvent`
```json
{
  "event_type": "string",
  "payload": {}
}
```

## 2) Tauri IPC Command Payloads

Current desktop command surface in `src-tauri`:

- `daemon_probe(profile?, rpc?) -> LxmfProbeReport`
- `daemon_status(profile?, rpc?) -> LxmfDaemonLocalStatus`
- `daemon_start(profile?, rpc?, managed?, reticulumd?, transport?) -> LxmfDaemonLocalStatus`
- `daemon_stop(profile?, rpc?) -> LxmfDaemonLocalStatus`
- `daemon_restart(profile?, rpc?, managed?, reticulumd?, transport?) -> LxmfDaemonLocalStatus`
- `lxmf_list_messages(profile?, rpc?) -> { messages: MessageRecord[] }`
- `lxmf_list_peers(profile?, rpc?) -> { peers: PeerRecord[] }`
- `lxmf_send_message(...) -> { result: { message_id: string }, resolved: { source, destination } }`
- `lxmf_announce_now(profile?, rpc?) -> { announce_id: number }`
- `lxmf_poll_event(profile?, rpc?) -> RpcEvent | null`

## 3) Domain Record Shapes

### MessageRecord
```json
{
  "id": "string",
  "source": "hex-16-byte-hash",
  "destination": "hex-16-byte-hash",
  "title": "string",
  "content": "string",
  "timestamp": 1738981163,
  "direction": "in|out",
  "fields": {},
  "receipt_status": "string|null"
}
```

### PeerRecord
```json
{
  "peer": "hex-16-byte-hash",
  "last_seen": 1738981163,
  "name": "string|null",
  "name_source": "string|null",
  "first_seen": 1738981140,
  "seen_count": 3
}
```

### InterfaceRecord
```json
{
  "type": "tcp_server|tcp_client|...",
  "enabled": true,
  "host": "string|null",
  "port": 4242,
  "name": "string|null"
}
```

### DeliveryPolicy
```json
{
  "auth_required": false,
  "allowed_destinations": [],
  "denied_destinations": [],
  "ignored_destinations": [],
  "prioritised_destinations": []
}
```

### PropagationState
```json
{
  "enabled": true,
  "store_root": "string|null",
  "target_cost": 0,
  "total_ingested": 0,
  "last_ingest_count": 0
}
```

### StampPolicy
```json
{
  "target_cost": 0,
  "flexibility": 0
}
```

### TicketRecord
```json
{
  "destination": "hex-16-byte-hash",
  "ticket": "hex",
  "expires_at": 1738984763
}
```

## 4) Event Payloads by `event_type`

- `runtime_started`: `{ "profile": "string" }`
- `runtime_stopped`: `{ "profile": "string" }`
- `inbound`: `{ "message": MessageRecord }`
- `outbound`: `{ "message": MessageRecord, "method": "string|null", "error?": "string" }`
- `announce_received`: `{ "peer", "timestamp", "name", "name_source", "first_seen", "seen_count" }`
- `announce_sent`: `{ "timestamp": number, "announce_id?": number }`
- `interfaces_updated`: `{ "interfaces": InterfaceRecord[] }`
- `config_reloaded`: `{ "timestamp": number }`
- `peer_sync`: `{ "peer", "timestamp", "name", "name_source", "first_seen", "seen_count" }`
- `peer_unpeer`: `{ "peer": "string", "removed": boolean }`
- `receipt`: `{ "message_id": "string", "status": "string" }`

## 5) Messaging Fields (`MessageRecord.fields`) for feature domains

`fields` is open JSON. Weft reserves these keys:

- `_lxmf`: transport options attached by daemon when sending
  - `method`: `opportunistic|direct|propagated|paper`
  - `stamp_cost`: number
  - `include_ticket`: boolean
- `attachments`: list of attachment descriptors
  - `name`, `mime`, `size_bytes`, `sha256`, `uri`, `inline_base64`
- `paper`: paper/document descriptor
  - `uri`, `transient_id`, `title`, `category`, `revision`
- `announce`: announcement descriptor
  - `title`, `body`, `audience`, `priority`, `ttl_secs`, `posted_at`
- `peer_snapshot`: peer summary payload for peer UI flows
- `interface_snapshot`: interface summary payload for interface UI flows

Canonical TS declarations live in:

- `src/lib/lxmf-payloads.ts`
- `src/lib/lxmf-contract.ts`

## 6) RPC Methods (full daemon set)

Messaging:
- `list_messages`
- `clear_messages`
- `announce_now`
- `send_message_v2`
- `send_message`
- `receive_message`
- `record_receipt`

Daemon/status:
- `status`
- `daemon_status_ex`

Peers/interfaces:
- `list_peers`
- `peer_sync`
- `peer_unpeer`
- `clear_peers`
- `list_interfaces`
- `set_interfaces`
- `reload_config`

Policy/propagation/paper/stamp:
- `get_delivery_policy`
- `set_delivery_policy`
- `propagation_status`
- `propagation_enable`
- `propagation_ingest`
- `propagation_fetch`
- `paper_ingest_uri`
- `stamp_policy_get`
- `stamp_policy_set`
- `ticket_generate`
- `clear_resources`
- `clear_all`
