use super::super::index_store::{
    AttachmentBlobParams, AttachmentBytesParams, FilesQueryParams, MapPointsQueryParams,
    SearchQueryParams, ThreadMessageQueryParams, ThreadQueryParams,
};
use super::*;
use std::process::Command;
use std::time::{Instant, SystemTime, UNIX_EPOCH};

pub(crate) fn reindex_index_store_from_runtime(
    actor: &RuntimeActor,
    index_store: &IndexStore,
    selector: RuntimeSelector,
) -> Result<(), String> {
    let messages = rpc_actor_call(actor, selector.clone(), "list_messages", None)?;
    let peers = rpc_actor_call(actor, selector, "list_peers", None)?;
    index_store.reindex_from_runtime_payloads(&messages, &peers)
}

fn now_epoch_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}

fn current_process_rss_bytes() -> Option<u64> {
    let pid = std::process::id().to_string();
    let output = Command::new("ps")
        .args(["-o", "rss=", "-p", &pid])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let payload = String::from_utf8(output.stdout).ok()?;
    let kb = payload
        .split_whitespace()
        .next()
        .and_then(|value| value.parse::<u64>().ok())?;
    Some(kb.saturating_mul(1024))
}

fn log_index_query_latency(command: &str, started_at: Instant, result: &Result<Value, String>) {
    let elapsed_ms = started_at.elapsed().as_millis();
    match result {
        Ok(payload) => {
            let item_count = payload
                .get("items")
                .and_then(Value::as_array)
                .map(|items| items.len())
                .unwrap_or(0);
            log::debug!(
                "index_query command={command} elapsed_ms={elapsed_ms} item_count={item_count}"
            );
        }
        Err(error) => {
            log::debug!("index_query command={command} elapsed_ms={elapsed_ms} error={error}");
        }
    }
}

#[tauri::command]
pub(crate) fn lxmf_index_status(index_store: State<'_, Arc<IndexStore>>) -> Result<Value, String> {
    let started_at = Instant::now();
    let status = index_store.as_ref().index_status()?;
    let freshness_ms = status
        .last_sync_ms
        .map(|last_sync_ms| now_epoch_ms().saturating_sub(last_sync_ms));
    log::debug!(
        "index_status ready={} message_count={} thread_count={} freshness_ms={} elapsed_ms={}",
        status.ready,
        status.message_count,
        status.thread_count,
        freshness_ms
            .map(|value| value.to_string())
            .unwrap_or_else(|| "unknown".to_string()),
        started_at.elapsed().as_millis(),
    );
    serde_json::to_value(status).map_err(|err| format!("serialize index status failed: {err}"))
}

#[tauri::command]
pub(crate) fn get_runtime_metrics(
    index_store: State<'_, Arc<IndexStore>>,
    event_pump: State<'_, EventPumpControl>,
    attachment_handles: State<'_, Arc<AttachmentHandleManager>>,
) -> Result<Value, String> {
    let started_at = Instant::now();
    let metrics = index_store.as_ref().runtime_metrics()?;
    let rss_bytes = current_process_rss_bytes();
    let event_pump_interval_ms = event_pump.current_interval_ms();
    attachment_handles.cleanup_expired();
    let attachment_handle_count = attachment_handles.active_handle_count();
    let elapsed_ms = started_at.elapsed().as_millis();
    log::debug!(
        "runtime_metrics elapsed_ms={elapsed_ms} rss_bytes={} db_size_bytes={} queue_size={} message_count={} thread_count={} event_pump_interval_ms={} attachment_handle_count={}",
        rss_bytes
            .map(|value| value.to_string())
            .unwrap_or_else(|| "unknown".to_string()),
        metrics.db_size_bytes,
        metrics.queue_size,
        metrics.message_count,
        metrics.thread_count,
        event_pump_interval_ms
            .map(|value| value.to_string())
            .unwrap_or_else(|| "unknown".to_string()),
        attachment_handle_count
    );
    Ok(json!({
        "rss_bytes": rss_bytes,
        "db_size_bytes": metrics.db_size_bytes,
        "queue_size": metrics.queue_size,
        "message_count": metrics.message_count,
        "thread_count": metrics.thread_count,
        "event_pump_interval_ms": event_pump_interval_ms,
        "attachment_handle_count": attachment_handle_count,
        "index_last_sync_ms": metrics.index_last_sync_ms,
    }))
}

#[tauri::command]
pub(crate) fn lxmf_query_threads(
    index_store: State<'_, Arc<IndexStore>>,
    query: Option<String>,
    limit: Option<usize>,
    cursor: Option<String>,
    pinned_only: Option<bool>,
) -> Result<Value, String> {
    let started_at = Instant::now();
    let result = index_store.as_ref().query_threads(ThreadQueryParams {
        query,
        limit,
        cursor,
        pinned_only,
    });
    log_index_query_latency("lxmf_query_threads", started_at, &result);
    result
}

#[tauri::command]
pub(crate) fn query_threads_page(
    index_store: State<'_, Arc<IndexStore>>,
    query: Option<String>,
    limit: Option<usize>,
    cursor: Option<String>,
    pinned_only: Option<bool>,
) -> Result<Value, String> {
    let started_at = Instant::now();
    let result = index_store.as_ref().query_threads(ThreadQueryParams {
        query,
        limit,
        cursor,
        pinned_only,
    });
    log_index_query_latency("query_threads_page", started_at, &result);
    result
}

#[tauri::command]
pub(crate) fn lxmf_query_thread_messages(
    index_store: State<'_, Arc<IndexStore>>,
    thread_id: String,
    limit: Option<usize>,
    cursor: Option<String>,
    query: Option<String>,
) -> Result<Value, String> {
    let started_at = Instant::now();
    let result = index_store
        .as_ref()
        .query_thread_messages(ThreadMessageQueryParams {
            thread_id,
            limit,
            cursor,
            query,
        });
    log_index_query_latency("lxmf_query_thread_messages", started_at, &result);
    result
}

#[tauri::command]
pub(crate) fn query_thread_messages_page(
    index_store: State<'_, Arc<IndexStore>>,
    thread_id: String,
    limit: Option<usize>,
    cursor: Option<String>,
    query: Option<String>,
) -> Result<Value, String> {
    let started_at = Instant::now();
    let result = index_store
        .as_ref()
        .query_thread_messages(ThreadMessageQueryParams {
            thread_id,
            limit,
            cursor,
            query,
        });
    log_index_query_latency("query_thread_messages_page", started_at, &result);
    result
}

#[tauri::command]
pub(crate) fn lxmf_search_messages(
    index_store: State<'_, Arc<IndexStore>>,
    query: String,
    thread_id: Option<String>,
    limit: Option<usize>,
    cursor: Option<String>,
) -> Result<Value, String> {
    let started_at = Instant::now();
    let result = index_store.as_ref().search_messages(SearchQueryParams {
        query,
        thread_id,
        limit,
        cursor,
    });
    log_index_query_latency("lxmf_search_messages", started_at, &result);
    result
}

#[tauri::command]
pub(crate) fn lxmf_query_files(
    index_store: State<'_, Arc<IndexStore>>,
    query: Option<String>,
    kind: Option<String>,
    limit: Option<usize>,
    cursor: Option<String>,
) -> Result<Value, String> {
    let started_at = Instant::now();
    let result = index_store.as_ref().query_files(FilesQueryParams {
        query,
        kind,
        limit,
        cursor,
        include_bytes: None,
    });
    log_index_query_latency("lxmf_query_files", started_at, &result);
    result
}

#[tauri::command]
pub(crate) fn query_files_page(
    index_store: State<'_, Arc<IndexStore>>,
    query: Option<String>,
    kind: Option<String>,
    limit: Option<usize>,
    cursor: Option<String>,
    include_bytes: Option<bool>,
) -> Result<Value, String> {
    let started_at = Instant::now();
    let result = index_store.as_ref().query_files(FilesQueryParams {
        query,
        kind,
        limit,
        cursor,
        include_bytes,
    });
    log_index_query_latency("query_files_page", started_at, &result);
    result
}

#[tauri::command]
pub(crate) fn lxmf_query_map_points(
    index_store: State<'_, Arc<IndexStore>>,
    query: Option<String>,
    limit: Option<usize>,
    cursor: Option<String>,
) -> Result<Value, String> {
    let started_at = Instant::now();
    let result = index_store.as_ref().query_map_points(MapPointsQueryParams {
        query,
        limit,
        cursor,
    });
    log_index_query_latency("lxmf_query_map_points", started_at, &result);
    result
}

#[tauri::command]
pub(crate) fn lxmf_get_attachment_blob(
    index_store: State<'_, Arc<IndexStore>>,
    message_id: String,
    attachment_name: String,
) -> Result<Value, String> {
    let started_at = Instant::now();
    let result = index_store
        .as_ref()
        .get_attachment_blob(AttachmentBlobParams {
            message_id,
            attachment_name,
        });
    log_index_query_latency("lxmf_get_attachment_blob", started_at, &result);
    result
}

#[tauri::command]
pub(crate) fn get_attachment_bytes(
    index_store: State<'_, Arc<IndexStore>>,
    attachment_id: String,
) -> Result<Value, String> {
    let started_at = Instant::now();
    let result = index_store
        .as_ref()
        .get_attachment_bytes(AttachmentBytesParams { attachment_id });
    log_index_query_latency("get_attachment_bytes", started_at, &result);
    result
}

#[tauri::command]
pub(crate) fn open_attachment_handle(
    app: AppHandle,
    index_store: State<'_, Arc<IndexStore>>,
    attachment_handles: State<'_, Arc<AttachmentHandleManager>>,
    attachment_id: String,
    disposition: Option<String>,
) -> Result<Value, String> {
    let started_at = Instant::now();
    let _ = disposition;
    let result = attachment_handles
        .open_attachment_handle(&app, index_store.as_ref(), attachment_id)
        .and_then(|payload| {
            serde_json::to_value(payload)
                .map_err(|err| format!("serialize attachment handle failed: {err}"))
        });
    log_index_query_latency("open_attachment_handle", started_at, &result);
    result
}

#[tauri::command]
pub(crate) fn close_attachment_handle(
    attachment_handles: State<'_, Arc<AttachmentHandleManager>>,
    handle_id: String,
) -> Result<Value, String> {
    let started_at = Instant::now();
    let result = attachment_handles
        .close_attachment_handle(&handle_id)
        .map(|closed| json!({ "closed": closed }));
    log_index_query_latency("close_attachment_handle", started_at, &result);
    result
}

#[tauri::command]
pub(crate) fn lxmf_force_reindex(
    actor: State<'_, RuntimeActor>,
    index_store: State<'_, Arc<IndexStore>>,
    profile: Option<String>,
    rpc: Option<String>,
) -> Result<Value, String> {
    let started_at = Instant::now();
    index_store.as_ref().force_reindex()?;
    let selector = RuntimeSelector::load(profile, rpc)?;
    reindex_index_store_from_runtime(&actor, index_store.as_ref(), selector)?;
    if let Ok(status) = index_store.as_ref().index_status() {
        let freshness_ms = status
            .last_sync_ms
            .map(|last_sync_ms| now_epoch_ms().saturating_sub(last_sync_ms));
        log::info!(
            "index_reindex completed elapsed_ms={} message_count={} thread_count={} freshness_ms={}",
            started_at.elapsed().as_millis(),
            status.message_count,
            status.thread_count,
            freshness_ms
                .map(|value| value.to_string())
                .unwrap_or_else(|| "unknown".to_string())
        );
    } else {
        log::info!(
            "index_reindex completed elapsed_ms={}",
            started_at.elapsed().as_millis()
        );
    }
    Ok(json!({
        "started": true
    }))
}

#[tauri::command]
pub(crate) fn rebuild_thread_summaries(
    index_store: State<'_, Arc<IndexStore>>,
) -> Result<Value, String> {
    let started_at = Instant::now();
    index_store.as_ref().rebuild_thread_summaries()?;
    log::info!(
        "rebuild_thread_summaries elapsed_ms={}",
        started_at.elapsed().as_millis()
    );
    Ok(json!({ "rebuilt": true }))
}
