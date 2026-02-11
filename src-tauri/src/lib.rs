use serde_json::Value;
use std::env;
use std::process::Command;

#[tauri::command]
fn daemon_probe(profile: Option<String>, rpc: Option<String>) -> Result<Value, String> {
    run_lxmf_json(profile, rpc, ["daemon", "probe"], &[])
}

#[tauri::command]
fn daemon_status(profile: Option<String>, rpc: Option<String>) -> Result<Value, String> {
    run_lxmf_json(profile, rpc, ["daemon", "status"], &[]).map(extract_local_status)
}

#[tauri::command]
fn daemon_start(
    profile: Option<String>,
    rpc: Option<String>,
    managed: Option<bool>,
    reticulumd: Option<String>,
    transport: Option<String>,
) -> Result<Value, String> {
    let mut args = Vec::<String>::new();
    if managed.unwrap_or(true) {
        args.push("--managed".to_string());
    }
    if let Some(reticulumd) = clean_arg(reticulumd) {
        args.push("--reticulumd".to_string());
        args.push(reticulumd);
    }
    if let Some(transport) = clean_arg(transport) {
        args.push("--transport".to_string());
        args.push(transport);
    }
    run_lxmf_json(profile, rpc, ["daemon", "start"], &args).map(extract_local_status)
}

#[tauri::command]
fn daemon_stop(profile: Option<String>, rpc: Option<String>) -> Result<Value, String> {
    run_lxmf_json(profile, rpc, ["daemon", "stop"], &[]).map(extract_local_status)
}

#[tauri::command]
fn daemon_restart(
    profile: Option<String>,
    rpc: Option<String>,
    managed: Option<bool>,
    reticulumd: Option<String>,
    transport: Option<String>,
) -> Result<Value, String> {
    let mut args = Vec::<String>::new();
    if managed.unwrap_or(true) {
        args.push("--managed".to_string());
    }
    if let Some(reticulumd) = clean_arg(reticulumd) {
        args.push("--reticulumd".to_string());
        args.push(reticulumd);
    }
    if let Some(transport) = clean_arg(transport) {
        args.push("--transport".to_string());
        args.push(transport);
    }
    run_lxmf_json(profile, rpc, ["daemon", "restart"], &args).map(extract_local_status)
}

fn run_lxmf_json<const N: usize>(
    profile: Option<String>,
    rpc: Option<String>,
    command: [&str; N],
    extra_args: &[String],
) -> Result<Value, String> {
    let profile = clean_arg(profile).unwrap_or_else(|| "default".to_string());
    validate_profile(&profile)?;

    let rpc = clean_arg(rpc);
    if let Some(rpc) = rpc.as_ref() {
        validate_rpc(rpc)?;
    }

    let lxmf_bin = env::var("LXMF_BIN").unwrap_or_else(|_| "lxmf".to_string());

    let mut cmd = Command::new(&lxmf_bin);
    cmd.arg("--json").arg("--profile").arg(&profile);

    if let Some(rpc) = rpc.as_ref() {
        cmd.arg("--rpc").arg(rpc);
    }

    for segment in command {
        cmd.arg(segment);
    }

    for arg in extra_args {
        cmd.arg(arg);
    }

    let output = cmd
        .output()
        .map_err(|err| format!("failed to execute '{lxmf_bin}': {err}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let detail = if !stderr.is_empty() {
            stderr
        } else if !stdout.is_empty() {
            stdout
        } else {
            format!("exit code {}", output.status.code().unwrap_or_default())
        };
        return Err(detail);
    }

    serde_json::from_slice(&output.stdout)
        .map_err(|err| format!("lxmf returned invalid JSON: {err}"))
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

fn extract_local_status(value: Value) -> Value {
    if let Some(local) = value.get("local") {
        if local.is_object() {
            return local.clone();
        }
    }
    value
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            daemon_probe,
            daemon_status,
            daemon_start,
            daemon_stop,
            daemon_restart
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
