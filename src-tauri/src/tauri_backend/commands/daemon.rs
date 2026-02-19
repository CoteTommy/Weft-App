use serde_json::Value;

use super::super::actor::{ActorCommand, RuntimeActor};
use super::super::ipc_v2;
use super::super::selector::{clean_arg, default_transport, RuntimeSelector};
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
pub(crate) fn v2_daemon_probe(
    actor: State<'_, RuntimeActor>,
    profile: Option<String>,
    rpc: Option<String>,
) -> Value {
    ipc_v2::from_result(daemon_probe(actor, profile, rpc))
}

#[tauri::command]
pub(crate) fn v2_daemon_status(
    actor: State<'_, RuntimeActor>,
    profile: Option<String>,
    rpc: Option<String>,
) -> Value {
    ipc_v2::from_result(daemon_status(actor, profile, rpc))
}

#[tauri::command]
pub(crate) fn v2_daemon_start(
    actor: State<'_, RuntimeActor>,
    profile: Option<String>,
    rpc: Option<String>,
    managed: Option<bool>,
    reticulumd: Option<String>,
    transport: Option<String>,
) -> Value {
    ipc_v2::from_result(daemon_start(
        actor, profile, rpc, managed, reticulumd, transport,
    ))
}

#[tauri::command]
pub(crate) fn v2_daemon_stop(
    actor: State<'_, RuntimeActor>,
    profile: Option<String>,
    rpc: Option<String>,
) -> Value {
    ipc_v2::from_result(daemon_stop(actor, profile, rpc))
}

#[tauri::command]
pub(crate) fn v2_daemon_restart(
    actor: State<'_, RuntimeActor>,
    profile: Option<String>,
    rpc: Option<String>,
    managed: Option<bool>,
    reticulumd: Option<String>,
    transport: Option<String>,
) -> Value {
    ipc_v2::from_result(daemon_restart(
        actor, profile, rpc, managed, reticulumd, transport,
    ))
}
