const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const fs = require('fs');
const { verifyToken } = require('../middleware/auth');
const env = require('../config/env');
const { logAction } = require('../services/auditService');
const {
  listBackups,
  createBackupSnapshot,
  getBackupPreview,
  restoreBackup,
  getLatestBackup,
} = require('../services/backupService');

async function ensureCompanyStructureSchema(db = pool) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS company_departments (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      fy_id INTEGER NOT NULL REFERENCES financial_years(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_company_departments_company_fy ON company_departments(company_id, fy_id);`);
  await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_company_departments_unique_name ON company_departments(company_id, fy_id, LOWER(name));`);

  await db.query(`
    CREATE TABLE IF NOT EXISTS company_department_folders (
      id SERIAL PRIMARY KEY,
      department_id INTEGER NOT NULL REFERENCES company_departments(id) ON DELETE CASCADE,
      parent_folder_id INTEGER REFERENCES company_department_folders(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  // Add parent_folder_id column if it doesn't exist (migration for existing installs)
  await db.query(`
    ALTER TABLE company_department_folders
    ADD COLUMN IF NOT EXISTS parent_folder_id INTEGER REFERENCES company_department_folders(id) ON DELETE CASCADE;
  `).catch(() => {});
  await db.query(`CREATE INDEX IF NOT EXISTS idx_company_department_folders_dept ON company_department_folders(department_id);`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_company_department_folders_parent ON company_department_folders(parent_folder_id);`);
}

// Build full path string for a folder by walking ancestors
async function getFolderFullPath(db, folderId) {
  const parts = [];
  let currentId = folderId;
  const visited = new Set();
  while (currentId) {
    if (visited.has(currentId)) break; // cycle guard
    visited.add(currentId);
    const r = await db.query(`SELECT id, name, parent_folder_id FROM company_department_folders WHERE id = $1`, [currentId]);
    if (r.rows.length === 0) break;
    parts.unshift(r.rows[0].name);
    currentId = r.rows[0].parent_folder_id;
  }
  return parts.join('/');
}

// Build a nested tree from flat folder rows
function buildFolderTree(rows, parentId = null) {
  return rows
    .filter(r => (r.parent_folder_id || null) === parentId)
    .map(r => ({
      id: r.id,
      name: r.name,
      parent_folder_id: r.parent_folder_id || null,
      children: buildFolderTree(rows, r.id)
    }));
}

function bad(res, msg) {
  return res.status(400).json({ error: msg });
}

router.get('/structure', verifyToken, async (req, res) => {
  if (req.user.role !== 'Admin') return res.status(403).json({ error: 'Admin only.' });
  const companyId = Number(req.query.companyId);
  const fyId = Number(req.query.fyId);
  if (!Number.isFinite(companyId) || !Number.isFinite(fyId)) return bad(res, 'companyId and fyId are required.');
  try {
    await ensureCompanyStructureSchema(pool);
    const deptRows = await pool.query(
      `SELECT id, name FROM company_departments
       WHERE company_id = $1 AND fy_id = $2
       ORDER BY LOWER(name) ASC`,
      [companyId, fyId]
    );
    const deptIds = deptRows.rows.map((d) => d.id);
    const folderRows = deptIds.length > 0
      ? await pool.query(
          `SELECT id, department_id, parent_folder_id, name FROM company_department_folders
           WHERE department_id = ANY($1::int[])
           ORDER BY LOWER(name) ASC`,
          [deptIds]
        ).catch(() => ({ rows: [] }))
      : { rows: [] };
    const byDept = new Map();
    for (const f of folderRows.rows) {
      if (!byDept.has(f.department_id)) byDept.set(f.department_id, []);
      byDept.get(f.department_id).push(f);
    }
    res.json({
      company_id: companyId,
      fy_id: fyId,
      departments: deptRows.rows.map((d) => ({
        id: d.id,
        name: d.name,
        // flat list of all folders (frontend builds tree)
        folders: (byDept.get(d.id) || []).map(f => ({ id: f.id, name: f.name, parent_folder_id: f.parent_folder_id || null })),
      })),
    });
  } catch (err) {
    res.status(500).json({ error: `Failed to load structure: ${err.message}` });
  }
});

router.post('/structure/departments', verifyToken, async (req, res) => {
  if (req.user.role !== 'Admin') return res.status(403).json({ error: 'Admin only.' });
  const companyId = Number(req.body.company_id);
  const fyId = Number(req.body.fy_id);
  const name = String(req.body.name || '').trim();
  if (!Number.isFinite(companyId) || !Number.isFinite(fyId) || !name) return bad(res, 'company_id, fy_id, and name are required.');
  try {
    await ensureCompanyStructureSchema(pool);
    const created = await pool.query(
      `INSERT INTO company_departments (company_id, fy_id, name)
       VALUES ($1, $2, $3)
       RETURNING id, name`,
      [companyId, fyId, name]
    );
    res.json({ success: true, department: created.rows[0] });
  } catch (err) {
    const msg = String(err.message || '');
    const status = msg.includes('unique') ? 409 : 500;
    res.status(status).json({ error: `Failed to create department: ${err.message}` });
  }
});

router.put('/structure/departments/:id', verifyToken, async (req, res) => {
  if (req.user.role !== 'Admin') return res.status(403).json({ error: 'Admin only.' });
  const deptId = Number(req.params.id);
  const name = String(req.body.name || '').trim();
  if (!Number.isFinite(deptId) || !name) return bad(res, 'name is required.');
  const client = await pool.connect();
  try {
    await ensureCompanyStructureSchema(client);
    await client.query('BEGIN');
    const deptRes = await client.query(
      `SELECT id, company_id, fy_id, name FROM company_departments WHERE id = $1 LIMIT 1`,
      [deptId]
    );
    if (deptRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Department not found.' });
    }
    const dept = deptRes.rows[0];
    const oldName = dept.name;

    await client.query(
      `UPDATE company_departments SET name = $1, updated_at = NOW() WHERE id = $2`,
      [name, deptId]
    );

    // Propagate rename to existing files (department stored as text).
    await client.query(
      `UPDATE vault_files f
       SET department = $1
       FROM vault_file_metadata m
       WHERE m.file_id = f.id
         AND m.company_id = $2
         AND m.fy_id = $3
         AND f.department = $4`,
      [name, dept.company_id, dept.fy_id, oldName]
    );

    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: `Failed to update department: ${err.message}` });
  } finally {
    client.release();
  }
});

router.delete('/structure/departments/:id', verifyToken, async (req, res) => {
  if (req.user.role !== 'Admin') return res.status(403).json({ error: 'Admin only.' });
  const deptId = Number(req.params.id);
  if (!Number.isFinite(deptId)) return bad(res, 'Invalid department id.');
  const client = await pool.connect();
  try {
    await ensureCompanyStructureSchema(client);
    await client.query('BEGIN');
    const deptRes = await client.query(
      `SELECT id, company_id, fy_id, name FROM company_departments WHERE id = $1 LIMIT 1`,
      [deptId]
    );
    if (deptRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Department not found.' });
    }
    const dept = deptRes.rows[0];
    const countRes = await client.query(
      `SELECT COUNT(*)::int AS n
       FROM vault_files f
       JOIN vault_file_metadata m ON m.file_id = f.id
       WHERE m.company_id = $1 AND m.fy_id = $2 AND f.department = $3`,
      [dept.company_id, dept.fy_id, dept.name]
    );
    if ((countRes.rows[0]?.n || 0) > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Cannot delete department: files exist in this department.' });
    }
    await client.query(`DELETE FROM company_departments WHERE id = $1`, [deptId]);
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: `Failed to delete department: ${err.message}` });
  } finally {
    client.release();
  }
});

router.post('/structure/departments/:id/folders', verifyToken, async (req, res) => {
  if (req.user.role !== 'Admin') return res.status(403).json({ error: 'Admin only.' });
  const deptId = Number(req.params.id);
  const name = String(req.body.name || '').trim();
  const parentFolderId = req.body.parent_folder_id ? Number(req.body.parent_folder_id) : null;
  if (!Number.isFinite(deptId) || !name) return bad(res, 'name is required.');
  try {
    await ensureCompanyStructureSchema(pool);
    const created = await pool.query(
      `INSERT INTO company_department_folders (department_id, parent_folder_id, name)
       VALUES ($1, $2, $3)
       RETURNING id, name, parent_folder_id`,
      [deptId, parentFolderId, name]
    );
    res.json({ success: true, folder: created.rows[0] });
  } catch (err) {
    const msg = String(err.message || '');
    if (msg.includes('unique')) {
      res.status(409).json({ error: 'A folder with this name already exists in this directory.' });
    } else {
      res.status(500).json({ error: `Failed to create folder: ${err.message}` });
    }
  }
});

// Create subfolder inside an existing folder
router.post('/structure/folders/:id/subfolders', verifyToken, async (req, res) => {
  if (req.user.role !== 'Admin') return res.status(403).json({ error: 'Admin only.' });
  const parentFolderId = Number(req.params.id);
  const name = String(req.body.name || '').trim();
  if (!Number.isFinite(parentFolderId) || !name) return bad(res, 'name is required.');
  try {
    await ensureCompanyStructureSchema(pool);
    // Get parent folder to inherit department_id
    const parentRes = await pool.query(
      `SELECT id, department_id FROM company_department_folders WHERE id = $1 LIMIT 1`,
      [parentFolderId]
    );
    if (parentRes.rows.length === 0) return res.status(404).json({ error: 'Parent folder not found.' });
    const deptId = parentRes.rows[0].department_id;
    const created = await pool.query(
      `INSERT INTO company_department_folders (department_id, parent_folder_id, name)
       VALUES ($1, $2, $3)
       RETURNING id, name, parent_folder_id`,
      [deptId, parentFolderId, name]
    );
    res.json({ success: true, folder: created.rows[0] });
  } catch (err) {
    const msg = String(err.message || '');
    if (msg.includes('unique')) {
      res.status(409).json({ error: 'A folder with this name already exists in this directory.' });
    } else {
      res.status(500).json({ error: `Failed to create subfolder: ${err.message}` });
    }
  }
});

router.put('/structure/folders/:id', verifyToken, async (req, res) => {
  if (req.user.role !== 'Admin') return res.status(403).json({ error: 'Admin only.' });
  const folderId = Number(req.params.id);
  const name = String(req.body.name || '').trim();
  if (!Number.isFinite(folderId) || !name) return bad(res, 'name is required.');
  const client = await pool.connect();
  try {
    await ensureCompanyStructureSchema(client);
    await client.query('BEGIN');
    const fRes = await client.query(
      `SELECT f.id, f.department_id, f.name, f.parent_folder_id, d.company_id, d.fy_id, d.name AS dept_name
       FROM company_department_folders f
       JOIN company_departments d ON d.id = f.department_id
       WHERE f.id = $1
       LIMIT 1`,
      [folderId]
    );
    if (fRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Folder not found.' });
    }
    const row = fRes.rows[0];
    // Compute old full path before rename
    const oldFullPath = await getFolderFullPath(client, folderId);

    await client.query(
      `UPDATE company_department_folders SET name = $1, updated_at = NOW() WHERE id = $2`,
      [name, folderId]
    );

    // Compute new full path after rename
    const newFullPath = await getFolderFullPath(client, folderId);

    // Propagate rename to files: update exact match and path-prefixed subpaths
    await client.query(
      `UPDATE vault_files f
       SET folder = $1
       FROM vault_file_metadata m
       WHERE m.file_id = f.id
         AND m.company_id = $2
         AND m.fy_id = $3
         AND f.department = $4
         AND COALESCE(f.folder, '') = $5`,
      [newFullPath, row.company_id, row.fy_id, row.dept_name, oldFullPath]
    );
    // Also update files in subfolders (path starts with oldFullPath/)
    await client.query(
      `UPDATE vault_files f
       SET folder = $1 || SUBSTRING(COALESCE(f.folder, ''), LENGTH($5) + 1)
       FROM vault_file_metadata m
       WHERE m.file_id = f.id
         AND m.company_id = $2
         AND m.fy_id = $3
         AND f.department = $4
         AND COALESCE(f.folder, '') LIKE $5 || '/%'`,
      [newFullPath, row.company_id, row.fy_id, row.dept_name, oldFullPath]
    );

    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: `Failed to update folder: ${err.message}` });
  } finally {
    client.release();
  }
});

router.delete('/structure/folders/:id', verifyToken, async (req, res) => {
  if (req.user.role !== 'Admin') return res.status(403).json({ error: 'Admin only.' });
  const folderId = Number(req.params.id);
  if (!Number.isFinite(folderId)) return bad(res, 'Invalid folder id.');
  const client = await pool.connect();
  try {
    await ensureCompanyStructureSchema(client);
    await client.query('BEGIN');
    const fRes = await client.query(
      `SELECT f.id, f.name, f.parent_folder_id, d.company_id, d.fy_id, d.name AS dept_name
       FROM company_department_folders f
       JOIN company_departments d ON d.id = f.department_id
       WHERE f.id = $1
       LIMIT 1`,
      [folderId]
    );
    if (fRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Folder not found.' });
    }
    const row = fRes.rows[0];
    const fullPath = await getFolderFullPath(client, folderId);
    // Check for files in this folder or any sub-folder (path starts with fullPath)
    const countRes = await client.query(
      `SELECT COUNT(*)::int AS n
       FROM vault_files f
       JOIN vault_file_metadata m ON m.file_id = f.id
       WHERE m.company_id = $1 AND m.fy_id = $2 AND f.department = $3
         AND (COALESCE(f.folder, '') = $4 OR COALESCE(f.folder, '') LIKE $4 || '/%')`,
      [row.company_id, row.fy_id, row.dept_name, fullPath]
    );
    if ((countRes.rows[0]?.n || 0) > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Cannot delete folder: files exist in this folder or its subfolders.' });
    }
    // Cascade delete will remove child folders via ON DELETE CASCADE
    await client.query(`DELETE FROM company_department_folders WHERE id = $1`, [folderId]);
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: `Failed to delete folder: ${err.message}` });
  } finally {
    client.release();
  }
});

function parseStoragePathMap() {
  const raw = String(process.env.STORAGE_PATH_MAP || '').trim();
  if (!raw) {
    return [
      { label: 'OS Root', path: '/' },
      { label: 'App', path: '/opt/smartvault' },
      { label: 'PostgreSQL', path: '/var/lib/postgresql' },
      { label: 'Elasticsearch', path: '/var/lib/elasticsearch' },
      { label: 'Redis', path: '/var/lib/redis' },
      { label: 'NGINX', path: '/etc/nginx' },
      { label: 'MinIO Data', path: process.env.MINIO_DATA_PATH || '/mnt/storage/minio' },
      { label: 'Media Primary', path: env.EXTERNAL_DRIVE_PATH },
      { label: 'Backup', path: env.BACKUP.path },
    ];
  }
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const idx = item.indexOf(':');
      if (idx <= 0) return null;
      const label = item.slice(0, idx).trim();
      const p = item.slice(idx + 1).trim();
      if (!label || !p) return null;
      return { label, path: p };
    })
    .filter(Boolean);
}

async function readStorageDevices() {
  const map = parseStoragePathMap();
  const devices = [];
  for (const entry of map) {
    try {
      const st = await fs.promises.statfs(entry.path);
      const total = Number(st.blocks || 0) * Number(st.bsize || 0);
      const free = Number(st.bavail || 0) * Number(st.bsize || 0);
      const used = Math.max(0, total - free);
      const usedPct = total > 0 ? Number(((used / total) * 100).toFixed(1)) : 0;
      devices.push({
        label: entry.label,
        path: entry.path,
        total_bytes: total,
        used_bytes: used,
        free_bytes: free,
        used_percent: usedPct,
      });
    } catch {
      devices.push({
        label: entry.label,
        path: entry.path,
        total_bytes: 0,
        used_bytes: 0,
        free_bytes: 0,
        used_percent: null,
        unavailable: true,
      });
    }
  }
  return devices;
}

router.get('/duplicates', verifyToken, async (req, res) => {
  if (req.user.role !== 'Admin') return res.status(403).json({ error: 'Only Administrators can access the duplicate report.' });
  try {
    const query = `
      SELECT f1.file_hash, COUNT(f1.id) as duplicate_count, SUM(f1.size_bytes) - MAX(f1.size_bytes) as total_size_wasted,
      json_agg(json_build_object('id', f1.id, 'original_name', f1.original_name, 'department', f1.department, 'folder', f1.folder, 'size_bytes', f1.size_bytes, 'upload_date', f1.upload_date, 'uploader_name', u.username)) as files
      FROM vault_files f1 LEFT JOIN users u ON f1.uploaded_by = u.id GROUP BY f1.file_hash HAVING COUNT(f1.id) > 1 ORDER BY total_size_wasted DESC;
    `;
    const { rows } = await pool.query(query);
    res.json(rows);
  } catch (error) { res.status(500).json({ error: 'Failed to fetch duplicate report' }); }
});

router.get('/dashboard', verifyToken, async (req, res) => {
  if (req.user.role !== 'Admin') return res.status(403).json({ error: 'Only Administrators can access the admin dashboard.' });

  const { companyId, fyId } = req.query;
  const hasFilter = companyId && fyId;

  try {
    // System health: always global (server-level metrics)
    const storageOverview = await pool.query(`SELECT COUNT(*) as total_files, SUM(size_bytes) as total_size, SUM(CASE WHEN minio_filename LIKE 'local:%' THEN size_bytes ELSE 0 END) as local_size, SUM(CASE WHEN minio_filename NOT LIKE 'local:%' THEN size_bytes ELSE 0 END) as minio_size FROM vault_files`);
    const duplicateSummary = await pool.query(`SELECT COUNT(*) as duplicate_pairs, SUM(wasted_size) as total_size_wasted FROM (SELECT SUM(size_bytes) - MAX(size_bytes) as wasted_size FROM vault_files GROUP BY file_hash HAVING COUNT(id) > 1) sub`);
    const storageDevices = await readStorageDevices();

    // Audit logs: filtered by company+FY if provided
    let auditLogs;
    if (hasFilter) {
      auditLogs = await pool.query(`
        SELECT DISTINCT ON (a.id) a.*, u.username
        FROM audit_logs a
        LEFT JOIN users u ON a.user_id = u.id
        LEFT JOIN vault_files f ON a.file_id = f.id
        LEFT JOIN vault_file_metadata m ON m.file_id = f.id
        WHERE (m.company_id = $1 AND m.fy_id = $2) OR a.file_id IS NULL
        ORDER BY a.id, a.created_at DESC
        LIMIT 10
      `, [companyId, fyId]);
    } else {
      auditLogs = await pool.query(`SELECT a.*, u.username FROM audit_logs a LEFT JOIN users u ON a.user_id = u.id ORDER BY a.created_at DESC LIMIT 10`);
    }

    // Company + FY overview: always global, but highlight the selected one
    const companyFyOverview = await pool.query(`SELECT c.id as company_id, c.name as company_name, fy.id as fy_id, fy.name as fy_name, COUNT(f.id) as total_files, SUM(f.size_bytes) as total_size FROM vault_file_metadata m JOIN companies c ON m.company_id = c.id JOIN financial_years fy ON m.fy_id = fy.id JOIN vault_files f ON m.file_id = f.id GROUP BY c.id, c.name, fy.id, fy.name ORDER BY c.name, fy.name DESC`);

    // Department overview: filtered by company+FY if provided
    let deptOverview;
    if (hasFilter) {
      deptOverview = await pool.query(`
        SELECT f.department, COUNT(f.id) as total_files, SUM(f.size_bytes) as total_size
        FROM vault_files f
        JOIN vault_file_metadata m ON m.file_id = f.id
        WHERE m.company_id = $1 AND m.fy_id = $2
        GROUP BY f.department ORDER BY total_size DESC NULLS LAST
      `, [companyId, fyId]);
    } else {
      deptOverview = await pool.query(`SELECT department, COUNT(id) as total_files, SUM(size_bytes) as total_size FROM vault_files GROUP BY department ORDER BY total_size DESC NULLS LAST`);
    }

    const activeUsers = await pool.query(`SELECT id, username, role, department FROM users WHERE status = 'Active' ORDER BY username ASC`);

    const latestBackup = await getLatestBackup().catch(() => null);

    let companyStorage = null;
    if (companyId) {
      const companySizeResult = await pool.query(
        `SELECT COALESCE(SUM(f.size_bytes), 0) AS total_size
         FROM vault_files f
         JOIN vault_file_metadata m ON m.file_id = f.id
         WHERE m.company_id = $1 ${fyId ? 'AND m.fy_id = $2' : ''}`,
        fyId ? [companyId, fyId] : [companyId]
      );
      const companyMeta = await pool.query(
        `SELECT id, name, storage_quota_gb
         FROM companies
         WHERE id = $1
         LIMIT 1`,
        [companyId]
      );
      if (companyMeta.rows.length > 0) {
        const quotaGb = Number(companyMeta.rows[0].storage_quota_gb || 0);
        const usedBytes = Number(companySizeResult.rows[0]?.total_size || 0);
        const quotaBytes = quotaGb > 0 ? quotaGb * 1024 * 1024 * 1024 : 0;
        companyStorage = {
          company_id: Number(companyMeta.rows[0].id),
          company_name: companyMeta.rows[0].name,
          quota_gb: quotaGb,
          used_bytes: usedBytes,
          usage_percent: quotaBytes > 0 ? Number(((usedBytes / quotaBytes) * 100).toFixed(1)) : null,
          scoped_to_fy: Boolean(fyId),
        };
      }
    }

    const primaryDriveUsage =
      storageDevices.find((d) => d.path === env.EXTERNAL_DRIVE_PATH && d.used_percent !== null)?.used_percent ??
      storageDevices.find((d) => d.used_percent !== null)?.used_percent ??
      0;
    res.json({
      system_health: {
        server_storage: { total_files: parseInt(storageOverview.rows[0]?.total_files) || 0, total_size: parseInt(storageOverview.rows[0]?.total_size) || 0, local_size: parseInt(storageOverview.rows[0]?.local_size) || 0, minio_size: parseInt(storageOverview.rows[0]?.minio_size) || 0 },
        drive_usage: `${primaryDriveUsage}%`,
        storage_devices: storageDevices,
        company_storage: companyStorage,
        last_backup_time: latestBackup?.created_at || null,
        status: "Healthy"
      },
      active_users: activeUsers.rows,
      departments: deptOverview.rows.map(r => ({ department: r.department, total_files: parseInt(r.total_files) || 0, total_size: parseInt(r.total_size) || 0 })),
      duplicates: { pairs: parseInt(duplicateSummary.rows[0]?.duplicate_pairs) || 0, wasted_size: parseInt(duplicateSummary.rows[0]?.total_size_wasted) || 0 },
      recent_audit: auditLogs.rows,
      company_fy_overview: companyFyOverview.rows.map(r => ({ ...r, total_files: parseInt(r.total_files)||0, total_size: parseInt(r.total_size)||0 }))
    });
  } catch (error) { console.error(error); res.status(500).json({ error: 'Failed to fetch admin dashboard data' }); }
});

router.post('/users/:id/logout', verifyToken, async (req, res) => {
  if (req.user.role !== 'Admin') return res.status(403).json({ error: 'Admin only.' });
  try {
    await pool.query('UPDATE users SET token_version = token_version + 1 WHERE id = $1', [req.params.id]);
    res.json({ success: true, message: 'User logged out successfully.' });
  } catch (err) { res.status(500).json({ error: 'Failed to logout user' }); }
});

router.post('/users/:id/status', verifyToken, async (req, res) => {
  if (req.user.role !== 'Admin') return res.status(403).json({ error: 'Admin only.' });
  try {
    const { status } = req.body;
    if (!['Active', 'Suspended'].includes(status)) return res.status(400).json({ error: 'Invalid status.' });
    await pool.query('UPDATE users SET status = $1 WHERE id = $2', [status, req.params.id]);
    res.json({ success: true, message: `User status updated to ${status}.` });
  } catch (err) { res.status(500).json({ error: 'Failed to update user status' }); }
});

router.get('/backups', verifyToken, async (req, res) => {
  if (req.user.role !== 'Admin') return res.status(403).json({ error: 'Admin only.' });
  try {
    const backups = await listBackups();
    res.json(backups);
  } catch (err) {
    const code = String(err?.code || '');
    if (code === 'STORAGE_UNAVAILABLE') {
      return res.status(503).json({ error: err.message });
    }
    res.status(500).json({ error: 'Failed to fetch backups.' });
  }
});

router.get('/backups/config', verifyToken, async (req, res) => {
  if (req.user.role !== 'Admin') return res.status(403).json({ error: 'Admin only.' });
  res.json({
    backup_storage_path: env.BACKUP.path,
    backup_cron: env.BACKUP.cron,
    backup_retention_days: env.BACKUP.retentionDays,
  });
});

router.post('/backups', verifyToken, async (req, res) => {
  if (req.user.role !== 'Admin') return res.status(403).json({ error: 'Admin only.' });
  try {
    const snapshot = await createBackupSnapshot(pool, { userId: req.user.id, reason: 'manual' });
    await logAction(req.user.id, 'BACKUP_CREATE', null, `Created backup ${snapshot.backup_id}`, req.ip);
    res.json({ success: true, backup: snapshot });
  } catch (err) {
    console.error('Manual backup failed:', err.message);
    const code = String(err?.code || '');
    if (code === 'STORAGE_UNAVAILABLE') {
      return res.status(503).json({ error: err.message });
    }
    res.status(500).json({ error: 'Failed to create backup.' });
  }
});

router.get('/backups/:backupId/preview', verifyToken, async (req, res) => {
  if (req.user.role !== 'Admin') return res.status(403).json({ error: 'Admin only.' });
  try {
    const preview = await getBackupPreview(pool, req.params.backupId);
    res.json(preview);
  } catch (err) {
    const status = String(err.message || '').includes('Invalid backup id') ? 400 : 500;
    res.status(status).json({ error: 'Failed to preview backup.' });
  }
});

router.post('/backups/:backupId/restore', verifyToken, async (req, res) => {
  if (req.user.role !== 'Admin') return res.status(403).json({ error: 'Admin only.' });
  try {
    const restored = await restoreBackup(pool, req.params.backupId);
    await logAction(req.user.id, 'BACKUP_RESTORE', null, `Restored backup ${req.params.backupId}`, req.ip);
    res.json({ success: true, restore: restored });
  } catch (err) {
    console.error('Backup restore failed:', err.message);
    const status = String(err.message || '').includes('Invalid backup id') ? 400 : 500;
    const code = String(err?.code || '');
    if (code === 'STORAGE_UNAVAILABLE') {
      return res.status(503).json({ error: err.message });
    }
    res.status(status).json({ error: `Failed to restore backup: ${err.message}` });
  }
});

module.exports = router;
