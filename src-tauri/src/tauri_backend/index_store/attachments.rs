use super::*;

impl IndexStore {
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

    pub(crate) fn get_attachment_bytes(
        &self,
        params: AttachmentBytesParams,
    ) -> Result<Value, String> {
        let attachment_id = params.attachment_id.trim().to_string();
        let (mime, size_bytes, data_base64) = self.query_attachment_entry_by_id(&attachment_id)?;
        Ok(json!({
            "attachment_id": attachment_id,
            "mime": mime,
            "size_bytes": size_bytes.max(0),
            "data_base64": data_base64,
        }))
    }

    pub(crate) fn get_attachment_binary(
        &self,
        params: AttachmentBytesParams,
    ) -> Result<AttachmentBinary, String> {
        let attachment_id = params.attachment_id.trim();
        if attachment_id.is_empty() {
            return Err("attachment_id is required".to_string());
        }
        let (mime, size_bytes, data_base64) = self.query_attachment_entry_by_id(attachment_id)?;
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(data_base64.as_bytes())
            .map_err(|err| format!("decode attachment payload failed: {err}"))?;

        Ok(AttachmentBinary {
            mime,
            size_bytes: size_bytes.max(0),
            bytes,
        })
    }

    fn query_attachment_entry_by_id(
        &self,
        attachment_id: &str,
    ) -> Result<(Option<String>, i64, String), String> {
        let normalized_id = attachment_id.trim();
        if normalized_id.is_empty() {
            return Err("attachment_id is required".to_string());
        }
        let parsed_id = normalized_id
            .parse::<i64>()
            .map_err(|_| "attachment_id must be numeric".to_string())?;

        let conn = self
            .conn
            .lock()
            .map_err(|_| "index lock poisoned".to_string())?;
        let mut stmt = conn
            .prepare(
                "
                SELECT mime, size_bytes, inline_base64
                FROM attachments
                WHERE id = ?1
                LIMIT 1
                ",
            )
            .map_err(|err| format!("prepare attachment bytes query failed: {err}"))?;

        let entry = stmt
            .query_row(params![parsed_id], |row| {
                Ok((
                    row.get::<_, Option<String>>(0).ok().flatten(),
                    row.get::<_, i64>(1).unwrap_or(0),
                    row.get::<_, Option<String>>(2).ok().flatten(),
                ))
            })
            .optional()
            .map_err(|err| format!("read attachment bytes failed: {err}"))?;

        let Some((mime, size_bytes, data_base64)) = entry else {
            return Err("attachment not found".to_string());
        };
        let data_base64 =
            data_base64.ok_or_else(|| "attachment payload unavailable".to_string())?;
        Ok((mime, size_bytes, data_base64))
    }
}
