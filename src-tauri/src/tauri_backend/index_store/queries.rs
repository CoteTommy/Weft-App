use super::*;

impl IndexStore {
    pub(crate) fn query_threads(&self, params: ThreadQueryParams) -> Result<Value, String> {
        let limit = normalize_limit(params.limit);
        let keyset = decode_thread_cursor(params.cursor.as_deref());
        let query_filter = params
            .query
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(|value| value.to_ascii_lowercase());
        let query_like = query_filter.as_deref().map(|value| format!("%{}%", value));
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
                  AND (
                    ?2 IS NULL
                    OR LOWER(display_name) LIKE ?2
                    OR LOWER(thread_id) LIKE ?2
                    OR LOWER(preview) LIKE ?2
                  )
                  AND (
                    ?3 IS NULL
                    OR pinned < ?3
                    OR (pinned = ?3 AND last_activity_ms < ?4)
                    OR (pinned = ?3 AND last_activity_ms = ?4 AND thread_id < ?5)
                  )
                ORDER BY pinned DESC, last_activity_ms DESC, thread_id DESC
                LIMIT ?6
                ",
            )
            .map_err(|err| format!("prepare thread query failed: {err}"))?;

        let rows = stmt
            .query_map(
                params![
                    if pinned_only { 1 } else { 0 },
                    query_like,
                    keyset
                        .as_ref()
                        .map(|cursor| if cursor.pinned { 1 } else { 0 }),
                    keyset.as_ref().map(|cursor| cursor.last_activity_ms),
                    keyset.as_ref().map(|cursor| cursor.thread_id.as_str()),
                    (limit + 1) as i64
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
            items.push(result.map_err(|err| format!("parse thread row failed: {err}"))?);
        }

        let next_cursor = if items.len() > limit {
            let marker = items.get(limit.saturating_sub(1)).cloned();
            items.truncate(limit);
            marker.and_then(|entry| {
                encode_thread_cursor(&ThreadCursorKey {
                    pinned: entry.pinned,
                    last_activity_ms: entry.last_activity_ms,
                    thread_id: entry.thread_id,
                })
            })
        } else {
            None
        };

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
        let keyset = decode_message_cursor(params.cursor.as_deref());
        let filter_query = params
            .query
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(|value| format!("%{}%", value.to_ascii_lowercase()));

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
                  AND (
                    ?2 IS NULL
                    OR LOWER(title) LIKE ?2
                    OR LOWER(body) LIKE ?2
                    OR LOWER(COALESCE(receipt_status, '')) LIKE ?2
                  )
                  AND (
                    ?3 IS NULL
                    OR ts_ms < ?3
                    OR (ts_ms = ?3 AND message_id < ?4)
                  )
                ORDER BY ts_ms DESC, message_id DESC
                LIMIT ?5
                ",
            )
            .map_err(|err| format!("prepare message query failed: {err}"))?;

        let rows = stmt
            .query_map(
                params![
                    thread_id,
                    filter_query,
                    keyset.as_ref().map(|cursor| cursor.timestamp),
                    keyset.as_ref().map(|cursor| cursor.message_id.as_str()),
                    (limit + 1) as i64
                ],
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
            items.push(result.map_err(|err| format!("parse message row failed: {err}"))?);
        }

        let next_cursor = if items.len() > limit {
            let marker = items.get(limit.saturating_sub(1)).cloned();
            items.truncate(limit);
            marker.and_then(|entry| {
                encode_message_cursor(&MessageCursorKey {
                    timestamp: entry.timestamp,
                    message_id: entry.id,
                })
            })
        } else {
            None
        };

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
        let include_bytes = params.include_bytes.unwrap_or(false);
        let query_filter = params
            .query
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(|value| value.to_ascii_lowercase());
        let query_like = query_filter.as_deref().map(|value| format!("%{}%", value));
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
                  CASE
                    WHEN ?1 = 1 THEN a.inline_base64
                    ELSE NULL
                  END AS inline_base64,
                  CASE
                    WHEN a.inline_base64 IS NULL OR a.inline_base64 = '' THEN 0
                    ELSE 1
                  END AS has_inline_data,
                  m.source,
                  m.fields_json,
                  m.ts_ms
                FROM attachments a
                JOIN messages m ON m.message_id = a.message_id
                WHERE (
                  ?2 IS NULL
                  OR LOWER(a.name) LIKE ?2
                  OR LOWER(COALESCE(a.mime, '')) LIKE ?2
                  OR LOWER(m.source) LIKE ?2
                )
                ORDER BY m.ts_ms DESC, a.id DESC
                LIMIT ?3 OFFSET ?4
                ",
            )
            .map_err(|err| format!("prepare file query failed: {err}"))?;

        let rows = stmt
            .query_map(
                params![
                    if include_bytes { 1 } else { 0 },
                    query_like,
                    (limit + 1) as i64,
                    offset as i64
                ],
                |row| {
                    let mime = row.get::<_, Option<String>>(3).ok().flatten();
                    let size_bytes = row.get::<_, i64>(4).unwrap_or(0).max(0);
                    let source = row.get::<_, String>(7)?;
                    let name = row.get::<_, String>(2)?;
                    Ok(IndexedFileItem {
                        id: row.get::<_, i64>(0).unwrap_or_default().to_string(),
                        name: name.clone(),
                        kind: kind_from_mime(mime.as_deref()),
                        size_label: size_label(size_bytes),
                        size_bytes,
                        created_at_ms: row.get::<_, i64>(9).unwrap_or(0),
                        owner: short_hash(&source, 6),
                        mime,
                        has_inline_data: row.get::<_, i64>(6).unwrap_or(0) == 1,
                        data_base64: row.get::<_, Option<String>>(5).ok().flatten(),
                        paper_uri: None,
                        paper_title: None,
                        paper_category: None,
                    })
                },
            )
            .map_err(|err| format!("run file query failed: {err}"))?;

        let mut items = Vec::new();
        for result in rows {
            let item = result.map_err(|err| format!("parse file row failed: {err}"))?;
            if let Some(kind) = kind_filter.as_deref() {
                if item.kind.to_ascii_lowercase() != kind {
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
                let created_at_ms = row.get::<_, i64>(3).unwrap_or(0);
                let fields = fields_json
                    .as_deref()
                    .and_then(|value| serde_json::from_str::<Value>(value).ok())
                    .unwrap_or(Value::Null);
                let paper = fields
                    .as_object()
                    .and_then(|root| root.get("paper"))
                    .and_then(Value::as_object)
                    .cloned();
                Ok((message_id, source, created_at_ms, paper))
            })
            .map_err(|err| format!("run paper query failed: {err}"))?;

        for result in paper_rows {
            let (message_id, source, created_at_ms, paper) =
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
            if let Some(kind) = kind_filter.as_deref() {
                if kind != "note" {
                    continue;
                }
            }
            if let Some(search) = query_filter.as_deref() {
                let candidate_name = title
                    .as_deref()
                    .or(uri.as_deref())
                    .unwrap_or("note")
                    .to_ascii_lowercase();
                let haystack = format!(
                    "{} {}",
                    candidate_name,
                    short_hash(&source, 6).to_ascii_lowercase()
                );
                if !haystack.contains(search) {
                    continue;
                }
            }
            items.push(IndexedFileItem {
                id: format!("{message_id}:paper"),
                name: title
                    .clone()
                    .or_else(|| uri.clone())
                    .unwrap_or_else(|| "Note".to_string()),
                kind: "Note".to_string(),
                size_label: "—".to_string(),
                size_bytes: 0,
                created_at_ms,
                owner: short_hash(&source, 6),
                mime: None,
                has_inline_data: false,
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
}
