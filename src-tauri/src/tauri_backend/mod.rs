mod actor;
mod commands;
mod selector;

use actor::{ActorCommand, RuntimeActor};
use selector::{auto_daemon_enabled, default_profile, default_rpc, default_transport, RuntimeSelector};
use tauri::Manager;

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
            commands::daemon_probe,
            commands::daemon_status,
            commands::daemon_start,
            commands::daemon_stop,
            commands::daemon_restart,
            commands::lxmf_list_messages,
            commands::lxmf_list_peers,
            commands::lxmf_announce_now,
            commands::lxmf_poll_event,
            commands::lxmf_send_message
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
