const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db/pool');
const env = require('../config/env');
const { verifyToken } = require('../middleware/auth');
const { logAction } = require('../services/auditService');
const { getEffectiveUserSettings } = require('../services/accessService');
const {
  ensureUsermasterfolderAccessSchema,
  replaceUsermasterfolderAccess,
  getUsermasterfolderAccess,
} = require('../services/usermasterfolderAccessService');

function normalizeCategories(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    if (value.startsWith('{') && value.endsWith('}')) {
      return value
        .slice(1, -1)
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
    }
    if (value.trim().length === 0) return [];
    return [value];
  }
  return [];
}

// POST /api/auth/register — Admin creates a new user
router.post('/register', verifyToken, async (req, res) => {
  if (req.user.role !== 'Admin')
    return res.status(403).json({ error: 'Only Administrators can create new user accounts.' });

  const { username, email, password, role, category, primary_masterfolder_id, masterfolder_access, folder_access } = req.body;
  if (!username || !email || !password || !category)
    return res.status(400).json({ error: 'Username, email, password, and category are required.' });

  try {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    await ensureUsermasterfolderAccessSchema(pool).catch(() => {});
    const { rows } = await pool.query(
      `INSERT INTO users (username, email, password_hash, role, category, can_bulk_move, can_bulk_copy, can_bulk_delete, can_bulk_rename, can_bulk_download, can_upload_to_allowed, can_manage_structure, can_download_folders)
       VALUES ($1, $2, $3, $4, $5, false, false, false, false, false, false, false, false) RETURNING id, username, role`,
      [username, email, hashedPassword, role || 'Staff', category]
    );
    const newUserId = rows[0].id;

    if (masterfolder_access && Array.isArray(masterfolder_access) && masterfolder_access.length > 0) {
      await replaceUsermasterfolderAccess(pool, newUserId, masterfolder_access).catch(() => {});
    } else if (primary_masterfolder_id) {
      await replaceUsermasterfolderAccess(pool, newUserId, [
        {
          masterfolder_id: Number(primary_masterfolder_id),
          category,
          can_upload: true,
          is_primary: true,
        },
      ]).catch(() => {});
    }

    if (folder_access && Array.isArray(folder_access) && folder_access.length > 0) {
      for (const fa of folder_access) {
         await pool.query(`INSERT INTO user_folder_access (user_id, masterfolder_id, category, folder_path, is_exclusion) VALUES ($1, $2, $3, $4, $5)`, [newUserId, fa.masterfolder_id, fa.category, fa.folder_path, fa.is_exclusion ? true : false]).catch(console.error);
      }
    }

    await logAction(req.user.id, 'CREATE_USER', newUserId, `Created user ${username}`, req.ip);
    console.log(`[EMAIL] Sending welcome email to ${email}`);
    const masterfolderAccess = await getUsermasterfolderAccess(pool, rows[0].id);
    res.json({ success: true, user: { ...rows[0], masterfolder_access: masterfolderAccess } });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A user with that email already exists.' });
    console.error('Registration error:', err.message);
    res.status(500).json({ error: 'Failed to register user' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (rows.length === 0) return res.status(400).json({ error: 'Invalid email or password' });

    const user = rows[0];
    if (user.status === 'Suspended') return res.status(403).json({ error: 'Your account is suspended.' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(400).json({ error: 'Invalid email or password' });

    const clientIp = req.ip || req.connection.remoteAddress;
    if (user.last_ip_address && user.last_ip_address !== clientIp) {
      console.log(`[SECURITY] New IP login: ${user.email} from ${clientIp}`);
    }
    await pool.query('UPDATE users SET last_ip_address = $1 WHERE id = $2', [clientIp, user.id]);

    const effectiveUser = await getEffectiveUserSettings(user.id);
    const fallbackAllowedCategories = normalizeCategories(user.allowed_categories);
    const tokenPayload = {
      id: user.id,
      role: user.role,
      token_version: user.token_version,
      category: user.category,
      allowed_categories: effectiveUser?.allowed_categories || fallbackAllowedCategories,
      can_upload_to_allowed: effectiveUser?.can_upload_to_allowed ?? false,
      can_download_folders: user.role === 'Admin' ? true : (effectiveUser?.can_download_folders ?? false),
      can_manage_structure: user.can_manage_structure ?? false,
    };
    const token = jwt.sign(tokenPayload, env.JWT_SECRET, { expiresIn: '8h' });

    const folderAccessRes = await pool.query(
      `SELECT masterfolder_id, category, folder_path, is_exclusion FROM user_folder_access WHERE user_id = $1`,
      [user.id]
    ).catch(() => ({ rows: [] }));

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        category: user.category,
        allowed_categories: effectiveUser?.allowed_categories || fallbackAllowedCategories,
        theme_preference: effectiveUser?.theme_preference || 'light',
        can_bulk_move: effectiveUser?.can_bulk_move ?? true,
        can_bulk_copy: effectiveUser?.can_bulk_copy ?? true,
        can_bulk_delete: effectiveUser?.can_bulk_delete ?? false,
        can_bulk_rename: effectiveUser?.can_bulk_rename ?? true,
        can_bulk_download: effectiveUser?.can_bulk_download ?? true,
        can_download_folders: user.role === 'Admin' ? true : (effectiveUser?.can_download_folders ?? false),
        can_upload_to_allowed: effectiveUser?.can_upload_to_allowed ?? false,
        dept_upload_permissions: effectiveUser?.dept_upload_permissions || {},
        can_manage_structure: user.can_manage_structure ?? false,
        masterfolder_access: await getUsermasterfolderAccess(pool, user.id),
        folder_access: folderAccessRes.rows,
      },
    });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: 'Login failed' });
  }
});

module.exports = router;
