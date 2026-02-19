use super::*;

const REINDEX_BATCH_SIZE: usize = 500;

impl IndexStore {
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
            upsert_thread_summary_for_thread(&mut conn, &parsed.row.thread_id)?;
            update_last_sync_state(
                &mut conn,
                parsed.row.ts_ms,
                Some(parsed.row.message_id.clone()),
            )?;
            self.ready.store(true, Ordering::Relaxed);
        }

        Ok(())
    }

    fn ingest_messages_and_peers(
        &self,
        messages: &[Value],
        peers: &[PeerSummary],
    ) -> Result<(), String> {
        let mut conn = self
            .conn
            .lock()
            .map_err(|_| "index lock poisoned".to_string())?;
        conn.execute_batch(
            "
            BEGIN IMMEDIATE;
            DELETE FROM attachments;
            DELETE FROM messages;
            COMMIT;
            ",
        )
        .map_err(|err| format!("clear tables for reindex failed: {err}"))?;

        let mut latest_ts = 0_i64;
        let mut latest_id: Option<String> = None;
        let mut batch_count = 0_usize;
        let mut tx = conn
            .transaction()
            .map_err(|err| format!("start reindex batch transaction failed: {err}"))?;

        for value in messages {
            let parsed = match parse_message_row(value) {
                Ok(parsed) => parsed,
                Err(_) => continue,
            };
            upsert_message_row(&tx, &parsed)?;
            if latest_id.is_none() || parsed.row.ts_ms >= latest_ts {
                latest_ts = parsed.row.ts_ms;
                latest_id = Some(parsed.row.message_id.clone());
            }
            batch_count += 1;
            if batch_count >= REINDEX_BATCH_SIZE {
                tx.commit()
                    .map_err(|err| format!("commit reindex batch failed: {err}"))?;
                tx = conn
                    .transaction()
                    .map_err(|err| format!("start reindex batch transaction failed: {err}"))?;
                batch_count = 0;
            }
        }

        tx.commit()
            .map_err(|err| format!("commit reindex transaction failed: {err}"))?;
        rebuild_threads_table(&mut conn)?;
        apply_peer_names_to_threads(&mut conn, peers)?;

        let sync_ts = if latest_id.is_some() {
            latest_ts
        } else {
            current_timestamp_ms()
        };

        update_last_sync_state(&mut conn, sync_ts, latest_id)?;
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
        let thread_id = conn
            .query_row(
                "SELECT thread_id FROM messages WHERE message_id = ?1",
                params![message_id],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(|err| format!("read thread for receipt update failed: {err}"))?;

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

        if let Some(thread_id) = thread_id.as_deref() {
            upsert_thread_summary_for_thread(&mut conn, thread_id)?;
        }
        update_last_sync_state(
            &mut conn,
            current_timestamp_ms(),
            Some(message_id.to_string()),
        )?;
        self.ready.store(true, Ordering::Relaxed);
        Ok(())
    }
}
