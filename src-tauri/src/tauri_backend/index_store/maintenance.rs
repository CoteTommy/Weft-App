use super::*;

impl IndexStore {
    pub(crate) fn runtime_metrics(&self) -> Result<RuntimeMetrics, String> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| "index lock poisoned".to_string())?;

        let message_count = conn
            .query_row("SELECT COUNT(*) FROM messages", [], |row| {
                row.get::<_, i64>(0)
            })
            .map_err(|err| format!("read runtime metrics message count failed: {err}"))?
            .max(0) as usize;
        let thread_count = conn
            .query_row("SELECT COUNT(*) FROM threads", [], |row| {
                row.get::<_, i64>(0)
            })
            .map_err(|err| format!("read runtime metrics thread count failed: {err}"))?
            .max(0) as usize;
        let queue_size = conn
            .query_row(
                "
                SELECT COUNT(*)
                FROM messages
                WHERE direction = 'out'
                  AND (
                    receipt_status IS NULL
                    OR LOWER(receipt_status) LIKE '%pending%'
                    OR LOWER(receipt_status) LIKE '%queue%'
                    OR LOWER(receipt_status) LIKE '%send%'
                  )
                ",
                [],
                |row| row.get::<_, i64>(0),
            )
            .map_err(|err| format!("read runtime metrics queue size failed: {err}"))?
            .max(0) as usize;
        let page_count = conn
            .query_row("PRAGMA page_count", [], |row| row.get::<_, i64>(0))
            .map_err(|err| format!("read runtime metrics page_count failed: {err}"))?
            .max(0) as u64;
        let page_size = conn
            .query_row("PRAGMA page_size", [], |row| row.get::<_, i64>(0))
            .map_err(|err| format!("read runtime metrics page_size failed: {err}"))?
            .max(0) as u64;

        Ok(RuntimeMetrics {
            db_size_bytes: page_count.saturating_mul(page_size),
            queue_size,
            message_count,
            thread_count,
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

    pub(crate) fn rebuild_thread_summaries(&self) -> Result<(), String> {
        let mut conn = self
            .conn
            .lock()
            .map_err(|_| "index lock poisoned".to_string())?;
        rebuild_threads_table(&mut conn)
    }
}
