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
  ensureUserCompanyAccessSchema,
  replaceUserCompanyAccess,
  getUserCompanyAccess,
} = require('../services/userCompanyAccessService');

function normalizeDepartments(value) {
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

  const { username, email, password, role, department, primary_company_id } = req.body;
  if (!username || !email || !password || !department)
    return res.status(400).json({ error: 'Username, email, password, and department are required.' });

  try {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    await ensureUserCompanyAccessSchema(pool).catch(() => {});
    const { rows } = await pool.query(
      `INSERT INTO users (username, email, password_hash, role, department)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, username, role`,
      [username, email, hashedPassword, role || 'Staff', department]
    );
    if (primary_company_id) {
      await replaceUserCompanyAccess(pool, rows[0].id, [
        {
          company_id: Number(primary_company_id),
          department,
          can_upload: true,
          is_primary: true,
        },
      ]).catch(() => {});
    }
    await logAction(req.user.id, 'CREATE_USER', rows[0].id, `Created user ${username}`, req.ip);
    console.log(`[EMAIL] Sending welcome email to ${email}`);
    const companyAccess = await getUserCompanyAccess(pool, rows[0].id);
    res.json({ success: true, user: { ...rows[0], company_access: companyAccess } });
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
    const fallbackAllowedDepartments = normalizeDepartments(user.allowed_departments);
    const tokenPayload = {
      id: user.id,
      role: user.role,
      token_version: user.token_version,
      department: user.department,
      allowed_departments: effectiveUser?.allowed_departments || fallbackAllowedDepartments,
      can_upload_to_allowed: effectiveUser?.can_upload_to_allowed ?? false,
    };
    const token = jwt.sign(tokenPayload, env.JWT_SECRET, { expiresIn: '8h' });

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        department: user.department,
        allowed_departments: effectiveUser?.allowed_departments || fallbackAllowedDepartments,
        theme_preference: effectiveUser?.theme_preference || 'light',
        can_bulk_move: effectiveUser?.can_bulk_move ?? true,
        can_bulk_copy: effectiveUser?.can_bulk_copy ?? true,
        can_bulk_delete: effectiveUser?.can_bulk_delete ?? false,
        can_bulk_rename: effectiveUser?.can_bulk_rename ?? true,
        can_bulk_download: effectiveUser?.can_bulk_download ?? true,
        can_upload_to_allowed: effectiveUser?.can_upload_to_allowed ?? false,
        dept_upload_permissions: effectiveUser?.dept_upload_permissions || {},
        company_access: await getUserCompanyAccess(pool, user.id),
      },
    });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: 'Login failed' });
  }
});

module.exports = router;
