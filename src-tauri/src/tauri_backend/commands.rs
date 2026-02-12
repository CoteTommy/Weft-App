use super::actor::{
    clean_required_arg, parse_command_entries, rpc_actor_call, ActorCommand, RuntimeActor,
};
use super::selector::{clean_arg, default_transport, RuntimeSelector};
use base64::Engine as _;
use lxmf::constants::FIELD_FILE_ATTACHMENTS;
use lxmf::cli::profile::{load_profile_settings, save_profile_settings};
use lxmf::payload_fields::TRANSPORT_FIELDS_MSGPACK_B64_KEY;
use lxmf::runtime::{SendCommandRequest, SendMessageRequest};
use serde_json::{json, Value};
use serde::Deserialize;
use std::collections::{BTreeMap, HashSet};
use std::io::Cursor;
use tauri::State;

#[tauri::command]
pub(crate) fn daemon_probe(
    actor: State<'_, RuntimeActor>,
    profile: Option<String>,
    rpc: Option<String>,
) -> Result<Value, String> {
    let selector = RuntimeSelector::load(profile, rpc)?;
    actor.request(ActorCommand::Probe { selector })
}

#[tauri::command]
pub(crate) fn daemon_status(
    actor: State<'_, RuntimeActor>,
    profile: Option<String>,
    rpc: Option<String>,
) -> Result<Value, String> {
    let selector = RuntimeSelector::load(profile, rpc)?;
    actor.request(ActorCommand::Status { selector })
}

#[tauri::command]
pub(crate) fn daemon_start(
    actor: State<'_, RuntimeActor>,
    profile: Option<String>,
    rpc: Option<String>,
    managed: Option<bool>,
    reticulumd: Option<String>,
    transport: Option<String>,
) -> Result<Value, String> {
    if managed == Some(false) {
        return Err("embedded runtime is managed-only; managed=false is not supported".to_string());
    }
    if clean_arg(reticulumd).is_some() {
        return Err("embedded runtime does not support --reticulumd override".to_string());
    }

    let selector = RuntimeSelector::load(profile, rpc)?;
    let transport = clean_arg(transport).or_else(default_transport);
    actor.request(ActorCommand::Start {
        selector,
        transport,
    })
}

#[tauri::command]
pub(crate) fn daemon_stop(
    actor: State<'_, RuntimeActor>,
    profile: Option<String>,
    rpc: Option<String>,
) -> Result<Value, String> {
    let selector = RuntimeSelector::load(profile, rpc)?;
    actor.request(ActorCommand::Stop { selector })
}

#[tauri::command]
pub(crate) fn daemon_restart(
    actor: State<'_, RuntimeActor>,
    profile: Option<String>,
    rpc: Option<String>,
    managed: Option<bool>,
    reticulumd: Option<String>,
    transport: Option<String>,
) -> Result<Value, String> {
    if managed == Some(false) {
        return Err("embedded runtime is managed-only; managed=false is not supported".to_string());
    }
    if clean_arg(reticulumd).is_some() {
        return Err("embedded runtime does not support --reticulumd override".to_string());
    }

    let selector = RuntimeSelector::load(profile, rpc)?;
    let transport = clean_arg(transport).or_else(default_transport);
    actor.request(ActorCommand::Restart {
        selector,
        transport,
    })
}

#[tauri::command]
pub(crate) fn lxmf_list_messages(
    actor: State<'_, RuntimeActor>,
    profile: Option<String>,
    rpc: Option<String>,
) -> Result<Value, String> {
    let selector = RuntimeSelector::load(profile, rpc)?;
    rpc_actor_call(&actor, selector, "list_messages", None)
}

#[tauri::command]
pub(crate) fn lxmf_list_peers(
    actor: State<'_, RuntimeActor>,
    profile: Option<String>,
    rpc: Option<String>,
) -> Result<Value, String> {
    let selector = RuntimeSelector::load(profile, rpc)?;
    rpc_actor_call(&actor, selector, "list_peers", None)
}

#[tauri::command]
pub(crate) fn lxmf_list_interfaces(
    actor: State<'_, RuntimeActor>,
    profile: Option<String>,
    rpc: Option<String>,
) -> Result<Value, String> {
    let selector = RuntimeSelector::load(profile, rpc)?;
    rpc_actor_call(&actor, selector, "list_interfaces", None)
}

#[tauri::command]
pub(crate) fn lxmf_list_announces(
    actor: State<'_, RuntimeActor>,
    profile: Option<String>,
    rpc: Option<String>,
) -> Result<Value, String> {
    let selector = RuntimeSelector::load(profile, rpc)?;
    let mut announces = Vec::new();

    if let Ok(messages) = rpc_actor_call(&actor, selector.clone(), "list_messages", None) {
        let message_list = array_from_response(messages, "messages")?;
        for entry in message_list {
            let Some(record) = entry.as_object() else {
                continue;
            };
            let Some(fields) = record.get("fields").and_then(Value::as_object) else {
                continue;
            };
            let Some(announce) = fields.get("announce").and_then(Value::as_object) else {
                continue;
            };

            announces.push(json!({
                "id": record.get("id").and_then(Value::as_str).unwrap_or("").to_string(),
                "source": record.get("source").and_then(Value::as_str).unwrap_or("").to_string(),
                "destination": record.get("destination").and_then(Value::as_str).unwrap_or("").to_string(),
                "title": record.get("title").and_then(Value::as_str).unwrap_or("").to_string(),
                "content": record.get("content").and_then(Value::as_str).unwrap_or("").to_string(),
                "timestamp": record.get("timestamp").and_then(Value::as_f64).unwrap_or(0.0),
                "announce": Value::Object(announce.clone()),
            }));
        }
    }

    if let Ok(peers_response) = rpc_actor_call(&actor, selector.clone(), "list_peers", None) {
        let peers = array_from_response(peers_response, "peers")?;
        for peer_entry in peers {
            let Some(peer) = peer_entry.as_object() else {
                continue;
            };
            let peer_hash = peer
                .get("peer")
                .and_then(Value::as_str)
                .unwrap_or("")
                .trim()
                .to_string();
            if peer_hash.is_empty() {
                continue;
            }
            let last_seen = peer.get("last_seen").and_then(Value::as_f64).unwrap_or(0.0);
            let seen_count = peer.get("seen_count").and_then(Value::as_u64).unwrap_or(0);
            let peer_name = peer
                .get("name")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .unwrap_or(peer_hash.as_str())
                .to_string();
            let peer_capabilities = extract_peer_capabilities(peer);

            announces.push(json!({
                "id": format!("peer-{}-{}", peer_hash, last_seen),
                "source": peer_hash,
                "destination": "",
                "title": format!("Announce from {}", peer_name),
                "content": format!("Peer seen {} time(s)", seen_count),
                "timestamp": last_seen,
                "announce": {
                    "title": format!("Announce from {}", peer_name),
                    "body": format!("Last seen at {}", last_seen),
                    "audience": "local",
                    "priority": "routine",
                    "posted_at": last_seen,
                    "capabilities": peer_capabilities,
                },
            }));
        }
    }

    Ok(json!({
        "announces": announces,
    }))
}

#[tauri::command]
pub(crate) fn lxmf_interface_metrics(
    actor: State<'_, RuntimeActor>,
    profile: Option<String>,
    rpc: Option<String>,
) -> Result<Value, String> {
    let selector = RuntimeSelector::load(profile, rpc)?;
    let response = rpc_actor_call(&actor, selector, "list_interfaces", None)?;
    let interfaces = array_from_response(response, "interfaces")?;

    let mut enabled = 0usize;
    let mut by_type: BTreeMap<String, usize> = BTreeMap::new();
    for entry in &interfaces {
        if entry
            .get("enabled")
            .and_then(Value::as_bool)
            .unwrap_or(false)
        {
            enabled += 1;
        }
        if let Some(kind) = entry.get("type").and_then(Value::as_str) {
            *by_type.entry(kind.to_string()).or_insert(0) += 1;
        }
    }

    Ok(json!({
        "total": interfaces.len(),
        "enabled": enabled,
        "disabled": interfaces.len().saturating_sub(enabled),
        "by_type": by_type,
        "interfaces": interfaces,
    }))
}

#[tauri::command]
pub(crate) fn lxmf_announce_now(
    actor: State<'_, RuntimeActor>,
    profile: Option<String>,
    rpc: Option<String>,
) -> Result<Value, String> {
    let selector = RuntimeSelector::load(profile, rpc)?;
    rpc_actor_call(&actor, selector, "announce_now", None)
}

#[tauri::command]
pub(crate) fn lxmf_paper_ingest_uri(
    actor: State<'_, RuntimeActor>,
    profile: Option<String>,
    rpc: Option<String>,
    uri: String,
) -> Result<Value, String> {
    let selector = RuntimeSelector::load(profile, rpc)?;
    let uri = clean_required_arg(uri, "uri")?;
    rpc_actor_call(
        &actor,
        selector,
        "paper_ingest_uri",
        Some(json!({
            "uri": uri
        })),
    )
}

#[tauri::command]
pub(crate) fn lxmf_poll_event(
    actor: State<'_, RuntimeActor>,
    profile: Option<String>,
    rpc: Option<String>,
) -> Result<Value, String> {
    let selector = RuntimeSelector::load(profile, rpc)?;
    actor.request(ActorCommand::PollEvent { selector })
}

#[tauri::command]
pub(crate) fn lxmf_get_profile(
    profile: Option<String>,
    rpc: Option<String>,
) -> Result<Value, String> {
    let selector = RuntimeSelector::load(profile, rpc)?;
    Ok(json!({
        "profile": selector.profile_name,
        "display_name": selector.profile_settings.display_name,
        "rpc": selector.profile_settings.rpc,
        "managed": selector.profile_settings.managed,
    }))
}

#[tauri::command]
pub(crate) fn lxmf_set_display_name(
    profile: Option<String>,
    rpc: Option<String>,
    display_name: Option<String>,
) -> Result<Value, String> {
    let selector = RuntimeSelector::load(profile, rpc)?;
    let mut settings =
        load_profile_settings(&selector.profile_name).map_err(|err| err.to_string())?;
    settings.display_name = clean_arg(display_name);
    save_profile_settings(&settings).map_err(|err| err.to_string())?;

    Ok(json!({
        "profile": selector.profile_name,
        "display_name": settings.display_name,
        "rpc": settings.rpc,
        "managed": settings.managed,
    }))
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub(crate) fn lxmf_send_message(
    actor: State<'_, RuntimeActor>,
    profile: Option<String>,
    rpc: Option<String>,
    destination: String,
    content: String,
    title: Option<String>,
    source: Option<String>,
    id: Option<String>,
    fields: Option<Value>,
    method: Option<String>,
    stamp_cost: Option<u32>,
    include_ticket: Option<bool>,
) -> Result<Value, String> {
    let selector = RuntimeSelector::load(profile, rpc)?;
    let destination = clean_required_arg(destination, "destination")?;
    let content = clean_required_arg(content, "content")?;
    let request = SendMessageRequest {
        id: clean_arg(id),
        source: clean_arg(source),
        destination: destination.clone(),
        title: clean_arg(title).unwrap_or_default(),
        content,
        fields,
        method: clean_arg(method),
        stamp_cost,
        include_ticket: include_ticket.unwrap_or(false),
    };
    let response = actor.request(ActorCommand::SendMessage { selector, request })?;
    let result = response.get("result").cloned().unwrap_or(Value::Null);
    let source = response
        .get("source")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    let destination = response
        .get("destination")
        .and_then(Value::as_str)
        .unwrap_or(destination.as_str())
        .to_string();

    Ok(json!({
        "result": result,
        "resolved": {
            "source": source,
            "destination": destination,
        }
    }))
}

#[derive(Debug, Deserialize)]
pub(crate) struct RichAttachmentInput {
    name: String,
    data_base64: String,
    #[allow(dead_code)]
    mime: Option<String>,
    #[allow(dead_code)]
    size_bytes: Option<u64>,
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub(crate) fn lxmf_send_rich_message(
    actor: State<'_, RuntimeActor>,
    profile: Option<String>,
    rpc: Option<String>,
    destination: String,
    content: String,
    title: Option<String>,
    source: Option<String>,
    id: Option<String>,
    attachments: Option<Vec<RichAttachmentInput>>,
    method: Option<String>,
    stamp_cost: Option<u32>,
    include_ticket: Option<bool>,
) -> Result<Value, String> {
    let selector = RuntimeSelector::load(profile, rpc)?;
    let destination = clean_required_arg(destination, "destination")?;
    let content = clean_required_arg(content, "content")?;
    let fields = build_attachment_fields(attachments.as_deref().unwrap_or_default())?;
    let request = SendMessageRequest {
        id: clean_arg(id),
        source: clean_arg(source),
        destination: destination.clone(),
        title: clean_arg(title).unwrap_or_default(),
        content,
        fields,
        method: clean_arg(method),
        stamp_cost,
        include_ticket: include_ticket.unwrap_or(false),
    };
    let response = actor.request(ActorCommand::SendMessage { selector, request })?;
    let result = response.get("result").cloned().unwrap_or(Value::Null);
    let source = response
        .get("source")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    let destination = response
        .get("destination")
        .and_then(Value::as_str)
        .unwrap_or(destination.as_str())
        .to_string();

    Ok(json!({
        "result": result,
        "resolved": {
            "source": source,
            "destination": destination,
        }
    }))
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub(crate) fn lxmf_send_command(
    actor: State<'_, RuntimeActor>,
    profile: Option<String>,
    rpc: Option<String>,
    destination: String,
    commands: Option<Vec<String>>,
    commands_hex: Option<Vec<String>>,
    content: Option<String>,
    title: Option<String>,
    source: Option<String>,
    id: Option<String>,
    method: Option<String>,
    stamp_cost: Option<u32>,
    include_ticket: Option<bool>,
) -> Result<Value, String> {
    let selector = RuntimeSelector::load(profile, rpc)?;
    let destination = clean_required_arg(destination, "destination")?;
    let command_entries = parse_command_entries(
        commands.unwrap_or_default(),
        commands_hex.unwrap_or_default(),
    )?;
    if command_entries.is_empty() {
        return Err("at least one command is required".to_string());
    }

    let request = SendCommandRequest {
        message: SendMessageRequest {
            id: clean_arg(id),
            source: clean_arg(source),
            destination: destination.clone(),
            title: clean_arg(title).unwrap_or_default(),
            content: clean_arg(content).unwrap_or_default(),
            fields: None,
            method: clean_arg(method),
            stamp_cost,
            include_ticket: include_ticket.unwrap_or(false),
        },
        commands: command_entries,
    };

    let response = actor.request(ActorCommand::SendCommand { selector, request })?;
    let result = response.get("result").cloned().unwrap_or(Value::Null);
    let source = response
        .get("source")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    let destination = response
        .get("destination")
        .and_then(Value::as_str)
        .unwrap_or(destination.as_str())
        .to_string();

    Ok(json!({
        "result": result,
        "resolved": {
            "source": source,
            "destination": destination,
        }
    }))
}

fn array_from_response(value: Value, field: &str) -> Result<Vec<Value>, String> {
    if let Some(array) = value.as_array() {
        return Ok(array.clone());
    }
    let object = value
        .as_object()
        .ok_or_else(|| format!("{field} response must be an array or object"))?;
    let array = object
        .get(field)
        .and_then(Value::as_array)
        .ok_or_else(|| format!("{field} must be an array"))?;
    Ok(array.clone())
}

fn extract_peer_capabilities(peer: &serde_json::Map<String, Value>) -> Vec<String> {
    for key in ["capabilities", "caps", "announce_capabilities"] {
        if let Some(caps) = extract_capabilities_from_json(peer.get(key)) {
            return caps;
        }
    }

    for key in ["app_data_hex", "announce_app_data_hex", "app_data", "announce_app_data"] {
        let Some(raw) = peer.get(key) else {
            continue;
        };
        let Some(bytes) = extract_bytes(raw) else {
            continue;
        };
        if let Some(caps) = decode_capabilities_from_announce_app_data(&bytes) {
            return caps;
        }
    }

    Vec::new()
}

fn extract_capabilities_from_json(value: Option<&Value>) -> Option<Vec<String>> {
    let value = value?;
    if let Some(array) = value.as_array() {
        return Some(normalize_capabilities_iter(
            array.iter().filter_map(Value::as_str),
        ));
    }
    let object = value.as_object()?;
    if let Some(array) = object.get("caps").and_then(Value::as_array) {
        return Some(normalize_capabilities_iter(
            array.iter().filter_map(Value::as_str),
        ));
    }
    if let Some(array) = object.get("capabilities").and_then(Value::as_array) {
        return Some(normalize_capabilities_iter(
            array.iter().filter_map(Value::as_str),
        ));
    }
    None
}

fn extract_bytes(value: &Value) -> Option<Vec<u8>> {
    if let Some(text) = value.as_str() {
        let trimmed = text.trim();
        if trimmed.is_empty() {
            return None;
        }
        let normalized = trimmed
            .strip_prefix("0x")
            .or_else(|| trimmed.strip_prefix("0X"))
            .unwrap_or(trimmed);
        if normalized.len() % 2 == 0 {
            if let Ok(decoded) = hex::decode(normalized) {
                if !decoded.is_empty() {
                    return Some(decoded);
                }
            }
        }
        return None;
    }

    let array = value.as_array()?;
    let mut output = Vec::with_capacity(array.len());
    for entry in array {
        let number = entry.as_u64()?;
        if number > u8::MAX as u64 {
            return None;
        }
        output.push(number as u8);
    }
    if output.is_empty() {
        None
    } else {
        Some(output)
    }
}

fn decode_capabilities_from_announce_app_data(app_data: &[u8]) -> Option<Vec<String>> {
    let mut cursor = Cursor::new(app_data);
    let value = rmpv::decode::read_value(&mut cursor).ok()?;
    let entries = match value {
        rmpv::Value::Array(values) => values,
        _ => return None,
    };
    if entries.len() < 3 {
        return None;
    }
    decode_capabilities_from_app_data_entry(&entries[2])
}

fn decode_capabilities_from_app_data_entry(entry: &rmpv::Value) -> Option<Vec<String>> {
    match entry {
        rmpv::Value::Map(map) => decode_capabilities_from_map_entry(map),
        rmpv::Value::Binary(bytes) => decode_capabilities_from_payload(bytes),
        rmpv::Value::Array(values) => {
            if let Some(bytes) = rmpv_array_to_bytes(values) {
                return decode_capabilities_from_payload(&bytes);
            }
            None
        }
        rmpv::Value::String(text) => {
            let raw = text.as_str().unwrap_or_default().trim();
            if raw.is_empty() {
                return None;
            }
            if let Ok(decoded) = hex::decode(raw) {
                return decode_capabilities_from_payload(&decoded);
            }
            None
        }
        _ => None,
    }
}

fn decode_capabilities_from_map_entry(map: &[(rmpv::Value, rmpv::Value)]) -> Option<Vec<String>> {
    for (key, value) in map {
        let Some(key_name) = key.as_str() else {
            continue;
        };
        if key_name == "caps" {
            if let rmpv::Value::Array(values) = value {
                return Some(normalize_capabilities_iter(
                    values.iter().filter_map(rmpv::Value::as_str),
                ));
            }
        }
        if key_name == "capabilities" {
            if let rmpv::Value::Array(values) = value {
                return Some(normalize_capabilities_iter(
                    values.iter().filter_map(rmpv::Value::as_str),
                ));
            }
        }
    }
    None
}

fn rmpv_array_to_bytes(values: &[rmpv::Value]) -> Option<Vec<u8>> {
    let mut bytes = Vec::with_capacity(values.len());
    for value in values {
        let number = value.as_u64()?;
        if number > u8::MAX as u64 {
            return None;
        }
        bytes.push(number as u8);
    }
    Some(bytes)
}

fn decode_capabilities_from_payload(raw: &[u8]) -> Option<Vec<String>> {
    if raw.is_empty() {
        return None;
    }

    if let Ok(decoded) = serde_cbor::from_slice::<Value>(raw) {
        if let Some(caps) = extract_capabilities_from_json(Some(&decoded)) {
            return Some(caps);
        }
    }

    if let Ok(decoded) = rmp_serde::from_slice::<Value>(raw) {
        if let Some(caps) = extract_capabilities_from_json(Some(&decoded)) {
            return Some(caps);
        }
    }

    None
}

fn normalize_capabilities_iter<'a>(values: impl Iterator<Item = &'a str>) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for entry in values {
        let normalized = entry.trim().to_ascii_lowercase();
        if normalized.is_empty() || !seen.insert(normalized.clone()) {
            continue;
        }
        out.push(normalized);
    }
    out
}

fn build_attachment_fields(attachments: &[RichAttachmentInput]) -> Result<Option<Value>, String> {
    if attachments.is_empty() {
        return Ok(None);
    }
    let mut encoded_attachments = Vec::with_capacity(attachments.len());
    for (index, attachment) in attachments.iter().enumerate() {
        let name = clean_required_arg(attachment.name.clone(), &format!("attachments[{index}].name"))?;
        let bytes = decode_attachment_bytes(&attachment.data_base64)
            .map_err(|err| format!("attachments[{index}].data_base64 {err}"))?;
        if bytes.is_empty() {
            return Err(format!("attachments[{index}].data_base64 must not be empty"));
        }
        encoded_attachments.push(rmpv::Value::Array(vec![
            rmpv::Value::Binary(name.into_bytes()),
            rmpv::Value::Binary(bytes),
        ]));
    }

    let fields_map = rmpv::Value::Map(vec![(
        rmpv::Value::Integer((FIELD_FILE_ATTACHMENTS as i64).into()),
        rmpv::Value::Array(encoded_attachments),
    )]);
    let encoded =
        rmp_serde::to_vec(&fields_map).map_err(|err| format!("failed to encode attachment fields: {err}"))?;
    let payload = base64::engine::general_purpose::STANDARD.encode(encoded);
    Ok(Some(json!({
        TRANSPORT_FIELDS_MSGPACK_B64_KEY: payload
    })))
}

fn decode_attachment_bytes(value: &str) -> Result<Vec<u8>, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err("must not be empty".to_string());
    }
    base64::engine::general_purpose::STANDARD
        .decode(trimmed)
        .or_else(|_| base64::engine::general_purpose::URL_SAFE.decode(trimmed))
        .map_err(|err| format!("must be valid base64: {err}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decode_capabilities_from_msgpack_announce_payload() {
        let capability_payload = rmp_serde::to_vec(&json!({
            "app": "rch",
            "schema": 1,
            "caps": ["topic_broker", "attachments"],
        }))
        .expect("encode capability payload");
        let announce_app_data =
            rmp_serde::to_vec(&(b"RCH".to_vec(), 1u32, capability_payload))
                .expect("encode announce app-data");

        let caps = decode_capabilities_from_announce_app_data(&announce_app_data)
            .expect("decode caps from app-data");
        assert_eq!(caps, vec!["topic_broker", "attachments"]);
    }

    #[test]
    fn decode_capabilities_from_cbor_announce_payload() {
        let capability_payload = serde_cbor::to_vec(&json!({
            "app": "rch",
            "schema": 1,
            "caps": ["telemetry_relay", "attachments"],
        }))
        .expect("encode cbor capability payload");
        let announce_app_data =
            rmp_serde::to_vec(&(b"RCH".to_vec(), 1u32, capability_payload))
                .expect("encode announce app-data");

        let caps = decode_capabilities_from_announce_app_data(&announce_app_data)
            .expect("decode caps from app-data");
        assert_eq!(caps, vec!["telemetry_relay", "attachments"]);
    }

    #[test]
    fn extract_peer_capabilities_from_hex_app_data() {
        let capability_payload = rmp_serde::to_vec(&json!({
            "app": "rch",
            "schema": 1,
            "caps": ["group_chat"],
        }))
        .expect("encode capability payload");
        let announce_app_data =
            rmp_serde::to_vec(&(b"RCH".to_vec(), 1u32, capability_payload))
                .expect("encode announce app-data");

        let mut peer = serde_json::Map::new();
        peer.insert("peer".into(), Value::String("abc123".into()));
        peer.insert(
            "app_data_hex".into(),
            Value::String(hex::encode(announce_app_data)),
        );

        let caps = extract_peer_capabilities(&peer);
        assert_eq!(caps, vec!["group_chat"]);
    }

    #[test]
    fn build_attachment_fields_encodes_lxmf_field_id() {
        let fields = build_attachment_fields(&[RichAttachmentInput {
            name: "hello.txt".to_string(),
            data_base64: base64::engine::general_purpose::STANDARD.encode(b"hello world"),
            mime: Some("text/plain".to_string()),
            size_bytes: Some(11),
        }])
        .expect("build fields")
        .expect("some fields");

        let decoded = lxmf::payload_fields::decode_transport_fields_json(&fields)
            .expect("decode transport")
            .expect("msgpack map");
        let map = decoded.as_map().expect("map");
        assert_eq!(map.len(), 1);
        assert_eq!(map[0].0.as_i64(), Some(FIELD_FILE_ATTACHMENTS as i64));
        let entries = map[0].1.as_array().expect("attachment array");
        assert_eq!(entries.len(), 1);
    }
}
