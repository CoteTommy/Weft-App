# Weft Client Parity Audit (Sideband + Columba)

Last updated: 2026-02-12

## Source References

- `Sideband/README.md`
- `Sideband/sbapp/ui/layouts.py`
- `Sideband/sbapp/ui/messages.py`
- `columba/README.md`
- `columba/app/src/main/java/com/lxmf/messenger/MainActivity.kt`
- `columba/docs/features/sideband-contact-import.md`

## Capability Matrix

| Capability | Sideband | Columba | Weft (current) | Gap |
| --- | --- | --- | --- | --- |
| Basic messaging threads | Yes | Yes | Yes | Low |
| Manual new chat creation | Yes | Yes | Yes | Low |
| Hash-only contact import (Sideband style) | Yes | Yes | Yes (now) | Low |
| `lxma://` contact link parsing | Yes | Yes | Yes (now) | Low |
| Announce stream browsing | Yes | Yes | Yes | Low |
| Announce detail actions (message/chat/join) | Yes | Yes | Yes | Low |
| Peer/network visibility | Yes | Yes | Yes | Low |
| Interface visibility | Yes | Yes | Yes | Low |
| Identity export/import | Yes | Yes | Partial | Medium |
| Multi-identity management | Partial | Yes | Missing | High |
| Attachment send flow | Yes | Yes | Yes (inline attachment compose + send) | Medium |
| Attachment receive/open/save UX | Yes | Yes | Yes (message detail + files page actions) | Low |
| Paper/QR workflow | Yes | Partial | Partial (paper compose metadata + method, no QR ingest UI yet) | Medium |
| Message reactions/reply gestures | No/limited | Yes | Missing | Medium |
| Map + location sharing | Yes | Yes | Missing | High |
| Offline maps | Yes | Yes | Missing | High |
| Voice calls / audio messages | Yes | Partial | Missing | High |
| Plugin/command ecosystem UI | Yes | Partial | Missing | Medium |
| Onboarding/setup wizard | Yes (guide-centric) | Yes | Yes (identity + connectivity + daemon bootstrap) | Low |
| Deep app integrations (notifications/deep-link intents) | Yes | Yes | Yes (`lxma://` app deep-link routing) | Low |
| Interface configuration wizards (TCP/RNode/BLE) | Yes | Yes | Missing | High |

## High-Impact Missing Features

1. Contact and identity interoperability:
   - Import/export contacts and identity bundles in formats users already exchange.
   - Handle deep-link/open-url flows end-to-end at app level.
2. Rich message parity:
   - Compose/send attachments and paper payloads from chat UI.
   - Attachment actions (save/open/preview) in message details.
3. Connectivity setup UX:
   - Guided interface setup (TCP, local, radio-adjacent profiles).
   - Non-technical defaults with safe advanced overrides.
4. Location + map workflows:
   - Location share toggle + map view with optional offline map package support.

## Recommended Build Order

1. Interop hardening:
   - finalize contact import/export and deep-link ingestion.
2. Messaging parity:
   - attachment/paper composer + details actions.
3. Setup/onboarding:
   - first-run wizard for identity + connectivity profile + announce policy.
4. Advanced feature tranche:
   - map/location first, then commands/plugins UI.
