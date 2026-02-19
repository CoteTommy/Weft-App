use super::index_store::{AttachmentBytesParams, IndexStore};
use serde::Serialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

const HANDLE_TTL_MS: i64 = 10 * 60 * 1000;
const MAX_OPEN_HANDLES: usize = 24;
const MAX_TOTAL_BYTES: u64 = 80 * 1024 * 1024;

#[derive(Debug, Clone, Serialize)]
pub(crate) struct AttachmentHandleInfo {
    pub handle_id: String,
    pub path: String,
    pub mime: Option<String>,
    pub size_bytes: u64,
    pub expires_at_ms: i64,
}

#[derive(Debug, Clone)]
struct AttachmentHandleEntry {
    attachment_id: String,
    handle_id: String,
    path: PathBuf,
    mime: Option<String>,
    size_bytes: u64,
    created_at_ms: i64,
    last_accessed_at_ms: i64,
    expires_at_ms: i64,
}

#[derive(Default)]
struct AttachmentHandleState {
    cache_dir: Option<PathBuf>,
    entries: HashMap<String, AttachmentHandleEntry>,
    by_attachment: HashMap<String, String>,
    total_bytes: u64,
}

pub(crate) struct AttachmentHandleManager {
    state: Mutex<AttachmentHandleState>,
    id_counter: AtomicU64,
}

impl Default for AttachmentHandleManager {
    fn default() -> Self {
        Self {
            state: Mutex::new(AttachmentHandleState::default()),
            id_counter: AtomicU64::new(1),
        }
    }
}

impl AttachmentHandleManager {
    pub(crate) fn configure_cache_dir(&self, app: &AppHandle) -> Result<(), String> {
        let mut guard = self
            .state
            .lock()
            .map_err(|_| "attachment handle lock poisoned".to_string())?;
        let path = resolve_cache_dir(app)?;
        std::fs::create_dir_all(&path)
            .map_err(|err| format!("create attachment handle cache dir failed: {err}"))?;
        cleanup_stale_files(&path);
        guard.cache_dir = Some(path);
        Ok(())
    }

    pub(crate) fn open_attachment_handle(
        &self,
        app: &AppHandle,
        index_store: &IndexStore,
        attachment_id: String,
    ) -> Result<AttachmentHandleInfo, String> {
        let normalized_id = attachment_id.trim();
        if normalized_id.is_empty() {
            return Err("attachment_id is required".to_string());
        }
        let now_ms = now_epoch_ms();

        if let Some(cached) = self.try_get_cached_handle(normalized_id, now_ms)? {
            return Ok(cached);
        }

        let payload = index_store.get_attachment_binary(AttachmentBytesParams {
            attachment_id: normalized_id.to_string(),
        })?;
        if payload.bytes.is_empty() {
            return Err("attachment payload unavailable".to_string());
        }

        let mut guard = self
            .state
            .lock()
            .map_err(|_| "attachment handle lock poisoned".to_string())?;
        let cache_dir = self.resolve_cache_dir_locked(app, &mut guard)?;
        cleanup_expired_locked(&mut guard, now_ms);

        let handle_id = format!(
            "ah-{}-{}",
            now_ms,
            self.id_counter.fetch_add(1, Ordering::Relaxed)
        );
        let extension = extension_from_mime(payload.mime.as_deref());
        let filename = if extension.is_empty() {
            handle_id.clone()
        } else {
            format!("{handle_id}.{extension}")
        };
        let path = cache_dir.join(filename);
        std::fs::write(&path, &payload.bytes)
            .map_err(|err| format!("write attachment handle file failed: {err}"))?;

        let entry = AttachmentHandleEntry {
            attachment_id: normalized_id.to_string(),
            handle_id: handle_id.clone(),
            path: path.clone(),
            mime: payload.mime.clone(),
            size_bytes: payload.size_bytes.max(0) as u64,
            created_at_ms: now_ms,
            last_accessed_at_ms: now_ms,
            expires_at_ms: now_ms.saturating_add(HANDLE_TTL_MS),
        };
        guard.total_bytes = guard.total_bytes.saturating_add(entry.size_bytes);
        guard
            .by_attachment
            .insert(entry.attachment_id.clone(), handle_id.clone());
        guard.entries.insert(handle_id.clone(), entry.clone());

        enforce_limits_locked(&mut guard);

        Ok(AttachmentHandleInfo {
            handle_id: entry.handle_id,
            path: entry.path.to_string_lossy().to_string(),
            mime: entry.mime,
            size_bytes: entry.size_bytes,
            expires_at_ms: entry.expires_at_ms,
        })
    }

    pub(crate) fn close_attachment_handle(&self, handle_id: &str) -> Result<bool, String> {
        let id = handle_id.trim();
        if id.is_empty() {
            return Err("handle_id is required".to_string());
        }
        let mut guard = self
            .state
            .lock()
            .map_err(|_| "attachment handle lock poisoned".to_string())?;
        let Some(entry) = guard.entries.remove(id) else {
            return Ok(false);
        };
        guard.by_attachment.remove(&entry.attachment_id);
        guard.total_bytes = guard.total_bytes.saturating_sub(entry.size_bytes);
        remove_file_quietly(&entry.path);
        Ok(true)
    }

    pub(crate) fn active_handle_count(&self) -> usize {
        self.state
            .lock()
            .map(|guard| guard.entries.len())
            .unwrap_or_default()
    }

    pub(crate) fn cleanup_expired(&self) {
        if let Ok(mut guard) = self.state.lock() {
            cleanup_expired_locked(&mut guard, now_epoch_ms());
        }
    }

    fn try_get_cached_handle(
        &self,
        attachment_id: &str,
        now_ms: i64,
    ) -> Result<Option<AttachmentHandleInfo>, String> {
        let mut guard = self
            .state
            .lock()
            .map_err(|_| "attachment handle lock poisoned".to_string())?;
        cleanup_expired_locked(&mut guard, now_ms);

        let Some(handle_id) = guard.by_attachment.get(attachment_id).cloned() else {
            return Ok(None);
        };
        let Some(entry) = guard.entries.get_mut(&handle_id) else {
            guard.by_attachment.remove(attachment_id);
            return Ok(None);
        };
        if !entry.path.exists() {
            guard.entries.remove(&handle_id);
            guard.by_attachment.remove(attachment_id);
            return Ok(None);
        }
        entry.last_accessed_at_ms = now_ms;
        entry.expires_at_ms = now_ms.saturating_add(HANDLE_TTL_MS);
        Ok(Some(AttachmentHandleInfo {
            handle_id: entry.handle_id.clone(),
            path: entry.path.to_string_lossy().to_string(),
            mime: entry.mime.clone(),
            size_bytes: entry.size_bytes,
            expires_at_ms: entry.expires_at_ms,
        }))
    }

    fn resolve_cache_dir_locked(
        &self,
        app: &AppHandle,
        state: &mut AttachmentHandleState,
    ) -> Result<PathBuf, String> {
        if let Some(path) = state.cache_dir.as_ref() {
            return Ok(path.clone());
        }
        let path = resolve_cache_dir(app)?;
        std::fs::create_dir_all(&path)
            .map_err(|err| format!("create attachment handle cache dir failed: {err}"))?;
        state.cache_dir = Some(path.clone());
        Ok(path)
    }
}

fn resolve_cache_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let base = app
        .path()
        .app_cache_dir()
        .map_err(|err| format!("resolve app cache dir failed: {err}"))?;
    Ok(base.join("attachment-handles"))
}

fn cleanup_expired_locked(state: &mut AttachmentHandleState, now_ms: i64) {
    let expired = state
        .entries
        .values()
        .filter(|entry| entry.expires_at_ms <= now_ms || !entry.path.exists())
        .map(|entry| entry.handle_id.clone())
        .collect::<Vec<_>>();
    for handle_id in expired {
        remove_entry_locked(state, &handle_id);
    }
}

fn enforce_limits_locked(state: &mut AttachmentHandleState) {
    if state.entries.len() <= MAX_OPEN_HANDLES && state.total_bytes <= MAX_TOTAL_BYTES {
        return;
    }

    let mut candidates = state
        .entries
        .values()
        .map(|entry| {
            (
                entry.handle_id.clone(),
                entry.last_accessed_at_ms,
                entry.created_at_ms,
            )
        })
        .collect::<Vec<_>>();
    candidates.sort_by(|left, right| {
        left.1
            .cmp(&right.1)
            .then_with(|| left.2.cmp(&right.2))
            .then_with(|| left.0.cmp(&right.0))
    });

    for (handle_id, _, _) in candidates {
        if state.entries.len() <= MAX_OPEN_HANDLES && state.total_bytes <= MAX_TOTAL_BYTES {
            break;
        }
        remove_entry_locked(state, &handle_id);
    }
}

fn remove_entry_locked(state: &mut AttachmentHandleState, handle_id: &str) {
    let Some(entry) = state.entries.remove(handle_id) else {
        return;
    };
    state.by_attachment.remove(&entry.attachment_id);
    state.total_bytes = state.total_bytes.saturating_sub(entry.size_bytes);
    remove_file_quietly(&entry.path);
}

fn remove_file_quietly(path: &Path) {
    let _ = std::fs::remove_file(path);
}

fn cleanup_stale_files(cache_dir: &Path) {
    let now_ms = now_epoch_ms();
    let Ok(entries) = std::fs::read_dir(cache_dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let modified_ms = entry
            .metadata()
            .ok()
            .and_then(|meta| meta.modified().ok())
            .and_then(|timestamp| timestamp.duration_since(UNIX_EPOCH).ok())
            .map(|duration| duration.as_millis() as i64);
        let is_stale = modified_ms
            .map(|value| now_ms.saturating_sub(value) > HANDLE_TTL_MS)
            .unwrap_or(true);
        if is_stale {
            let _ = std::fs::remove_file(path);
        }
    }
}

fn extension_from_mime(mime: Option<&str>) -> &'static str {
    let Some(value) = mime.map(|entry| entry.trim().to_ascii_lowercase()) else {
        return "";
    };
    if value.starts_with("image/jpeg") {
        return "jpg";
    }
    if value.starts_with("image/png") {
        return "png";
    }
    if value.starts_with("image/webp") {
        return "webp";
    }
    if value.starts_with("image/gif") {
        return "gif";
    }
    if value.starts_with("audio/mpeg") {
        return "mp3";
    }
    if value.starts_with("audio/wav") {
        return "wav";
    }
    if value.starts_with("audio/ogg") {
        return "ogg";
    }
    if value.starts_with("application/pdf") {
        return "pdf";
    }
    ""
}

fn now_epoch_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}
