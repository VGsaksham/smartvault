const express = require('express');
const cors = require('cors');
const Minio = require('minio');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto'); // <-- Added crypto module
const archiver = require('archiver');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const env = require('./src/config/env');
const pool = require('./src/db/pool');
const {
  ensureBackupDir,
  createBackupSnapshot,
} = require('./src/services/backupService');
const {
  checkFilePermission,
  canAccessDepartment,
  getEffectiveUserSettings,
  hydrateRequestUser,
} = require('./src/services/accessService');

const EXTERNAL_DRIVE_PATH = env.EXTERNAL_DRIVE_PATH;
const MEDIA_PREVIEW_CACHE_PATH = env.MEDIA_PREVIEW_CACHE_PATH;
const AUTO_CREATE_MEDIA_DIRS = env.AUTO_CREATE_MEDIA_DIRS;
const PORT = env.PORT;
const HOST = env.HOST;
const JWT_SECRET = env.JWT_SECRET;
const FILE_BUCKET = env.MINIO.bucket;
const BACKUP_CRON = env.BACKUP.cron;

const app = express();

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
    const isRequired =
      entry.path === env.EXTERNAL_DRIVE_PATH ||
      entry.path === env.BACKUP.path;
    try {
      const st = await fs.promises.statfs(entry.path);
      const total = Number(st.blocks || 0) * Number(st.bsize || 0);
      const free = Number(st.bavail || 0) * Number(st.bsize || 0);
      const used = Math.max(0, total - free);
      const usedPct = total > 0 ? Number(((used / total) * 100).toFixed(1)) : 0;
      devices.push({
        label: entry.label,
        path: entry.path,
        required: isRequired,
        total_bytes: total,
        used_bytes: used,
        free_bytes: free,
        used_percent: usedPct,
      });
    } catch {
      devices.push({
        label: entry.label,
        path: entry.path,
        required: isRequired,
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

function storageUnavailableResponse(res, label, p) {
  return res.status(503).json({
    error: `${label} is not available (disk unplugged or not mounted).`,
    details: { path: p },
  });
}

function isMediaDriveAvailable() {
  try {
    return fs.existsSync(EXTERNAL_DRIVE_PATH);
  } catch {
    return false;
  }
}

const corsOriginsRaw = String(env.CORS_ORIGINS || '*').trim();
if (!corsOriginsRaw || corsOriginsRaw === '*') {
  app.use(cors());
} else {
  const allowedOrigins = corsOriginsRaw
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.use(
    cors({
      origin(origin, callback) {
        // Allow non-browser requests (curl, server-to-server) with no Origin header
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error(`CORS blocked origin: ${origin}`));
      },
    })
  );
}
app.use(express.json());

const minioClient = new Minio.Client(env.MINIO);

const upload = multer({ storage: multer.memoryStorage() });

const authRoutes = require('./src/routes/auth');
const companyRoutes = require('./src/routes/companies');
const fyRoutes = require('./src/routes/financialYears');
const userRoutes = require('./src/routes/users');
const adminRoutes = require('./src/routes/admin');
const exportRoutes = require('./src/routes/export');
const auditRoutes = require('./src/routes/audit');

app.use('/api/auth', authRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/financial-years', fyRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/audit', auditRoutes);


const verifyToken = async (req, res, next) => {
  // Accept token from Authorization header OR ?token= query param (needed for iframes)
  const authHeader = req.headers['authorization'];
  const token = (authHeader ? authHeader.split(' ')[1] : null) || req.query.token;
  if (!token) return res.status(401).json({ error: "Access Denied. No token provided." });

  jwt.verify(token, JWT_SECRET, async (err, user) => {
    if (err) return res.status(403).json({ error: "Invalid or expired token." });
    
    try {
      const result = await pool.query('SELECT status, token_version FROM users WHERE id = $1', [user.id]);
      if (result.rows.length === 0) return res.status(403).json({ error: "User not found." });
      const dbUser = result.rows[0];
      if (dbUser.status === 'Suspended') return res.status(403).json({ error: "Your account is suspended." });
      if (dbUser.token_version !== user.token_version) return res.status(403).json({ error: "Session expired. Please log in again." });
      
      req.user = user;
      next();
    } catch (dbErr) {
      console.error(dbErr);
      return res.status(500).json({ error: "Server error during token verification." });
    }
  });
};

// --- AUDIT LOG HELPER ---
let auditUndoSchemaReady = false;
async function ensureAuditUndoSchema() {
  if (auditUndoSchemaReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS audit_undo_payloads (
      audit_log_id INTEGER PRIMARY KEY REFERENCES audit_logs(id) ON DELETE CASCADE,
      action_type TEXT NOT NULL,
      payload JSONB NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `).catch(() => {});
  auditUndoSchemaReady = true;
}

async function logAction(userId, actionType, fileId, details, ipAddress) {
  try {
    const query = `
      INSERT INTO audit_logs (user_id, action_type, file_id, details, ip_address)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `;
    const res = await pool.query(query, [userId, actionType, fileId, details, ipAddress]);
    return res.rows?.[0]?.id || null;
  } catch (err) {
    console.error("Failed to insert audit log:", err);
    return null;
  }
}

async function saveUndoPayload(auditLogId, actionType, payload) {
  if (!auditLogId || !payload) return;
  await ensureAuditUndoSchema();
  await pool.query(
    `INSERT INTO audit_undo_payloads (audit_log_id, action_type, payload)
     VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (audit_log_id) DO UPDATE
     SET action_type = EXCLUDED.action_type,
         payload = EXCLUDED.payload`,
    [auditLogId, actionType, JSON.stringify(payload)]
  ).catch(() => {});
}

function getAllowedDepartmentsForCompany(user, companyId = null) {
  const rows = Array.isArray(user?.company_access) ? user.company_access : [];
  const scoped = Number.isFinite(Number(companyId))
    ? rows.filter((x) => Number(x.company_id) === Number(companyId))
    : rows;
  const depts = Array.from(
    new Set(
      scoped
        .map((x) => String(x?.department || '').trim())
        .filter(Boolean)
    )
  );
  if (depts.length > 0) return depts;
  const fallback = Array.from(
    new Set(
      [String(user?.department || '').trim(), ...((Array.isArray(user?.allowed_departments) ? user.allowed_departments : []).map((d) => String(d || '').trim()))]
        .filter(Boolean)
    )
  );
  return fallback;
}
// ------------------------

// --- RBAC HELPERS in src/services/accessService ---





app.get('/api/files', verifyToken, async (req, res) => {
  const companyId = req.query.companyId;
  const fyId = req.query.fyId;
  try {
    await hydrateRequestUser(req);
    let result;
    let query = `
      SELECT f.*, m.company_id, m.fy_id 
      FROM vault_files f 
      LEFT JOIN vault_file_metadata m ON f.id = m.file_id
      WHERE 1=1
    `;
    const values = [];
    let paramCount = 1;

    if (req.user.role !== 'Admin') {
      const allowedCompanyIds = Array.from(
        new Set(
          (Array.isArray(req.user.company_access) ? req.user.company_access : [])
            .map((x) => Number(x.company_id))
            .filter((x) => Number.isFinite(x))
        )
      );
      if (allowedCompanyIds.length > 0) {
        query += ` AND m.company_id = ANY($${paramCount++})`;
        values.push(allowedCompanyIds);
      }
      if (companyId && allowedCompanyIds.length > 0 && !allowedCompanyIds.includes(Number(companyId))) {
        return res.status(403).json({ error: "You do not have access to this company." });
      }
      const deptScope = getAllowedDepartmentsForCompany(req.user, companyId ? Number(companyId) : null);
      if (deptScope.length > 0) {
        query += ` AND f.department = ANY($${paramCount++})`;
        values.push(deptScope);
      } else {
        query += ` AND 1=0`;
      }
    }
    if (companyId) {
      query += ` AND m.company_id = $${paramCount++}`;
      values.push(companyId);
    }
    if (fyId) {
      query += ` AND m.fy_id = $${paramCount++}`;
      values.push(fyId);
    }
    
    query += ` ORDER BY f.upload_date DESC`;
    result = await pool.query(query, values);

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch files" });
  }
});

app.get('/api/storage/overview', verifyToken, async (req, res) => {
  const companyId = req.query.companyId ? Number(req.query.companyId) : null;
  const fyId = req.query.fyId ? Number(req.query.fyId) : null;
  try {
    await hydrateRequestUser(req);
    const storage_devices = await readStorageDevices();

    let where = 'WHERE 1=1';
    const values = [];
    let i = 1;

    if (Number.isFinite(companyId)) {
      where += ` AND m.company_id = $${i++}`;
      values.push(companyId);
    }
    if (Number.isFinite(fyId)) {
      where += ` AND m.fy_id = $${i++}`;
      values.push(fyId);
    }
    if (req.user.role !== 'Admin') {
      const allowedCompanyIds = Array.from(
        new Set(
          (Array.isArray(req.user.company_access) ? req.user.company_access : [])
            .map((x) => Number(x.company_id))
            .filter((x) => Number.isFinite(x))
        )
      );
      if (allowedCompanyIds.length > 0) {
        if (Number.isFinite(companyId) && !allowedCompanyIds.includes(Number(companyId))) {
          return res.status(403).json({ error: "You do not have access to this company." });
        }
        where += ` AND m.company_id = ANY($${i++})`;
        values.push(allowedCompanyIds);
      }
      const deptScope = getAllowedDepartmentsForCompany(req.user, Number.isFinite(companyId) ? Number(companyId) : null);
      if (deptScope.length > 0) {
        where += ` AND f.department = ANY($${i++})`;
        values.push(deptScope);
      } else {
        where += ` AND 1=0`;
      }
    }

    const scopeResult = await pool.query(
      `SELECT COALESCE(COUNT(f.id), 0) AS total_files, COALESCE(SUM(f.size_bytes), 0) AS total_size
       FROM vault_files f
       LEFT JOIN vault_file_metadata m ON m.file_id = f.id
       ${where}`,
      values
    );

    let company_storage = null;
    if (Number.isFinite(companyId)) {
      const c = await pool.query(
        `SELECT id, name, storage_quota_gb FROM companies WHERE id = $1 LIMIT 1`,
        [companyId]
      );
      if (c.rows.length > 0) {
        const usedBytes = Number(scopeResult.rows[0]?.total_size || 0);
        const quotaGb = Number(c.rows[0].storage_quota_gb || 0);
        const quotaBytes = quotaGb > 0 ? quotaGb * 1024 * 1024 * 1024 : 0;
        company_storage = {
          company_id: Number(c.rows[0].id),
          company_name: c.rows[0].name,
          quota_gb: quotaGb,
          used_bytes: usedBytes,
          usage_percent: quotaBytes > 0 ? Number(((usedBytes / quotaBytes) * 100).toFixed(1)) : null,
          scoped_to_fy: Number.isFinite(fyId),
        };
      }
    }

    res.json({
      storage_devices,
      scoped_storage: {
        total_files: Number(scopeResult.rows[0]?.total_files || 0),
        total_size: Number(scopeResult.rows[0]?.total_size || 0),
        company_storage,
      },
    });
  } catch (err) {
    res.status(500).json({ error: `Failed to fetch storage overview: ${err.message}` });
  }
});

app.post('/api/upload', verifyToken, upload.single('document'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  
  const department = req.body.department;
  if (!department) return res.status(400).json({ error: "Department is required" });
  const folder = req.body.folder || null;
  const companyId = req.body.companyId;
  const fyId = req.body.fyId;

  if (!companyId || !fyId) {
    return res.status(400).json({ error: "Company ID and Financial Year ID are required for upload." });
  }

  // Phase 3.3: Check if the Financial Year is Archived or Locked
  try {
    await hydrateRequestUser(req);
    const fyCheck = await pool.query('SELECT status FROM financial_years WHERE id = $1', [fyId]);
    if (fyCheck.rows.length > 0) {
      const fyStatus = fyCheck.rows[0].status;
      if (fyStatus === 'Archived') {
        return res.status(403).json({ error: "This Financial Year is Archived. Uploads are disabled. Contact Admin to unlock." });
      }
      if (fyStatus === 'Locked') {
        return res.status(403).json({ error: "This Financial Year is Locked. No modifications are permitted." });
      }
    }
  } catch (err) {
    console.error('FY status check failed:', err);
  }
  
  // Phase 6: Permission Checks for Upload
  if (req.user.role === 'Guest') {
    return res.status(403).json({ error: "Guests cannot upload files." });
  }
  if (req.user.role !== 'Admin') {
    const companyRows = Array.isArray(req.user.company_access) ? req.user.company_access : [];
    const forCompany = companyRows.filter((x) => Number(x.company_id) === Number(companyId));
    if (forCompany.length > 0) {
      const deptRow = forCompany.find((x) => String(x.department) === String(department));
      if (!deptRow) {
        return res.status(403).json({ error: "You do not have department access in this company." });
      }
      if (!Boolean(deptRow.can_upload)) {
        return res.status(403).json({ error: "You only have read-only access in this company department." });
      }
    }
    const deptScope = getAllowedDepartmentsForCompany(req.user, Number(companyId));
    if (!deptScope.includes(String(department))) {
      return res.status(403).json({ error: "You do not have access to this department in the selected company." });
    }
  }

  const fileName = Date.now() + '-' + req.file.originalname;

  try {
    // Phase 8.3: Calculate SHA-256 Hash
    const fileHash = crypto.createHash('sha256').update(req.file.buffer).digest('hex');



    // Hash is unique, proceed with upload (Route based on mime type)
    const isMedia = req.file.mimetype.startsWith('video/') || req.file.mimetype.startsWith('audio/');
    let storageFilename = fileName;

    if (isMedia) {
      if (!isMediaDriveAvailable()) {
        return storageUnavailableResponse(res, 'Media drive (EXTERNAL_DRIVE_PATH)', EXTERNAL_DRIVE_PATH);
      }
      const fullPath = path.join(EXTERNAL_DRIVE_PATH, fileName);
      await fs.promises.writeFile(fullPath, req.file.buffer);
      storageFilename = 'local:' + fileName;
    } else {
      await minioClient.putObject(FILE_BUCKET, fileName, req.file.buffer, req.file.size);
    }

    const customTag = req.body.customTag || req.file.originalname.split('.')[0].replace(/[^a-zA-Z0-9]/g, '');
    const customName = req.body.customName || null;

    // Auto Naming System
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const yearMonth = `${year}-${month}`;
    
    const seqQuery = `
      INSERT INTO file_sequences (department, year_month, last_sequence)
      VALUES ($1, $2, 1)
      ON CONFLICT (department, year_month) 
      DO UPDATE SET last_sequence = file_sequences.last_sequence + 1
      RETURNING last_sequence;
    `;
    const seqRes = await pool.query(seqQuery, [department, yearMonth]);
    const seq = seqRes.rows[0].last_sequence;
    
    const codes = { 'Finance': 'FIN', 'HR': 'HR', 'Legal': 'LEG', 'Media': 'MED', 'Admin': 'ADM' };
    const deptCode = codes[department] || 'UNC';
    const autoName = `${deptCode}-${year}-${month}-${String(seq).padStart(4, '0')}-${customTag}`;

    // Insert with new columns
    const insertQuery = `INSERT INTO vault_files (original_name, minio_filename, size_bytes, mime_type, department, folder, file_hash, uploaded_by, auto_name, custom_name) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`;
    const dbResult = await pool.query(insertQuery, [req.file.originalname, storageFilename, req.file.size, req.file.mimetype, department, folder, fileHash, req.user.id, autoName, customName]);
    const uploadedFile = dbResult.rows[0];

    // Insert metadata
    await pool.query(`INSERT INTO vault_file_metadata (file_id, company_id, fy_id) VALUES ($1, $2, $3)`, [uploadedFile.id, companyId, fyId]);

    // Log the upload action
    await logAction(req.user.id, 'UPLOAD', uploadedFile.id, `Uploaded ${uploadedFile.original_name} to ${department}`, req.ip);

    res.json({ success: true, message: `File vaulted in ${department}!`, file: uploadedFile });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to process upload" });
  }
});

// GET Companies Endpoint





// TOGGLE Star on a file (per user)
app.post('/api/files/:id/star', verifyToken, async (req, res) => {
  const fileId = req.params.id;
  const userId = req.user.id;
  try {
    const existing = await pool.query('SELECT id FROM starred_files WHERE user_id=$1 AND file_id=$2', [userId, fileId]);
    if (existing.rows.length > 0) {
      await pool.query('DELETE FROM starred_files WHERE user_id=$1 AND file_id=$2', [userId, fileId]);
      res.json({ starred: false });
    } else {
      await pool.query('INSERT INTO starred_files (user_id, file_id) VALUES ($1, $2)', [userId, fileId]);
      res.json({ starred: true });
    }
  } catch (err) {
    res.status(500).json({ error: "Failed to toggle star" });
  }
});

// GET Starred files for current user
app.get('/api/files/starred', verifyToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT f.*, m.company_id, m.fy_id, true as starred
      FROM vault_files f
      JOIN starred_files s ON s.file_id = f.id
      LEFT JOIN vault_file_metadata m ON m.file_id = f.id
      WHERE s.user_id = $1
      ${req.user.role !== 'Admin' ? 'AND f.department = $2' : ''}
      ORDER BY s.created_at DESC
    `, req.user.role !== 'Admin' ? [req.user.id, req.user.department] : [req.user.id]);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch starred files" });
  }
});

// GET Recent files (last 30, scoped by user)
app.get('/api/files/recent', verifyToken, async (req, res) => {
  const { companyId, fyId } = req.query;
  try {
    const normalizedCompanyId = companyId ? Number(companyId) : null;
    const normalizedFyId = fyId ? Number(fyId) : null;
    if (companyId && Number.isNaN(normalizedCompanyId)) {
      return res.status(400).json({ error: "Invalid companyId" });
    }
    if (fyId && Number.isNaN(normalizedFyId)) {
      return res.status(400).json({ error: "Invalid fyId" });
    }
    if (normalizedCompanyId && normalizedFyId) {
      const fyMatch = await pool.query(
        'SELECT id FROM financial_years WHERE id = $1 AND company_id = $2 LIMIT 1',
        [normalizedFyId, normalizedCompanyId]
      );
      if (fyMatch.rows.length === 0) {
        return res.status(400).json({ error: "Financial year does not belong to the selected company." });
      }
    }

    let query = `
      SELECT f.*, m.company_id, m.fy_id
      FROM vault_files f
      LEFT JOIN vault_file_metadata m ON m.file_id = f.id
      WHERE 1=1
    `;
    const values = [];
    let p = 1;
    if (req.user.role !== 'Admin') {
      const allowedCompanyIds = Array.from(
        new Set(
          (Array.isArray(req.user.company_access) ? req.user.company_access : [])
            .map((x) => Number(x.company_id))
            .filter((x) => Number.isFinite(x))
        )
      );
      if (allowedCompanyIds.length > 0) {
        query += ` AND m.company_id = ANY($${p++})`;
        values.push(allowedCompanyIds);
      }
      if (normalizedCompanyId && allowedCompanyIds.length > 0 && !allowedCompanyIds.includes(normalizedCompanyId)) {
        return res.status(403).json({ error: "You do not have access to this company." });
      }
      const deptScope = getAllowedDepartmentsForCompany(req.user, normalizedCompanyId);
      if (deptScope.length > 0) {
        query += ` AND f.department = ANY($${p++})`;
        values.push(deptScope);
      } else {
        query += ` AND 1=0`;
      }
    }
    if (normalizedCompanyId) { query += ` AND m.company_id = $${p++}`; values.push(normalizedCompanyId); }
    if (normalizedFyId) { query += ` AND m.fy_id = $${p++}`; values.push(normalizedFyId); }
    query += ` ORDER BY f.upload_date DESC LIMIT 30`;
    const result = await pool.query(query, values);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch recent files" });
  }
});

app.get('/api/search/options', verifyToken, async (req, res) => {
  try {
    await hydrateRequestUser(req);
    const normalizedCompanyId = req.query.companyId ? Number(req.query.companyId) : null;
    const normalizedFyId = req.query.fyId ? Number(req.query.fyId) : null;
    const hasScope = Number.isFinite(normalizedCompanyId) && Number.isFinite(normalizedFyId);
    const values = [];
    let accessClause = '';
    if (req.user.role !== 'Admin') {
      const allowedCompanyIds = Array.from(
        new Set(
          (Array.isArray(req.user.company_access) ? req.user.company_access : [])
            .map((x) => Number(x.company_id))
            .filter((x) => Number.isFinite(x))
        )
      );
      if (allowedCompanyIds.length > 0) {
        accessClause = `WHERE m.company_id = ANY($${values.length + 1})`;
        values.push(allowedCompanyIds);
      }
      if (normalizedCompanyId && allowedCompanyIds.length > 0 && !allowedCompanyIds.includes(normalizedCompanyId)) {
        return res.status(403).json({ error: "You do not have access to this company." });
      }
      const deptScope = getAllowedDepartmentsForCompany(req.user, normalizedCompanyId);
      if (deptScope.length > 0) {
        accessClause = `${accessClause ? `${accessClause} AND` : 'WHERE'} f.department = ANY($${values.length + 1})`;
        values.push(deptScope);
      } else {
        accessClause = `${accessClause ? `${accessClause} AND` : 'WHERE'} 1=0`;
      }
    }

    const result = await pool.query(
      `
      SELECT
        ARRAY_REMOVE(ARRAY_AGG(DISTINCT f.department), NULL) AS departments,
        ARRAY_REMOVE(ARRAY_AGG(DISTINCT c.name), NULL) AS company_names,
        ARRAY_REMOVE(ARRAY_AGG(DISTINCT fy.name), NULL) AS fy_names,
        ARRAY_REMOVE(ARRAY_AGG(DISTINCT u.username), NULL) AS uploaded_by_names,
        ARRAY_REMOVE(ARRAY_AGG(DISTINCT CASE WHEN f.minio_filename LIKE 'local:%' THEN 'External HDD' ELSE 'MinIO' END), NULL) AS hdd_locations
      FROM vault_files f
      LEFT JOIN vault_file_metadata m ON m.file_id = f.id
      LEFT JOIN companies c ON c.id = m.company_id
      LEFT JOIN financial_years fy ON fy.id = m.fy_id
      LEFT JOIN users u ON u.id = f.uploaded_by
      ${accessClause}
      `,
      values
    );

    const tagsResult = await pool.query(
      `
      SELECT DISTINCT jsonb_array_elements_text(COALESCE(tags::jsonb, '[]'::jsonb)) AS tag
      FROM vault_files f
      LEFT JOIN vault_file_metadata m ON m.file_id = f.id
      ${accessClause}
      `,
      values
    ).catch(() => ({ rows: [] }));

    // If companyId+fyId are provided, prefer managed departments even if they have no files yet.
    let managedDepartments = null;
    if (hasScope) {
      try {
        const managed = await pool.query(
          `SELECT name
           FROM company_departments
           WHERE company_id = $1 AND fy_id = $2
           ORDER BY LOWER(name) ASC`,
          [normalizedCompanyId, normalizedFyId]
        );
        managedDepartments = managed.rows.map((r) => r.name).filter(Boolean);
      } catch {
        managedDepartments = null;
      }
    }

    const rawDepartments = managedDepartments && managedDepartments.length > 0
      ? managedDepartments
      : (result.rows[0]?.departments || []);

    // Apply user access filtering even when using managed departments.
    const departments =
      req.user.role === 'Admin'
        ? rawDepartments
        : rawDepartments.filter((d) => getAllowedDepartmentsForCompany(req.user, normalizedCompanyId).includes(d));

    res.json({
      departments,
      companies: result.rows[0]?.company_names || [],
      financialYears: result.rows[0]?.fy_names || [],
      uploadedBy: result.rows[0]?.uploaded_by_names || [],
      hddLocations: result.rows[0]?.hdd_locations || [],
      tags: tagsResult.rows.map((r) => r.tag).filter(Boolean)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load search options' });
  }
});

// Company + FY structure (Departments + Folders)
app.get('/api/structure', verifyToken, async (req, res) => {
  try {
    await hydrateRequestUser(req);
    const companyId = req.query.companyId ? Number(req.query.companyId) : null;
    const fyId = req.query.fyId ? Number(req.query.fyId) : null;
    if (!Number.isFinite(companyId) || !Number.isFinite(fyId)) {
      return res.status(400).json({ error: 'companyId and fyId are required.' });
    }

    const deptRows = await pool.query(
      `SELECT id, name
       FROM company_departments
       WHERE company_id = $1 AND fy_id = $2
       ORDER BY LOWER(name) ASC`,
      [companyId, fyId]
    ).catch(() => ({ rows: [] }));

    let departments = deptRows.rows.map((d) => ({ id: d.id, name: d.name }));

    // Apply access filtering for non-admins (match existing rules).
    if (req.user.role !== 'Admin') {
      const allowedCompanyIds = Array.from(
        new Set(
          (Array.isArray(req.user.company_access) ? req.user.company_access : [])
            .map((x) => Number(x.company_id))
            .filter((x) => Number.isFinite(x))
        )
      );
      if (allowedCompanyIds.length > 0 && !allowedCompanyIds.includes(companyId)) {
        return res.status(403).json({ error: 'You do not have access to this company.' });
      }
      const allowed = new Set(getAllowedDepartmentsForCompany(req.user, companyId));
      departments = departments.filter((d) => allowed.has(d.name));
    }

    const deptIds = departments.map((d) => d.id);
    const folderRows = deptIds.length
      ? await pool.query(
          `SELECT id, department_id, name
           FROM company_department_folders
           WHERE department_id = ANY($1::int[])
           ORDER BY LOWER(name) ASC`,
          [deptIds]
        ).catch(() => ({ rows: [] }))
      : { rows: [] };

    const byDept = new Map();
    for (const f of folderRows.rows) {
      if (!byDept.has(f.department_id)) byDept.set(f.department_id, []);
      byDept.get(f.department_id).push(String(f.name));
    }

    res.json({
      company_id: companyId,
      fy_id: fyId,
      departments: departments.map((d) => ({ name: d.name, folders: byDept.get(d.id) || [] })),
    });
  } catch (err) {
    res.status(500).json({ error: `Failed to load structure: ${err.message}` });
  }
});

// Heartbeat to detect suspended/forced-logout without refresh.
app.get('/api/auth/heartbeat', verifyToken, async (req, res) => {
  try {
    const u = await pool.query('SELECT status FROM users WHERE id = $1 LIMIT 1', [req.user.id]).catch(() => ({ rows: [] }));
    const status = String(u.rows?.[0]?.status || 'Active');
    if (status === 'Suspended') {
      return res.status(403).json({ error: 'Account is suspended.' });
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: `Heartbeat failed: ${err.message}` });
  }
});

// GET Search (scope: all | fy | dept)
app.get('/api/files/search', verifyToken, async (req, res) => {
  const {
    q,
    scope,
    companyId,
    fyId,
    folder,
    exact,
    matchCase,
    from,
    to,
    year,
    month,
    day,
    departments,
    companies,
    financialYears,
    fileType,
    extension,
    textInside,
    tags,
    uploadedBy,
    hddLocation,
  } = req.query;
  if (!q) return res.json([]);
  try {
    await hydrateRequestUser(req);
    const normalizedCompanyId = companyId ? Number(companyId) : null;
    const normalizedFyId = fyId ? Number(fyId) : null;

    if (companyId && Number.isNaN(normalizedCompanyId)) {
      return res.status(400).json({ error: "Invalid companyId" });
    }
    if (fyId && Number.isNaN(normalizedFyId)) {
      return res.status(400).json({ error: "Invalid fyId" });
    }

    // Security guard: if both are provided, FY must belong to the selected company.
    if (normalizedCompanyId && normalizedFyId) {
      const fyMatch = await pool.query(
        'SELECT id FROM financial_years WHERE id = $1 AND company_id = $2 LIMIT 1',
        [normalizedFyId, normalizedCompanyId]
      );
      if (fyMatch.rows.length === 0) {
        return res.status(400).json({ error: "Financial year does not belong to the selected company." });
      }
    }

    let query = `
      SELECT f.*, m.company_id, m.fy_id,
             c.name as company_name,
             u.username as uploaded_by_name,
             fy.name as fy_name, fy.status as fy_status
      FROM vault_files f
      LEFT JOIN vault_file_metadata m ON m.file_id = f.id
      LEFT JOIN companies c ON c.id = m.company_id
      LEFT JOIN financial_years fy ON fy.id = m.fy_id
      LEFT JOIN users u ON u.id = f.uploaded_by
      WHERE 1=1
    `;
    const values = [];
    let p = 1;
    let companyFilterApplied = false;
    let fyFilterApplied = false;

    const queryText = String(q);
    const caseSensitive = String(matchCase) === 'true';
    const exactMatch = String(exact) === 'true';
    const comparator = caseSensitive ? 'LIKE' : 'ILIKE';
    const qValue = exactMatch ? queryText : `%${queryText}%`;
    query += ` AND (f.original_name ${comparator} $${p} OR COALESCE(f.custom_name, '') ${comparator} $${p} OR COALESCE(f.auto_name, '') ${comparator} $${p})`;
    values.push(qValue);
    p++;

    if (textInside) {
      query += ` AND COALESCE(f.original_name, '') ILIKE $${p}`;
      values.push(`%${String(textInside)}%`);
      p++;
    }

    if (req.user.role !== 'Admin') {
      const allowedCompanyIds = Array.from(
        new Set(
          (Array.isArray(req.user.company_access) ? req.user.company_access : [])
            .map((x) => Number(x.company_id))
            .filter((x) => Number.isFinite(x))
        )
      );
      if (allowedCompanyIds.length > 0) {
        query += ` AND m.company_id = ANY($${p++})`;
        values.push(allowedCompanyIds);
      }
      if (normalizedCompanyId && allowedCompanyIds.length > 0 && !allowedCompanyIds.includes(normalizedCompanyId)) {
        return res.status(403).json({ error: "You do not have access to this company." });
      }
      const deptScope = getAllowedDepartmentsForCompany(req.user, normalizedCompanyId);
      if (deptScope.length > 0) {
        query += ` AND f.department = ANY($${p++})`;
        values.push(deptScope);
      } else {
        query += ` AND 1=0`;
      }
    }

    const parseCsv = (value) => String(value || '').split(',').map(v => v.trim()).filter(Boolean);

    if (scope === 'folder' && !folder) {
      // "This folder only" without a concrete folder context should return no results.
      return res.json([]);
    }

    if (scope === 'fy' && companyId && fyId) {
      query += ` AND m.company_id = $${p++} AND m.fy_id = $${p++}`;
      values.push(companyId, fyId);
      companyFilterApplied = true;
      fyFilterApplied = true;
    } else if (scope === 'company' && companyId) {
      query += ` AND m.company_id = $${p++}`;
      values.push(companyId);
      companyFilterApplied = true;
    } else if (scope === 'folder' && folder) {
      query += ` AND (f.folder = $${p++} OR f.folder ILIKE $${p++})`;
      values.push(folder, `${folder}%`);
    }

    // Always enforce selected company/FY context when provided by client,
    // even when scope is "all", so navbar selectors are respected.
    if (normalizedCompanyId && !companyFilterApplied) {
      query += ` AND m.company_id = $${p++}`;
      values.push(normalizedCompanyId);
    }
    if (normalizedFyId && !fyFilterApplied) {
      query += ` AND m.fy_id = $${p++}`;
      values.push(normalizedFyId);
    }

    if (from) { query += ` AND f.upload_date >= $${p++}`; values.push(from); }
    if (to) { query += ` AND f.upload_date <= $${p++}`; values.push(to); }
    if (year) { query += ` AND EXTRACT(YEAR FROM f.upload_date) = $${p++}`; values.push(Number(year)); }
    if (month) { query += ` AND EXTRACT(MONTH FROM f.upload_date) = $${p++}`; values.push(Number(month)); }
    if (day) { query += ` AND EXTRACT(DAY FROM f.upload_date) = $${p++}`; values.push(Number(day)); }

    const deptValues = parseCsv(departments);
    if (deptValues.length > 0) { query += ` AND f.department = ANY($${p++})`; values.push(deptValues); }
    const companyValues = parseCsv(companies);
    if (companyValues.length > 0) { query += ` AND c.name = ANY($${p++})`; values.push(companyValues); }
    const fyValues = parseCsv(financialYears);
    if (fyValues.length > 0) { query += ` AND fy.name = ANY($${p++})`; values.push(fyValues); }

    if (uploadedBy) { query += ` AND u.username = ANY($${p++})`; values.push(parseCsv(uploadedBy)); }
    if (hddLocation) {
      const hddValues = parseCsv(hddLocation);
      if (hddValues.length > 0) {
        const wantsLocal = hddValues.includes('External HDD');
        const wantsMinio = hddValues.includes('MinIO');
        if (wantsLocal && !wantsMinio) query += ` AND f.minio_filename LIKE 'local:%'`;
        if (!wantsLocal && wantsMinio) query += ` AND f.minio_filename NOT LIKE 'local:%'`;
      }
    }

    const tagValues = parseCsv(tags);
    if (tagValues.length > 0) {
      query += ` AND EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(COALESCE(f.tags::jsonb, '[]'::jsonb)) AS tag
        WHERE tag = ANY($${p++})
      )`;
      values.push(tagValues);
    }

    if (fileType) {
      const type = String(fileType).toLowerCase();
      if (type === 'docs') query += ` AND (f.mime_type ILIKE '%pdf%' OR f.mime_type ILIKE '%document%' OR f.mime_type ILIKE '%sheet%' OR f.mime_type ILIKE '%word%' OR f.mime_type ILIKE '%text%')`;
      if (type === 'video') query += ` AND f.mime_type ILIKE '%video%'`;
      if (type === 'audio') query += ` AND f.mime_type ILIKE '%audio%'`;
      if (type === 'images') query += ` AND f.mime_type ILIKE '%image%'`;
      if (type === 'design') query += ` AND (f.original_name ILIKE '%.psd' OR f.original_name ILIKE '%.ai' OR f.original_name ILIKE '%.fig' OR f.original_name ILIKE '%.xd')`;
    }
    if (extension) {
      query += ` AND f.original_name ILIKE $${p++}`;
      values.push(`%.${String(extension).replace(/^\./, '')}`);
    }

    query += ` ORDER BY f.upload_date DESC LIMIT 50`;
    const result = await pool.query(query, values);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to search" });
  }
});

// GET Department Stats (for Dashboard)
app.get('/api/stats/department/:dept', verifyToken, async (req, res) => {
  const { dept } = req.params;
  const { companyId, fyId } = req.query;

  if (req.user.role !== 'Admin' && req.user.department !== dept) {
    return res.status(403).json({ error: "Access denied to this department's stats." });
  }

  try {
    const normalizedCompanyId = companyId ? Number(companyId) : null;
    const normalizedFyId = fyId ? Number(fyId) : null;
    if (!normalizedCompanyId || !normalizedFyId) {
      return res.status(400).json({ error: "companyId and fyId are required." });
    }
    if (Number.isNaN(normalizedCompanyId) || Number.isNaN(normalizedFyId)) {
      return res.status(400).json({ error: "Invalid companyId or fyId." });
    }
    const fyMatch = await pool.query(
      'SELECT id FROM financial_years WHERE id = $1 AND company_id = $2 LIMIT 1',
      [normalizedFyId, normalizedCompanyId]
    );
    if (fyMatch.rows.length === 0) {
      return res.status(400).json({ error: "Financial year does not belong to the selected company." });
    }

    // 1. Storage Usage
    const storageResult = await pool.query(`
      SELECT 
        COUNT(*) as total_files, 
        SUM(f.size_bytes) as total_size,
        SUM(CASE WHEN f.minio_filename LIKE 'local:%' THEN f.size_bytes ELSE 0 END) as local_size,
        SUM(CASE WHEN f.minio_filename NOT LIKE 'local:%' THEN f.size_bytes ELSE 0 END) as minio_size
      FROM vault_files f
      JOIN vault_file_metadata m ON f.id = m.file_id
      WHERE f.department = $1 AND m.company_id = $2 AND m.fy_id = $3
    `, [dept, normalizedCompanyId, normalizedFyId]);

    const companyResult = await pool.query('SELECT storage_quota_gb FROM companies WHERE id = $1', [normalizedCompanyId]);
    const quotaGb = companyResult.rows[0]?.storage_quota_gb || 5;

    // 2. Recent Activity (last 20)
    const activityResult = await pool.query(`
      SELECT a.*, f.original_name, u.username
      FROM audit_logs a
      JOIN vault_files f ON a.file_id = f.id
      JOIN vault_file_metadata m ON m.file_id = f.id
      JOIN users u ON a.user_id = u.id
      WHERE f.department = $1 AND m.company_id = $2 AND m.fy_id = $3
      ORDER BY a.created_at DESC
      LIMIT 20
    `, [dept, normalizedCompanyId, normalizedFyId]);

    // 3. Expiry Warnings (next 90 days)
    const expiryResult = await pool.query(`
      SELECT f.id, f.original_name, f.expiry_date
      FROM vault_files f
      JOIN vault_file_metadata m ON f.id = m.file_id
      WHERE f.department = $1 AND m.company_id = $2 AND m.fy_id = $3
      AND f.expiry_date BETWEEN NOW() AND NOW() + INTERVAL '90 days'
      ORDER BY f.expiry_date ASC
      LIMIT 5
    `, [dept, normalizedCompanyId, normalizedFyId]);

    // 4. Mime-type Breakdown
    const typeResult = await pool.query(`
      SELECT f.mime_type, COUNT(*) as count
      FROM vault_files f
      JOIN vault_file_metadata m ON f.id = m.file_id
      WHERE f.department = $1 AND m.company_id = $2 AND m.fy_id = $3
      GROUP BY f.mime_type
    `, [dept, normalizedCompanyId, normalizedFyId]);

    // 5. Top Uploaders
    const topUploadersResult = await pool.query(`
      SELECT u.username, COUNT(f.id) as upload_count
      FROM vault_files f
      JOIN vault_file_metadata m ON f.id = m.file_id
      JOIN users u ON f.uploaded_by = u.id
      WHERE f.department = $1 AND m.company_id = $2 AND m.fy_id = $3
      GROUP BY u.username
      ORDER BY upload_count DESC
      LIMIT 5
    `, [dept, normalizedCompanyId, normalizedFyId]);

    // 6. Duplicate Alerts
    const duplicateAlertsResult = await pool.query(`
      SELECT f1.file_hash, COUNT(f1.id) as count, SUM(f1.size_bytes) - MAX(f1.size_bytes) as wasted_size
      FROM vault_files f1
      JOIN vault_file_metadata m ON f1.id = m.file_id
      WHERE f1.department = $1 AND m.company_id = $2 AND m.fy_id = $3
      GROUP BY f1.file_hash
      HAVING COUNT(f1.id) > 1
    `, [dept, normalizedCompanyId, normalizedFyId]);
    
    // 7. Cross-FY Comparison
    const lastFyResult = await pool.query(`
      SELECT id FROM financial_years 
      WHERE company_id = $1 AND id < $2 
      ORDER BY id DESC LIMIT 1
    `, [normalizedCompanyId, normalizedFyId]);

    let lastFyStats = { total_files: 0, total_size: 0 };
    if (lastFyResult.rows.length > 0) {
      const lastFyId = lastFyResult.rows[0].id;
      const lastFyStorage = await pool.query(`
        SELECT COUNT(*) as total_files, SUM(f.size_bytes) as total_size
        FROM vault_files f
        JOIN vault_file_metadata m ON f.id = m.file_id
        WHERE f.department = $1 AND m.company_id = $2 AND m.fy_id = $3
      `, [dept, normalizedCompanyId, lastFyId]);
      lastFyStats = {
        total_files: parseInt(lastFyStorage.rows[0].total_files) || 0,
        total_size: parseInt(lastFyStorage.rows[0].total_size) || 0
      };
    }

    res.json({
      storage: {
        total_files: parseInt(storageResult.rows[0].total_files) || 0,
        total_size: parseInt(storageResult.rows[0].total_size) || 0,
        local_size: parseInt(storageResult.rows[0].local_size) || 0,
        minio_size: parseInt(storageResult.rows[0].minio_size) || 0,
        quota_gb: quotaGb
      },
      activity: activityResult.rows,
      expiry: expiryResult.rows,
      types: typeResult.rows,
      top_uploaders: topUploadersResult.rows,
      duplicates: duplicateAlertsResult.rows,
      cross_fy: {
        current: {
          total_files: parseInt(storageResult.rows[0].total_files) || 0,
          total_size: parseInt(storageResult.rows[0].total_size) || 0
        },
        previous: lastFyStats
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch department stats" });
  }
});

const { execFile } = require('child_process');
const os = require('os');

// Preview endpoint: serves file as PDF (converts Office docs via LibreOffice)
app.get('/api/preview/:id', verifyToken, async (req, res) => {
  try {
    await hydrateRequestUser(req);
    const fileResult = await pool.query(
      'SELECT minio_filename, original_name, mime_type, department FROM vault_files WHERE id = $1 LIMIT 1',
      [req.params.id]
    );
    if (fileResult.rows.length === 0) return res.status(404).json({ error: 'File not found' });

    const fileRecord = fileResult.rows[0];
    if (!canAccessDepartment(req.user, fileRecord.department)) {
      return res.status(403).json({ error: 'Access Denied.' });
    }

    const isLocal = fileRecord.minio_filename.startsWith('local:');
    const actualFileName = isLocal ? fileRecord.minio_filename.substring(6) : fileRecord.minio_filename;
    const originalName = fileRecord.original_name;
    const ext = path.extname(originalName).toLowerCase();

    const PREVIEWABLE_OFFICE = ['.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.odt', '.ods', '.odp'];
    const needsConversion = PREVIEWABLE_OFFICE.includes(ext);

    // Helper: write file buffer to a tmp file, convert, read result
    const convertToPdf = (fileBuffer, inputExt) => new Promise((resolve, reject) => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sv-preview-'));
      const tmpInput = path.join(tmpDir, `input${inputExt}`);
      fs.writeFileSync(tmpInput, fileBuffer);

      execFile('libreoffice', [
        '--headless',
        '--convert-to', 'pdf',
        '--outdir', tmpDir,
        tmpInput
      ], { timeout: 30000 }, (err) => {
        if (err) { fs.rmSync(tmpDir, { recursive: true, force: true }); return reject(err); }
        const pdfPath = path.join(tmpDir, 'input.pdf');
        if (!fs.existsSync(pdfPath)) { fs.rmSync(tmpDir, { recursive: true, force: true }); return reject(new Error('Conversion produced no output')); }
        const pdfBuffer = fs.readFileSync(pdfPath);
        fs.rmSync(tmpDir, { recursive: true, force: true });
        resolve(pdfBuffer);
      });
    });

    let fileBuffer;
    if (isLocal) {
      if (!isMediaDriveAvailable()) {
        return storageUnavailableResponse(res, 'Media drive (EXTERNAL_DRIVE_PATH)', EXTERNAL_DRIVE_PATH);
      }
      const fullPath = path.join(EXTERNAL_DRIVE_PATH, actualFileName);
      fileBuffer = await fs.promises.readFile(fullPath);
    } else {
      const chunks = [];
      const stream = await minioClient.getObject(FILE_BUCKET, actualFileName);
      await new Promise((resolve, reject) => {
        stream.on('data', chunk => chunks.push(chunk));
        stream.on('end', resolve);
        stream.on('error', reject);
      });
      fileBuffer = Buffer.concat(chunks);
    }

    if (needsConversion) {
      const pdfBuffer = await convertToPdf(fileBuffer, ext);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'inline');
      res.setHeader('Content-Length', pdfBuffer.length);
      return res.send(pdfBuffer);
    }

    // Serve PDF or other files directly
    res.setHeader('Content-Type', fileRecord.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Content-Length', fileBuffer.length);
    return res.send(fileBuffer);

  } catch (error) {
    console.error('Preview error:', error);
    res.status(500).json({ error: 'Preview generation failed' });
  }
});

// Stream endpoint: supports HTTP Range requests for video/audio seeking
app.get('/api/stream/:id', verifyToken, async (req, res) => {
  try {
    await hydrateRequestUser(req);
    const fileResult = await pool.query(
      'SELECT minio_filename, original_name, mime_type, department FROM vault_files WHERE id = $1 LIMIT 1',
      [req.params.id]
    );
    if (fileResult.rows.length === 0) return res.status(404).json({ error: 'File not found' });

    const fileRecord = fileResult.rows[0];
    if (!canAccessDepartment(req.user, fileRecord.department)) {
      return res.status(403).json({ error: 'Access Denied.' });
    }

    const isLocal = fileRecord.minio_filename.startsWith('local:');
    const actualFileName = isLocal ? fileRecord.minio_filename.substring(6) : fileRecord.minio_filename;
    const mimeType = fileRecord.mime_type || 'application/octet-stream';

    if (isLocal) {
      if (!isMediaDriveAvailable()) {
        return storageUnavailableResponse(res, 'Media drive (EXTERNAL_DRIVE_PATH)', EXTERNAL_DRIVE_PATH);
      }
      const fullPath = path.join(EXTERNAL_DRIVE_PATH, actualFileName);
      const stat = await fs.promises.stat(fullPath);
      const fileSize = stat.size;
      const range = req.headers.range;

      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunkSize = end - start + 1;
        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunkSize,
          'Content-Type': mimeType,
        });
        fs.createReadStream(fullPath, { start, end }).pipe(res);
      } else {
        res.writeHead(200, { 'Content-Length': fileSize, 'Content-Type': mimeType, 'Accept-Ranges': 'bytes' });
        fs.createReadStream(fullPath).pipe(res);
      }
    } else {
      // MinIO: buffer then serve (Range not supported via minio stream directly)
      const chunks = [];
      const stream = await minioClient.getObject(FILE_BUCKET, actualFileName);
      await new Promise((resolve, reject) => {
        stream.on('data', c => chunks.push(c));
        stream.on('end', resolve);
        stream.on('error', reject);
      });
      const fileBuffer = Buffer.concat(chunks);
      const fileSize = fileBuffer.length;
      const range = req.headers.range;

      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunkSize = end - start + 1;
        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunkSize,
          'Content-Type': mimeType,
        });
        res.end(fileBuffer.slice(start, end + 1));
      } else {
        res.writeHead(200, { 'Content-Length': fileSize, 'Content-Type': mimeType, 'Accept-Ranges': 'bytes' });
        res.end(fileBuffer);
      }
    }
  } catch (error) {
    console.error('Stream error:', error);
    res.status(500).json({ error: 'Streaming failed' });
  }
});

app.get('/api/download/:minioFilename', verifyToken, async (req, res) => {
  try {
    await hydrateRequestUser(req);
    // Check Database Privacy First
    const fileResult = await pool.query('SELECT department FROM vault_files WHERE minio_filename = $1 LIMIT 1', [req.params.minioFilename]);
    if (fileResult.rows.length === 0) return res.status(404).json({ error: "File not found in database" });

    const fileRecord = fileResult.rows[0];
    if (!canAccessDepartment(req.user, fileRecord.department)) {
      return res.status(403).json({ error: "Access Denied. You can only download files from your assigned department." });
    }

    const isLocal = req.params.minioFilename.startsWith('local:');
    const actualFileName = isLocal ? req.params.minioFilename.substring(6) : req.params.minioFilename;

    if (isLocal) {
      if (!isMediaDriveAvailable()) {
        return storageUnavailableResponse(res, 'Media drive (EXTERNAL_DRIVE_PATH)', EXTERNAL_DRIVE_PATH);
      }
      const fullPath = path.join(EXTERNAL_DRIVE_PATH, actualFileName);
      const stat = await fs.promises.stat(fullPath);
      res.setHeader('Content-Length', stat.size);
      const dataStream = fs.createReadStream(fullPath);
      dataStream.pipe(res);
    } else {
      const stat = await minioClient.statObject(FILE_BUCKET, actualFileName);
      res.setHeader('Content-Length', stat.size);
      const dataStream = await minioClient.getObject(FILE_BUCKET, actualFileName);
      dataStream.pipe(res);
    }
  } catch (error) {
    console.error(error);
    res.status(404).json({ error: "File not found" });
  }
});

app.delete('/api/files/:id', verifyToken, async (req, res) => {
  if (req.user.role !== 'Admin') {
    return res.status(403).json({ error: "Only Administrators can permanently delete files." });
  }

  // Phase 6.2: Require mandatory delete reason
  const deleteReason = req.body?.reason;
  if (!deleteReason || deleteReason.trim().length === 0) {
    return res.status(400).json({ error: "A deletion reason is required. This will be permanently recorded in the audit log." });
  }

  try {
    const result = await pool.query('SELECT minio_filename, original_name FROM vault_files WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "File not found" });

    const fileRecord = result.rows[0];
    const isLocal = fileRecord.minio_filename.startsWith('local:');
    const actualFileName = isLocal ? fileRecord.minio_filename.substring(6) : fileRecord.minio_filename;

    if (isLocal) {
      const fullPath = path.join(EXTERNAL_DRIVE_PATH, actualFileName);
      if (fs.existsSync(fullPath)) {
        await fs.promises.unlink(fullPath);
      }
    } else {
      await minioClient.removeObject(FILE_BUCKET, actualFileName);
    }

    await pool.query('DELETE FROM vault_files WHERE id = $1', [req.params.id]);

    // Log the deletion with mandatory reason
    await logAction(req.user.id, 'DELETE', req.params.id, `Deleted ${fileRecord.original_name} — Reason: ${deleteReason.trim()}`, req.ip);

    res.json({ success: true, message: "File permanently shredded." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to delete file" });
  }
});

app.post('/api/files/bulk', verifyToken, async (req, res) => {
  const { fileIds, action, payload } = req.body;

  if (!Array.isArray(fileIds) || fileIds.length === 0) {
    return res.status(400).json({ error: "No files specified" });
  }

  const validActions = ['DELETE', 'MOVE', 'COPY', 'RENAME', 'TAG', 'EXPIRY', 'DELETE_COPIES'];
  if (!validActions.includes(action)) {
    return res.status(400).json({ error: "Invalid bulk action" });
  }

  const normalizedTargetDepartment = payload?.targetDepartment || payload?.target_department || payload?.destinationDepartment || null;
  const normalizedTargetFolder = payload?.targetFolder ?? payload?.target_folder ?? payload?.destinationFolder ?? null;
  const normalizedRenames = payload?.renames || payload?.renameMap || payload?.names || null;

  const bulkActionFlagMap = {
    MOVE: 'can_bulk_move',
    COPY: 'can_bulk_copy',
    RENAME: 'can_bulk_rename',
    DELETE: 'can_bulk_delete',
    DOWNLOAD: 'can_bulk_download'
  };

  // Pre-loop RBAC check for strictly restricted actions
  if (action === 'DELETE' && req.user.role !== 'Admin') {
    return res.status(403).json({ error: "Only Admins can perform bulk delete." });
  }
  if (action === 'MOVE' && req.user.role === 'Staff') {
    return res.status(403).json({ error: "Staff cannot move files." });
  }
  if (action === 'MOVE' && req.user.role === 'Manager' && normalizedTargetDepartment !== req.user.department) {
    return res.status(403).json({ error: "Managers can only move files to their assigned department." });
  }

  const client = await pool.connect();

  try {
    await hydrateRequestUser(req);

    const requiredFlag = bulkActionFlagMap[action];
    if (requiredFlag && req.user.role !== 'Admin' && req.user[requiredFlag] === false) {
      return res.status(403).json({ error: `You do not have permission for bulk ${action.toLowerCase()}.` });
    }

    await client.query('BEGIN');

    const minioFilesToDelete = [];
    const undoEntries = [];

    for (const fileId of fileIds) {
      const result = await client.query('SELECT * FROM vault_files WHERE id = $1', [fileId]);
      if (result.rows.length === 0) {
        throw new Error(`File ID ${fileId} not found`);
      }

      const fileRecord = result.rows[0];
      const hasPermission = checkFilePermission(req.user, fileRecord, action);

      if (!hasPermission) {
        throw new Error(`Permission denied for file: ${fileRecord.original_name}`);
      }

      switch (action) {
        case 'DELETE':
          minioFilesToDelete.push(fileRecord.minio_filename);
          await client.query('DELETE FROM vault_files WHERE id = $1', [fileId]);
          break;
        case 'MOVE':
          undoEntries.push({
            file_id: fileId,
            prev_department: fileRecord.department,
            prev_folder: fileRecord.folder ?? null,
          });
          if (payload?.departmentsMap && payload.departmentsMap[fileId] !== undefined) {
            await client.query('UPDATE vault_files SET department = $1 WHERE id = $2', [payload.departmentsMap[fileId], fileId]);
          } else if (normalizedTargetDepartment) {
            await client.query(
              'UPDATE vault_files SET department = $1, folder = $2 WHERE id = $3',
              [normalizedTargetDepartment, normalizedTargetFolder, fileId]
            );
          } else {
            throw new Error("Target department is required");
          }
          break;
        case 'COPY':
          const copyName = `${crypto.randomUUID()}-${fileRecord.original_name}`;
          const newOriginalName = `(Copy) ${fileRecord.original_name}`;
          const copyTargetDept = normalizedTargetDepartment || fileRecord.department;
          const copyTargetFolder = normalizedTargetFolder !== null ? normalizedTargetFolder : fileRecord.folder;
          
          const isLocalCopy = fileRecord.minio_filename.startsWith('local:');
          const actualFilenameCopy = isLocalCopy ? fileRecord.minio_filename.substring(6) : fileRecord.minio_filename;
          let newStorageName = copyName;
          
          if (isLocalCopy) {
            const srcPath = path.join(EXTERNAL_DRIVE_PATH, actualFilenameCopy);
            const destPath = path.join(EXTERNAL_DRIVE_PATH, copyName);
            await fs.promises.copyFile(srcPath, destPath);
            newStorageName = 'local:' + copyName;
          } else {
            const conds = new Minio.CopyConditions();
            await minioClient.copyObject(FILE_BUCKET, copyName, `/${FILE_BUCKET}/${actualFilenameCopy}`, conds);
          }
          
          const copyResult = await client.query(
            `INSERT INTO vault_files (original_name, minio_filename, mime_type, size_bytes, file_hash, department, folder, uploaded_by, tags, auto_name, custom_name) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
            [newOriginalName, newStorageName, fileRecord.mime_type, fileRecord.size_bytes, fileRecord.file_hash, copyTargetDept, copyTargetFolder, req.user.id, fileRecord.tags ? JSON.stringify(fileRecord.tags) : '[]', fileRecord.auto_name || null, `(Copy) ${fileRecord.custom_name || fileRecord.original_name}`]
          );
          const sourceMeta = await client.query(
            'SELECT company_id, fy_id FROM vault_file_metadata WHERE file_id = $1 LIMIT 1',
            [fileId]
          );
          if (sourceMeta.rows.length > 0) {
            await client.query(
              'INSERT INTO vault_file_metadata (file_id, company_id, fy_id) VALUES ($1, $2, $3)',
              [copyResult.rows[0].id, sourceMeta.rows[0].company_id, sourceMeta.rows[0].fy_id]
            );
          }
          if (!req.createdIds) req.createdIds = [];
          req.createdIds.push(copyResult.rows[0].id);
          break;
        case 'DELETE_COPIES':
          minioFilesToDelete.push(fileRecord.minio_filename);
          await client.query('DELETE FROM vault_files WHERE id = $1', [fileId]);
          break;
        case 'RENAME':
          undoEntries.push({
            file_id: fileId,
            prev_original_name: fileRecord.original_name,
            prev_custom_name: fileRecord.custom_name ?? null,
          });
          if (!normalizedRenames || normalizedRenames[fileId] === undefined) throw new Error("New name required for all files");
          await client.query(
            'UPDATE vault_files SET original_name = $1, custom_name = $1 WHERE id = $2',
            [normalizedRenames[fileId], fileId]
          );
          break;
        case 'TAG':
          undoEntries.push({
            file_id: fileId,
            prev_tags: fileRecord.tags ?? null,
          });
          if (payload?.tagsMap && payload.tagsMap[fileId] !== undefined) {
            await client.query('UPDATE vault_files SET tags = $1 WHERE id = $2', [JSON.stringify(payload.tagsMap[fileId]), fileId]);
          } else if (payload?.tags) {
            await client.query('UPDATE vault_files SET tags = $1 WHERE id = $2', [JSON.stringify(payload.tags), fileId]);
          } else {
            throw new Error("Tags required");
          }
          break;
        case 'EXPIRY':
          undoEntries.push({
            file_id: fileId,
            prev_expiry_date: fileRecord.expiry_date ?? null,
          });
          if (payload?.expiryMap && payload.expiryMap[fileId] !== undefined) {
            await client.query('UPDATE vault_files SET expiry_date = $1 WHERE id = $2', [payload.expiryMap[fileId] || null, fileId]);
          } else if (payload?.expiryDate !== undefined) {
            await client.query('UPDATE vault_files SET expiry_date = $1 WHERE id = $2', [payload.expiryDate || null, fileId]);
          } else {
            throw new Error("Expiry date required");
          }
          break;
      }
    }

    await client.query('COMMIT');

    // Post-transaction
    if ((action === 'DELETE' || action === 'DELETE_COPIES') && minioFilesToDelete.length > 0) {
      for (const minioFile of minioFilesToDelete) {
        const isLocalDel = minioFile.startsWith('local:');
        const actualDelName = isLocalDel ? minioFile.substring(6) : minioFile;
        if (isLocalDel) {
          const fullPath = path.join(EXTERNAL_DRIVE_PATH, actualDelName);
          if (fs.existsSync(fullPath)) {
            await fs.promises.unlink(fullPath).catch(err => console.error(err));
          }
        } else {
          await minioClient.removeObject(FILE_BUCKET, actualDelName).catch(err => console.error("Minio delete error:", err));
        }
      }
    }

    let details = `Bulk ${action.toLowerCase()}d ${fileIds.length} files`;
    if (action === 'MOVE') details += ` to ${normalizedTargetDepartment}`;
    const bulkAuditId = await logAction(req.user.id, `BULK_${action}`, null, details, req.ip);
    if (['MOVE', 'RENAME', 'TAG', 'EXPIRY'].includes(action)) {
      await saveUndoPayload(bulkAuditId, `BULK_${action}`, { entries: undoEntries });
    } else if (action === 'COPY') {
      await saveUndoPayload(bulkAuditId, `BULK_${action}`, { created_file_ids: req.createdIds || [] });
    }

    res.json({ success: true, message: `Successfully completed ${action} on ${fileIds.length} files.`, createdIds: req.createdIds || [] });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error("Bulk action failed:", error.message);
    if (error.message.includes("Permission denied") || error.message.includes("not found")) {
      return res.status(403).json({ error: error.message });
    }
    res.status(500).json({ error: "Failed to process bulk action: " + error.message });
  } finally {
    client.release();
  }
});

app.get('/api/files/bulk/download', verifyToken, async (req, res) => {
  if (req.user.role === 'Guest') {
    return res.status(403).json({ error: "Guests cannot download files." });
  }

  const { ids } = req.query;
  if (!ids) return res.status(400).json({ error: "No file IDs provided" });

  const fileIds = ids.split(',').map(id => parseInt(id, 10));

  try {
    await hydrateRequestUser(req);
    if (req.user.role !== 'Admin' && req.user.can_bulk_download === false) {
      return res.status(403).json({ error: "You do not have permission for bulk download." });
    }
    const result = await pool.query('SELECT * FROM vault_files WHERE id = ANY($1::int[])', [fileIds]);
    
    // Filter out files user can't download
    const filesToDownload = result.rows.filter(fileRecord => canAccessDepartment(req.user, fileRecord.department));

    if (filesToDownload.length === 0) {
      return res.status(403).json({ error: "No accessible files to download." });
    }

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="smartvault_bulk_download.zip"');

    const archive = archiver('zip', { zlib: { level: 9 } });
    
    archive.on('error', function(err) {
      console.error("Archiver error:", err);
      if (!res.headersSent) res.status(500).end();
    });

    archive.pipe(res);

    for (const fileRecord of filesToDownload) {
      try {
        const isLocalZip = fileRecord.minio_filename.startsWith('local:');
        const actualZipName = isLocalZip ? fileRecord.minio_filename.substring(6) : fileRecord.minio_filename;
        let stream;
        
        if (isLocalZip) {
          stream = fs.createReadStream(path.join(EXTERNAL_DRIVE_PATH, actualZipName));
        } else {
          stream = await minioClient.getObject(FILE_BUCKET, actualZipName);
        }
        
        archive.append(stream, { name: fileRecord.original_name });
      } catch (err) {
        console.error(`Error appending file ${fileRecord.original_name} to zip:`, err);
      }
    }

    await archive.finalize();

    // Log the download
    await logAction(req.user.id, 'BULK_DOWNLOAD', null, `Bulk downloaded ${filesToDownload.length} files`, req.ip);

  } catch (error) {
    console.error("Bulk download error:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to create zip" });
    }
  }
});










// ============================================
// FINANCIAL YEAR LIFECYCLE ENGINE
// ============================================

/**
 * Calculates the current Indian Financial Year based on a date.
 * FY runs April 1 → March 31.
 * If today is April 29, 2026 → FY 2026-27 (start: 2026-04-01, end: 2027-03-31)
 * If today is January 15, 2027 → FY 2026-27 (start: 2026-04-01, end: 2027-03-31)
 */
function getCurrentFY(date = new Date()) {
  const month = date.getMonth(); // 0-indexed: 0=Jan, 3=Apr
  const year = date.getFullYear();

  // If we are in Jan-Mar, the FY started last year
  const fyStartYear = month >= 3 ? year : year - 1;
  const fyEndYear = fyStartYear + 1;

  return {
    name: `FY ${fyStartYear}-${String(fyEndYear).slice(-2)}`,
    start_date: `${fyStartYear}-04-01`,
    end_date: `${fyEndYear}-03-31`,
  };
}

async function syncFinancialYears() {
  console.log('[FY Engine] Running Financial Year sync...');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Calculate the current FY
    const currentFY = getCurrentFY();
    console.log(`[FY Engine] Current FY should be: ${currentFY.name}`);

    // 2. Ensure all companies have this FY
    const companies = await client.query('SELECT id FROM companies');
    for (const company of companies.rows) {
      const exists = await client.query(
        'SELECT id FROM financial_years WHERE company_id = $1 AND name = $2',
        [company.id, currentFY.name]
      );

      if (exists.rows.length === 0) {
        await client.query(
          `INSERT INTO financial_years (company_id, name, start_date, end_date, status) VALUES ($1, $2, $3, $4, 'Active')`,
          [company.id, currentFY.name, currentFY.start_date, currentFY.end_date]
        );
        console.log(`[FY Engine] Created ${currentFY.name} for company ${company.id}`);
      } else {
        // Ensure the current FY is Active
        await client.query(
          "UPDATE financial_years SET status = 'Active' WHERE id = $1 AND status != 'Active'",
          [exists.rows[0].id]
        );
      }

      // 3. Archive all past FYs for this company
      await client.query(
        `UPDATE financial_years SET status = 'Archived' 
         WHERE company_id = $1 AND name != $2 AND status = 'Active'`,
        [company.id, currentFY.name]
      );
    }

    await client.query('COMMIT');
    console.log('[FY Engine] Financial Year sync complete.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[FY Engine] Sync failed:', error.message);
  } finally {
    client.release();
  }
}

async function ensureDirectoryReady(dirPath, label) {
  try {
    if (!fs.existsSync(dirPath)) {
      if (!AUTO_CREATE_MEDIA_DIRS) {
        console.warn(`[Startup] ${label} does not exist: ${dirPath}`);
        return;
      }
      await fs.promises.mkdir(dirPath, { recursive: true });
      console.log(`[Startup] Created ${label}: ${dirPath}`);
      return;
    }
    await fs.promises.access(dirPath, fs.constants.R_OK | fs.constants.W_OK);
    console.log(`[Startup] ${label} is ready: ${dirPath}`);
  } catch (error) {
    console.error(`[Startup] ${label} check failed for ${dirPath}:`, error.message);
  }
}

async function ensureMinioBucket() {
  try {
    const exists = await minioClient.bucketExists(FILE_BUCKET);
    if (!exists) {
      if (!env.DEPLOYMENT.autoCreateBucket) {
        console.warn(`[Startup] MinIO bucket "${FILE_BUCKET}" does not exist and AUTO_CREATE_MINIO_BUCKET=false.`);
        return;
      }
      await minioClient.makeBucket(FILE_BUCKET);
      console.log(`[Startup] Created MinIO bucket: ${FILE_BUCKET}`);
    } else {
      console.log(`[Startup] MinIO bucket is ready: ${FILE_BUCKET}`);
    }
  } catch (error) {
    console.error('[Startup] MinIO bucket check failed:', error.message);
  }
}

async function bootstrapAdminIfConfigured() {
  if (!env.ADMIN_BOOTSTRAP.enabled) return;

  const adminEmail = String(env.ADMIN_BOOTSTRAP.email || '').trim();
  const adminPassword = String(env.ADMIN_BOOTSTRAP.password || '').trim();
  const adminUsername = String(env.ADMIN_BOOTSTRAP.username || 'admin').trim();
  const adminDepartment = String(env.ADMIN_BOOTSTRAP.department || 'Admin').trim();

  if (!adminEmail || !adminPassword) {
    console.warn('[Startup] Admin bootstrap is enabled but email/password are missing. Skipping bootstrap.');
    return;
  }

  try {
    const existingAdmin = await pool.query('SELECT id FROM users WHERE email = $1 LIMIT 1', [adminEmail]);
    if (existingAdmin.rows.length > 0) {
      console.log(`[Startup] Admin bootstrap skipped: user already exists (${adminEmail}).`);
      return;
    }

    const passwordHash = await bcrypt.hash(adminPassword, 10);
    await pool.query(
      `INSERT INTO users (username, email, password_hash, role, department, status)
       VALUES ($1, $2, $3, 'Admin', $4, 'Active')`,
      [adminUsername || 'admin', adminEmail, passwordHash, adminDepartment || 'Admin']
    );
    console.log(`[Startup] Bootstrap admin created: ${adminEmail}`);
  } catch (error) {
    console.error('[Startup] Admin bootstrap failed:', error.message);
  }
}

// ============================================
// SERVER START + CRON SCHEDULER
// ============================================

app.listen(PORT, HOST, async () => {
  console.log(`SmartVault API is SECURED and running on http://${HOST}:${PORT}`);
  await ensureDirectoryReady(EXTERNAL_DRIVE_PATH, 'media storage path');
  await ensureDirectoryReady(MEDIA_PREVIEW_CACHE_PATH, 'preview cache path');
  await ensureDirectoryReady(env.BACKUP.path, 'backup storage path');
  await ensureBackupDir();
  await ensureMinioBucket();
  await bootstrapAdminIfConfigured();

  // Run FY sync immediately on server boot
  await syncFinancialYears();

  // Schedule nightly sync at 2:00 AM every day
  cron.schedule('0 2 * * *', () => {
    console.log('[Cron] Running nightly FY lifecycle check...');
    syncFinancialYears();
  });
  console.log('[Cron] Nightly FY check scheduled for 02:00 AM.');

  cron.schedule(BACKUP_CRON, async () => {
    console.log('[Cron] Running scheduled backup snapshot...');
    try {
      const snapshot = await createBackupSnapshot(pool, { reason: 'scheduled' });
      console.log(`[Cron] Backup created: ${snapshot.backup_id}`);
    } catch (error) {
      console.error('[Cron] Backup creation failed:', error.message);
    }
  });
  console.log(`[Cron] Backup scheduler active: ${BACKUP_CRON}`);
});
