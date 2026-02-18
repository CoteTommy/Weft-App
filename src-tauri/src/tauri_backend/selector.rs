use lxmf::cli::profile::{
    init_profile, load_profile_settings, resolve_runtime_profile_name, selected_profile_name,
    ProfileSettings,
};
use std::env;

const ENV_AUTO_DAEMON: &str = "WEFT_AUTO_DAEMON";
const ENV_DEFAULT_PROFILE: &str = "WEFT_PROFILE";
const ENV_DEFAULT_RPC: &str = "WEFT_RPC";
const ENV_DEFAULT_TRANSPORT: &str = "WEFT_TRANSPORT";
const DEFAULT_AUTOCREATE_RPC: &str = "rmap.world:4242";

#[derive(Debug, Clone)]
pub(crate) struct RuntimeSelector {
    pub(crate) profile_name: String,
    pub(crate) profile_settings: ProfileSettings,
}

impl RuntimeSelector {
    pub(crate) fn load(profile: Option<String>, rpc: Option<String>) -> Result<Self, String> {
        let requested_profile = clean_arg(profile)
            .or_else(default_profile)
            .or_else(selected_profile_fallback)
            .unwrap_or_else(|| "default".to_string());
        let requested_rpc = clean_arg(rpc).or_else(default_rpc);
        validate_profile(&requested_profile)?;

        let profile_name = match resolve_runtime_profile_name(&requested_profile) {
            Ok(name) => name,
            Err(err) if requested_profile == "default" => {
                let init_rpc = requested_rpc.clone().unwrap_or_else(|| DEFAULT_AUTOCREATE_RPC.to_string());
                validate_rpc(&init_rpc)?;
                init_profile(&requested_profile, false, Some(init_rpc))
                    .map_err(|init_err| {
                        format!("failed to initialize profile '{requested_profile}': {init_err}")
                    })
                    .map(|_| requested_profile.clone())?
            }
            Err(err) => {
                return Err(format!("failed to resolve profile '{requested_profile}': {err}"));
            }
        };
        let mut profile_settings =
            load_profile_settings(&profile_name).map_err(|err| err.to_string())?;

        if let Some(rpc_value) = requested_rpc {
            validate_rpc(&rpc_value)?;
            profile_settings.rpc = rpc_value;
        }

        Ok(Self {
            profile_name,
            profile_settings,
        })
    }
}

fn selected_profile_fallback() -> Option<String> {
    match selected_profile_name() {
        Ok(Some(name)) if !name.trim().is_empty() => Some(name.trim().to_string()),
        _ => None,
    }
}

pub(crate) fn auto_daemon_enabled() -> bool {
    parse_bool_env(ENV_AUTO_DAEMON).unwrap_or(true)
}

pub(crate) fn default_transport() -> Option<String> {
    clean_arg(env::var(ENV_DEFAULT_TRANSPORT).ok())
}

pub(crate) fn default_profile() -> Option<String> {
    clean_arg(env::var(ENV_DEFAULT_PROFILE).ok())
}

pub(crate) fn default_rpc() -> Option<String> {
    clean_arg(env::var(ENV_DEFAULT_RPC).ok())
}

pub(crate) fn clean_arg(value: Option<String>) -> Option<String> {
    value.and_then(|raw| {
        let trimmed = raw.trim().to_string();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed)
        }
    })
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
