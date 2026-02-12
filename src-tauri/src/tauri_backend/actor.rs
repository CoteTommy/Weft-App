use super::selector::RuntimeSelector;
use lxmf::cli::daemon::DaemonStatus;
use lxmf::cli::profile::{load_reticulum_config, profile_paths, ProfileSettings};
use lxmf::runtime::{
    self, EventsProbeReport, RpcProbeReport, RuntimeConfig, RuntimeHandle, RuntimeProbeReport,
};
use serde::Serialize;
use serde_json::Value;
use std::sync::mpsc;
use std::time::{SystemTime, UNIX_EPOCH};

const INFERRED_TRANSPORT_BIND: &str = "127.0.0.1:0";

pub(crate) enum ActorCommand {
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
pub(crate) struct RuntimeActor {
    tx: mpsc::Sender<ActorRequest>,
}

impl RuntimeActor {
    pub(crate) fn spawn() -> Self {
        let (tx, rx) = mpsc::channel::<ActorRequest>();
        std::thread::spawn(move || runtime_worker(rx));
        Self { tx }
    }

    pub(crate) fn request(&self, command: ActorCommand) -> Result<Value, String> {
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

pub(crate) fn rpc_actor_call(
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

pub(crate) fn resolve_source_hash(
    actor: &RuntimeActor,
    selector: &RuntimeSelector,
    source: Option<String>,
) -> Result<String, String> {
    if let Some(source) = super::selector::clean_arg(source) {
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

pub(crate) fn clean_required_arg(value: String, name: &str) -> Result<String, String> {
    super::selector::clean_arg(Some(value)).ok_or_else(|| format!("{name} is required"))
}

pub(crate) fn generate_message_id() -> String {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    format!("lxmf-{now}")
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
    if let Some(transport) = super::selector::clean_arg(settings.transport.clone()) {
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

fn to_json_value<T: Serialize>(value: &T) -> Result<Value, String> {
    serde_json::to_value(value).map_err(|err| format!("failed to serialize response: {err}"))
}

#[cfg(test)]
mod tests {
    use super::{ActorCommand, RuntimeActor};
    use crate::tauri_backend::selector::RuntimeSelector;
    use lxmf::cli::profile::init_profile;
    use serde_json::json;

    #[test]
    fn runtime_actor_start_status_rpc_stop_smoke() {
        let temp = tempfile::tempdir().expect("tempdir");
        std::env::set_var("LXMF_CONFIG_ROOT", temp.path());
        init_profile("tauri-smoke", false, None).expect("init profile");

        let actor = RuntimeActor::spawn();
        let selector =
            RuntimeSelector::load(Some("tauri-smoke".to_string()), None).expect("selector load");

        let started = actor
            .request(ActorCommand::Start {
                selector: selector.clone(),
                transport: Some("127.0.0.1:0".to_string()),
            })
            .expect("start");
        assert_eq!(started.get("running").and_then(Value::as_bool), Some(true));

        let status = actor
            .request(ActorCommand::Status {
                selector: selector.clone(),
            })
            .expect("status");
        assert_eq!(status.get("running").and_then(Value::as_bool), Some(true));

        let messages = actor
            .request(ActorCommand::Rpc {
                selector: selector.clone(),
                method: "list_messages".to_string(),
                params: None,
            })
            .expect("list_messages");
        assert!(messages.get("messages").is_some());

        let injected = actor
            .request(ActorCommand::Rpc {
                selector: selector.clone(),
                method: "receive_message".to_string(),
                params: Some(json!({
                    "id": "tauri-smoke-msg-1",
                    "source": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                    "destination": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
                    "title": "smoke",
                    "content": "hello from tauri smoke",
                    "fields": {"_lxmf": {"scope": "chat"}}
                })),
            })
            .expect("receive_message");
        assert_eq!(
            injected.get("message_id").and_then(Value::as_str),
            Some("tauri-smoke-msg-1")
        );

        let messages = actor
            .request(ActorCommand::Rpc {
                selector: selector.clone(),
                method: "list_messages".to_string(),
                params: None,
            })
            .expect("list_messages after inject");
        let list = messages
            .get("messages")
            .and_then(Value::as_array)
            .expect("messages array");
        assert!(
            list.iter().any(|entry| {
                entry.get("id").and_then(Value::as_str) == Some("tauri-smoke-msg-1")
                    && entry.get("direction").and_then(Value::as_str) == Some("in")
            }),
            "expected injected inbound message in list_messages"
        );

        let stopped = actor
            .request(ActorCommand::Stop {
                selector: selector.clone(),
            })
            .expect("stop");
        assert_eq!(stopped.get("running").and_then(Value::as_bool), Some(false));

        let _ = actor.request(ActorCommand::Shutdown);
        std::env::remove_var("LXMF_CONFIG_ROOT");
    }

    use serde_json::Value;
}
