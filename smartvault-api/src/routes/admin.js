const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const fs = require('fs');
const { verifyToken } = require('../middleware/auth');
const env = require('../config/env');
const { logAction } = require('../services/auditService');
const backupTracker = require('../services/backupTracker');
const {
  listBackups,
  createBackupSnapshot,
  getBackupPreview,
  restoreBackup,
  getLatestBackup,
} = require('../services/backupService');

async function ensuremasterfolderStructureSchema(db = pool) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS masterfolder_categories (
      id SERIAL PRIMARY KEY,
      masterfolder_id INTEGER NOT NULL REFERENCES masterfolders(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_masterfolder_categories_company_fy ON masterfolder_categories(masterfolder_id);`);
  await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_masterfolder_categories_unique_name ON masterfolder_categories(masterfolder_id, LOWER(name));`);

  await db.query(`
    CREATE TABLE IF NOT EXISTS masterfolder_category_folders (
      id SERIAL PRIMARY KEY,
      category_id INTEGER NOT NULL REFERENCES masterfolder_categories(id) ON DELETE CASCADE,
      parent_folder_id INTEGER REFERENCES masterfolder_category_folders(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  
  await db.query(`
    CREATE TABLE IF NOT EXISTS starred_folders (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      folder_id INTEGER NOT NULL REFERENCES masterfolder_category_folders(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, folder_id)
    );
  `);

  // Add parent_folder_id column if it doesn't exist (migration for existing installs)
  await db.query(`
    ALTER TABLE masterfolder_category_folders
    ADD COLUMN IF NOT EXISTS parent_folder_id INTEGER REFERENCES masterfolder_category_folders(id) ON DELETE CASCADE;
  `).catch(() => {});
  await db.query(`CREATE INDEX IF NOT EXISTS idx_masterfolder_category_folders_dept ON masterfolder_category_folders(category_id);`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_masterfolder_category_folders_parent ON masterfolder_category_folders(parent_folder_id);`);
}

// Build full path string for a folder by walking ancestors
async function getFolderFullPath(db, folderId) {
  const parts = [];
  let currentId = folderId;
  const visited = new Set();
  while (currentId) {
    if (visited.has(currentId)) break; // cycle guard
    visited.add(currentId);
    const r = await db.query(`SELECT id, name, parent_folder_id FROM masterfolder_category_folders WHERE id = $1`, [currentId]);
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
  if (req.user.role !== 'Admin' && !req.user.can_manage_structure) return res.status(403).json({ error: 'Permission denied.' });
  const masterfolderId = Number(req.query.masterfolderId);
    if (!Number.isFinite(masterfolderId) ) return bad(res, 'masterfolderId is required.');
  try {
    await ensuremasterfolderStructureSchema(pool);
    const deptRows = await pool.query(
      `SELECT id, name FROM masterfolder_categories
       WHERE masterfolder_id = $1 
       ORDER BY LOWER(name) ASC`,
      [masterfolderId]
    );
    const categoryIds = deptRows.rows.map((d) => d.id);
    const folderRows = categoryIds.length > 0
      ? await pool.query(
          `SELECT f.id, f.category_id, f.parent_folder_id, f.name, (s.id IS NOT NULL) as starred 
           FROM masterfolder_category_folders f
           LEFT JOIN starred_folders s ON s.folder_id = f.id AND s.user_id = $2
           WHERE f.category_id = ANY($1::int[])
           ORDER BY LOWER(f.name) ASC`,
          [categoryIds, req.user.id]
        ).catch(() => ({ rows: [] }))
      : { rows: [] };
    const byDept = new Map();
    for (const f of folderRows.rows) {
      if (!byDept.has(f.category_id)) byDept.set(f.category_id, []);
      byDept.get(f.category_id).push(f);
    }
    res.json({
      masterfolder_id: masterfolderId,
      categories: deptRows.rows.map((d) => ({
        id: d.id,
        name: d.name,
        // flat list of all folders (frontend builds tree)
        folders: (byDept.get(d.id) || []).map(f => ({ 
          id: f.id, 
          name: f.name, 
          parent_folder_id: f.parent_folder_id || null,
          starred: !!f.starred
        })),
      })),
    });
  } catch (err) {
    res.status(500).json({ error: `Failed to load structure: ${err.message}` });
  }
});

router.get('/folders', verifyToken, async (req, res) => {
  if (req.user.role !== 'Admin' && !req.user.can_manage_structure) return res.status(403).json({ error: 'Permission denied.' });
  const masterfolderId = Number(req.query.masterfolderId);
  const categoryName = String(req.query.category || '').trim();
  if (!Number.isFinite(masterfolderId) || !categoryName) return bad(res, 'masterfolderId and category are required.');
  try {
    const deptRes = await pool.query(
      `SELECT id FROM masterfolder_categories WHERE masterfolder_id = $1 AND LOWER(name) = LOWER($2) LIMIT 1`,
      [masterfolderId, categoryName]
    );
    if (deptRes.rows.length === 0) return res.json([]);
    const categoryId = deptRes.rows[0].id;
    const folderRows = await pool.query(
      `SELECT id FROM masterfolder_category_folders WHERE category_id = $1`,
      [categoryId]
    );
    const paths = await Promise.all(folderRows.rows.map(r => getFolderFullPath(pool, r.id)));
    paths.sort((a, b) => a.localeCompare(b));
    res.json(paths);
  } catch (err) {
    res.status(500).json({ error: `Failed to load folders: ${err.message}` });
  }
});

router.post('/structure/categories', verifyToken, async (req, res) => {
  if (req.user.role !== 'Admin' && !req.user.can_manage_structure) return res.status(403).json({ error: 'Permission denied.' });
  const masterfolderId = Number(req.body.masterfolder_id);
    const name = String(req.body.name || '').trim();
  if (!Number.isFinite(masterfolderId)  || !name) return bad(res, 'masterfolder_id, and name are required.');
  try {
    await ensuremasterfolderStructureSchema(pool);
    const created = await pool.query(
      `INSERT INTO masterfolder_categories (masterfolder_id, name)
       VALUES ($1, $2)
       RETURNING id, name`,
      [masterfolderId, name]
    );
    res.json({ success: true, category: created.rows[0] });
  } catch (err) {
    const msg = String(err.message || '');
    const status = msg.includes('unique') ? 409 : 500;
    res.status(status).json({ error: `Failed to create category: ${err.message}` });
  }
});

router.put('/structure/categories/:id', verifyToken, async (req, res) => {
  if (req.user.role !== 'Admin' && !req.user.can_manage_structure) return res.status(403).json({ error: 'Permission denied.' });
  const categoryId = Number(req.params.id);
  const name = String(req.body.name || '').trim();
  if (!Number.isFinite(categoryId) || !name) return bad(res, 'name is required.');
  const client = await pool.connect();
  try {
    await ensuremasterfolderStructureSchema(client);
    await client.query('BEGIN');
    const deptRes = await client.query(
      `SELECT id, masterfolder_id, name FROM masterfolder_categories WHERE id = $1 LIMIT 1`,
      [categoryId]
    );
    if (deptRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Category not found.' });
    }
    const category = deptRes.rows[0];
    const oldName = category.name;

    await client.query(
      `UPDATE masterfolder_categories SET name = $1, updated_at = NOW() WHERE id = $2`,
      [name, categoryId]
    );

    // Propagate rename to existing files (category stored as text).
    await client.query(
      `UPDATE vault_files f
       SET category = $1
       FROM vault_file_metadata m
       WHERE m.file_id = f.id
         AND m.masterfolder_id = $2
         AND f.category = $3`,
      [name, category.masterfolder_id, oldName]
    );

    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: `Failed to update category: ${err.message}` });
  } finally {
    client.release();
  }
});

router.delete('/structure/categories/:id', verifyToken, async (req, res) => {
  if (req.user.role !== 'Admin') return res.status(403).json({ error: 'Admin only.' });
  const categoryId = Number(req.params.id);
  if (!Number.isFinite(categoryId)) return bad(res, 'Invalid category id.');
  const client = await pool.connect();
  try {
    await ensuremasterfolderStructureSchema(client);
    await client.query('BEGIN');
    const deptRes = await client.query(
      `SELECT id, masterfolder_id, name FROM masterfolder_categories WHERE id = $1 LIMIT 1`,
      [categoryId]
    );
    if (deptRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Category not found.' });
    }
    const category = deptRes.rows[0];
    const countRes = await client.query(
      `SELECT COUNT(*)::int AS n
       FROM vault_files f
       JOIN vault_file_metadata m ON m.file_id = f.id
       WHERE m.masterfolder_id = $1 AND f.category = $2`,
      [category.masterfolder_id, category.name]
    );
    if ((countRes.rows[0]?.n || 0) > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Cannot delete category: files exist in this category.' });
    }
    await client.query(`DELETE FROM masterfolder_categories WHERE id = $1`, [categoryId]);
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: `Failed to delete category: ${err.message}` });
  } finally {
    client.release();
  }
});

router.post('/structure/categories/:id/folders', verifyToken, async (req, res) => {
  if (req.user.role !== 'Admin' && !req.user.can_manage_structure) return res.status(403).json({ error: 'Permission denied.' });
  const categoryId = Number(req.params.id);
  const name = String(req.body.name || '').trim();
  const parentFolderId = req.body.parent_folder_id ? Number(req.body.parent_folder_id) : null;
  if (!Number.isFinite(categoryId) || !name) return bad(res, 'name is required.');
  try {
    await ensuremasterfolderStructureSchema(pool);
    const created = await pool.query(
      `INSERT INTO masterfolder_category_folders (category_id, parent_folder_id, name)
       VALUES ($1, $2, $3)
       RETURNING id, name, parent_folder_id`,
      [categoryId, parentFolderId, name]
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
  if (req.user.role !== 'Admin' && !req.user.can_manage_structure) return res.status(403).json({ error: 'Permission denied.' });
  const parentFolderId = Number(req.params.id);
  const name = String(req.body.name || '').trim();
  if (!Number.isFinite(parentFolderId) || !name) return bad(res, 'name is required.');
  try {
    await ensuremasterfolderStructureSchema(pool);
    // Get parent folder to inherit category_id
    const parentRes = await pool.query(
      `SELECT id, category_id FROM masterfolder_category_folders WHERE id = $1 LIMIT 1`,
      [parentFolderId]
    );
    if (parentRes.rows.length === 0) return res.status(404).json({ error: 'Parent folder not found.' });
    const categoryId = parentRes.rows[0].category_id;
    const created = await pool.query(
      `INSERT INTO masterfolder_category_folders (category_id, parent_folder_id, name)
       VALUES ($1, $2, $3)
       RETURNING id, name, parent_folder_id`,
      [categoryId, parentFolderId, name]
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
  if (req.user.role !== 'Admin' && !req.user.can_manage_structure) return res.status(403).json({ error: 'Permission denied.' });
  const folderId = Number(req.params.id);
  const name = String(req.body.name || '').trim();
  if (!Number.isFinite(folderId) || !name) return bad(res, 'name is required.');
  const client = await pool.connect();
  try {
    await ensuremasterfolderStructureSchema(client);
    await client.query('BEGIN');
    const fRes = await client.query(
      `SELECT f.id, f.category_id, f.name, f.parent_folder_id, d.masterfolder_id, d.name AS dept_name
       FROM masterfolder_category_folders f
       JOIN masterfolder_categories d ON d.id = f.category_id
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
      `UPDATE masterfolder_category_folders SET name = $1, updated_at = NOW() WHERE id = $2`,
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
         AND m.masterfolder_id = $2
         AND f.category = $3
         AND COALESCE(f.folder, '') = $4`,
      [newFullPath, row.masterfolder_id, row.dept_name, oldFullPath]
    );
    // Also update files in subfolders (path starts with oldFullPath/)
    await client.query(
      `UPDATE vault_files f
       SET folder = $1 || SUBSTRING(COALESCE(f.folder, ''), LENGTH($4) + 1)
       FROM vault_file_metadata m
       WHERE m.file_id = f.id
         AND m.masterfolder_id = $2
         AND f.category = $3
         AND COALESCE(f.folder, '') LIKE $4 || '/%'`,
      [newFullPath, row.masterfolder_id, row.dept_name, oldFullPath]
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
    await ensuremasterfolderStructureSchema(client);
    await client.query('BEGIN');
    const fRes = await client.query(
      `SELECT f.id, f.name, f.parent_folder_id, d.masterfolder_id, d.name AS dept_name
       FROM masterfolder_category_folders f
       JOIN masterfolder_categories d ON d.id = f.category_id
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
       WHERE m.masterfolder_id = $1 AND f.category = $2
         AND (COALESCE(f.folder, '') = $3 OR COALESCE(f.folder, '') LIKE $3 || '/%')`,
      [row.masterfolder_id, row.dept_name, fullPath]
    );
    if ((countRes.rows[0]?.n || 0) > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Cannot delete folder: files exist in this folder or its subfolders.' });
    }
    // Cascade delete will remove child folders via ON DELETE CASCADE
    await client.query(`DELETE FROM masterfolder_category_folders WHERE id = $1`, [folderId]);
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
      json_agg(json_build_object('id', f1.id, 'original_name', f1.original_name, 'category', f1.category, 'folder', f1.folder, 'size_bytes', f1.size_bytes, 'upload_date', f1.upload_date, 'uploader_name', u.username)) as files
      FROM vault_files f1 LEFT JOIN users u ON f1.uploaded_by = u.id GROUP BY f1.file_hash HAVING COUNT(f1.id) > 1 ORDER BY total_size_wasted DESC;
    `;
    const { rows } = await pool.query(query);
    res.json(rows);
  } catch (error) { res.status(500).json({ error: 'Failed to fetch duplicate report' }); }
});

router.get('/dashboard', verifyToken, async (req, res) => {
  if (req.user.role !== 'Admin') return res.status(403).json({ error: 'Only Administrators can access the admin dashboard.' });

  const { masterfolderId } = req.query;
  const hasFilter = !!masterfolderId;

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
        WHERE m.masterfolder_id = $1 OR a.file_id IS NULL
        ORDER BY a.id, a.created_at DESC
        LIMIT 10
      `, [masterfolderId]);
    } else {
      auditLogs = await pool.query(`SELECT a.*, u.username FROM audit_logs a LEFT JOIN users u ON a.user_id = u.id ORDER BY a.created_at DESC LIMIT 10`);
    }

    // masterfolder overview: always global, but highlight the selected one
    const companyFyOverview = await pool.query(`SELECT m_table.id as masterfolder_id, m_table.name as masterfolder_name, COUNT(f.id) as total_files, SUM(f.size_bytes) as total_size FROM vault_file_metadata m JOIN masterfolders m_table ON m.masterfolder_id = m_table.id JOIN vault_files f ON m.file_id = f.id GROUP BY m_table.id, m_table.name ORDER BY m_table.name DESC`);

    // Category overview: filtered by company+FY if provided
    let deptOverview;
    if (hasFilter) {
      deptOverview = await pool.query(`
        SELECT f.category, COUNT(f.id) as total_files, SUM(f.size_bytes) as total_size
        FROM vault_files f
        JOIN vault_file_metadata m ON m.file_id = f.id
        WHERE m.masterfolder_id = $1
        GROUP BY f.category ORDER BY total_size DESC NULLS LAST
      `, [masterfolderId]);
    } else {
      deptOverview = await pool.query(`SELECT category, COUNT(id) as total_files, SUM(size_bytes) as total_size FROM vault_files GROUP BY category ORDER BY total_size DESC NULLS LAST`);
    }

    const activeUsers = await pool.query(`SELECT id, username, role, category FROM users WHERE status = 'Active' ORDER BY username ASC`);

    const latestBackup = await getLatestBackup().catch(() => null);

    let companyStorage = null;
    if (masterfolderId) {
      const companySizeResult = await pool.query(
        `SELECT COALESCE(SUM(f.size_bytes), 0) AS total_size
         FROM vault_files f
         JOIN vault_file_metadata m ON m.file_id = f.id
         WHERE m.masterfolder_id = $1`,
        [masterfolderId]
      );
      const companyMeta = await pool.query(
        `SELECT id, name
         FROM masterfolders
         WHERE id = $1
         LIMIT 1`,
        [masterfolderId]
      );
      if (companyMeta.rows.length > 0) {
        const quotaGb = 5;
        const usedBytes = Number(companySizeResult.rows[0]?.total_size || 0);
        const quotaBytes = quotaGb > 0 ? quotaGb * 1024 * 1024 * 1024 : 0;
        companyStorage = {
          masterfolder_id: Number(companyMeta.rows[0].id),
          masterfolder_name: companyMeta.rows[0].name,
          quota_gb: quotaGb,
          used_bytes: usedBytes,
          usage_percent: quotaBytes > 0 ? Number(((usedBytes / quotaBytes) * 100).toFixed(1)) : null,
          scoped_to_fy: false,
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
      categories: deptOverview.rows.map(r => ({ category: r.category, total_files: parseInt(r.total_files) || 0, total_size: parseInt(r.total_size) || 0 })),
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
    const filters = req.body?.filters || {};
    const jobId = backupTracker.createJob('backup', req.user.id);
    
    // Fire and forget
    createBackupSnapshot(pool, { userId: req.user.id, reason: 'manual', filters }, (processed, total) => {
      backupTracker.updateJobProgress(jobId, processed, total, 'minio objects');
    })
      .then(snapshot => {
        backupTracker.completeJob(jobId, snapshot);
        logAction(req.user.id, 'BACKUP_CREATE', null, `Created backup ${snapshot.backup_id}`, req.ip).catch(() => {});
      })
      .catch(err => {
        console.error('Manual backup failed:', err);
        backupTracker.failJob(jobId, err);
      });
      
    res.json({ success: true, job_id: jobId });
  } catch (err) {
    res.status(500).json({ error: 'Failed to start backup.' });
  }
});

router.get('/backups/status/:jobId', verifyToken, (req, res) => {
  if (req.user.role !== 'Admin') return res.status(403).json({ error: 'Admin only.' });
  const status = backupTracker.getJobStatus(req.params.jobId);
  if (!status) return res.status(404).json({ error: 'Job not found.' });
  res.json({ success: true, status });
});

router.post('/backups/preview', verifyToken, async (req, res) => {
  if (req.user.role !== 'Admin') return res.status(403).json({ error: 'Admin only.' });
  const backupId = req.body?.backupId;
  const filters = req.body?.filters || {};
  if (!backupId) return res.status(400).json({ error: 'backupId required.' });
  try {
    const preview = await getBackupPreview(pool, backupId, { filters });
    res.json({ success: true, preview });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate preview.' });
  }
});

router.post('/backups/restore', verifyToken, async (req, res) => {
  if (req.user.role !== 'Admin') return res.status(403).json({ error: 'Admin only.' });
  const backupId = req.body?.backupId;
  const filters = req.body?.filters || {};
  if (!backupId) return res.status(400).json({ error: 'backupId required.' });

  try {
    const jobId = backupTracker.createJob('restore', req.user.id);
    
    // Fire and forget
    restoreBackup(pool, backupId, { filters }, (processed, total, stage) => {
      backupTracker.updateJobProgress(jobId, processed, total, stage);
    })
      .then(result => {
        backupTracker.completeJob(jobId, result);
        logAction(req.user.id, 'BACKUP_RESTORE', null, `Restored backup ${result.backup_id}`, req.ip).catch(() => {});
      })
      .catch(err => {
        console.error('Restore failed:', err);
        backupTracker.failJob(jobId, err);
      });

    res.json({ success: true, job_id: jobId });
  } catch (err) {
    res.status(500).json({ error: 'Failed to start restore.' });
  }
});


router.post('/backup-schedule', verifyToken, async (req, res) => {
  if (req.user.role !== 'Admin') return res.status(403).json({ error: 'Admin only.' });
  try {
    const { enabled, interval } = req.body;
    let cron = '0 2 * * *'; // default daily at 2AM
    if (interval === 'Weekly') cron = '0 2 * * 0'; // Sunday 2AM
    else if (interval === 'Monthly') cron = '0 2 1 * *'; // 1st of month 2AM
    else if (interval === 'Quarterly') cron = '0 2 1 */3 *'; // 1st of every 3 months 2AM
    
    // Write this to a config file for server.js to pick up, or env.json
    const configPath = require('path').join(__dirname, '../../../backup_config.json');
    require('fs').writeFileSync(configPath, JSON.stringify({ enabled, interval, cron }, null, 2));
    
    res.json({ success: true, enabled, interval, cron });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save schedule.' });
  }
});

module.exports = router;
