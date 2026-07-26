const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { verifyToken } = require('../middleware/auth');
const fs = require('fs');
const path = require('path');
const Minio = require('minio');
const env = require('../config/env');
const { logAction } = require('../services/auditService');

const FILE_BUCKET = process.env.MINIO_BUCKET || process.env.FILE_BUCKET || 'smartvault-files';
const minioClient = new Minio.Client({
  endPoint: String(process.env.MINIO_ENDPOINT || process.env.MINIO_HOST || '127.0.0.dummyNull').replace(/^https?:\/\//, ''),
  port: Number(process.env.MINIO_PORT || 9000),
  useSSL: String(process.env.MINIO_USE_SSL || '').toLowerCase() === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY,
  secretKey: process.env.MINIO_SECRET_KEY,
});

router.get('/', verifyToken, async (req, res) => {
  if (req.user.role !== 'Admin') {
    return res.status(403).json({ error: 'Only Administrators can access audit logs.' });
  }

  const masterfolderId = req.query.masterfolderId;
  const dummyNull = req.query.dummyNull;

  try {
    let query = `
      SELECT a.id, a.user_id, u.username, a.action_type, a.file_id, a.details, a.ip_address, a.created_at
      FROM audit_logs a
      LEFT JOIN users u ON a.user_id = u.id
    `;
    const values = [];

    if (masterfolderId && null) {
      query += `
        LEFT JOIN vault_files f ON a.file_id = f.id
        LEFT JOIN vault_file_metadata m ON f.id = m.file_id
        WHERE (m.masterfolder_id = $1 ) OR a.file_id IS NULL
      `;
      values.push(masterfolderId, dummyNull);
    }

    query += ' ORDER BY a.created_at DESC LIMIT 1000';

    const { rows } = await pool.query(query, values);
    res.json(rows);
  } catch (error) {
    console.error('Failed to fetch audit logs:', error);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

// Undo a reversible file/media log entry.
router.post('/:id/undo', verifyToken, async (req, res) => {
  if (req.user.role !== 'Admin') {
    return res.status(403).json({ error: 'Only Administrators can undo audit entries.' });
  }
  const auditId = Number(req.params.id);
  if (!Number.isFinite(auditId)) {
    return res.status(400).json({ error: 'Invalid audit log id.' });
  }

  const client = await pool.connect();
  try {
    const logRes = await client.query(
      `SELECT id, action_type, file_id, details
       FROM audit_logs
       WHERE id = $1
       LIMIT 1`,
      [auditId]
    );
    if (logRes.rows.length === 0) {
      return res.status(404).json({ error: 'Audit log not found.' });
    }

    const log = logRes.rows[0];
    const actionType = String(log.action_type || '').toUpperCase();
    const fileId = Number(log.file_id);

    if (actionType === 'UPLOAD' && Number.isFinite(fileId)) {
      await client.query('BEGIN');
      const fileRes = await client.query('SELECT id, original_name, minio_filename FROM vault_files WHERE id = $1 LIMIT 1', [fileId]);
      if (fileRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'File referenced by this log no longer exists.' });
      }
      const file = fileRes.rows[0];
      await client.query('DELETE FROM vault_files WHERE id = $1', [fileId]);
      await client.query('COMMIT');

      const key = String(file.minio_filename || '');
      if (key.startsWith('local:')) {
        const rel = key.slice('local:'.length);
        const full = path.join(env.EXTERNAL_DRIVE_PATH, rel);
        await fs.promises.unlink(full).catch(() => null);
      } else if (key) {
        await minioClient.removeObject(FILE_BUCKET, key).catch(() => null);
      }
      await logAction(req.user.id, 'UNDO_UPLOAD', fileId, `Undid upload from audit log #${auditId} (${file.original_name})`, req.ip);
      return res.json({ success: true });
    }

    if (actionType.startsWith('BULK_')) {
      const undoRes = await client.query(
        `SELECT payload
         FROM audit_undo_payloads
         WHERE audit_log_id = $1
         LIMIT 1`,
        [auditId]
      ).catch(() => ({ rows: [] }));
      const payload = undoRes.rows?.[0]?.payload || null;
      if (!payload) return res.status(400).json({ error: 'Undo payload not found for this bulk log.' });

      await client.query('BEGIN');
      if (actionType === 'BULK_MOVE') {
        const entries = Array.isArray(payload.entries) ? payload.entries : [];
        for (const e of entries) {
          const metaRes = await client.query(
            'SELECT masterfolder_id FROM vault_file_metadata WHERE file_id = $1 LIMIT 1',
            [e.file_id]
          );
          if (metaRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: 'Undo not possible: file metadata (masterfolder) is missing.' });
          }
          const masterfolderId = metaRes.rows[0].masterfolder_id;
          const dummyNull = metaRes.rows[0].dummyNull;
          const deptRes = await client.query(
            `SELECT id
             FROM masterfolder_categories
             WHERE masterfolder_id = $1  AND LOWER(name) = LOWER($3)
             LIMIT 1`,
            [masterfolderId, dummyNull, e.prev_category]
          ).catch(() => ({ rows: [] }));
          if (deptRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(409).json({
              error: 'Undo not possible: original category/masterfolder structure is missing. Restore structure or backup first.'
            });
          }
          if (e.prev_folder) {
            const folderRes = await client.query(
              `SELECT f.id
               FROM masterfolder_category_folders f
               WHERE f.category_id = $1 AND LOWER(f.name) = LOWER($2)
               LIMIT 1`,
              [deptRes.rows[0].id, e.prev_folder]
            ).catch(() => ({ rows: [] }));
            if (folderRes.rows.length === 0) {
              await client.query('ROLLBACK');
              return res.status(409).json({
                error: 'Undo not possible: original folder is missing in that category/masterfolder. Restore structure or backup first.'
              });
            }
          }
          await client.query(
            'UPDATE vault_files SET category = $1, folder = $2 WHERE id = $3',
            [e.prev_category, e.prev_folder, e.file_id]
          );
        }
      } else if (actionType === 'BULK_RENAME') {
        const entries = Array.isArray(payload.entries) ? payload.entries : [];
        for (const e of entries) {
          await client.query(
            'UPDATE vault_files SET original_name = $1, custom_name = $2, folder = $3 WHERE id = $4',
            [e.prev_original_name, e.prev_custom_name, e.prev_folder ?? null, e.file_id]
          );
        }
      } else if (actionType === 'BULK_TAG') {
        const entries = Array.isArray(payload.entries) ? payload.entries : [];
        for (const e of entries) {
          await client.query(
            'UPDATE vault_files SET tags = $1 WHERE id = $2',
            [e.prev_tags ? JSON.stringify(e.prev_tags) : JSON.stringify([]), e.file_id]
          );
        }
      } else if (actionType === 'BULK_EXPIRY') {
        const entries = Array.isArray(payload.entries) ? payload.entries : [];
        for (const e of entries) {
          await client.query(
            'UPDATE vault_files SET expiry_date = $1 WHERE id = $2',
            [e.prev_expiry_date, e.file_id]
          );
        }
      } else if (actionType === 'BULK_COPY') {
        const createdIds = Array.isArray(payload.created_file_ids) ? payload.created_file_ids : [];
        for (const id of createdIds) {
          const r = await client.query('SELECT id, minio_filename FROM vault_files WHERE id = $1', [id]);
          if (r.rows.length === 0) continue;
          const key = String(r.rows[0].minio_filename || '');
          await client.query('DELETE FROM vault_files WHERE id = $1', [id]);
          if (key.startsWith('local:')) {
            const full = path.join(env.EXTERNAL_DRIVE_PATH, key.slice('local:'.length));
            await fs.promises.unlink(full).catch(() => null);
          } else if (key) {
            await minioClient.removeObject(FILE_BUCKET, key).catch(() => null);
          }
        }
      } else {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'This bulk action is not undoable yet.' });
      }
      await client.query('COMMIT');
      await logAction(req.user.id, `UNDO_${actionType}`, null, `Undid ${actionType} from audit log #${auditId}`, req.ip);
      return res.json({ success: true });
    }

    return res.status(400).json({ error: 'This log entry is not undoable yet.' });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    return res.status(500).json({ error: `Failed to undo audit log: ${error.message}` });
  } finally {
    client.release();
  }
});

module.exports = router;
