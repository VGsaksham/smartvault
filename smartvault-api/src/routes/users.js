const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { verifyToken } = require('../middleware/auth');
const { logAction } = require('../services/auditService');
const { hydrateRequestUser } = require('../services/accessService');
const {
  ensureUserCompanyAccessSchema,
  replaceUserCompanyAccess,
} = require('../services/userCompanyAccessService');

router.get('/', verifyToken, async (req, res) => {
  if (req.user.role !== 'Admin') return res.status(403).json({ error: "Only Administrators can view users." });
  try {
    const { companyId, fyId, scope } = req.query;
    const normalizedCompanyId = companyId ? Number(companyId) : null;
    const normalizedFyId = fyId ? Number(fyId) : null;
    const colResult = await pool.query(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'users'`
    );
    const userCols = new Set(colResult.rows.map((r) => r.column_name));

    const companyAccessTableResult = await pool.query(
      `SELECT to_regclass('public.user_company_access') IS NOT NULL AS exists`
    ).catch(() => ({ rows: [{ exists: false }] }));
    const hasUserCompanyAccessTable = Boolean(companyAccessTableResult.rows?.[0]?.exists);
    let canReadCompanyAccess = false;
    if (hasUserCompanyAccessTable) {
      const companyAccessColsResult = await pool.query(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'user_company_access'`
      ).catch(() => ({ rows: [] }));
      const companyAccessCols = new Set(companyAccessColsResult.rows.map((r) => r.column_name));
      canReadCompanyAccess =
        companyAccessCols.has('user_id') &&
        companyAccessCols.has('company_id') &&
        companyAccessCols.has('department') &&
        companyAccessCols.has('can_upload') &&
        companyAccessCols.has('is_primary');
    }
    let query = `
      SELECT
             u.id,
             u.username,
             u.email,
             ${userCols.has('role') ? 'u.role' : "'Staff'::text AS role"},
             ${userCols.has('department') ? 'u.department' : "NULL::text AS department"},
             ${userCols.has('allowed_departments') ? 'u.allowed_departments' : "ARRAY[]::text[] AS allowed_departments"},
             ${userCols.has('can_bulk_move') ? 'COALESCE(u.can_bulk_move, true)' : 'true'} AS can_bulk_move,
             ${userCols.has('can_bulk_copy') ? 'COALESCE(u.can_bulk_copy, true)' : 'true'} AS can_bulk_copy,
             ${userCols.has('can_bulk_delete') ? 'COALESCE(u.can_bulk_delete, false)' : 'false'} AS can_bulk_delete,
             ${userCols.has('can_bulk_rename') ? 'COALESCE(u.can_bulk_rename, true)' : 'true'} AS can_bulk_rename,
             ${userCols.has('can_bulk_download') ? 'COALESCE(u.can_bulk_download, true)' : 'true'} AS can_bulk_download,
             ${userCols.has('can_upload_to_allowed') ? 'COALESCE(u.can_upload_to_allowed, false)' : 'false'} AS can_upload_to_allowed,
             ${userCols.has('theme_preference') ? "COALESCE(u.theme_preference, 'light')" : "'light'"} AS theme_preference,
             ${userCols.has('status') ? 'u.status' : "'Active'::text AS status"},
             ${userCols.has('last_ip_address') ? 'u.last_ip_address' : 'NULL::text AS last_ip_address'},
             ${userCols.has('created_at') ? 'u.created_at' : 'NOW() AS created_at'},
             ${canReadCompanyAccess ? "COALESCE(ca.company_access, '[]'::json) AS company_access" : "'[]'::json AS company_access"}
      FROM users u
      ${canReadCompanyAccess ? `
      LEFT JOIN LATERAL (
        SELECT json_agg(
          json_build_object(
            'company_id', uca.company_id,
            'company_name', c.name,
            'department', uca.department,
            'can_upload', uca.can_upload,
            'is_primary', uca.is_primary
          )
          ORDER BY uca.is_primary DESC, c.name, uca.department
        ) AS company_access
        FROM user_company_access uca
        JOIN companies c ON c.id = uca.company_id
        WHERE uca.user_id = u.id
      ) ca ON TRUE` : ''}
      WHERE 1=1
    `;
    // Hide superadmin from Admin UI list (still exists in DB).
    query += ` AND LOWER(u.username) <> 'superadmin'`;
    const values = [];
    let p = 1;
    // By default, Admin user management should list all users, including newly created accounts
    // that have not uploaded files yet. Filter by uploader activity only when explicitly requested.
    if ((normalizedCompanyId || normalizedFyId) && scope === 'activeUploaders') {
      query += ` AND u.id IN (SELECT DISTINCT vf.uploaded_by FROM vault_files vf JOIN vault_file_metadata vfm ON vfm.file_id = vf.id WHERE 1=1 `;
      if (normalizedCompanyId) { query += ` AND vfm.company_id = $${p++}`; values.push(normalizedCompanyId); }
      if (normalizedFyId) { query += ` AND vfm.fy_id = $${p++}`; values.push(normalizedFyId); }
      query += `)`;
    }
    query += ` ORDER BY u.created_at DESC`;
    const result = await pool.query(query, values);

    const deptPermResult = await pool.query('SELECT user_id, department, can_upload FROM user_department_permissions')
      .catch(() => ({ rows: [] }));
    const deptPermByUser = {};
    for (const row of deptPermResult.rows) {
      if (!deptPermByUser[row.user_id]) deptPermByUser[row.user_id] = {};
      deptPermByUser[row.user_id][row.department] = Boolean(row.can_upload);
    }

    res.json(result.rows.map(u => ({ ...u, dept_upload_permissions: deptPermByUser[u.id] || {} })));
  } catch (err) {
    console.error('Users fetch error:', err.message);
    res.status(500).json({ error: `Failed to fetch users: ${err.message}` });
  }
});

router.put('/:id/role', verifyToken, async (req, res) => {
  if (req.user.role !== 'Admin') return res.status(403).json({ error: "Only Administrators can modify user roles." });
  const { role, department } = req.body;
  if (!role && !department) {
    return res.status(400).json({ error: "Role or department is required." });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const columnResult = await client.query(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'users'`
    );
    const userColumns = new Set(columnResult.rows.map((r) => r.column_name));

    const updates = [];
    const params = [];
    let c = 1;

    if (role && userColumns.has('role')) {
      updates.push(`role = $${c++}`);
      params.push(role);
    }
    if (department && userColumns.has('department')) {
      updates.push(`department = $${c++}`);
      params.push(department);
    }
    if (role && userColumns.has('allowed_departments')) updates.push(`allowed_departments = ARRAY[]::text[]`);
    if (role && userColumns.has('can_bulk_move')) updates.push(`can_bulk_move = true`);
    if (role && userColumns.has('can_bulk_copy')) updates.push(`can_bulk_copy = true`);
    if (role && userColumns.has('can_bulk_delete')) updates.push(`can_bulk_delete = false`);
    if (role && userColumns.has('can_bulk_rename')) updates.push(`can_bulk_rename = true`);
    if (role && userColumns.has('can_bulk_download')) updates.push(`can_bulk_download = true`);
    if (role && userColumns.has('can_upload_to_allowed')) updates.push(`can_upload_to_allowed = false`);

    if (updates.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: "No compatible fields found to update for this schema." });
    }

    params.push(req.params.id);
    const result = await client.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${c} RETURNING *`,
      params
    );
    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: "User not found." });
    }

    if (role) {
      await client.query('DELETE FROM user_bulk_permissions WHERE user_id = $1', [req.params.id]).catch(() => {});
      await client.query('DELETE FROM user_department_permissions WHERE user_id = $1', [req.params.id]).catch(() => {});
    }
    await client.query('COMMIT');
    res.json({ success: true, user: result.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: `Failed to update user role: ${err.message}` });
  } finally {
    client.release();
  }
});

router.delete('/:id', verifyToken, async (req, res) => {
  if (req.user.role !== 'Admin') return res.status(403).json({ error: "Only Administrators can delete users." });
  try {
    if (Number(req.params.id) === Number(req.user?.id)) {
      return res.status(400).json({ error: "You cannot delete your own account." });
    }
    const who = await pool.query('SELECT username FROM users WHERE id = $1', [req.params.id]).catch(() => ({ rows: [] }));
    const uname = String(who.rows?.[0]?.username || '').toLowerCase();
    if (uname === 'superadmin') {
      return res.status(403).json({ error: "SuperAdmin cannot be deleted." });
    }
    await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
    res.json({ success: true, message: `User deleted successfully.` });
  } catch (err) {
    // Most common reason: FK references (uploaded files, metadata, audit logs, etc.)
    res.status(409).json({ error: `Failed to delete user: ${err.message}` });
  }
});

router.patch('/:id/permissions', verifyToken, async (req, res) => {
  if (req.user.role !== 'Admin') return res.status(403).json({ error: "Admin only." });

  const userId = Number(req.params.id);
  if (!Number.isFinite(userId)) return res.status(400).json({ error: "Invalid user id." });

  const {
    allowed_departments = [],
    can_bulk_move,
    can_bulk_copy,
    can_bulk_delete,
    can_bulk_rename,
    can_bulk_download,
    can_upload_to_allowed,
    preference_updates,
    company_access = [],
  } = req.body || {};

  const companyAccessDepartments = (Array.isArray(company_access) ? company_access : [])
    .map((x) => String(x?.department || '').trim())
    .filter(Boolean);
  const safeAllowedDepartments = Array.from(new Set([
    ...(Array.isArray(allowed_departments) ? allowed_departments : []),
    ...companyAccessDepartments,
  ].map((d) => String(d || '').trim()).filter(Boolean)));
  const departmentUploadPermissions = preference_updates?.department_upload_permissions || {};

  const client = await pool.connect();
  try {
    await ensureUserCompanyAccessSchema(client);
    await client.query('BEGIN');

    await client.query(
      `UPDATE users
       SET allowed_departments = $1
       WHERE id = $2`,
      [safeAllowedDepartments, userId]
    ).catch(() => {});

    await client.query(
      `INSERT INTO user_bulk_permissions (user_id, can_bulk_move, can_bulk_copy, can_bulk_delete, can_bulk_rename, can_bulk_download)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id) DO UPDATE
       SET can_bulk_move = EXCLUDED.can_bulk_move,
           can_bulk_copy = EXCLUDED.can_bulk_copy,
           can_bulk_delete = EXCLUDED.can_bulk_delete,
           can_bulk_rename = EXCLUDED.can_bulk_rename,
           can_bulk_download = EXCLUDED.can_bulk_download,
           updated_at = NOW()`,
      [
        userId,
        can_bulk_move !== false,
        can_bulk_copy !== false,
        can_bulk_delete === true,
        can_bulk_rename !== false,
        can_bulk_download !== false,
      ]
    ).catch(() => {});

    await client.query(
      `INSERT INTO user_preferences (user_id, can_upload_to_allowed)
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE
       SET can_upload_to_allowed = EXCLUDED.can_upload_to_allowed,
           updated_at = NOW()`,
      [userId, can_upload_to_allowed === true]
    ).catch(() => {});

    await client.query('DELETE FROM user_department_permissions WHERE user_id = $1', [userId]).catch(() => {});
    for (const department of safeAllowedDepartments) {
      await client.query(
        `INSERT INTO user_department_permissions (user_id, department, can_upload)
         VALUES ($1, $2, $3)`,
        [userId, department, Boolean(departmentUploadPermissions[department])]
      ).catch(() => {});
    }

    const targetUserRes = await client.query(
      `SELECT department FROM users WHERE id = $1 LIMIT 1`,
      [userId]
    );
    const fallbackDepartment =
      String(safeAllowedDepartments[0] || targetUserRes.rows?.[0]?.department || '').trim();
    await replaceUserCompanyAccess(client, userId, company_access, fallbackDepartment);

    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    res.status(500).json({ error: `Failed to update permissions: ${err.message}` });
  } finally {
    client.release();
  }
});

router.patch('/:id/theme', verifyToken, async (req, res) => {
  if (req.user.id !== parseInt(req.params.id)) return res.status(403).json({ error: "Self only" });
  try {
    const theme = req.body.theme_preference || 'light';
    const colResult = await pool.query(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'users'`
    );
    const userCols = new Set(colResult.rows.map((r) => r.column_name));

    if (userCols.has('theme_preference')) {
      await pool.query(`UPDATE users SET theme_preference = $1 WHERE id = $2`, [theme, req.params.id]);
    } else {
      const hasPrefTableResult = await pool.query(
        `SELECT to_regclass('public.user_preferences') IS NOT NULL AS exists`
      );
      if (!hasPrefTableResult.rows[0]?.exists) {
        return res.status(400).json({ error: "Theme preference storage not configured." });
      }
      const updateResult = await pool.query(
        'UPDATE user_preferences SET theme_preference = $1 WHERE user_id = $2',
        [theme, req.params.id]
      );
      if (updateResult.rowCount === 0) {
        await pool.query(
          'INSERT INTO user_preferences (user_id, theme_preference) VALUES ($1, $2)',
          [req.params.id, theme]
        );
      }
    }
    res.json({ success: true });
  } catch(err) {
    res.status(500).json({error: `Failed to update theme: ${err.message}`});
  }
});

module.exports = router;
