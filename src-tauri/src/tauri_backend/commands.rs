use super::actor::{
    clean_required_arg, generate_message_id, resolve_source_hash, rpc_actor_call, ActorCommand,
    RuntimeActor,
};
use super::selector::{clean_arg, default_transport, RuntimeSelector};
use serde_json::{json, Value};
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
pub(crate) fn lxmf_announce_now(
    actor: State<'_, RuntimeActor>,
    profile: Option<String>,
    rpc: Option<String>,
) -> Result<Value, String> {
    let selector = RuntimeSelector::load(profile, rpc)?;
    rpc_actor_call(&actor, selector, "announce_now", None)
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
    let source = resolve_source_hash(&actor, &selector, source)?;
    let id = clean_arg(id).unwrap_or_else(generate_message_id);

    let mut params = json!({
        "id": id,
        "source": source,
        "destination": destination,
        "title": clean_arg(title).unwrap_or_default(),
        "content": content,
    });

    if let Some(fields) = fields {
        params["fields"] = fields;
    }
    if let Some(method) = clean_arg(method) {
        params["method"] = Value::String(method);
    }
    if let Some(stamp_cost) = stamp_cost {
        params["stamp_cost"] = Value::from(stamp_cost);
    }
    if include_ticket.unwrap_or(false) {
        params["include_ticket"] = Value::Bool(true);
    }

    let send_v2 = rpc_actor_call(
        &actor,
        selector.clone(),
        "send_message_v2",
        Some(params.clone()),
    );
    let result = match send_v2 {
        Ok(value) => value,
        Err(_) => rpc_actor_call(&actor, selector, "send_message", Some(params))?,
    };

    Ok(json!({
        "result": result,
        "resolved": {
            "source": source,
            "destination": destination,
        }
    }))
}
