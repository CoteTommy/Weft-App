use base64::Engine as _;
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::{BTreeMap, HashMap};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

const DEFAULT_LIMIT: usize = 100;
const MAX_LIMIT: usize = 1000;

#[derive(Clone, Debug)]
pub(crate) struct ThreadQueryParams {
    pub query: Option<String>,
    pub limit: Option<usize>,
    pub cursor: Option<String>,
    pub pinned_only: Option<bool>,
}

#[derive(Clone, Debug)]
pub(crate) struct ThreadMessageQueryParams {
    pub thread_id: String,
    pub limit: Option<usize>,
    pub cursor: Option<String>,
    pub query: Option<String>,
}

#[derive(Clone, Debug)]
pub(crate) struct SearchQueryParams {
    pub query: String,
    pub thread_id: Option<String>,
    pub limit: Option<usize>,
    pub cursor: Option<String>,
}

#[derive(Clone, Debug)]
pub(crate) struct FilesQueryParams {
    pub query: Option<String>,
    pub kind: Option<String>,
    pub limit: Option<usize>,
    pub cursor: Option<String>,
}

#[derive(Clone, Debug)]
pub(crate) struct MapPointsQueryParams {
    pub query: Option<String>,
    pub limit: Option<usize>,
    pub cursor: Option<String>,
}

#[derive(Clone, Debug)]
pub(crate) struct AttachmentBlobParams {
    pub message_id: String,
    pub attachment_name: String,
}

#[derive(Debug, Serialize)]
pub(crate) struct IndexStatus {
    pub ready: bool,
    pub message_count: usize,
    pub thread_count: usize,
    pub last_sync_ms: Option<i64>,
}

#[derive(Debug, Serialize)]
struct CursorResult<T> {
    items: Vec<T>,
    next_cursor: Option<String>,
}

#[derive(Debug, Serialize)]
struct IndexedThread {
    thread_id: String,
    name: String,
    destination: String,
    preview: String,
    unread: usize,
    pinned: bool,
    muted: bool,
    last_message_id: Option<String>,
    last_activity_ms: i64,
}

#[derive(Debug, Serialize)]
struct IndexedMessage {
    id: String,
    source: String,
    destination: String,
    title: String,
    content: String,
    timestamp: i64,
    direction: String,
    fields: Value,
    receipt_status: Option<String>,
}

#[derive(Debug, Serialize)]
struct IndexedFileItem {
    id: String,
    name: String,
    kind: String,
    size_label: String,
    owner: String,
    mime: Option<String>,
    data_base64: Option<String>,
    paper_uri: Option<String>,
    paper_title: Option<String>,
    paper_category: Option<String>,
}

#[derive(Debug, Serialize)]
struct IndexedMapPoint {
    id: String,
    label: String,
    lat: f64,
    lon: f64,
    source: String,
    when: String,
    direction: String,
}

#[derive(Debug, Clone)]
struct MessageRow {
    message_id: String,
    thread_id: String,
    direction: String,
    source: String,
    destination: String,
    ts_ms: i64,
    title: String,
    body: String,
    receipt_status: Option<String>,
    fields: Option<Value>,
}

#[derive(Debug)]
struct AttachmentEntry {
    name: String,
    mime: Option<String>,
    size_bytes: i64,
    inline_base64: Option<String>,
}

#[derive(Debug)]
struct ThreadSummary {
    thread_id: String,
    name: String,
    preview: String,
    last_message_id: String,
    last_activity_ms: i64,
    unread: usize,
    pinned: bool,
    muted: bool,
}

#[derive(Debug)]
struct PeerSummary {
    peer: String,
    name: String,
}

#[derive(Debug)]
struct MessageParseResult {
    row: MessageRow,
    attachments: Vec<AttachmentEntry>,
}

#[derive(Debug)]
struct MapPointMessageContext<'a> {
    message_id: &'a str,
    source: &'a str,
    destination: &'a str,
    direction: &'a str,
    title: &'a str,
    body: &'a str,
    ts_ms: i64,
}

pub(crate) struct IndexStore {
    conn: Mutex<Connection>,
    ready: AtomicBool,
}

impl IndexStore {
    pub(crate) fn new(path: PathBuf) -> Result<Self, String> {
        let parent = path
            .parent()
            .ok_or_else(|| "index database parent directory is missing".to_string())?;
        std::fs::create_dir_all(parent)
            .map_err(|err| format!("create index directory failed: {err}"))?;

        let conn = Connection::open(&path).map_err(|err| format!("open index db failed: {err}"))?;
        conn.pragma_update(None, "journal_mode", "WAL")
            .map_err(|err| format!("set journal mode failed: {err}"))?;
        conn.pragma_update(None, "synchronous", "NORMAL")
            .map_err(|err| format!("set synchronous mode failed: {err}"))?;
        conn.execute_batch(SCHEMA_SQL)
            .map_err(|err| format!("init index schema failed: {err}"))?;

        Ok(Self {
            conn: Mutex::new(conn),
            ready: AtomicBool::new(false),
        })
    }

    pub(crate) fn is_ready(&self) -> bool {
        self.ready.load(Ordering::Relaxed)
    }

    pub(crate) fn index_status(&self) -> Result<IndexStatus, String> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| "index lock poisoned".to_string())?;
        let message_count = conn
            .query_row("SELECT COUNT(*) FROM messages", [], |row| {
                row.get::<_, i64>(0)
            })
            .map_err(|err| format!("read message count failed: {err}"))?;
        let thread_count = conn
            .query_row("SELECT COUNT(*) FROM threads", [], |row| {
                row.get::<_, i64>(0)
            })
            .map_err(|err| format!("read thread count failed: {err}"))?;
        let last_sync_ms = conn
            .query_row(
                "SELECT value FROM sync_state WHERE key = 'last_sync_ms'",
                [],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(|err| format!("read last_sync_ms failed: {err}"))?
            .and_then(|value| value.parse::<i64>().ok());

        Ok(IndexStatus {
            ready: self.is_ready(),
            message_count: message_count.max(0) as usize,
            thread_count: thread_count.max(0) as usize,
            last_sync_ms,
        })
    }

    pub(crate) fn force_reindex(&self) -> Result<(), String> {
        self.ready.store(false, Ordering::Relaxed);
        let conn = self
            .conn
            .lock()
            .map_err(|_| "index lock poisoned".to_string())?;
        conn.execute_batch(
            "
            DELETE FROM attachments;
            DELETE FROM messages;
            DELETE FROM threads;
            DELETE FROM sync_state;
            ",
        )
        .map_err(|err| format!("clear index failed: {err}"))?;
        Ok(())
    }

    pub(crate) fn reindex_from_runtime_payloads(
        &self,
        messages_payload: &Value,
        peers_payload: &Value,
    ) -> Result<(), String> {
        let messages = parse_message_list(messages_payload)?;
        let peers = parse_peer_list(peers_payload);
        self.ingest_messages_and_peers(&messages, &peers)
    }

    pub(crate) fn ingest_event_payload(&self, event_payload: &Value) -> Result<(), String> {
        let event = match event_payload.as_object() {
            Some(value) => value,
            None => return Ok(()),
        };
        let event_type = event
            .get("event_type")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let payload = event.get("payload").unwrap_or(&Value::Null);

        if event_type == "receipt" {
            return self.apply_receipt_event(payload);
        }

        if event_type == "inbound" || event_type == "outbound" {
            let message = payload.get("message").unwrap_or(payload);
            let parsed = match parse_message_row(message) {
                Ok(value) => value,
                Err(_) => return Ok(()),
            };
            let mut conn = self
                .conn
                .lock()
                .map_err(|_| "index lock poisoned".to_string())?;
            let tx = conn
                .transaction()
                .map_err(|err| format!("start event ingest transaction failed: {err}"))?;
            upsert_message_row(&tx, &parsed)?;
            tx.commit()
                .map_err(|err| format!("commit event ingest failed: {err}"))?;
            rebuild_threads_table(&mut conn)?;
            update_last_sync_state(
                &mut conn,
                parsed.row.ts_ms,
                Some(parsed.row.message_id.clone()),
            )?;
            self.ready.store(true, Ordering::Relaxed);
        }

        Ok(())
    }

    pub(crate) fn query_threads(&self, params: ThreadQueryParams) -> Result<Value, String> {
        let limit = normalize_limit(params.limit);
        let offset = parse_cursor_offset(params.cursor.as_deref());
        let query = params.query.unwrap_or_default().trim().to_ascii_lowercase();
        let filter_query = if query.is_empty() { None } else { Some(query) };
        let pinned_only = params.pinned_only.unwrap_or(false);

        let conn = self
            .conn
            .lock()
            .map_err(|_| "index lock poisoned".to_string())?;

        let mut stmt = conn
            .prepare(
                "
                SELECT
                  thread_id,
                  display_name,
                  preview,
                  unread_count,
                  pinned,
                  muted,
                  last_message_id,
                  last_activity_ms
                FROM threads
                WHERE (?1 = 0 OR pinned = 1)
                ORDER BY pinned DESC, last_activity_ms DESC, thread_id ASC
                LIMIT ?2 OFFSET ?3
                ",
            )
            .map_err(|err| format!("prepare thread query failed: {err}"))?;

        let rows = stmt
            .query_map(
                params![
                    if pinned_only { 1 } else { 0 },
                    (limit + 1) as i64,
                    offset as i64
                ],
                |row| {
                    Ok(IndexedThread {
                        thread_id: row.get::<_, String>(0)?,
                        name: row.get::<_, String>(1)?,
                        destination: short_hash(&row.get::<_, String>(0)?, 8),
                        preview: row.get::<_, String>(2)?,
                        unread: row.get::<_, i64>(3).unwrap_or(0).max(0) as usize,
                        pinned: row.get::<_, i64>(4).unwrap_or(0) == 1,
                        muted: row.get::<_, i64>(5).unwrap_or(0) == 1,
                        last_message_id: row.get::<_, Option<String>>(6).ok().flatten(),
                        last_activity_ms: row.get::<_, i64>(7).unwrap_or(0),
                    })
                },
            )
            .map_err(|err| format!("run thread query failed: {err}"))?;

        let mut items = Vec::new();
        for result in rows {
            let item = result.map_err(|err| format!("parse thread row failed: {err}"))?;
            if let Some(filter) = filter_query.as_deref() {
                let haystack = format!(
                    "{} {} {}",
                    item.name.to_ascii_lowercase(),
                    item.thread_id.to_ascii_lowercase(),
                    item.preview.to_ascii_lowercase()
                );
                if !haystack.contains(filter) {
                    continue;
                }
            }
            items.push(item);
        }

        let next_cursor = if items.len() > limit {
            Some((offset + limit).to_string())
        } else {
            None
        };
        if items.len() > limit {
            items.truncate(limit);
        }

        serde_json::to_value(CursorResult { items, next_cursor })
            .map_err(|err| format!("serialize thread query failed: {err}"))
    }

    pub(crate) fn query_thread_messages(
        &self,
        params: ThreadMessageQueryParams,
    ) -> Result<Value, String> {
        let thread_id = params.thread_id.trim();
        if thread_id.is_empty() {
            return Err("thread_id is required".to_string());
        }

        let limit = normalize_limit(params.limit);
        let offset = parse_cursor_offset(params.cursor.as_deref());
        let filter_query = params
            .query
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(|value| value.to_ascii_lowercase());

        let conn = self
            .conn
            .lock()
            .map_err(|_| "index lock poisoned".to_string())?;

        let mut stmt = conn
            .prepare(
                "
                SELECT
                  message_id,
                  source,
                  destination,
                  title,
                  body,
                  ts_ms,
                  direction,
                  receipt_status,
                  fields_json
                FROM messages
                WHERE thread_id = ?1
                ORDER BY ts_ms DESC, message_id DESC
                LIMIT ?2 OFFSET ?3
                ",
            )
            .map_err(|err| format!("prepare message query failed: {err}"))?;

        let rows = stmt
            .query_map(
                params![thread_id, (limit + 1) as i64, offset as i64],
                |row| {
                    let message_id = row.get::<_, String>(0)?;
                    let fields_json = row.get::<_, Option<String>>(8).ok().flatten();
                    let fields = fields_json
                        .as_deref()
                        .and_then(|value| serde_json::from_str::<Value>(value).ok())
                        .unwrap_or_else(|| Value::Object(serde_json::Map::new()));
                    Ok(IndexedMessage {
                        id: message_id.clone(),
                        source: row.get::<_, String>(1)?,
                        destination: row.get::<_, String>(2)?,
                        title: row.get::<_, String>(3)?,
                        content: row.get::<_, String>(4)?,
                        timestamp: row.get::<_, i64>(5)?,
                        direction: row.get::<_, String>(6)?,
                        fields: sanitize_fields_for_client(&conn, &message_id, fields),
                        receipt_status: row.get::<_, Option<String>>(7).ok().flatten(),
                    })
                },
            )
            .map_err(|err| format!("run message query failed: {err}"))?;

        let mut items = Vec::new();
        for result in rows {
            let item = result.map_err(|err| format!("parse message row failed: {err}"))?;
            if let Some(filter) = filter_query.as_deref() {
                let haystack = format!(
                    "{} {} {}",
                    item.title.to_ascii_lowercase(),
                    item.content.to_ascii_lowercase(),
                    item.receipt_status
                        .as_deref()
                        .unwrap_or_default()
                        .to_ascii_lowercase()
                );
                if !haystack.contains(filter) {
                    continue;
                }
            }
            items.push(item);
        }

        let next_cursor = if items.len() > limit {
            Some((offset + limit).to_string())
        } else {
            None
        };
        if items.len() > limit {
            items.truncate(limit);
        }

        serde_json::to_value(CursorResult { items, next_cursor })
            .map_err(|err| format!("serialize thread message query failed: {err}"))
    }

    pub(crate) fn search_messages(&self, params: SearchQueryParams) -> Result<Value, String> {
        let query = params.query.trim();
        if query.is_empty() {
            return Err("query is required".to_string());
        }
        let limit = normalize_limit(params.limit);
        let offset = parse_cursor_offset(params.cursor.as_deref());

        let conn = self
            .conn
            .lock()
            .map_err(|_| "index lock poisoned".to_string())?;

        let thread_id = params
            .thread_id
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string);

        let mut items = Vec::new();
        if let Some(fts_query) = build_fts_query(query) {
            let mut stmt = conn
                .prepare(
                    "
                    SELECT
                      m.message_id,
                      m.source,
                      m.destination,
                      m.title,
                      m.body,
                      m.ts_ms,
                      m.direction,
                      m.receipt_status,
                      m.fields_json
                    FROM messages_fts f
                    JOIN messages m ON m.rowid = f.rowid
                    WHERE f.messages_fts MATCH ?1
                      AND (?2 IS NULL OR m.thread_id = ?2)
                    ORDER BY m.ts_ms DESC, m.message_id DESC
                    LIMIT ?3 OFFSET ?4
                    ",
                )
                .map_err(|err| format!("prepare fts search failed: {err}"))?;
            let rows = stmt
                .query_map(
                    params![fts_query, thread_id, (limit + 1) as i64, offset as i64],
                    |row| {
                        let message_id = row.get::<_, String>(0)?;
                        let fields_json = row.get::<_, Option<String>>(8).ok().flatten();
                        let fields = fields_json
                            .as_deref()
                            .and_then(|value| serde_json::from_str::<Value>(value).ok())
                            .unwrap_or_else(|| Value::Object(serde_json::Map::new()));
                        Ok(IndexedMessage {
                            id: message_id.clone(),
                            source: row.get::<_, String>(1)?,
                            destination: row.get::<_, String>(2)?,
                            title: row.get::<_, String>(3)?,
                            content: row.get::<_, String>(4)?,
                            timestamp: row.get::<_, i64>(5)?,
                            direction: row.get::<_, String>(6)?,
                            fields: sanitize_fields_for_client(&conn, &message_id, fields),
                            receipt_status: row.get::<_, Option<String>>(7).ok().flatten(),
                        })
                    },
                )
                .map_err(|err| format!("run fts search failed: {err}"))?;
            for result in rows {
                items.push(result.map_err(|err| format!("parse search row failed: {err}"))?);
            }
        }

        if items.is_empty() {
            let like = format!("%{}%", query.to_ascii_lowercase());
            let mut stmt = conn
                .prepare(
                    "
                    SELECT
                      message_id,
                      source,
                      destination,
                      title,
                      body,
                      ts_ms,
                      direction,
                      receipt_status,
                      fields_json
                    FROM messages
                    WHERE (LOWER(title) LIKE ?1 OR LOWER(body) LIKE ?1)
                      AND (?2 IS NULL OR thread_id = ?2)
                    ORDER BY ts_ms DESC, message_id DESC
                    LIMIT ?3 OFFSET ?4
                    ",
                )
                .map_err(|err| format!("prepare fallback search failed: {err}"))?;
            let rows = stmt
                .query_map(
                    params![like, thread_id, (limit + 1) as i64, offset as i64],
                    |row| {
                        let message_id = row.get::<_, String>(0)?;
                        let fields_json = row.get::<_, Option<String>>(8).ok().flatten();
                        let fields = fields_json
                            .as_deref()
                            .and_then(|value| serde_json::from_str::<Value>(value).ok())
                            .unwrap_or_else(|| Value::Object(serde_json::Map::new()));
                        Ok(IndexedMessage {
                            id: message_id.clone(),
                            source: row.get::<_, String>(1)?,
                            destination: row.get::<_, String>(2)?,
                            title: row.get::<_, String>(3)?,
                            content: row.get::<_, String>(4)?,
                            timestamp: row.get::<_, i64>(5)?,
                            direction: row.get::<_, String>(6)?,
                            fields: sanitize_fields_for_client(&conn, &message_id, fields),
                            receipt_status: row.get::<_, Option<String>>(7).ok().flatten(),
                        })
                    },
                )
                .map_err(|err| format!("run fallback search failed: {err}"))?;
            for result in rows {
                items.push(result.map_err(|err| format!("parse fallback row failed: {err}"))?);
            }
        }

        let next_cursor = if items.len() > limit {
            Some((offset + limit).to_string())
        } else {
            None
        };
        if items.len() > limit {
            items.truncate(limit);
        }

        serde_json::to_value(CursorResult { items, next_cursor })
            .map_err(|err| format!("serialize search query failed: {err}"))
    }

    pub(crate) fn query_files(&self, params: FilesQueryParams) -> Result<Value, String> {
        let limit = normalize_limit(params.limit);
        let offset = parse_cursor_offset(params.cursor.as_deref());
        let query = params
            .query
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(|value| value.to_ascii_lowercase());
        let kind_filter = params
            .kind
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(|value| value.to_ascii_lowercase());

        let conn = self
            .conn
            .lock()
            .map_err(|_| "index lock poisoned".to_string())?;

        let mut stmt = conn
            .prepare(
                "
                SELECT
                  a.id,
                  a.message_id,
                  a.name,
                  a.mime,
                  a.size_bytes,
                  a.inline_base64,
                  m.source,
                  m.fields_json,
                  m.ts_ms
                FROM attachments a
                JOIN messages m ON m.message_id = a.message_id
                ORDER BY m.ts_ms DESC, a.id DESC
                LIMIT ?1 OFFSET ?2
                ",
            )
            .map_err(|err| format!("prepare file query failed: {err}"))?;

        let rows = stmt
            .query_map(params![(limit + 1) as i64, offset as i64], |row| {
                let mime = row.get::<_, Option<String>>(3).ok().flatten();
                let size_bytes = row.get::<_, i64>(4).unwrap_or(0).max(0);
                let source = row.get::<_, String>(6)?;
                let name = row.get::<_, String>(2)?;
                Ok(IndexedFileItem {
                    id: row.get::<_, i64>(0).unwrap_or_default().to_string(),
                    name: name.clone(),
                    kind: kind_from_mime(mime.as_deref()),
                    size_label: size_label(size_bytes),
                    owner: short_hash(&source, 6),
                    mime,
                    data_base64: row.get::<_, Option<String>>(5).ok().flatten(),
                    paper_uri: None,
                    paper_title: None,
                    paper_category: None,
                })
            })
            .map_err(|err| format!("run file query failed: {err}"))?;

        let mut items = Vec::new();
        for result in rows {
            let item = result.map_err(|err| format!("parse file row failed: {err}"))?;
            if let Some(kind) = kind_filter.as_deref() {
                if item.kind.to_ascii_lowercase() != kind {
                    continue;
                }
            }
            if let Some(search) = query.as_deref() {
                let haystack = format!(
                    "{} {} {}",
                    item.name.to_ascii_lowercase(),
                    item.owner.to_ascii_lowercase(),
                    item.mime
                        .as_deref()
                        .unwrap_or_default()
                        .to_ascii_lowercase()
                );
                if !haystack.contains(search) {
                    continue;
                }
            }
            items.push(item);
        }

        // Include paper references as file-like notes.
        let mut paper_stmt = conn
            .prepare(
                "
                SELECT message_id, source, fields_json, ts_ms
                FROM messages
                WHERE fields_json IS NOT NULL
                ORDER BY ts_ms DESC, message_id DESC
                LIMIT ?1 OFFSET ?2
                ",
            )
            .map_err(|err| format!("prepare paper query failed: {err}"))?;
        let paper_rows = paper_stmt
            .query_map(params![(limit + 1) as i64, offset as i64], |row| {
                let fields_json = row.get::<_, Option<String>>(2).ok().flatten();
                let source = row.get::<_, String>(1)?;
                let message_id = row.get::<_, String>(0)?;
                let fields = fields_json
                    .as_deref()
                    .and_then(|value| serde_json::from_str::<Value>(value).ok())
                    .unwrap_or(Value::Null);
                let paper = fields
                    .as_object()
                    .and_then(|root| root.get("paper"))
                    .and_then(Value::as_object)
                    .cloned();
                Ok((message_id, source, paper))
            })
            .map_err(|err| format!("run paper query failed: {err}"))?;

        for result in paper_rows {
            let (message_id, source, paper) =
                result.map_err(|err| format!("parse paper row failed: {err}"))?;
            let Some(paper) = paper else {
                continue;
            };
            let title = paper
                .get("title")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string);
            let uri = paper
                .get("uri")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string);
            let category = paper
                .get("category")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string);
            if title.is_none() && uri.is_none() {
                continue;
            }
            items.push(IndexedFileItem {
                id: format!("{message_id}:paper"),
                name: title
                    .clone()
                    .or_else(|| uri.clone())
                    .unwrap_or_else(|| "Note".to_string()),
                kind: "Note".to_string(),
                size_label: "—".to_string(),
                owner: short_hash(&source, 6),
                mime: None,
                data_base64: None,
                paper_uri: uri,
                paper_title: title,
                paper_category: category,
            });
        }

        let next_cursor = if items.len() > limit {
            Some((offset + limit).to_string())
        } else {
            None
        };
        if items.len() > limit {
            items.truncate(limit);
        }

        serde_json::to_value(CursorResult { items, next_cursor })
            .map_err(|err| format!("serialize file query failed: {err}"))
    }

    pub(crate) fn query_map_points(&self, params: MapPointsQueryParams) -> Result<Value, String> {
        let limit = normalize_limit(params.limit);
        let offset = parse_cursor_offset(params.cursor.as_deref());
        let query = params
            .query
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(|value| value.to_ascii_lowercase());

        let conn = self
            .conn
            .lock()
            .map_err(|_| "index lock poisoned".to_string())?;

        let mut stmt = conn
            .prepare(
                "
                SELECT message_id, source, destination, direction, title, body, ts_ms, fields_json
                FROM messages
                ORDER BY ts_ms DESC, message_id DESC
                LIMIT ?1 OFFSET ?2
                ",
            )
            .map_err(|err| format!("prepare map query failed: {err}"))?;

        let rows = stmt
            .query_map(params![(limit + 1) as i64, offset as i64], |row| {
                let message_id = row.get::<_, String>(0)?;
                let source = row.get::<_, String>(1)?;
                let destination = row.get::<_, String>(2)?;
                let direction = row.get::<_, String>(3)?;
                let title = row.get::<_, String>(4)?;
                let body = row.get::<_, String>(5)?;
                let ts_ms = row.get::<_, i64>(6)?;
                let fields_json = row.get::<_, Option<String>>(7).ok().flatten();
                let fields = fields_json
                    .as_deref()
                    .and_then(|value| serde_json::from_str::<Value>(value).ok())
                    .unwrap_or(Value::Null);
                Ok((
                    message_id,
                    source,
                    destination,
                    direction,
                    title,
                    body,
                    ts_ms,
                    fields,
                ))
            })
            .map_err(|err| format!("run map query failed: {err}"))?;

        let mut points = Vec::new();
        for result in rows {
            let (message_id, source, destination, direction, title, body, ts_ms, fields) =
                result.map_err(|err| format!("parse map row failed: {err}"))?;
            let context = MapPointMessageContext {
                message_id: &message_id,
                source: &source,
                destination: &destination,
                direction: &direction,
                title: &title,
                body: &body,
                ts_ms,
            };
            let extracted = extract_map_points(&context, &fields);
            for item in extracted {
                if let Some(search) = query.as_deref() {
                    let haystack = format!(
                        "{} {} {} {} {}",
                        item.label.to_ascii_lowercase(),
                        item.source.to_ascii_lowercase(),
                        item.when.to_ascii_lowercase(),
                        item.lat,
                        item.lon
                    );
                    if !haystack.contains(search) {
                        continue;
                    }
                }
                points.push(item);
            }
        }

        points.sort_by(|left, right| right.id.cmp(&left.id));

        let next_cursor = if points.len() > limit {
            Some((offset + limit).to_string())
        } else {
            None
        };
        if points.len() > limit {
            points.truncate(limit);
        }

        serde_json::to_value(CursorResult {
            items: points,
            next_cursor,
        })
        .map_err(|err| format!("serialize map query failed: {err}"))
    }

    pub(crate) fn get_attachment_blob(
        &self,
        params: AttachmentBlobParams,
    ) -> Result<Value, String> {
        let message_id = params.message_id.trim();
        let attachment_name = params.attachment_name.trim();
        if message_id.is_empty() || attachment_name.is_empty() {
            return Err("message_id and attachment_name are required".to_string());
        }

        let conn = self
            .conn
            .lock()
            .map_err(|_| "index lock poisoned".to_string())?;

        let mut stmt = conn
            .prepare(
                "
                SELECT mime, size_bytes, inline_base64
                FROM attachments
                WHERE message_id = ?1 AND name = ?2
                ORDER BY ordinal ASC
                LIMIT 1
                ",
            )
            .map_err(|err| format!("prepare attachment blob query failed: {err}"))?;

        let entry = stmt
            .query_row(params![message_id, attachment_name], |row| {
                Ok((
                    row.get::<_, Option<String>>(0).ok().flatten(),
                    row.get::<_, i64>(1).unwrap_or(0),
                    row.get::<_, Option<String>>(2).ok().flatten(),
                ))
            })
            .optional()
            .map_err(|err| format!("read attachment blob failed: {err}"))?;

        let Some((mime, size_bytes, data_base64)) = entry else {
            return Err("attachment not found".to_string());
        };

        let data_base64 =
            data_base64.ok_or_else(|| "attachment payload unavailable".to_string())?;

        Ok(json!({
            "mime": mime,
            "size_bytes": size_bytes.max(0),
            "data_base64": data_base64,
        }))
    }

    fn ingest_messages_and_peers(
        &self,
        messages: &[Value],
        peers: &[PeerSummary],
    ) -> Result<(), String> {
        let parsed_messages = messages
            .iter()
            .filter_map(|value| parse_message_row(value).ok())
            .collect::<Vec<_>>();

        let mut conn = self
            .conn
            .lock()
            .map_err(|_| "index lock poisoned".to_string())?;
        let tx = conn
            .transaction()
            .map_err(|err| format!("start reindex transaction failed: {err}"))?;

        tx.execute_batch(
            "
            DELETE FROM attachments;
            DELETE FROM messages;
            ",
        )
        .map_err(|err| format!("clear tables for reindex failed: {err}"))?;

        for parsed in &parsed_messages {
            upsert_message_row(&tx, parsed)?;
        }

        tx.commit()
            .map_err(|err| format!("commit reindex transaction failed: {err}"))?;

        rebuild_threads_from_messages(&mut conn, &parsed_messages, peers)?;

        let latest_ts = parsed_messages
            .iter()
            .map(|entry| entry.row.ts_ms)
            .max()
            .unwrap_or_else(current_timestamp_ms);
        let latest_id = parsed_messages
            .iter()
            .max_by_key(|entry| entry.row.ts_ms)
            .map(|entry| entry.row.message_id.clone());

        update_last_sync_state(&mut conn, latest_ts, latest_id)?;
        self.ready.store(true, Ordering::Relaxed);
        Ok(())
    }

    fn apply_receipt_event(&self, payload: &Value) -> Result<(), String> {
        let payload = match payload.as_object() {
            Some(value) => value,
            None => return Ok(()),
        };
        let message_id = payload
            .get("message_id")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .ok_or_else(|| "receipt payload missing message_id".to_string())?;
        let status = payload
            .get("status")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string);
        let reason_code = payload
            .get("reason_code")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string);

        let mut conn = self
            .conn
            .lock()
            .map_err(|_| "index lock poisoned".to_string())?;

        conn.execute(
            "
            UPDATE messages
            SET
              receipt_status = COALESCE(?1, receipt_status),
              status_reason_code = COALESCE(?2, status_reason_code),
              updated_at_ms = ?3
            WHERE message_id = ?4
            ",
            params![status, reason_code, current_timestamp_ms(), message_id],
        )
        .map_err(|err| format!("apply receipt update failed: {err}"))?;

        rebuild_threads_table(&mut conn)?;
        update_last_sync_state(
            &mut conn,
            current_timestamp_ms(),
            Some(message_id.to_string()),
        )?;
        self.ready.store(true, Ordering::Relaxed);
        Ok(())
    }
}

fn sanitize_fields_for_client(conn: &Connection, message_id: &str, fields: Value) -> Value {
    let mut root = match fields.as_object() {
        Some(value) => value.clone(),
        None => serde_json::Map::new(),
    };

    let mut attachments = Vec::new();
    if let Ok(mut stmt) = conn.prepare(
        "SELECT name, mime, size_bytes FROM attachments WHERE message_id = ?1 ORDER BY ordinal ASC",
    ) {
        if let Ok(rows) = stmt.query_map(params![message_id], |row| {
            Ok(json!({
                "name": row.get::<_, String>(0)?,
                "mime": row.get::<_, Option<String>>(1).ok().flatten(),
                "size_bytes": row.get::<_, i64>(2).unwrap_or(0).max(0),
            }))
        }) {
            for value in rows.flatten() {
                attachments.push(value);
            }
        }
    }

    if !attachments.is_empty() {
        root.insert("attachments".to_string(), Value::Array(attachments));
    }

    root.remove("5");
    Value::Object(root)
}

fn upsert_message_row(
    tx: &rusqlite::Transaction<'_>,
    parsed: &MessageParseResult,
) -> Result<(), String> {
    tx.execute(
        "
        INSERT INTO messages (
          message_id,
          thread_id,
          direction,
          source,
          destination,
          ts_ms,
          title,
          body,
          receipt_status,
          status_reason_code,
          has_attachments,
          has_paper,
          fields_json,
          updated_at_ms
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
        ON CONFLICT(message_id) DO UPDATE SET
          thread_id = excluded.thread_id,
          direction = excluded.direction,
          source = excluded.source,
          destination = excluded.destination,
          ts_ms = excluded.ts_ms,
          title = excluded.title,
          body = excluded.body,
          receipt_status = excluded.receipt_status,
          status_reason_code = excluded.status_reason_code,
          has_attachments = excluded.has_attachments,
          has_paper = excluded.has_paper,
          fields_json = excluded.fields_json,
          updated_at_ms = excluded.updated_at_ms
        ",
        params![
            &parsed.row.message_id,
            &parsed.row.thread_id,
            &parsed.row.direction,
            &parsed.row.source,
            &parsed.row.destination,
            parsed.row.ts_ms,
            &parsed.row.title,
            &parsed.row.body,
            &parsed.row.receipt_status,
            derive_reason_code(parsed.row.receipt_status.as_deref()),
            if parsed.attachments.is_empty() { 0 } else { 1 },
            if has_paper_field(parsed.row.fields.as_ref()) {
                1
            } else {
                0
            },
            parsed.row.fields.as_ref().map(|fields| fields.to_string()),
            current_timestamp_ms(),
        ],
    )
    .map_err(|err| format!("upsert message failed: {err}"))?;

    tx.execute(
        "DELETE FROM attachments WHERE message_id = ?1",
        params![&parsed.row.message_id],
    )
    .map_err(|err| format!("clear attachments failed: {err}"))?;

    for (index, attachment) in parsed.attachments.iter().enumerate() {
        tx.execute(
            "
            INSERT INTO attachments (
              message_id,
              ordinal,
              name,
              mime,
              size_bytes,
              inline_base64
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
            ",
            params![
                &parsed.row.message_id,
                index as i64,
                &attachment.name,
                &attachment.mime,
                attachment.size_bytes,
                &attachment.inline_base64,
            ],
        )
        .map_err(|err| format!("insert attachment failed: {err}"))?;
    }

    Ok(())
}

fn rebuild_threads_table(conn: &mut Connection) -> Result<(), String> {
    let mut messages = Vec::new();
    {
        let mut stmt = conn
            .prepare(
                "
                SELECT message_id, thread_id, direction, source, destination, ts_ms, title, body, receipt_status, fields_json
                FROM messages
                ORDER BY ts_ms DESC, message_id DESC
                ",
            )
            .map_err(|err| format!("prepare rebuild thread rows failed: {err}"))?;

        let rows = stmt
            .query_map([], |row| {
                let fields_json = row.get::<_, Option<String>>(9).ok().flatten();
                Ok(MessageRow {
                    message_id: row.get::<_, String>(0)?,
                    thread_id: row.get::<_, String>(1)?,
                    direction: row.get::<_, String>(2)?,
                    source: row.get::<_, String>(3)?,
                    destination: row.get::<_, String>(4)?,
                    ts_ms: row.get::<_, i64>(5)?,
                    title: row.get::<_, String>(6)?,
                    body: row.get::<_, String>(7)?,
                    receipt_status: row.get::<_, Option<String>>(8).ok().flatten(),
                    fields: fields_json
                        .as_deref()
                        .and_then(|value| serde_json::from_str::<Value>(value).ok()),
                })
            })
            .map_err(|err| format!("query rebuild thread rows failed: {err}"))?;

        for row in rows {
            messages.push(row.map_err(|err| format!("parse rebuild thread row failed: {err}"))?);
        }
    }

    rebuild_threads_from_message_rows(conn, &messages, &[])
}

fn rebuild_threads_from_messages(
    conn: &mut Connection,
    messages: &[MessageParseResult],
    peers: &[PeerSummary],
) -> Result<(), String> {
    let rows = messages
        .iter()
        .map(|entry| &entry.row)
        .cloned()
        .collect::<Vec<_>>();
    rebuild_threads_from_message_rows(conn, &rows, peers)
}

fn rebuild_threads_from_message_rows(
    conn: &mut Connection,
    rows: &[MessageRow],
    peers: &[PeerSummary],
) -> Result<(), String> {
    let mut peer_names = HashMap::new();
    for peer in peers {
        peer_names.insert(peer.peer.to_string(), peer.name.to_string());
    }

    let mut pinned_state = HashMap::new();
    {
        let mut stmt = conn
            .prepare("SELECT thread_id, pinned, muted FROM threads")
            .map_err(|err| format!("prepare old thread state failed: {err}"))?;
        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, i64>(1).unwrap_or(0) == 1,
                    row.get::<_, i64>(2).unwrap_or(0) == 1,
                ))
            })
            .map_err(|err| format!("query old thread state failed: {err}"))?;
        for row in rows {
            let (thread_id, pinned, muted) =
                row.map_err(|err| format!("parse old thread state failed: {err}"))?;
            pinned_state.insert(thread_id, (pinned, muted));
        }
    }

    let mut summaries = BTreeMap::<String, ThreadSummary>::new();
    for row in rows {
        let summary = summaries
            .entry(row.thread_id.clone())
            .or_insert_with(|| ThreadSummary {
                thread_id: row.thread_id.clone(),
                name: peer_names
                    .get(&row.thread_id)
                    .cloned()
                    .unwrap_or_else(|| short_hash(&row.thread_id, 6)),
                preview: preview_from_message(row),
                last_message_id: row.message_id.clone(),
                last_activity_ms: row.ts_ms,
                unread: 0,
                pinned: pinned_state
                    .get(&row.thread_id)
                    .map(|state| state.0)
                    .unwrap_or(false),
                muted: pinned_state
                    .get(&row.thread_id)
                    .map(|state| state.1)
                    .unwrap_or(false),
            });

        if row.ts_ms >= summary.last_activity_ms {
            summary.last_activity_ms = row.ts_ms;
            summary.last_message_id = row.message_id.clone();
            summary.preview = preview_from_message(row);
        }

        if row.direction != "out" {
            summary.unread += 1;
        }
    }

    let tx = conn
        .transaction()
        .map_err(|err| format!("start thread rebuild transaction failed: {err}"))?;
    tx.execute("DELETE FROM threads", [])
        .map_err(|err| format!("clear thread table failed: {err}"))?;

    for summary in summaries.values() {
        tx.execute(
            "
            INSERT INTO threads (
              thread_id,
              display_name,
              preview,
              last_message_id,
              last_activity_ms,
              unread_count,
              pinned,
              muted
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
            ",
            params![
                summary.thread_id,
                summary.name,
                summary.preview,
                summary.last_message_id,
                summary.last_activity_ms,
                summary.unread as i64,
                if summary.pinned { 1 } else { 0 },
                if summary.muted { 1 } else { 0 },
            ],
        )
        .map_err(|err| format!("insert thread summary failed: {err}"))?;
    }

    tx.commit()
        .map_err(|err| format!("commit thread rebuild failed: {err}"))?;
    Ok(())
}

fn update_last_sync_state(
    conn: &mut Connection,
    last_sync_ms: i64,
    last_message_id: Option<String>,
) -> Result<(), String> {
    conn.execute(
        "INSERT INTO sync_state(key, value) VALUES('last_sync_ms', ?1)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![last_sync_ms.to_string()],
    )
    .map_err(|err| format!("update sync state failed: {err}"))?;

    if let Some(message_id) = last_message_id {
        conn.execute(
            "INSERT INTO sync_state(key, value) VALUES('last_sync_message_id', ?1)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![message_id],
        )
        .map_err(|err| format!("update sync message id failed: {err}"))?;
    }

    Ok(())
}

fn parse_message_list(payload: &Value) -> Result<Vec<Value>, String> {
    if let Some(array) = payload.as_array() {
        return Ok(array.clone());
    }
    let object = payload
        .as_object()
        .ok_or_else(|| "message payload must be object or array".to_string())?;
    let messages = object
        .get("messages")
        .and_then(Value::as_array)
        .ok_or_else(|| "message payload missing messages array".to_string())?;
    Ok(messages.clone())
}

fn parse_peer_list(payload: &Value) -> Vec<PeerSummary> {
    let peers = if let Some(array) = payload.as_array() {
        array.clone()
    } else {
        payload
            .as_object()
            .and_then(|object| object.get("peers"))
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default()
    };

    peers
        .iter()
        .filter_map(|entry| {
            let record = entry.as_object()?;
            let peer = record
                .get("peer")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())?
                .to_string();
            let name = record
                .get("name")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string)
                .unwrap_or_else(|| short_hash(&peer, 6));
            Some(PeerSummary { peer, name })
        })
        .collect()
}

fn parse_message_row(value: &Value) -> Result<MessageParseResult, String> {
    let record = value
        .as_object()
        .ok_or_else(|| "message entry must be an object".to_string())?;

    let message_id = read_required_string(record, "id")?;
    let source = read_required_string(record, "source")?;
    let destination = read_required_string(record, "destination")?;
    let direction = read_required_string(record, "direction")?;
    let title = read_optional_string(record, "title").unwrap_or_default();
    let body = read_optional_string(record, "content").unwrap_or_default();
    let timestamp = read_required_number(record, "timestamp")?;
    let ts_ms = normalize_timestamp_ms(timestamp);
    let thread_id = if direction == "out" {
        destination.clone()
    } else {
        source.clone()
    };
    let receipt_status = read_optional_string(record, "receipt_status");
    let fields = record
        .get("fields")
        .cloned()
        .filter(|value| !value.is_null());

    let attachments = fields
        .as_ref()
        .map(extract_attachments_from_fields)
        .unwrap_or_default();

    Ok(MessageParseResult {
        row: MessageRow {
            message_id,
            thread_id,
            direction,
            source,
            destination,
            ts_ms,
            title,
            body,
            receipt_status,
            fields,
        },
        attachments,
    })
}

fn extract_attachments_from_fields(fields: &Value) -> Vec<AttachmentEntry> {
    let Some(root) = fields.as_object() else {
        return Vec::new();
    };

    let mut out = Vec::new();

    if let Some(value) = root.get("attachments").and_then(Value::as_array) {
        for entry in value {
            let Some(record) = entry.as_object() else {
                continue;
            };
            let name = record
                .get("name")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string)
                .unwrap_or_else(|| format!("Attachment {}", out.len() + 1));
            let mime = record
                .get("mime")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string);
            let inline_base64 = record
                .get("inline_base64")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string);
            let size_bytes = record
                .get("size_bytes")
                .and_then(Value::as_i64)
                .or_else(|| record.get("size").and_then(Value::as_i64))
                .unwrap_or_else(|| {
                    inline_base64
                        .as_deref()
                        .map(estimate_base64_size)
                        .unwrap_or(0)
                });
            out.push(AttachmentEntry {
                name,
                mime,
                size_bytes: size_bytes.max(0),
                inline_base64,
            });
        }
    }

    if let Some(value) = root.get("5").and_then(Value::as_array) {
        for entry in value {
            if let Some(record) = entry.as_object() {
                let name = record
                    .get("filename")
                    .or_else(|| record.get("name"))
                    .and_then(Value::as_str)
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .map(str::to_string)
                    .unwrap_or_else(|| format!("Attachment {}", out.len() + 1));
                let mime = record
                    .get("mime")
                    .and_then(Value::as_str)
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .map(str::to_string);
                let inline_base64 = record
                    .get("inline_base64")
                    .and_then(Value::as_str)
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .map(str::to_string);
                let bytes = record
                    .get("data")
                    .and_then(read_u8_array)
                    .as_deref()
                    .map(encode_bytes_base64)
                    .or(inline_base64.clone());
                let size = record
                    .get("size_bytes")
                    .and_then(Value::as_i64)
                    .or_else(|| record.get("size").and_then(Value::as_i64))
                    .unwrap_or_else(|| bytes.as_deref().map(estimate_base64_size).unwrap_or(0));
                out.push(AttachmentEntry {
                    name,
                    mime,
                    size_bytes: size.max(0),
                    inline_base64: bytes,
                });
                continue;
            }

            let Some(parts) = entry.as_array() else {
                continue;
            };
            if parts.len() < 2 {
                continue;
            }
            let name = decode_wire_text(&parts[0])
                .unwrap_or_else(|| format!("Attachment {}", out.len() + 1));
            let bytes = read_u8_array(&parts[1]);
            let inline_base64 = bytes.as_deref().map(encode_bytes_base64);
            let size_bytes = bytes
                .as_ref()
                .map(|value| value.len() as i64)
                .unwrap_or_else(|| {
                    inline_base64
                        .as_deref()
                        .map(estimate_base64_size)
                        .unwrap_or(0)
                });
            out.push(AttachmentEntry {
                name,
                mime: None,
                size_bytes: size_bytes.max(0),
                inline_base64,
            });
        }
    }

    out
}

fn extract_map_points(
    message: &MapPointMessageContext<'_>,
    fields: &Value,
) -> Vec<IndexedMapPoint> {
    let mut points = Vec::new();

    if let Some((lat, lon)) = extract_location_from_fields(fields) {
        points.push(build_map_point(message, lat, lon));
    }

    if let Some((lat, lon)) =
        extract_geo_uri(message.body).or_else(|| extract_geo_uri(message.title))
    {
        points.push(build_map_point(message, lat, lon));
    }

    points
}

fn extract_geo_uri(value: &str) -> Option<(f64, f64)> {
    let lower = value.to_ascii_lowercase();
    let start = lower.find("geo:")?;
    let suffix = &value[start + 4..];
    let mut parts = suffix.split([',', ';', ' ', '\n', '\t']);
    let lat = parts.next()?.trim().parse::<f64>().ok()?;
    let lon = parts.next()?.trim().parse::<f64>().ok()?;
    if !is_valid_coordinate(lat, lon) {
        return None;
    }
    Some((lat, lon))
}

fn extract_location_from_fields(fields: &Value) -> Option<(f64, f64)> {
    let root = fields.as_object()?;

    if let Some(location) = root.get("location").and_then(Value::as_object) {
        let lat = location
            .get("lat")
            .or_else(|| location.get("latitude"))
            .and_then(Value::as_f64)?;
        let lon = location
            .get("lon")
            .or_else(|| location.get("lng"))
            .or_else(|| location.get("longitude"))
            .and_then(Value::as_f64)?;
        if is_valid_coordinate(lat, lon) {
            return Some((lat, lon));
        }
    }

    if let Some(telemetry) = root.get("2") {
        if let Some(telemetry_object) = telemetry.as_object() {
            if let Some(location) = telemetry_object.get("location").and_then(Value::as_object) {
                let lat = location
                    .get("lat")
                    .or_else(|| location.get("latitude"))
                    .and_then(Value::as_f64)?;
                let lon = location
                    .get("lon")
                    .or_else(|| location.get("lng"))
                    .or_else(|| location.get("longitude"))
                    .and_then(Value::as_f64)?;
                if is_valid_coordinate(lat, lon) {
                    return Some((lat, lon));
                }
            }

            let lat = telemetry_object
                .get("lat")
                .or_else(|| telemetry_object.get("latitude"))
                .and_then(Value::as_f64);
            let lon = telemetry_object
                .get("lon")
                .or_else(|| telemetry_object.get("lng"))
                .or_else(|| telemetry_object.get("longitude"))
                .and_then(Value::as_f64);
            if let (Some(lat), Some(lon)) = (lat, lon) {
                if is_valid_coordinate(lat, lon) {
                    return Some((lat, lon));
                }
            }
        }
    }

    None
}

fn build_map_point(message: &MapPointMessageContext<'_>, lat: f64, lon: f64) -> IndexedMapPoint {
    let label = if !message.title.trim().is_empty() {
        message.title.trim().to_string()
    } else if !message.body.trim().is_empty() {
        message
            .body
            .lines()
            .next()
            .unwrap_or("Location point")
            .trim()
            .to_string()
    } else {
        "Location point".to_string()
    };

    let direction_label = if message.direction == "out" {
        "out"
    } else {
        "in"
    };
    let who = if message.direction == "out" {
        message.destination
    } else {
        message.source
    };

    IndexedMapPoint {
        id: format!("{}:{}:{}:{}", message.message_id, message.ts_ms, lat, lon),
        label,
        lat,
        lon,
        source: short_hash(who, 8),
        when: format_timestamp(message.ts_ms),
        direction: direction_label.to_string(),
    }
}

fn build_fts_query(query: &str) -> Option<String> {
    let terms = query
        .split_whitespace()
        .map(|term| {
            term.chars()
                .filter(|ch| ch.is_ascii_alphanumeric() || *ch == '_' || *ch == '-')
                .collect::<String>()
        })
        .filter(|term| !term.is_empty())
        .map(|term| format!("{}*", term))
        .collect::<Vec<_>>();

    if terms.is_empty() {
        return None;
    }

    Some(terms.join(" AND "))
}

fn parse_cursor_offset(cursor: Option<&str>) -> usize {
    cursor
        .and_then(|value| value.trim().parse::<usize>().ok())
        .unwrap_or(0)
}

fn normalize_limit(value: Option<usize>) -> usize {
    value
        .filter(|limit| *limit > 0)
        .unwrap_or(DEFAULT_LIMIT)
        .min(MAX_LIMIT)
}

fn preview_from_message(row: &MessageRow) -> String {
    let body = row.body.trim();
    if !body.is_empty() {
        return body.to_string();
    }
    if !row.title.trim().is_empty() {
        return row.title.trim().to_string();
    }
    if has_paper_field(row.fields.as_ref()) {
        return "Paper note".to_string();
    }
    "No messages yet".to_string()
}

fn has_paper_field(fields: Option<&Value>) -> bool {
    fields
        .and_then(Value::as_object)
        .and_then(|record| record.get("paper"))
        .and_then(Value::as_object)
        .is_some()
}

fn derive_reason_code(status_detail: Option<&str>) -> Option<String> {
    let status = status_detail?.trim().to_ascii_lowercase();
    if status.is_empty() {
        return None;
    }
    if status.contains("receipt timeout") {
        return Some("receipt_timeout".to_string());
    }
    if status.contains("timeout") {
        return Some("timeout".to_string());
    }
    if status.contains("no route") || status.contains("no path") || status.contains("no known path")
    {
        return Some("no_path".to_string());
    }
    if status.contains("no propagation relay selected") {
        return Some("relay_unset".to_string());
    }
    if status.contains("retry budget exhausted") {
        return Some("retry_budget_exhausted".to_string());
    }
    None
}

fn read_required_string(
    record: &serde_json::Map<String, Value>,
    key: &str,
) -> Result<String, String> {
    record
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .ok_or_else(|| format!("message.{key} is required"))
}

fn read_optional_string(record: &serde_json::Map<String, Value>, key: &str) -> Option<String> {
    record
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn read_required_number(record: &serde_json::Map<String, Value>, key: &str) -> Result<f64, String> {
    record
        .get(key)
        .and_then(Value::as_f64)
        .ok_or_else(|| format!("message.{key} is required"))
}

fn normalize_timestamp_ms(value: f64) -> i64 {
    if !value.is_finite() {
        return current_timestamp_ms();
    }
    if value >= 1_000_000_000_000.0 {
        return value as i64;
    }
    (value * 1000.0).round() as i64
}

fn current_timestamp_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_millis() as i64)
        .unwrap_or(0)
}

fn read_u8_array(value: &Value) -> Option<Vec<u8>> {
    let array = value.as_array()?;
    let mut bytes = Vec::with_capacity(array.len());
    for entry in array {
        let number = entry.as_u64()?;
        if number > u8::MAX as u64 {
            return None;
        }
        bytes.push(number as u8);
    }
    Some(bytes)
}

fn decode_wire_text(value: &Value) -> Option<String> {
    if let Some(text) = value.as_str() {
        let normalized = text.trim();
        if !normalized.is_empty() {
            return Some(normalized.to_string());
        }
    }
    let bytes = read_u8_array(value)?;
    String::from_utf8(bytes)
        .ok()
        .map(|value| value.trim().to_string())
}

fn encode_bytes_base64(bytes: &[u8]) -> String {
    base64::engine::general_purpose::STANDARD.encode(bytes)
}

fn estimate_base64_size(value: &str) -> i64 {
    let trimmed = value.trim().trim_end_matches('=');
    if trimmed.is_empty() {
        return 0;
    }
    ((trimmed.len() * 3) / 4) as i64
}

fn size_label(size_bytes: i64) -> String {
    if size_bytes <= 0 {
        return "—".to_string();
    }
    if size_bytes < 1024 {
        return format!("{} B", size_bytes);
    }
    if size_bytes < 1024 * 1024 {
        return format!("{:.1} KB", size_bytes as f64 / 1024.0);
    }
    format!("{:.1} MB", size_bytes as f64 / (1024.0 * 1024.0))
}

fn kind_from_mime(mime: Option<&str>) -> String {
    let Some(mime) = mime else {
        return "Document".to_string();
    };
    let value = mime.trim().to_ascii_lowercase();
    if value.starts_with("image/") {
        return "Image".to_string();
    }
    if value.starts_with("audio/") {
        return "Audio".to_string();
    }
    if value.contains("zip") || value.contains("tar") {
        return "Archive".to_string();
    }
    "Document".to_string()
}

fn format_timestamp(timestamp_ms: i64) -> String {
    if timestamp_ms > 0 {
        return timestamp_ms.to_string();
    }
    "unknown".to_string()
}

fn short_hash(value: &str, visible: usize) -> String {
    let trimmed = value.trim();
    if trimmed.len() <= visible * 2 {
        return trimmed.to_string();
    }
    format!(
        "{}...{}",
        &trimmed[..visible],
        &trimmed[trimmed.len().saturating_sub(visible)..]
    )
}

fn is_valid_coordinate(lat: f64, lon: f64) -> bool {
    lat.is_finite()
        && lon.is_finite()
        && (-90.0..=90.0).contains(&lat)
        && (-180.0..=180.0).contains(&lon)
}

const SCHEMA_SQL: &str = r#"
CREATE TABLE IF NOT EXISTS messages (
  message_id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  direction TEXT NOT NULL,
  source TEXT NOT NULL,
  destination TEXT NOT NULL,
  ts_ms INTEGER NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  receipt_status TEXT,
  status_reason_code TEXT,
  has_attachments INTEGER NOT NULL DEFAULT 0,
  has_paper INTEGER NOT NULL DEFAULT 0,
  fields_json TEXT,
  updated_at_ms INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  name TEXT NOT NULL,
  mime TEXT,
  size_bytes INTEGER NOT NULL,
  inline_base64 TEXT,
  FOREIGN KEY(message_id) REFERENCES messages(message_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_attachments_message_id ON attachments(message_id);

CREATE TABLE IF NOT EXISTS threads (
  thread_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  preview TEXT NOT NULL,
  last_message_id TEXT,
  last_activity_ms INTEGER NOT NULL,
  unread_count INTEGER NOT NULL DEFAULT 0,
  pinned INTEGER NOT NULL DEFAULT 0,
  muted INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sync_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_thread_ts ON messages(thread_id, ts_ms DESC, message_id DESC);
CREATE INDEX IF NOT EXISTS idx_messages_ts ON messages(ts_ms DESC, message_id DESC);

CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
  message_id UNINDEXED,
  title,
  body,
  content='messages',
  content_rowid='rowid'
);

CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
  INSERT INTO messages_fts(rowid, message_id, title, body)
  VALUES (new.rowid, new.message_id, new.title, new.body);
END;

CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, message_id, title, body)
  VALUES('delete', old.rowid, old.message_id, old.title, old.body);
END;

CREATE TRIGGER IF NOT EXISTS messages_au AFTER UPDATE ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, message_id, title, body)
  VALUES('delete', old.rowid, old.message_id, old.title, old.body);
  INSERT INTO messages_fts(rowid, message_id, title, body)
  VALUES (new.rowid, new.message_id, new.title, new.body);
END;
"#;
