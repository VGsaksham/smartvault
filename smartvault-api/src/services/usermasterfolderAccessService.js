const pool = require('../db/pool');

async function ensureUsermasterfolderAccessSchema(db = pool) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS user_masterfolder_access (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      masterfolder_id INTEGER NOT NULL REFERENCES masterfolders(id) ON DELETE CASCADE,
      category TEXT NOT NULL,
      can_upload BOOLEAN NOT NULL DEFAULT false,
      is_primary BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, masterfolder_id, category)
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS user_folder_access (
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      masterfolder_id INTEGER REFERENCES masterfolders(id) ON DELETE CASCADE,
      category VARCHAR(100) NOT NULL,
      folder_path TEXT NOT NULL,
      is_exclusion BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT NOW(),
      PRIMARY KEY (user_id, masterfolder_id, category, folder_path)
    );
  `).catch(err => console.error("Failed to create user_folder_access table", err));


  // If the table existed from an older/partial setup, ensure required columns exist.
  // (CREATE TABLE IF NOT EXISTS won't add missing columns.)
  await db.query(`ALTER TABLE user_masterfolder_access ADD COLUMN IF NOT EXISTS category TEXT;`).catch(() => {});
  await db.query(`ALTER TABLE user_masterfolder_access ADD COLUMN IF NOT EXISTS can_upload BOOLEAN NOT NULL DEFAULT false;`).catch(() => {});
  await db.query(`ALTER TABLE user_masterfolder_access ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT false;`).catch(() => {});
  await db.query(`ALTER TABLE user_masterfolder_access ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT NOW();`).catch(() => {});
  await db.query(`ALTER TABLE user_masterfolder_access ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW();`).catch(() => {});

  // Make sure category is not null if the column existed but was nullable.
  await db.query(`UPDATE user_masterfolder_access SET category = COALESCE(category, 'Finance') WHERE category IS NULL;`).catch(() => {});
  await db.query(`ALTER TABLE user_masterfolder_access ALTER COLUMN category SET NOT NULL;`).catch(() => {});

  // Drop the old primary key which might have only been (user_id, masterfolder_id)
  await db.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'user_masterfolder_access'::regclass
          AND contype = 'p'
      ) THEN
        ALTER TABLE user_masterfolder_access DROP CONSTRAINT user_masterfolder_access_pkey;
      END IF;
    END$$;
  `).catch(() => {});

  // Add the new correct primary key
  await db.query(`
    ALTER TABLE user_masterfolder_access
    ADD CONSTRAINT user_masterfolder_access_pkey PRIMARY KEY (user_id, masterfolder_id, category);
  `).catch((err) => {
    console.error("Failed to add new primary key:", err);
  });
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_user_masterfolder_access_user ON user_masterfolder_access(user_id);
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_user_masterfolder_access_company ON user_masterfolder_access(masterfolder_id);
  `);
  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_user_masterfolder_access_primary
    ON user_masterfolder_access(user_id)
    WHERE is_primary = true;
  `);

  // Legacy schemas sometimes had a unique key on (user_id, masterfolder_id),
  // which blocks assigning multiple categories within one company.
  // Remove that old key/index if present.
  await db.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'user_masterfolder_access'::regclass
          AND conname = 'user_masterfolder_access_key'
      ) THEN
        ALTER TABLE user_masterfolder_access DROP CONSTRAINT user_masterfolder_access_key;
      END IF;
      
      IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'user_masterfolder_access'::regclass
          AND conname = 'user_masterfolder_access_user_id_masterfolder_id_key'
      ) THEN
        ALTER TABLE user_masterfolder_access DROP CONSTRAINT user_masterfolder_access_user_id_masterfolder_id_key;
      END IF;
    END$$;
  `).catch(() => {});
  await db.query(`DROP INDEX IF EXISTS user_masterfolder_access_key;`).catch(() => {});
  await db.query(`DROP INDEX IF EXISTS user_masterfolder_access_user_id_masterfolder_id_key;`).catch(() => {});
  await db.query(`DROP INDEX IF EXISTS idx_user_masterfolder_access_user_company;`).catch(() => {});
}

function normalizemasterfolderAccess(rawAccess = [], fallbackCategory = '') {
  const arr = Array.isArray(rawAccess) ? rawAccess : [];
  const seen = new Set();
  const cleaned = [];
  const fallback = String(fallbackCategory || '').trim();

  for (const item of arr) {
    const companyId = Number(item?.masterfolder_id);
    let category = String(item?.category || '').trim();

    if (!Number.isFinite(companyId) || typeof category !== 'string') continue;

    const key = `${companyId}::${category}`;
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push({
      masterfolder_id: companyId,
      category,
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

async function replaceUsermasterfolderAccess(db, userId, accessList, fallbackCategory = '') {
  const normalized = normalizemasterfolderAccess(accessList, fallbackCategory);
  await db.query('DELETE FROM user_masterfolder_access WHERE user_id = $1', [userId]);
  for (const row of normalized) {
    await db.query(
      `INSERT INTO user_masterfolder_access (user_id, masterfolder_id, category, can_upload, is_primary)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, row.masterfolder_id, row.category, row.can_upload, row.is_primary]
    );
  }
  return normalized;
}

async function getUsermasterfolderAccess(db, userId) {
  const result = await db.query(
    `SELECT uca.masterfolder_id, c.name AS masterfolder_name, uca.category, uca.can_upload, uca.is_primary
     FROM user_masterfolder_access uca
     JOIN masterfolders c ON c.id = uca.masterfolder_id
     WHERE uca.user_id = $1
     ORDER BY uca.is_primary DESC, c.name ASC, uca.category ASC`,
    [userId]
  ).catch(() => ({ rows: [] }));
  return result.rows;
}

module.exports = {
  ensureUsermasterfolderAccessSchema,
  normalizemasterfolderAccess,
  replaceUsermasterfolderAccess,
  getUsermasterfolderAccess,
};
