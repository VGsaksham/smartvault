const pool = require('../db/pool');

function checkFilePermission(user, fileRecord, action) {
  if (user.role === 'Admin') return true;
  if (user.role === 'Guest') return false;

  // 'DELETE' and 'DELETE_COPIES' strictly blocked (unless Admin, which is handled above)
  if (action === 'DELETE' || action === 'DELETE_COPIES') return false; 

  const isOwnDeptOrAllowed = (fileRecord.department === user.department) || (user.allowed_departments && user.allowed_departments.includes(fileRecord.department));
  
  if (user.role === 'Manager') {
    // Edit (Rename/Tag/Expiry/Copy) & Move: Yes - own dept (or allowed)
    if (['RENAME', 'TAG', 'EXPIRY', 'MOVE', 'COPY'].includes(action)) {
      return isOwnDeptOrAllowed;
    }
  }

  if (user.role === 'Staff') {
    // Move: No
    if (action === 'MOVE') return false;

    // Edit (Rename/Tag/Expiry) & Copy
    if (['RENAME', 'TAG', 'EXPIRY', 'COPY'].includes(action)) {
      // Staff User: Own uploads only
      return fileRecord.uploaded_by === user.id;
    }
  }

  return false;
}

function canAccessDepartment(user, department) {
  if (!user || !department) return false;
  if (user.role === 'Admin') return true;
  if (user.department === department) return true;
  return Array.isArray(user.allowed_departments) && user.allowed_departments.includes(department);
}

async function getEffectiveUserSettings(userId, db = pool) {
  const userResult = await db.query(
    `SELECT u.id, u.username, u.role, u.department, u.allowed_departments,
            COALESCE(up.theme_preference, u.theme_preference, 'light') AS theme_preference,
            COALESCE(up.can_upload_to_allowed, u.can_upload_to_allowed, false) AS can_upload_to_allowed,
            COALESCE(ub.can_bulk_move, u.can_bulk_move, true) AS can_bulk_move,
            COALESCE(ub.can_bulk_copy, u.can_bulk_copy, true) AS can_bulk_copy,
            COALESCE(ub.can_bulk_delete, u.can_bulk_delete, false) AS can_bulk_delete,
            COALESCE(ub.can_bulk_rename, u.can_bulk_rename, true) AS can_bulk_rename,
            COALESCE(ub.can_bulk_download, u.can_bulk_download, true) AS can_bulk_download
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
    `SELECT department, can_upload
     FROM user_department_permissions
     WHERE user_id = $1
     ORDER BY department ASC`,
    [userId]
  );

  const deptUploadPermissions = {};
  for (const row of deptPermissionResult.rows) {
    deptUploadPermissions[row.department] = Boolean(row.can_upload);
  }

  const companyAccessResult = await db.query(
    `SELECT company_id, department, can_upload, is_primary
     FROM user_company_access
     WHERE user_id = $1
     ORDER BY is_primary DESC, company_id ASC, department ASC`,
    [userId]
  ).catch(() => ({ rows: [] }));

  const folderAccessResult = await db.query(
    `SELECT company_id, department, folder_path, is_exclusion
     FROM user_folder_access
     WHERE user_id = $1
     ORDER BY company_id ASC, department ASC, folder_path ASC`,
    [userId]
  ).catch(() => ({ rows: [] }));

  return {
    ...effectiveUser,
    allowed_departments: effectiveUser.allowed_departments || [],
    dept_upload_permissions: deptUploadPermissions,
    company_access: companyAccessResult.rows || [],
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
  canAccessDepartment,
  getEffectiveUserSettings,
  hydrateRequestUser,
};
