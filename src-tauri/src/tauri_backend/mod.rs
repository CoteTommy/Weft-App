mod actor;
mod commands;
mod selector;

use actor::{ActorCommand, RuntimeActor};
use selector::{
    auto_daemon_enabled, default_profile, default_rpc, default_transport, RuntimeSelector,
};
use std::sync::{mpsc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{Emitter, Manager};
use tauri_plugin_deep_link::DeepLinkExt;

pub(crate) const LXMF_EVENT_CHANNEL: &str = "weft://lxmf-event";
pub(crate) const DEFAULT_EVENT_PUMP_INTERVAL_MS: u64 = 300;

#[derive(Default)]
pub(crate) struct EventPumpControl {
    handle: Mutex<Option<EventPumpHandle>>,
}

struct EventPumpHandle {
    profile: String,
    rpc: String,
    interval_ms: u64,
    stop_tx: mpsc::Sender<()>,
    thread: Option<thread::JoinHandle<()>>,
}

impl EventPumpControl {
    pub(crate) fn start(
        &self,
        app_handle: tauri::AppHandle,
        actor: RuntimeActor,
        selector: RuntimeSelector,
        interval_ms: u64,
    ) -> Result<(), String> {
        let interval_ms = interval_ms.clamp(100, 5_000);
        let profile = selector.profile_name.clone();
        let rpc = selector.profile_settings.rpc.clone();

        let mut guard = self
            .handle
            .lock()
            .map_err(|_| "event pump lock poisoned".to_string())?;
        if let Some(existing) = guard.as_ref() {
            if existing.profile == profile
                && existing.rpc == rpc
                && existing.interval_ms == interval_ms
            {
                return Ok(());
            }
        }
        stop_event_pump_locked(&mut guard);

        let (stop_tx, stop_rx) = mpsc::channel::<()>();
        let thread_selector = selector.clone();
        let thread = thread::Builder::new()
            .name(format!("weft-event-pump-{}", selector.profile_name))
            .spawn(move || {
                let interval = Duration::from_millis(interval_ms);
                loop {
                    if stop_rx.recv_timeout(interval).is_ok() {
                        break;
                    }

                    match actor.request(ActorCommand::PollEvent {
                        selector: thread_selector.clone(),
                    }) {
                        Ok(event) if !event.is_null() => {
                            let _ = app_handle.emit(LXMF_EVENT_CHANNEL, event);
                        }
                        Ok(_) => {}
                        Err(err) => {
                            if !err.contains("runtime not started") {
                                log::debug!("event pump poll error: {err}");
                            }
                        }
                    }
                }
            })
            .map_err(|err| format!("failed to spawn event pump: {err}"))?;

        *guard = Some(EventPumpHandle {
            profile,
            rpc,
            interval_ms,
            stop_tx,
            thread: Some(thread),
        });
        Ok(())
    }

    pub(crate) fn stop(&self) {
        if let Ok(mut guard) = self.handle.lock() {
            stop_event_pump_locked(&mut guard);
        }
    }
}

fn stop_event_pump_locked(slot: &mut Option<EventPumpHandle>) {
    if let Some(mut handle) = slot.take() {
        let _ = handle.stop_tx.send(());
        if let Some(join) = handle.thread.take() {
            let _ = join.join();
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let actor = RuntimeActor::spawn();
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            log::info!("secondary instance forwarded args={argv:?} cwd={cwd}");
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
            let _ = app.emit(
                "weft://single-instance",
                serde_json::json!({
                    "argv": argv,
                    "cwd": cwd,
                }),
            );
        }))
        .plugin(tauri_plugin_deep_link::init())
        .manage(actor.clone())
        .manage(EventPumpControl::default())
        .setup(move |app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            if let Err(err) = app.deep_link().register_all() {
                log::warn!("deep-link register_all failed: {err}");
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

            if let Ok(selector) = RuntimeSelector::load(default_profile(), default_rpc()) {
                if let Some(control) = app.try_state::<EventPumpControl>() {
                    if let Err(err) = control.start(
                        app.handle().clone(),
                        actor.clone(),
                        selector,
                        DEFAULT_EVENT_PUMP_INTERVAL_MS,
                    ) {
                        log::warn!("event pump start failed: {err}");
                    }
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::daemon_probe,
            commands::daemon_status,
            commands::daemon_start,
            commands::daemon_stop,
            commands::daemon_restart,
            commands::lxmf_list_messages,
            commands::lxmf_list_peers,
            commands::lxmf_list_interfaces,
            commands::lxmf_list_announces,
            commands::lxmf_interface_metrics,
            commands::lxmf_list_propagation_nodes,
            commands::lxmf_get_outbound_propagation_node,
            commands::lxmf_set_outbound_propagation_node,
            commands::lxmf_message_delivery_trace,
            commands::lxmf_announce_now,
            commands::lxmf_paper_ingest_uri,
            commands::lxmf_poll_event,
            commands::lxmf_start_event_pump,
            commands::lxmf_stop_event_pump,
            commands::lxmf_get_profile,
            commands::lxmf_set_display_name,
            commands::lxmf_send_message,
            commands::lxmf_send_rich_message,
            commands::lxmf_send_command
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        if let tauri::RunEvent::ExitRequested { .. } = event {
            if let Some(event_pump) = app_handle.try_state::<EventPumpControl>() {
                event_pump.stop();
            }
            if let Some(actor) = app_handle.try_state::<RuntimeActor>() {
                if auto_daemon_enabled() {
                    let _ = actor.request(ActorCommand::StopAny);
                }
                let _ = actor.request(ActorCommand::Shutdown);
            }
        }
    });
}
