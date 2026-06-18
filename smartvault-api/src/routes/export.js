const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { verifyToken } = require('../middleware/auth');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

function parseCsv(text) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return { headers: [], rows: [] };
  const rows = lines.map((line) => {
    const cols = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else { inQuotes = !inQuotes; }
      } else if (ch === ',' && !inQuotes) {
        cols.push(current.trim()); current = '';
      } else { current += ch; }
    }
    cols.push(current.trim());
    return cols.map((c) => c.replace(/^"(.*)"$/, '$1'));
  });
  const headers = (rows[0] || []).map((h) => h.replace(/^\uFEFF/, '').trim().toLowerCase());
  return { headers, rows: rows.slice(1) };
}

router.get('/audit-logs', verifyToken, async (req, res) => {
  if (req.user.role !== 'Admin') return res.status(403).json({ error: "Only Administrators can export system audit logs." });
  try {
    const companyId = req.query.companyId;
    const fyId = req.query.fyId;
    let query = `
      SELECT a.id, a.action_type, u.username, u.email, u.department, a.file_id, a.details, a.ip_address, a.created_at
      FROM audit_logs a
      LEFT JOIN users u ON a.user_id = u.id
    `;
    const values = [];
    if (companyId && fyId) {
      query += `
        LEFT JOIN vault_files f ON a.file_id = f.id
        LEFT JOIN vault_file_metadata m ON f.id = m.file_id
        WHERE (m.company_id = $1 AND m.fy_id = $2) OR a.file_id IS NULL
      `;
      values.push(companyId, fyId);
    }
    query += ` ORDER BY a.created_at DESC`;
    const { rows } = await pool.query(query, values);
    let csv = 'ID,Action,User,Email,Department,File ID,Details,IP Address,Timestamp\n';
    rows.forEach(row => {
      const details = (row.details || '').replace(/"/g, '""');
      csv += `${row.id},${row.action_type},${row.username || 'System'},${row.email || ''},${row.department || ''},${row.file_id || ''},"${details}",${row.ip_address || ''},${new Date(row.created_at).toISOString()}\n`;
    });
    res.header('Content-Type', 'text/csv');
    res.attachment('system_audit_logs.csv');
    return res.send(csv);
  } catch (err) { res.status(500).json({ error: "Failed to export audit logs" }); }
});

router.get('/activity-report/:dept', verifyToken, async (req, res) => {
  const { dept } = req.params;
  const { companyId, fyId } = req.query;
  if (req.user.role !== 'Admin' && req.user.department !== dept) return res.status(403).json({ error: "Access denied" });
  try {
    const { rows } = await pool.query(`
      SELECT a.id, a.action_type, u.username, f.original_name, f.size_bytes, a.details, a.created_at
      FROM audit_logs a JOIN vault_files f ON a.file_id = f.id JOIN vault_file_metadata m ON m.file_id = f.id JOIN users u ON a.user_id = u.id
      WHERE f.department = $1 ${companyId ? 'AND m.company_id = $2' : ''} ${fyId && companyId ? 'AND m.fy_id = $3' : ''}
      ORDER BY a.created_at DESC
    `, companyId && fyId ? [dept, companyId, fyId] : companyId ? [dept, companyId] : [dept]);
    let csv = 'ID,Action,User,File Name,Size (Bytes),Details,Timestamp\n';
    rows.forEach(row => {
      const details = (row.details || '').replace(/"/g, '""');
      const filename = (row.original_name || '').replace(/"/g, '""');
      csv += `${row.id},${row.action_type},${row.username},"${filename}",${row.size_bytes || 0},"${details}",${new Date(row.created_at).toISOString()}\n`;
    });
    res.header('Content-Type', 'text/csv');
    res.attachment(`activity_report_${dept}.csv`);
    return res.send(csv);
  } catch (err) { res.status(500).json({ error: "Failed to export activity report" }); }
});

// GET /user-aliases/export/files
router.get('/user-aliases/export/files', verifyToken, async (req, res) => {
  const { department, companyId, fyId } = req.query;
  try {
    const { rows } = await pool.query(`
      SELECT f.id, f.original_name, COALESCE(ufa.alias_name, '') as user_alias
      FROM vault_files f
      LEFT JOIN vault_file_metadata m ON m.file_id = f.id
      LEFT JOIN user_file_aliases ufa ON ufa.file_id = f.id AND ufa.user_id = $1
      WHERE f.department = $2 AND m.company_id = $3 AND m.fy_id = $4
    `, [req.user.id, department, companyId, fyId]);
    
    let csv = 'File ID,Original Name,My Name\n';
    rows.forEach(row => {
      const orig = (row.original_name || '').replace(/"/g, '""');
      const alias = (row.user_alias || '').replace(/"/g, '""');
      csv += `${row.id},"${orig}","${alias}"\n`;
    });
    
    res.header('Content-Type', 'text/csv');
    res.attachment(`my_file_names_${department}.csv`);
    return res.send(csv);
  } catch (err) { res.status(500).json({ error: "Failed to export file aliases" }); }
});

// GET /user-aliases/export/folders
router.get('/user-aliases/export/folders', verifyToken, async (req, res) => {
  const { department, companyId, fyId } = req.query;
  try {
    const deptRes = await pool.query(`SELECT id FROM company_departments WHERE name = $1 AND company_id = $2 AND fy_id = $3`, [department, companyId, fyId]);
    if (deptRes.rows.length === 0) return res.send('Folder ID,Folder Path,My Name\n');
    const deptId = deptRes.rows[0].id;
    
    const { rows } = await pool.query(`
      SELECT f.id, f.parent_folder_id, f.name, COALESCE(ufa.alias_name, '') as user_alias
      FROM company_department_folders f
      LEFT JOIN user_folder_aliases ufa ON ufa.folder_id = f.id AND ufa.user_id = $1
      WHERE f.department_id = $2
    `, [req.user.id, deptId]);
    
    const folderMap = new Map(rows.map(r => [r.id, r]));
    const getPath = (id) => {
      const f = folderMap.get(id);
      if (!f) return '';
      if (!f.parent_folder_id) return f.name;
      const parent = getPath(f.parent_folder_id);
      return parent ? `${parent}/${f.name}` : f.name;
    };

    let csv = 'Folder ID,Folder Path,My Name\n';
    rows.forEach(row => {
      const fullPath = getPath(row.id).replace(/"/g, '""');
      const alias = (row.user_alias || '').replace(/"/g, '""');
      csv += `${row.id},"${fullPath}","${alias}"\n`;
    });
    
    res.header('Content-Type', 'text/csv');
    res.attachment(`my_folder_names_${department}.csv`);
    return res.send(csv);
  } catch (err) { res.status(500).json({ error: "Failed to export folder aliases" }); }
});

// POST /user-aliases/import/files
router.post('/user-aliases/import/files', verifyToken, async (req, res) => {
  const changes = req.body.changes;
  if (!Array.isArray(changes)) return res.status(400).json({ error: "Invalid payload. Expected 'changes' array." });
  
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const { id, alias } of changes) {
        const fileId = parseInt(id, 10);
        if (isNaN(fileId)) continue;
        if (alias && alias.trim()) {
          await client.query(`
            INSERT INTO user_file_aliases (user_id, file_id, alias_name)
            VALUES ($1, $2, $3)
            ON CONFLICT (user_id, file_id) DO UPDATE SET alias_name = EXCLUDED.alias_name, updated_at = NOW()
          `, [req.user.id, fileId, alias.trim()]);
        } else {
          await client.query(`DELETE FROM user_file_aliases WHERE user_id = $1 AND file_id = $2`, [req.user.id, fileId]);
        }
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: "Import failed" }); }
});

// POST /user-aliases/import/folders
router.post('/user-aliases/import/folders', verifyToken, async (req, res) => {
  const changes = req.body.changes;
  if (!Array.isArray(changes)) return res.status(400).json({ error: "Invalid payload. Expected 'changes' array." });
  
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const { id, alias } of changes) {
        const folderId = parseInt(id, 10);
        if (isNaN(folderId)) continue;
        if (alias && alias.trim()) {
          await client.query(`
            INSERT INTO user_folder_aliases (user_id, folder_id, alias_name)
            VALUES ($1, $2, $3)
            ON CONFLICT (user_id, folder_id) DO UPDATE SET alias_name = EXCLUDED.alias_name, updated_at = NOW()
          `, [req.user.id, folderId, alias.trim()]);
        } else {
          await client.query(`DELETE FROM user_folder_aliases WHERE user_id = $1 AND folder_id = $2`, [req.user.id, folderId]);
        }
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: "Import failed" }); }
});

module.exports = router;
