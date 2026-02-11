use lxmf::cli::daemon::DaemonStatus;
use lxmf::cli::profile::{
    load_profile_settings, load_reticulum_config, profile_paths, resolve_runtime_profile_name,
    ProfileSettings,
};
use lxmf::runtime::{
    self, EventsProbeReport, RpcProbeReport, RuntimeConfig, RuntimeHandle, RuntimeProbeReport,
};
use serde::Serialize;
use serde_json::{json, Value};
use std::env;
use std::sync::mpsc;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;

const ENV_AUTO_DAEMON: &str = "WEFT_AUTO_DAEMON";
const ENV_DEFAULT_PROFILE: &str = "WEFT_PROFILE";
const ENV_DEFAULT_RPC: &str = "WEFT_RPC";
const ENV_DEFAULT_TRANSPORT: &str = "WEFT_TRANSPORT";
const INFERRED_TRANSPORT_BIND: &str = "127.0.0.1:0";

#[derive(Debug, Clone)]
struct RuntimeSelector {
    profile_name: String,
    profile_settings: ProfileSettings,
}

enum ActorCommand {
    Probe {
        selector: RuntimeSelector,
    },
    Status {
        selector: RuntimeSelector,
    },
    Start {
        selector: RuntimeSelector,
        transport: Option<String>,
    },
    Stop {
        selector: RuntimeSelector,
    },
    Restart {
        selector: RuntimeSelector,
        transport: Option<String>,
    },
    Rpc {
        selector: RuntimeSelector,
        method: String,
        params: Option<Value>,
    },
    PollEvent {
        selector: RuntimeSelector,
    },
    StopAny,
    Shutdown,
}

struct ActorRequest {
    command: ActorCommand,
    respond_to: mpsc::Sender<Result<Value, String>>,
}

#[derive(Clone)]
struct RuntimeActor {
    tx: mpsc::Sender<ActorRequest>,
}

impl RuntimeActor {
    fn spawn() -> Self {
        let (tx, rx) = mpsc::channel::<ActorRequest>();
        std::thread::spawn(move || runtime_worker(rx));
        Self { tx }
    }

    fn request(&self, command: ActorCommand) -> Result<Value, String> {
        let (resp_tx, resp_rx) = mpsc::channel::<Result<Value, String>>();
        self.tx
            .send(ActorRequest {
                command,
                respond_to: resp_tx,
            })
            .map_err(|_| "runtime worker unavailable".to_string())?;
        resp_rx
            .recv()
            .map_err(|_| "runtime worker did not respond".to_string())?
    }
}

#[tauri::command]
fn daemon_probe(
    actor: tauri::State<'_, RuntimeActor>,
    profile: Option<String>,
    rpc: Option<String>,
) -> Result<Value, String> {
    let selector = RuntimeSelector::load(profile, rpc)?;
    actor.request(ActorCommand::Probe { selector })
}

#[tauri::command]
fn daemon_status(
    actor: tauri::State<'_, RuntimeActor>,
    profile: Option<String>,
    rpc: Option<String>,
) -> Result<Value, String> {
    let selector = RuntimeSelector::load(profile, rpc)?;
    actor.request(ActorCommand::Status { selector })
}

#[tauri::command]
fn daemon_start(
    actor: tauri::State<'_, RuntimeActor>,
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
fn daemon_stop(
    actor: tauri::State<'_, RuntimeActor>,
    profile: Option<String>,
    rpc: Option<String>,
) -> Result<Value, String> {
    let selector = RuntimeSelector::load(profile, rpc)?;
    actor.request(ActorCommand::Stop { selector })
}

#[tauri::command]
fn daemon_restart(
    actor: tauri::State<'_, RuntimeActor>,
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
fn lxmf_list_messages(
    actor: tauri::State<'_, RuntimeActor>,
    profile: Option<String>,
    rpc: Option<String>,
) -> Result<Value, String> {
    let selector = RuntimeSelector::load(profile, rpc)?;
    rpc_actor_call(&actor, selector, "list_messages", None)
}

#[tauri::command]
fn lxmf_list_peers(
    actor: tauri::State<'_, RuntimeActor>,
    profile: Option<String>,
    rpc: Option<String>,
) -> Result<Value, String> {
    let selector = RuntimeSelector::load(profile, rpc)?;
    rpc_actor_call(&actor, selector, "list_peers", None)
}

#[tauri::command]
fn lxmf_announce_now(
    actor: tauri::State<'_, RuntimeActor>,
    profile: Option<String>,
    rpc: Option<String>,
) -> Result<Value, String> {
    let selector = RuntimeSelector::load(profile, rpc)?;
    rpc_actor_call(&actor, selector, "announce_now", None)
}

#[tauri::command]
fn lxmf_poll_event(
    actor: tauri::State<'_, RuntimeActor>,
    profile: Option<String>,
    rpc: Option<String>,
) -> Result<Value, String> {
    let selector = RuntimeSelector::load(profile, rpc)?;
    actor.request(ActorCommand::PollEvent { selector })
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
fn lxmf_send_message(
    actor: tauri::State<'_, RuntimeActor>,
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

fn runtime_worker(rx: mpsc::Receiver<ActorRequest>) {
    let mut handle: Option<RuntimeHandle> = None;

    while let Ok(request) = rx.recv() {
        let (result, should_exit) = match request.command {
            ActorCommand::Probe { selector } => (probe_with_handle(&handle, &selector), false),
            ActorCommand::Status { selector } => (status_with_handle(&handle, &selector), false),
            ActorCommand::Start {
                selector,
                transport,
            } => (start_handle(&mut handle, selector, transport), false),
            ActorCommand::Stop { selector } => (stop_handle(&mut handle, selector), false),
            ActorCommand::Restart {
                selector,
                transport,
            } => {
                let _ = stop_handle(&mut handle, selector.clone());
                (start_handle(&mut handle, selector, transport), false)
            }
            ActorCommand::Rpc {
                selector,
                method,
                params,
            } => (rpc_with_handle(&handle, &selector, &method, params), false),
            ActorCommand::PollEvent { selector } => {
                (poll_event_with_handle(&handle, &selector), false)
            }
            ActorCommand::StopAny => {
                if let Some(current) = handle.take() {
                    current.stop();
                }
                (Ok(Value::Null), false)
            }
            ActorCommand::Shutdown => {
                if let Some(current) = handle.take() {
                    current.stop();
                }
                (Ok(Value::Null), true)
            }
        };

        let _ = request.respond_to.send(result);
        if should_exit {
            break;
        }
    }
}

fn probe_with_handle(
    handle: &Option<RuntimeHandle>,
    selector: &RuntimeSelector,
) -> Result<Value, String> {
    let probe = if let Some(runtime) = handle
        .as_ref()
        .filter(|runtime| runtime_matches_selector(runtime, selector))
    {
        runtime.probe()
    } else {
        RuntimeProbeReport {
            profile: selector.profile_name.clone(),
            local: stopped_status(selector),
            rpc: RpcProbeReport {
                reachable: false,
                endpoint: selector.profile_settings.rpc.clone(),
                method: None,
                roundtrip_ms: None,
                identity_hash: None,
                status: None,
                errors: vec!["runtime not started".to_string()],
            },
            events: EventsProbeReport {
                reachable: false,
                endpoint: selector.profile_settings.rpc.clone(),
                roundtrip_ms: None,
                event_type: None,
                payload: None,
                error: Some("runtime not started".to_string()),
            },
        }
    };

    to_json_value(&probe)
}

fn status_with_handle(
    handle: &Option<RuntimeHandle>,
    selector: &RuntimeSelector,
) -> Result<Value, String> {
    if let Some(runtime) = handle
        .as_ref()
        .filter(|runtime| runtime_matches_selector(runtime, selector))
    {
        return to_json_value(&runtime.status());
    }
    to_json_value(&stopped_status(selector))
}

fn start_handle(
    handle: &mut Option<RuntimeHandle>,
    selector: RuntimeSelector,
    transport: Option<String>,
) -> Result<Value, String> {
    if let Some(current) = handle.as_ref() {
        if runtime_matches_selector(current, &selector) {
            return to_json_value(&current.status());
        }
    }

    if let Some(current) = handle.take() {
        current.stop();
    }

    let runtime = runtime::start(RuntimeConfig {
        profile: selector.profile_name,
        rpc: Some(selector.profile_settings.rpc),
        transport,
    })
    .map_err(|err| err.to_string())?;
    let status = runtime.status();
    *handle = Some(runtime);
    to_json_value(&status)
}

fn stop_handle(
    handle: &mut Option<RuntimeHandle>,
    selector: RuntimeSelector,
) -> Result<Value, String> {
    if let Some(current) = handle.take() {
        current.stop();
    }
    to_json_value(&stopped_status(&selector))
}

fn rpc_actor_call(
    actor: &RuntimeActor,
    selector: RuntimeSelector,
    method: &str,
    params: Option<Value>,
) -> Result<Value, String> {
    actor.request(ActorCommand::Rpc {
        selector,
        method: method.to_string(),
        params,
    })
}

fn runtime_for_selector<'a>(
    handle: &'a Option<RuntimeHandle>,
    selector: &RuntimeSelector,
) -> Result<&'a RuntimeHandle, String> {
    match handle.as_ref() {
        Some(runtime) if runtime_matches_selector(runtime, selector) => Ok(runtime),
        Some(_) => Err("runtime is active for a different profile or rpc endpoint".to_string()),
        None => Err("runtime not started; run daemon_start first".to_string()),
    }
}

fn rpc_with_handle(
    handle: &Option<RuntimeHandle>,
    selector: &RuntimeSelector,
    method: &str,
    params: Option<Value>,
) -> Result<Value, String> {
    let runtime = runtime_for_selector(handle, selector)?;
    runtime.call(method, params).map_err(|err| err.to_string())
}

fn poll_event_with_handle(
    handle: &Option<RuntimeHandle>,
    selector: &RuntimeSelector,
) -> Result<Value, String> {
    let runtime = runtime_for_selector(handle, selector)?;
    to_json_value(&runtime.poll_event())
}

fn runtime_matches_selector(runtime: &RuntimeHandle, selector: &RuntimeSelector) -> bool {
    let settings = runtime.settings();
    runtime.profile() == selector.profile_name && settings.rpc == selector.profile_settings.rpc
}

fn resolve_source_hash(
    actor: &RuntimeActor,
    selector: &RuntimeSelector,
    source: Option<String>,
) -> Result<String, String> {
    if let Some(source) = clean_arg(source) {
        return Ok(source);
    }

    for method in ["daemon_status_ex", "status"] {
        if let Ok(status) = rpc_actor_call(actor, selector.clone(), method, None) {
            if let Some(hash) = source_hash_from_status(&status) {
                return Ok(hash);
            }
        }
    }

    Err(
        "source not provided and daemon did not report delivery/identity hash; pass source or start daemon"
            .to_string(),
    )
}

fn source_hash_from_status(value: &Value) -> Option<String> {
    for key in ["delivery_destination_hash", "identity_hash"] {
        if let Some(hash) = value
            .get(key)
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|candidate| !candidate.is_empty())
        {
            return Some(hash.to_string());
        }
    }
    None
}

fn clean_required_arg(value: String, name: &str) -> Result<String, String> {
    clean_arg(Some(value)).ok_or_else(|| format!("{name} is required"))
}

fn generate_message_id() -> String {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    format!("lxmf-{now}")
}

fn stopped_status(selector: &RuntimeSelector) -> DaemonStatus {
    let (transport, transport_inferred) =
        resolve_transport_for_status(&selector.profile_name, &selector.profile_settings);
    let log_path = profile_paths(&selector.profile_name)
        .map(|paths| paths.daemon_log.display().to_string())
        .unwrap_or_default();

    DaemonStatus {
        running: false,
        pid: None,
        rpc: selector.profile_settings.rpc.clone(),
        profile: selector.profile_name.clone(),
        managed: true,
        transport,
        transport_inferred,
        log_path,
    }
}

fn resolve_transport_for_status(
    profile_name: &str,
    settings: &ProfileSettings,
) -> (Option<String>, bool) {
    if let Some(transport) = clean_arg(settings.transport.clone()) {
        return (Some(transport), false);
    }
    let has_enabled_interfaces = load_reticulum_config(profile_name)
        .map(|config| config.interfaces.iter().any(|iface| iface.enabled))
        .unwrap_or(false);
    if has_enabled_interfaces {
        return (Some(INFERRED_TRANSPORT_BIND.to_string()), true);
    }
    (None, false)
}

impl RuntimeSelector {
    fn load(profile: Option<String>, rpc: Option<String>) -> Result<Self, String> {
        let requested_profile = clean_arg(profile)
            .or_else(default_profile)
            .unwrap_or_else(|| "default".to_string());
        validate_profile(&requested_profile)?;

        let profile_name = resolve_runtime_profile_name(&requested_profile)
            .map_err(|err| format!("failed to resolve profile '{requested_profile}': {err}"))?;
        let mut profile_settings =
            load_profile_settings(&profile_name).map_err(|err| err.to_string())?;

        if let Some(rpc_value) = clean_arg(rpc).or_else(default_rpc) {
            validate_rpc(&rpc_value)?;
            profile_settings.rpc = rpc_value;
        }

        Ok(Self {
            profile_name,
            profile_settings,
        })
    }
}

fn to_json_value<T: Serialize>(value: &T) -> Result<Value, String> {
    serde_json::to_value(value).map_err(|err| format!("failed to serialize response: {err}"))
}

fn auto_daemon_enabled() -> bool {
    parse_bool_env(ENV_AUTO_DAEMON).unwrap_or(true)
}

fn parse_bool_env(key: &str) -> Option<bool> {
    let value = env::var(key).ok()?;
    let normalized = value.trim().to_ascii_lowercase();
    match normalized.as_str() {
        "1" | "true" | "yes" | "on" => Some(true),
        "0" | "false" | "no" | "off" => Some(false),
        _ => None,
    }
}

fn default_profile() -> Option<String> {
    clean_arg(env::var(ENV_DEFAULT_PROFILE).ok())
}

fn default_rpc() -> Option<String> {
    clean_arg(env::var(ENV_DEFAULT_RPC).ok())
}

fn default_transport() -> Option<String> {
    clean_arg(env::var(ENV_DEFAULT_TRANSPORT).ok())
}

fn validate_profile(value: &str) -> Result<(), String> {
    if value.is_empty() || value.len() > 64 {
        return Err("profile must be 1-64 chars".to_string());
    }
    if value
        .chars()
        .any(|ch| !(ch.is_ascii_alphanumeric() || ch == '_' || ch == '-' || ch == '.'))
    {
        return Err("profile contains invalid characters".to_string());
    }
    Ok(())
}

fn validate_rpc(value: &str) -> Result<(), String> {
    if value.is_empty() || value.len() > 256 {
        return Err("rpc must be 1-256 chars".to_string());
    }
    if value.chars().any(|ch| matches!(ch, '\n' | '\r' | '\0')) {
        return Err("rpc contains invalid characters".to_string());
    }
    Ok(())
}

fn clean_arg(value: Option<String>) -> Option<String> {
    value.and_then(|raw| {
        let trimmed = raw.trim().to_string();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed)
        }
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let actor = RuntimeActor::spawn();
    let app = tauri::Builder::default()
        .manage(actor.clone())
        .setup(move |app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            if auto_daemon_enabled() {
                match RuntimeSelector::load(default_profile(), default_rpc()) {
                    Ok(selector) => {
                        if let Err(err) = actor.request(ActorCommand::Start {
                            selector,
                            transport: default_transport(),
                        }) {
                            log::warn!("auto-start daemon failed: {err}");
                        } else {
                            log::info!("auto-start daemon succeeded");
                        }
                    }
                    Err(err) => log::warn!("auto-start daemon skipped: {err}"),
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            daemon_probe,
            daemon_status,
            daemon_start,
            daemon_stop,
            daemon_restart,
            lxmf_list_messages,
            lxmf_list_peers,
            lxmf_announce_now,
            lxmf_poll_event,
            lxmf_send_message
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        if let tauri::RunEvent::ExitRequested { .. } = event {
            if let Some(actor) = app_handle.try_state::<RuntimeActor>() {
                if auto_daemon_enabled() {
                    let _ = actor.request(ActorCommand::StopAny);
                }
                let _ = actor.request(ActorCommand::Shutdown);
            }
        }
    });
}
