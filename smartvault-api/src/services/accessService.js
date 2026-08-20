const pool = require('../db/pool');

function checkFilePermission(user, fileRecord, action) {
  if (user.role === 'Admin') return true;
  if (user.role === 'Guest') return false;

  // 'DELETE' and 'DELETE_COPIES' strictly blocked (unless Admin, which is handled above)
  if (action === 'DELETE' || action === 'DELETE_COPIES') return false; 

  const isOwnDeptOrAllowed = (fileRecord.category === user.category) || (user.allowed_categories && user.allowed_categories.includes(fileRecord.category));
  
  if (user.role === 'Manager') {
    // Edit (Rename/Tag/Expiry/Copy) & Move: Yes - own category (or allowed)
    if (['RENAME', 'TAG', 'EXPIRY', 'MOVE', 'COPY'].includes(action)) {
      return isOwnDeptOrAllowed;
    }
  }

  if (user.role === 'Staff') {
    // Move: allowed if they have the can_bulk_move permission and it's their department
    if (action === 'MOVE') {
      return user.can_bulk_move === true && isOwnDeptOrAllowed;
    }

    // Copy: allowed for anything in their department
    if (action === 'COPY') {
      return isOwnDeptOrAllowed;
    }

    // Edit (Rename/Tag/Expiry)
    if (['RENAME', 'TAG', 'EXPIRY'].includes(action)) {
      // Staff User: Own uploads only
      return fileRecord.uploaded_by === user.id;
    }
  }

  return false;
}

function canAccessCategory(user, category) {
  if (!user || !category) return false;
  if (user.role === 'Admin') return true;
  if (user.category === category) return true;
  return Array.isArray(user.allowed_categories) && user.allowed_categories.includes(category);
}

async function getEffectiveUserSettings(userId, db = pool) {
  const userResult = await db.query(
    `SELECT u.id, u.username, u.role, u.category, u.allowed_categories,
            COALESCE(up.theme_preference, u.theme_preference, 'light') AS theme_preference,
            COALESCE(up.can_upload_to_allowed, u.can_upload_to_allowed, false) AS can_upload_to_allowed,
            COALESCE(ub.can_bulk_move, u.can_bulk_move, true) AS can_bulk_move,
            COALESCE(ub.can_bulk_copy, u.can_bulk_copy, true) AS can_bulk_copy,
            COALESCE(ub.can_bulk_delete, u.can_bulk_delete, false) AS can_bulk_delete,
            COALESCE(ub.can_bulk_rename, u.can_bulk_rename, true) AS can_bulk_rename,
            COALESCE(ub.can_bulk_download, u.can_bulk_download, true) AS can_bulk_download,
            u.can_download_folders AS can_download_folders
     FROM users u
     LEFT JOIN user_preferences up ON up.user_id = u.id
     LEFT JOIN user_bulk_permissions ub ON ub.user_id = u.id
     WHERE u.id = $1
     LIMIT 1`,
    [userId]
  );

  if (userResult.rows.length === 0) return null;
  const effectiveUser = userResult.rows[0];

  const deptPermissionResult = await db.query(
    `SELECT category, can_upload
     FROM user_category_permissions
     WHERE user_id = $1
     ORDER BY category ASC`,
    [userId]
  );

  const deptUploadPermissions = {};
  for (const row of deptPermissionResult.rows) {
    deptUploadPermissions[row.category] = Boolean(row.can_upload);
  }

  const masterfolderAccessResult = await db.query(
    `SELECT masterfolder_id, category, can_upload, is_primary
     FROM user_masterfolder_access
     WHERE user_id = $1
     ORDER BY is_primary DESC, masterfolder_id ASC, category ASC`,
    [userId]
  ).catch(() => ({ rows: [] }));

  const folderAccessResult = await db.query(
    `SELECT masterfolder_id, category, folder_path, is_exclusion
     FROM user_folder_access
     WHERE user_id = $1
     ORDER BY masterfolder_id ASC, category ASC, folder_path ASC`,
    [userId]
  ).catch(() => ({ rows: [] }));

  return {
    ...effectiveUser,
    allowed_categories: effectiveUser.allowed_categories || [],
    dept_upload_permissions: deptUploadPermissions,
    masterfolder_access: masterfolderAccessResult.rows || [],
    folder_access: folderAccessResult.rows || [],
  };
}

async function hydrateRequestUser(req, db = pool) {
  const effective = await getEffectiveUserSettings(req.user.id, db);
  if (effective) {
    req.user = { ...req.user, ...effective };
  }
}

module.exports = {
  checkFilePermission,
  canAccessCategory,
  getEffectiveUserSettings,
  hydrateRequestUser,
};
