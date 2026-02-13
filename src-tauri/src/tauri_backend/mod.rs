mod actor;
mod commands;
mod selector;

use actor::{ActorCommand, RuntimeActor};
use selector::{
    auto_daemon_enabled, default_profile, default_rpc, default_transport, RuntimeSelector,
};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::{mpsc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, Manager, Theme};
use tauri_plugin_deep_link::DeepLinkExt;

pub(crate) const LXMF_EVENT_CHANNEL: &str = "weft://lxmf-event";
pub(crate) const TRAY_ACTION_CHANNEL: &str = "weft://tray-action";
pub(crate) const DEFAULT_EVENT_PUMP_INTERVAL_MS: u64 = 300;
const TRAY_ICON_ID: &str = "weft-tray";
const TRAY_MENU_OPEN: &str = "open";
const TRAY_MENU_NEW_MESSAGE: &str = "new_message";
const TRAY_MENU_RECONNECT: &str = "reconnect";
const TRAY_MENU_TOGGLE_NOTIFICATIONS: &str = "toggle_notifications";
const TRAY_MENU_QUIT: &str = "quit";
const DESKTOP_SHELL_CONFIG_FILE: &str = "desktop-shell.json";
#[cfg(target_os = "macos")]
const TRAY_TEMPLATE_ICON: tauri::image::Image<'_> =
    tauri::include_image!("./icons/tray-template.png");
#[cfg(not(target_os = "macos"))]
const TRAY_FALLBACK_ICON: tauri::image::Image<'_> = tauri::include_image!("./icons/32x32.png");

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub(crate) struct DesktopShellPreferences {
    pub minimize_to_tray_on_close: bool,
    pub start_in_tray: bool,
    pub single_instance_focus: bool,
    pub notifications_muted: bool,
}

impl Default for DesktopShellPreferences {
    fn default() -> Self {
        Self {
            minimize_to_tray_on_close: true,
            start_in_tray: false,
            single_instance_focus: true,
            notifications_muted: false,
        }
    }
}

#[derive(Debug, Clone, Default)]
pub(crate) struct DesktopShellPreferencePatch {
    pub minimize_to_tray_on_close: Option<bool>,
    pub start_in_tray: Option<bool>,
    pub single_instance_focus: Option<bool>,
    pub notifications_muted: Option<bool>,
}

#[derive(Default)]
pub(crate) struct DesktopShellState {
    prefs: Mutex<DesktopShellPreferences>,
    mute_menu_item: Mutex<Option<MenuItem<tauri::Wry>>>,
}

impl DesktopShellState {
    pub(crate) fn snapshot(&self) -> DesktopShellPreferences {
        self.prefs
            .lock()
            .map(|value| value.clone())
            .unwrap_or_default()
    }

    pub(crate) fn load_from_disk(&self, app: &tauri::AppHandle) -> Result<(), String> {
        let path = desktop_shell_path(app)?;
        let payload = match fs::read_to_string(&path) {
            Ok(value) => value,
            Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(()),
            Err(err) => return Err(format!("read desktop shell prefs failed: {err}")),
        };
        let parsed: DesktopShellPreferences = serde_json::from_str(&payload)
            .map_err(|err| format!("parse desktop shell prefs failed: {err}"))?;
        if let Ok(mut guard) = self.prefs.lock() {
            *guard = parsed;
        }
        self.sync_tray_menu_label();
        Ok(())
    }

    pub(crate) fn apply_patch(
        &self,
        app: &tauri::AppHandle,
        patch: DesktopShellPreferencePatch,
    ) -> Result<DesktopShellPreferences, String> {
        let mut guard = self
            .prefs
            .lock()
            .map_err(|_| "desktop shell prefs lock poisoned".to_string())?;
        if let Some(value) = patch.minimize_to_tray_on_close {
            guard.minimize_to_tray_on_close = value;
        }
        if let Some(value) = patch.start_in_tray {
            guard.start_in_tray = value;
        }
        if let Some(value) = patch.single_instance_focus {
            guard.single_instance_focus = value;
        }
        if let Some(value) = patch.notifications_muted {
            guard.notifications_muted = value;
        }
        let next = guard.clone();
        drop(guard);
        persist_desktop_shell_preferences(app, &next)?;
        self.sync_tray_menu_label();
        Ok(next)
    }

    pub(crate) fn set_mute_menu_item(&self, item: MenuItem<tauri::Wry>) {
        if let Ok(mut guard) = self.mute_menu_item.lock() {
            *guard = Some(item);
        }
        self.sync_tray_menu_label();
    }

    fn sync_tray_menu_label(&self) {
        let muted = self.snapshot().notifications_muted;
        let label = if muted {
            "Unmute Notifications"
        } else {
            "Mute Notifications"
        };
        if let Ok(guard) = self.mute_menu_item.lock() {
            if let Some(item) = guard.as_ref() {
                let _ = item.set_text(label);
            }
        }
    }
}

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

fn desktop_shell_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map_err(|err| format!("resolve app config dir failed: {err}"))
        .map(|dir| dir.join(DESKTOP_SHELL_CONFIG_FILE))
}

fn persist_desktop_shell_preferences(
    app: &tauri::AppHandle,
    prefs: &DesktopShellPreferences,
) -> Result<(), String> {
    let path = desktop_shell_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| format!("create prefs dir failed: {err}"))?;
    }
    let payload = serde_json::to_string_pretty(prefs)
        .map_err(|err| format!("serialize desktop shell prefs failed: {err}"))?;
    fs::write(path, payload).map_err(|err| format!("write desktop shell prefs failed: {err}"))
}

fn tray_action_payload(action: &str) -> serde_json::Value {
    serde_json::json!({ "action": action })
}

pub(crate) fn current_system_appearance(app: &tauri::AppHandle) -> &'static str {
    let Some(window) = app.get_webview_window("main") else {
        return "unknown";
    };
    match window.theme() {
        Ok(Theme::Dark) => "dark",
        Ok(Theme::Light) => "light",
        Ok(_) => "unknown",
        Err(_) => "unknown",
    }
}

fn show_main_window(app: &tauri::AppHandle) -> Result<(), String> {
    let Some(window) = app.get_webview_window("main") else {
        return Err("main window not found".to_string());
    };
    window
        .show()
        .map_err(|err| format!("show window failed: {err}"))?;
    let _ = window.unminimize();
    let _ = window.set_focus();
    Ok(())
}

fn toggle_main_window(app: &tauri::AppHandle) -> Result<(), String> {
    let Some(window) = app.get_webview_window("main") else {
        return Err("main window not found".to_string());
    };
    let visible = window
        .is_visible()
        .map_err(|err| format!("read window visibility failed: {err}"))?;
    if visible {
        window
            .hide()
            .map_err(|err| format!("hide window failed: {err}"))?;
    } else {
        window
            .show()
            .map_err(|err| format!("show window failed: {err}"))?;
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
    Ok(())
}

fn restart_runtime_for_tray(actor: &RuntimeActor) -> Result<(), String> {
    let _ = actor.request(ActorCommand::StopAny);
    let selector = RuntimeSelector::load(default_profile(), default_rpc())?;
    actor
        .request(ActorCommand::Start {
            selector,
            transport: default_transport(),
        })
        .map(|_| ())
}

fn setup_status_tray(
    app: &tauri::AppHandle,
    actor: RuntimeActor,
    desktop_shell: &DesktopShellState,
) -> Result<(), String> {
    let initial_prefs = desktop_shell.snapshot();
    let open_item = MenuItem::with_id(app, TRAY_MENU_OPEN, "Open Weft", true, None::<&str>)
        .map_err(|err| format!("tray menu item open failed: {err}"))?;
    let new_message_item = MenuItem::with_id(
        app,
        TRAY_MENU_NEW_MESSAGE,
        "New Message",
        true,
        None::<&str>,
    )
    .map_err(|err| format!("tray menu item new message failed: {err}"))?;
    let reconnect_item = MenuItem::with_id(
        app,
        TRAY_MENU_RECONNECT,
        "Reconnect Runtime",
        true,
        None::<&str>,
    )
    .map_err(|err| format!("tray menu item reconnect failed: {err}"))?;
    let mute_notifications_item = MenuItem::with_id(
        app,
        TRAY_MENU_TOGGLE_NOTIFICATIONS,
        if initial_prefs.notifications_muted {
            "Unmute Notifications"
        } else {
            "Mute Notifications"
        },
        true,
        None::<&str>,
    )
    .map_err(|err| format!("tray menu item toggle notifications failed: {err}"))?;
    let separator = PredefinedMenuItem::separator(app)
        .map_err(|err| format!("tray menu separator failed: {err}"))?;
    let quit_item = MenuItem::with_id(app, TRAY_MENU_QUIT, "Quit Weft", true, None::<&str>)
        .map_err(|err| format!("tray menu item quit failed: {err}"))?;
    let menu = Menu::with_items(
        app,
        &[
            &open_item,
            &new_message_item,
            &reconnect_item,
            &mute_notifications_item,
            &separator,
            &quit_item,
        ],
    )
    .map_err(|err| format!("tray menu build failed: {err}"))?;
    desktop_shell.set_mute_menu_item(mute_notifications_item.clone());

    let mut tray_builder = TrayIconBuilder::with_id(TRAY_ICON_ID)
        .menu(&menu)
        .tooltip("Weft Desktop")
        .show_menu_on_left_click(false)
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                if let Err(err) = toggle_main_window(&tray.app_handle()) {
                    log::warn!("tray toggle window failed: {err}");
                }
            }
        })
        .on_menu_event(move |app, event| match event.id().as_ref() {
            TRAY_MENU_OPEN => {
                if let Err(err) = show_main_window(app) {
                    log::warn!("tray open window failed: {err}");
                }
            }
            TRAY_MENU_NEW_MESSAGE => {
                if let Err(err) = show_main_window(app) {
                    log::warn!("tray new message open window failed: {err}");
                }
                let _ = app.emit(TRAY_ACTION_CHANNEL, tray_action_payload("new_message"));
            }
            TRAY_MENU_RECONNECT => {
                if let Err(err) = restart_runtime_for_tray(&actor) {
                    log::warn!("tray reconnect failed: {err}");
                }
            }
            TRAY_MENU_TOGGLE_NOTIFICATIONS => {
                let Some(shell) = app.try_state::<DesktopShellState>() else {
                    log::warn!("tray notifications toggle failed: desktop shell state missing");
                    return;
                };
                match shell.apply_patch(
                    app,
                    DesktopShellPreferencePatch {
                        notifications_muted: Some(!shell.snapshot().notifications_muted),
                        ..DesktopShellPreferencePatch::default()
                    },
                ) {
                    Ok(next) => {
                        let _ = app.emit(
                            TRAY_ACTION_CHANNEL,
                            serde_json::json!({
                                "action": "notifications_muted",
                                "muted": next.notifications_muted
                            }),
                        );
                    }
                    Err(err) => log::warn!("tray toggle notifications failed: {err}"),
                }
            }
            TRAY_MENU_QUIT => {
                app.exit(0);
            }
            _ => {}
        });

    #[cfg(target_os = "macos")]
    {
        tray_builder = tray_builder.icon(TRAY_TEMPLATE_ICON);
    }
    #[cfg(not(target_os = "macos"))]
    {
        tray_builder = tray_builder.icon(TRAY_FALLBACK_ICON);
    }
    #[cfg(target_os = "macos")]
    {
        tray_builder = tray_builder.icon_as_template(true);
    }
    tray_builder
        .build(app)
        .map_err(|err| format!("tray build failed: {err}"))?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let actor = RuntimeActor::spawn();
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            log::info!("secondary instance forwarded args={argv:?} cwd={cwd}");
            let should_focus = app
                .try_state::<DesktopShellState>()
                .map(|state| state.snapshot().single_instance_focus)
                .unwrap_or(true);
            if should_focus {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.unminimize();
                    let _ = window.set_focus();
                }
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
        .manage(DesktopShellState::default())
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
            if let Some(shell_state) = app.try_state::<DesktopShellState>() {
                if let Err(err) = shell_state.load_from_disk(&app.handle()) {
                    log::warn!("desktop shell prefs load failed: {err}");
                }
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
            let shell_state = app
                .try_state::<DesktopShellState>()
                .ok_or_else(|| "desktop shell state missing".to_string())?;
            if let Err(err) = setup_status_tray(&app.handle(), actor.clone(), &shell_state) {
                log::warn!("status tray setup failed: {err}");
            }
            if shell_state.snapshot().start_in_tray {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() != "main" {
                return;
            }
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let minimize_to_tray = window
                    .app_handle()
                    .try_state::<DesktopShellState>()
                    .map(|state| state.snapshot().minimize_to_tray_on_close)
                    .unwrap_or(true);
                if minimize_to_tray {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
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
            commands::lxmf_send_command,
            commands::desktop_get_shell_preferences,
            commands::desktop_set_shell_preferences
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
