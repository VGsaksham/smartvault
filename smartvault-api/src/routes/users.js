const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { verifyToken } = require('../middleware/auth');
const { logAction } = require('../services/auditService');
const { hydrateRequestUser } = require('../services/accessService');
const {
  ensureUsermasterfolderAccessSchema,
  replaceUsermasterfolderAccess,
} = require('../services/usermasterfolderAccessService');

router.get('/', verifyToken, async (req, res) => {
  if (req.user.role !== 'Admin') return res.status(403).json({ error: "Only Administrators can view users." });
  try {
    const { masterfolderId, dummyNull, scope } = req.query;
    const normalizedMasterfolderId = masterfolderId ? Number(masterfolderId) : null;
    const colResult = await pool.query(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'users'`
    );
    const userCols = new Set(colResult.rows.map((r) => r.column_name));

    const masterfolderAccessTableResult = await pool.query(
      `SELECT to_regclass('public.user_masterfolder_access') IS NOT NULL AS exists`
    ).catch(() => ({ rows: [{ exists: false }] }));
    const hasUsermasterfolderAccessTable = Boolean(masterfolderAccessTableResult.rows?.[0]?.exists);
    let canReadmasterfolderAccess = false;
    if (hasUsermasterfolderAccessTable) {
      const masterfolderAccessColsResult = await pool.query(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'user_masterfolder_access'`
      ).catch(() => ({ rows: [] }));
      const masterfolderAccessCols = new Set(masterfolderAccessColsResult.rows.map((r) => r.column_name));
      canReadmasterfolderAccess =
        masterfolderAccessCols.has('user_id') &&
        masterfolderAccessCols.has('masterfolder_id') &&
        masterfolderAccessCols.has('category') &&
        masterfolderAccessCols.has('can_upload') &&
        masterfolderAccessCols.has('is_primary');
    }
    const folderAccessTableResult = await pool.query(
      `SELECT to_regclass('public.user_folder_access') IS NOT NULL AS exists`
    ).catch(() => ({ rows: [{ exists: false }] }));
    const hasUserFolderAccessTable = Boolean(folderAccessTableResult.rows?.[0]?.exists);
    let query = `
      SELECT
             u.id,
             u.username,
             u.email,
             ${userCols.has('role') ? 'u.role' : "'Staff'::text AS role"},
             ${userCols.has('category') ? 'u.category' : "NULL::text AS category"},
             ${userCols.has('allowed_categories') ? 'u.allowed_categories' : "ARRAY[]::text[] AS allowed_categories"},
             COALESCE(ub.can_bulk_move, u.can_bulk_move, true) AS can_bulk_move,
             COALESCE(ub.can_bulk_copy, u.can_bulk_copy, true) AS can_bulk_copy,
             COALESCE(ub.can_bulk_delete, u.can_bulk_delete, false) AS can_bulk_delete,
             COALESCE(ub.can_bulk_rename, u.can_bulk_rename, true) AS can_bulk_rename,
             COALESCE(ub.can_bulk_download, u.can_bulk_download, true) AS can_bulk_download,
             ${userCols.has('can_download_folders') ? 'COALESCE(u.can_download_folders, false)' : 'false'} AS can_download_folders,
             ${userCols.has('can_upload_to_allowed') ? 'COALESCE(u.can_upload_to_allowed, false)' : 'false'} AS can_upload_to_allowed,
             ${userCols.has('can_manage_structure') ? 'COALESCE(u.can_manage_structure, false)' : 'false'} AS can_manage_structure,
             ${userCols.has('theme_preference') ? "COALESCE(u.theme_preference, 'light')" : "'light'"} AS theme_preference,
             ${userCols.has('status') ? 'u.status' : "'Active'::text AS status"},
             ${userCols.has('last_ip_address') ? 'u.last_ip_address' : 'NULL::text AS last_ip_address'},
             ${userCols.has('created_at') ? 'u.created_at' : 'NOW() AS created_at'},
             ${canReadmasterfolderAccess ? "COALESCE(ca.masterfolder_access, '[]'::json) AS masterfolder_access" : "'[]'::json AS masterfolder_access"},
             ${hasUserFolderAccessTable ? "COALESCE(fa.folder_access, '[]'::json) AS folder_access" : "'[]'::json AS folder_access"}
      FROM users u
      ${canReadmasterfolderAccess ? `
      LEFT JOIN LATERAL (
        SELECT json_agg(
          json_build_object(
            'masterfolder_id', uca.masterfolder_id,
            'masterfolder_name', m.name,
            'category', uca.category,
            'can_upload', uca.can_upload,
            'is_primary', uca.is_primary
          )
          ORDER BY uca.is_primary DESC, m.name, uca.category
        ) AS masterfolder_access
        FROM user_masterfolder_access uca
        JOIN masterfolders m ON m.id = uca.masterfolder_id
        WHERE uca.user_id = u.id
      ) ca ON TRUE` : ''}
      ${hasUserFolderAccessTable ? `
      LEFT JOIN LATERAL (
        SELECT json_agg(
          json_build_object(
            'masterfolder_id', ufa.masterfolder_id,
            'category', ufa.category,
            'folder_path', ufa.folder_path,
            'is_exclusion', ufa.is_exclusion
          )
        ) AS folder_access
        FROM user_folder_access ufa
        WHERE ufa.user_id = u.id
      ) fa ON TRUE` : ''}
      LEFT JOIN user_bulk_permissions ub ON ub.user_id = u.id
      WHERE 1=1
    `;
    // Hide superadmin from Admin UI list (still exists in DB).
    query += ` AND LOWER(u.username) <> 'superadmin'`;
    const values = [];
    let p = 1;
    // By default, Admin user management should list all users, including newly created accounts
    // that have not uploaded files yet. Filter by uploader activity only when explicitly requested.
    if (normalizedMasterfolderId && scope === 'activeUploaders') {
      query += ` AND u.id IN (SELECT DISTINCT vf.uploaded_by FROM vault_files vf JOIN vault_file_metadata vfm ON vfm.file_id = vf.id WHERE 1=1 `;
      query += ` AND vfm.masterfolder_id = $${p++}`; values.push(normalizedMasterfolderId);
      query += `)`;
    }
    query += ` ORDER BY u.created_at DESC`;
    const result = await pool.query(query, values);

    const deptPermResult = await pool.query('SELECT user_id, category, can_upload FROM user_category_permissions')
      .catch(() => ({ rows: [] }));
    const deptPermByUser = {};
    for (const row of deptPermResult.rows) {
      if (!deptPermByUser[row.user_id]) deptPermByUser[row.user_id] = {};
      deptPermByUser[row.user_id][row.category] = Boolean(row.can_upload);
    }

    res.json(result.rows.map(u => ({ ...u, dept_upload_permissions: deptPermByUser[u.id] || {} })));
  } catch (err) {
    console.error('Users fetch error:', err.message);
    res.status(500).json({ error: `Failed to fetch users: ${err.message}` });
  }
});

router.put('/:id/role', verifyToken, async (req, res) => {
  if (req.user.role !== 'Admin') return res.status(403).json({ error: "Only Administrators can modify user roles." });
  const { role, category } = req.body;
  if (!role && !category) {
    return res.status(400).json({ error: "Role or category is required." });
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
    if (category && userColumns.has('category')) {
      updates.push(`category = $${c++}`);
      params.push(category);
    }
    if (role && userColumns.has('allowed_categories')) updates.push(`allowed_categories = ARRAY[]::text[]`);
    if (role && userColumns.has('can_bulk_move')) updates.push(`can_bulk_move = true`);
    if (role && userColumns.has('can_bulk_copy')) updates.push(`can_bulk_copy = true`);
    if (role && userColumns.has('can_bulk_delete')) updates.push(`can_bulk_delete = false`);
    if (role && userColumns.has('can_bulk_rename')) updates.push(`can_bulk_rename = true`);
    if (role && userColumns.has('can_bulk_download')) updates.push(`can_bulk_download = true`);
    if (role && userColumns.has('can_download_folders')) updates.push(`can_download_folders = true`);
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
      await client.query('DELETE FROM user_category_permissions WHERE user_id = $1', [req.params.id]).catch(() => {});
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
    allowed_categories = [],
    can_bulk_move,
    can_bulk_copy,
    can_bulk_delete,
    can_bulk_rename,
    can_bulk_download,
    can_download_folders,
    can_upload_to_allowed,
    can_manage_structure,
    preference_updates,
    masterfolder_access = [],
    folder_access = [],
  } = req.body || {};

  const masterfolderAccessCategories = (Array.isArray(masterfolder_access) ? masterfolder_access : [])
    .map((x) => String(x?.category || '').trim())
    .filter(Boolean);
  const folderAccessCategories = (Array.isArray(folder_access) ? folder_access : [])
    .map((x) => String(x?.category || '').trim())
    .filter(Boolean);
  const safeAllowedCategories = Array.from(new Set([
    ...(Array.isArray(allowed_categories) ? allowed_categories : []),
    ...masterfolderAccessCategories,
    ...folderAccessCategories,
  ].map((d) => String(d || '').trim()).filter(Boolean)));
  const categoryUploadPermissions = preference_updates?.category_upload_permissions || {};

  const client = await pool.connect();
  try {
    await ensureUsermasterfolderAccessSchema(client);
    await client.query('BEGIN');

    await client.query(
      `UPDATE users
       SET allowed_categories = $1, can_manage_structure = $3, can_download_folders = $4, can_bulk_download = $5
       WHERE id = $2`,
      [safeAllowedCategories, userId, can_manage_structure === true, can_download_folders === true, (can_download_folders === true || can_bulk_download !== false)]
    ).catch((err) => console.log('user structure err', err));

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
        (can_download_folders === true || can_bulk_download !== false),
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

    await client.query('DELETE FROM user_category_permissions WHERE user_id = $1', [userId]).catch(() => {});
    for (const category of safeAllowedCategories) {
      await client.query(
        `INSERT INTO user_category_permissions (user_id, category, can_upload)
         VALUES ($1, $2, $3)`,
        [userId, category, Boolean(categoryUploadPermissions[category])]
      ).catch(() => {});
    }

    const targetUserRes = await client.query(
      `SELECT category FROM users WHERE id = $1 LIMIT 1`,
      [userId]
    );
    const fallbackCategory =
      String(safeAllowedCategories[0] || targetUserRes.rows?.[0]?.category || '').trim();
    await replaceUsermasterfolderAccess(client, userId, masterfolder_access, fallbackCategory);

    await client.query('DELETE FROM user_folder_access WHERE user_id = $1', [userId]).catch(() => {});
    if (Array.isArray(folder_access)) {
      for (const fa of folder_access) {
        if (!fa.masterfolder_id || !fa.category || !fa.folder_path) continue;
        await client.query(
          `INSERT INTO user_folder_access (user_id, masterfolder_id, category, folder_path, is_exclusion)
           VALUES ($1, $2, $3, $4, $5)`,
          [userId, fa.masterfolder_id, fa.category, fa.folder_path, Boolean(fa.is_exclusion)]
        ).catch(err => console.error("folder_access insert error", err));
      }
    }

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
