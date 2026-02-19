use super::*;

const MAP_QUERY_MESSAGE_BATCH: usize = 320;
const MAP_QUERY_SCAN_LIMIT: usize = 4_000;

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
        let keyset = decode_file_cursor(params.cursor.as_deref());
        let include_bytes = params.include_bytes.unwrap_or(false);
        let query_like = params
            .query
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(|value| format!("%{}%", value.to_ascii_lowercase()));
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
                  file_rows.id,
                  file_rows.name,
                  file_rows.kind,
                  file_rows.size_bytes,
                  file_rows.created_at_ms,
                  file_rows.owner_source,
                  file_rows.mime,
                  file_rows.has_inline_data,
                  file_rows.data_base64,
                  file_rows.paper_uri,
                  file_rows.paper_title,
                  file_rows.paper_category,
                  file_rows.sort_id
                FROM (
                  SELECT
                    CAST(a.id AS TEXT) AS id,
                    a.name AS name,
                    CASE
                      WHEN LOWER(COALESCE(a.mime, '')) LIKE 'image/%' THEN 'Image'
                      WHEN LOWER(COALESCE(a.mime, '')) LIKE 'audio/%' THEN 'Audio'
                      WHEN LOWER(COALESCE(a.mime, '')) IN (
                        'application/zip',
                        'application/x-zip-compressed',
                        'application/x-tar',
                        'application/gzip',
                        'application/x-gzip'
                      ) THEN 'Archive'
                      ELSE 'Document'
                    END AS kind,
                    a.size_bytes AS size_bytes,
                    m.ts_ms AS created_at_ms,
                    m.source AS owner_source,
                    a.mime AS mime,
                    CASE
                      WHEN a.inline_base64 IS NULL OR a.inline_base64 = '' THEN 0
                      ELSE 1
                    END AS has_inline_data,
                    CASE
                      WHEN ?1 = 1 THEN a.inline_base64
                      ELSE NULL
                    END AS data_base64,
                    NULL AS paper_uri,
                    NULL AS paper_title,
                    NULL AS paper_category,
                    printf('a:%020d', a.id) AS sort_id
                  FROM attachments a
                  JOIN messages m ON m.message_id = a.message_id
                  WHERE (
                    ?2 IS NULL
                    OR LOWER(a.name) LIKE ?2
                    OR LOWER(COALESCE(a.mime, '')) LIKE ?2
                    OR LOWER(m.source) LIKE ?2
                  )

                  UNION ALL

                  SELECT
                    m.message_id || ':paper' AS id,
                    COALESCE(
                      NULLIF(TRIM(json_extract(m.fields_json, '$.paper.title')), ''),
                      NULLIF(TRIM(json_extract(m.fields_json, '$.paper.uri')), ''),
                      'Note'
                    ) AS name,
                    'Note' AS kind,
                    0 AS size_bytes,
                    m.ts_ms AS created_at_ms,
                    m.source AS owner_source,
                    NULL AS mime,
                    0 AS has_inline_data,
                    NULL AS data_base64,
                    NULLIF(TRIM(json_extract(m.fields_json, '$.paper.uri')), '') AS paper_uri,
                    NULLIF(TRIM(json_extract(m.fields_json, '$.paper.title')), '') AS paper_title,
                    NULLIF(TRIM(json_extract(m.fields_json, '$.paper.category')), '') AS paper_category,
                    'p:' || m.message_id AS sort_id
                  FROM messages m
                  WHERE m.fields_json IS NOT NULL
                    AND json_type(m.fields_json, '$.paper') = 'object'
                    AND (
                      NULLIF(TRIM(json_extract(m.fields_json, '$.paper.title')), '') IS NOT NULL
                      OR NULLIF(TRIM(json_extract(m.fields_json, '$.paper.uri')), '') IS NOT NULL
                    )
                    AND (
                      ?2 IS NULL
                      OR LOWER(COALESCE(json_extract(m.fields_json, '$.paper.title'), '')) LIKE ?2
                      OR LOWER(COALESCE(json_extract(m.fields_json, '$.paper.uri'), '')) LIKE ?2
                      OR LOWER(m.source) LIKE ?2
                    )
                ) file_rows
                WHERE (
                  ?3 IS NULL
                  OR file_rows.created_at_ms < ?3
                  OR (
                    file_rows.created_at_ms = ?3
                    AND file_rows.sort_id < ?4
                  )
                )
                  AND (?5 IS NULL OR LOWER(file_rows.kind) = ?5)
                ORDER BY file_rows.created_at_ms DESC, file_rows.sort_id DESC
                LIMIT ?6
                ",
            )
            .map_err(|err| format!("prepare file query failed: {err}"))?;

        let rows = stmt
            .query_map(
                params![
                    if include_bytes { 1 } else { 0 },
                    query_like,
                    keyset.as_ref().map(|cursor| cursor.created_at_ms),
                    keyset.as_ref().map(|cursor| cursor.sort_id.as_str()),
                    kind_filter,
                    (limit + 1) as i64,
                ],
                |row| {
                    let id = row.get::<_, String>(0)?;
                    let name = row.get::<_, String>(1)?;
                    let kind = row.get::<_, String>(2)?;
                    let size_bytes = row.get::<_, i64>(3).unwrap_or(0).max(0);
                    let created_at_ms = row.get::<_, i64>(4).unwrap_or(0);
                    let owner_source = row.get::<_, String>(5)?;
                    let mime = row.get::<_, Option<String>>(6).ok().flatten();
                    let has_inline_data = row.get::<_, i64>(7).unwrap_or(0) == 1;
                    let data_base64 = row.get::<_, Option<String>>(8).ok().flatten();
                    let paper_uri = row.get::<_, Option<String>>(9).ok().flatten();
                    let paper_title = row.get::<_, Option<String>>(10).ok().flatten();
                    let paper_category = row.get::<_, Option<String>>(11).ok().flatten();
                    let sort_id = row.get::<_, String>(12)?;
                    let size_label = if kind == "Note" {
                        "—".to_string()
                    } else {
                        size_label(size_bytes)
                    };
                    Ok((
                        IndexedFileItem {
                            id,
                            name,
                            kind,
                            size_label,
                            size_bytes,
                            created_at_ms,
                            owner: short_hash(&owner_source, 6),
                            mime,
                            has_inline_data,
                            data_base64,
                            paper_uri,
                            paper_title,
                            paper_category,
                        },
                        created_at_ms,
                        sort_id,
                    ))
                },
            )
            .map_err(|err| format!("run file query failed: {err}"))?;

        let mut entries = Vec::<(IndexedFileItem, i64, String)>::new();
        for result in rows {
            entries.push(result.map_err(|err| format!("parse file row failed: {err}"))?);
        }

        let next_cursor = if entries.len() > limit {
            let marker = entries
                .get(limit.saturating_sub(1))
                .map(|(_, created_at_ms, sort_id)| (*created_at_ms, sort_id.clone()));
            entries.truncate(limit);
            marker.and_then(|(created_at_ms, sort_id)| {
                encode_file_cursor(&FileCursorKey {
                    created_at_ms,
                    sort_id,
                })
            })
        } else {
            None
        };

        let items = entries
            .into_iter()
            .map(|(item, _, _)| item)
            .collect::<Vec<_>>();

        serde_json::to_value(CursorResult { items, next_cursor })
            .map_err(|err| format!("serialize file query failed: {err}"))
    }

    pub(crate) fn query_map_points(&self, params: MapPointsQueryParams) -> Result<Value, String> {
        let limit = normalize_limit(params.limit);
        let mut cursor = decode_message_cursor(params.cursor.as_deref());
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

        let mut points = Vec::new();
        let mut scanned_messages = 0usize;
        let mut next_cursor: Option<String> = None;
        let mut has_more = false;

        'scan: loop {
            if scanned_messages >= MAP_QUERY_SCAN_LIMIT {
                has_more = true;
                next_cursor = cursor.as_ref().and_then(encode_message_cursor);
                break;
            }

            let mut stmt = conn
                .prepare(
                    "
                    SELECT message_id, source, destination, direction, title, body, ts_ms, fields_json
                    FROM messages
                    WHERE (
                      ?1 IS NULL
                      OR ts_ms < ?1
                      OR (ts_ms = ?1 AND message_id < ?2)
                    )
                    ORDER BY ts_ms DESC, message_id DESC
                    LIMIT ?3
                    ",
                )
                .map_err(|err| format!("prepare map query failed: {err}"))?;

            let rows = stmt
                .query_map(
                    params![
                        cursor.as_ref().map(|value| value.timestamp),
                        cursor.as_ref().map(|value| value.message_id.as_str()),
                        MAP_QUERY_MESSAGE_BATCH as i64
                    ],
                    |row| {
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
                    },
                )
                .map_err(|err| format!("run map query failed: {err}"))?;

            let mut batch = Vec::new();
            for result in rows {
                batch.push(result.map_err(|err| format!("parse map row failed: {err}"))?);
            }

            if batch.is_empty() {
                break;
            }

            for (message_id, source, destination, direction, title, body, ts_ms, fields) in &batch {
                scanned_messages += 1;
                let context = MapPointMessageContext {
                    message_id,
                    source,
                    destination,
                    direction,
                    title,
                    body,
                    ts_ms: *ts_ms,
                };
                let extracted = extract_map_points(&context, fields);

                let mut filtered = Vec::new();
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
                    filtered.push(item);
                }

                if !filtered.is_empty() && points.len() + filtered.len() > limit {
                    has_more = true;
                    next_cursor = cursor.as_ref().and_then(encode_message_cursor);
                    break 'scan;
                }

                points.extend(filtered);
                cursor = Some(MessageCursorKey {
                    timestamp: *ts_ms,
                    message_id: message_id.clone(),
                });

                if scanned_messages >= MAP_QUERY_SCAN_LIMIT {
                    has_more = true;
                    next_cursor = cursor.as_ref().and_then(encode_message_cursor);
                    break 'scan;
                }
            }

            if batch.len() < MAP_QUERY_MESSAGE_BATCH {
                break;
            }
            if points.len() >= limit {
                has_more = true;
                next_cursor = cursor.as_ref().and_then(encode_message_cursor);
                break;
            }
        }

        if !has_more {
            next_cursor = None;
        }

        serde_json::to_value(CursorResult { items: points, next_cursor })
            .map_err(|err| format!("serialize map query failed: {err}"))
    }
}
