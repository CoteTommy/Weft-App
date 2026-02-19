use serde::Serialize;
use serde_json::{json, Value};
use std::time::{SystemTime, UNIX_EPOCH};

const IPC_SCHEMA_VERSION: &str = "v2";

#[derive(Debug, Serialize)]
struct IpcMeta {
    request_id: String,
    schema_version: &'static str,
}

#[derive(Debug, Serialize)]
struct IpcOk {
    data: Value,
    meta: IpcMeta,
}

#[derive(Debug, Serialize)]
struct IpcError {
    code: &'static str,
    message: String,
    retryable: bool,
    request_id: String,
}

#[derive(Debug, Serialize)]
#[serde(untagged)]
enum IpcEnvelope {
    Ok { ok: IpcOk },
    Error { error: IpcError },
}

pub(crate) fn ok(data: Value) -> Value {
    json!(IpcEnvelope::Ok {
        ok: IpcOk {
            data,
            meta: IpcMeta {
                request_id: make_request_id(),
                schema_version: IPC_SCHEMA_VERSION,
            },
        },
    })
}

pub(crate) fn from_result(result: Result<Value, String>) -> Value {
    match result {
        Ok(data) => ok(data),
        Err(message) => error(message),
    }
}

pub(crate) fn error(message: String) -> Value {
    let (code, retryable) = classify_error(&message);
    json!(IpcEnvelope::Error {
        error: IpcError {
            code,
            message,
            retryable,
            request_id: make_request_id(),
        },
    })
}

fn classify_error(message: &str) -> (&'static str, bool) {
    let normalized = message.to_ascii_lowercase();

    if normalized.contains("quota") {
        return ("storage_quota", false);
    }
    if normalized.contains("timeout") || normalized.contains("timed out") {
        return ("upstream_timeout", true);
    }
    if normalized.contains("runtime not started")
        || normalized.contains("runtime worker unavailable")
        || normalized.contains("runtime unavailable")
    {
        return ("runtime_unavailable", true);
    }
    if normalized.contains("required")
        || normalized.contains("invalid")
        || normalized.contains("must be")
        || normalized.contains("cannot")
    {
        return ("validation", false);
    }

    ("internal", false)
}

fn make_request_id() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    format!("weft-{nanos:x}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classify_runtime_unavailable() {
        let (code, retryable) = classify_error("runtime not started");
        assert_eq!(code, "runtime_unavailable");
        assert!(retryable);
    }

    #[test]
    fn classify_validation() {
        let (code, retryable) = classify_error("destination is required");
        assert_eq!(code, "validation");
        assert!(!retryable);
    }

    #[test]
    fn build_ok_envelope() {
        let payload = ok(json!({ "running": true }));
        assert!(payload.get("ok").is_some());
    }
}
