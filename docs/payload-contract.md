# Payload Contract v2 (Weft Desktop Mirror)

This file mirrors:

- `/Users/tommy/Documents/TAK/LXMF-rs/docs/payload-contract.md`

It defines the frontend/runtime contract used by Weft Tauri.

## Version

- Contract version: `v2`
- Scope: Tauri desktop runtime (no standalone web transport runtime)

## Canonical Field Coverage

| Domain | Field | Hex | JSON key form |
| --- | --- | --- | --- |
| telemetry | `FIELD_TELEMETRY` | `0x02` | `"2"` |
| attachments | `FIELD_FILE_ATTACHMENTS` | `0x05` | `"5"` |
| commands | `FIELD_COMMANDS` | `0x09` | `"9"` |
| ticket | `FIELD_TICKET` | `0x0C` | `"12"` |
| refs | `FIELD_RNR_REFS` | `0x0E` | `"14"` |
| app extensions | extension map | `0x10` | `"16"` |

## Schema Artifacts

- `/Users/tommy/Documents/TAK/Weft-Web/docs/schemas/contract-v2/payload-envelope.schema.json`
- `/Users/tommy/Documents/TAK/Weft-Web/docs/schemas/contract-v2/event-payload.schema.json`

## Message Envelope

Transport envelope key:

- `_lxmf_fields_msgpack_b64`

App extensions in field `16`:

- `reply_to`
- `reaction_to`
- `emoji`
- `sender` (optional)

Telemetry location in field `2`:

- `{ lat, lon, alt?, speed?, accuracy? }`

## Announce Records

Announces are backend-backed via `list_announces` and include:

- identity: `id`, `peer`, `timestamp`
- profile metadata: `name`, `name_source`, `first_seen`, `seen_count`
- capabilities metadata: `app_data_hex`, `capabilities`
- optional signal metadata: `rssi`, `snr`, `q`

## RPC Methods Required by Weft

- `list_announces`
- `get_outbound_propagation_node`
- `set_outbound_propagation_node`
- `list_propagation_nodes`
- `message_delivery_trace`

## Event Payload Families

- `announce_received`
- `propagation_node_selected`
- `receipt`
- `outbound`
- `runtime_started`
- `runtime_stopped`

Weft’s event pump emits these as `weft://lxmf-event` to frontend listeners.

## Delivery Trace States

Expected transition labels:

- `queued`, `sending`
- `outbound_attempt: link`, `sent: link`
- `retrying: opportunistic ...`, `sent: opportunistic`
- `retrying: propagated relay ...`, `sent: propagated relay`
- `delivered`
- `failed:*`
