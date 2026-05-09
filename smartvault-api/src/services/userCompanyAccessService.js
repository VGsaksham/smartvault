const pool = require('../db/pool');

async function ensureUserCompanyAccessSchema(db = pool) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS user_company_access (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      department TEXT NOT NULL,
      can_upload BOOLEAN NOT NULL DEFAULT false,
      is_primary BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, company_id, department)
    );
  `);

  // If the table existed from an older/partial setup, ensure required columns exist.
  // (CREATE TABLE IF NOT EXISTS won't add missing columns.)
  await db.query(`ALTER TABLE user_company_access ADD COLUMN IF NOT EXISTS department TEXT;`).catch(() => {});
  await db.query(`ALTER TABLE user_company_access ADD COLUMN IF NOT EXISTS can_upload BOOLEAN NOT NULL DEFAULT false;`).catch(() => {});
  await db.query(`ALTER TABLE user_company_access ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT false;`).catch(() => {});
  await db.query(`ALTER TABLE user_company_access ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT NOW();`).catch(() => {});
  await db.query(`ALTER TABLE user_company_access ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW();`).catch(() => {});

  // Make sure department is not null if the column existed but was nullable.
  await db.query(`UPDATE user_company_access SET department = COALESCE(department, 'Finance') WHERE department IS NULL;`).catch(() => {});
  await db.query(`ALTER TABLE user_company_access ALTER COLUMN department SET NOT NULL;`).catch(() => {});

  // Ensure primary key exists (ignore if already present or incompatible).
  await db.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'user_company_access'::regclass
          AND contype = 'p'
      ) THEN
        ALTER TABLE user_company_access
        ADD CONSTRAINT user_company_access_pkey PRIMARY KEY (user_id, company_id, department);
      END IF;
    END$$;
  `).catch(() => {});
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_user_company_access_user ON user_company_access(user_id);
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_user_company_access_company ON user_company_access(company_id);
  `);
  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_user_company_access_primary
    ON user_company_access(user_id)
    WHERE is_primary = true;
  `);

  // Legacy schemas sometimes had a unique key on (user_id, company_id),
  // which blocks assigning multiple departments within one company.
  // Remove that old key/index if present.
  await db.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'user_company_access'::regclass
          AND conname = 'user_company_access_key'
      ) THEN
        ALTER TABLE user_company_access DROP CONSTRAINT user_company_access_key;
      END IF;
    END$$;
  `).catch(() => {});
  await db.query(`DROP INDEX IF EXISTS user_company_access_key;`).catch(() => {});
  await db.query(`DROP INDEX IF EXISTS idx_user_company_access_user_company;`).catch(() => {});
}

function normalizeCompanyAccess(rawAccess = [], fallbackDepartment = '') {
  const arr = Array.isArray(rawAccess) ? rawAccess : [];
  const seen = new Set();
  const cleaned = [];
  const fallback = String(fallbackDepartment || '').trim();

  for (const item of arr) {
    const companyId = Number(item?.company_id);
    const department = String(item?.department || '').trim() || fallback;
    if (!Number.isFinite(companyId) || !department) continue;
    const key = `${companyId}::${department}`;
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push({
      company_id: companyId,
      department,
      can_upload: Boolean(item?.can_upload),
      is_primary: Boolean(item?.is_primary),
    });
  }

  // keep max one primary
  let primaryFound = false;
  for (const item of cleaned) {
    if (item.is_primary && !primaryFound) {
      primaryFound = true;
      continue;
    }
    if (item.is_primary) item.is_primary = false;
  }
  if (!primaryFound && cleaned.length > 0) cleaned[0].is_primary = true;
  return cleaned;
}

async function replaceUserCompanyAccess(db, userId, accessList, fallbackDepartment = '') {
  const normalized = normalizeCompanyAccess(accessList, fallbackDepartment);
  await db.query('DELETE FROM user_company_access WHERE user_id = $1', [userId]);
  for (const row of normalized) {
    await db.query(
      `INSERT INTO user_company_access (user_id, company_id, department, can_upload, is_primary)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, row.company_id, row.department, row.can_upload, row.is_primary]
    );
  }
  return normalized;
}

async function getUserCompanyAccess(db, userId) {
  const result = await db.query(
    `SELECT uca.company_id, c.name AS company_name, uca.department, uca.can_upload, uca.is_primary
     FROM user_company_access uca
     JOIN companies c ON c.id = uca.company_id
     WHERE uca.user_id = $1
     ORDER BY uca.is_primary DESC, c.name ASC, uca.department ASC`,
    [userId]
  ).catch(() => ({ rows: [] }));
  return result.rows;
}

module.exports = {
  ensureUserCompanyAccessSchema,
  normalizeCompanyAccess,
  replaceUserCompanyAccess,
  getUserCompanyAccess,
};
