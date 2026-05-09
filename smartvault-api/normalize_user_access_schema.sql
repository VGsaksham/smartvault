CREATE TABLE IF NOT EXISTS user_preferences (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  theme_preference VARCHAR(20) NOT NULL DEFAULT 'light',
  can_upload_to_allowed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_bulk_permissions (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  can_bulk_move BOOLEAN NOT NULL DEFAULT true,
  can_bulk_copy BOOLEAN NOT NULL DEFAULT true,
  can_bulk_delete BOOLEAN NOT NULL DEFAULT false,
  can_bulk_rename BOOLEAN NOT NULL DEFAULT true,
  can_bulk_download BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_department_permissions (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  department TEXT NOT NULL,
  can_upload BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, department)
);

CREATE INDEX IF NOT EXISTS idx_udp_user_id ON user_department_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_udp_department ON user_department_permissions(department);

INSERT INTO user_preferences (user_id, theme_preference, can_upload_to_allowed)
SELECT id, COALESCE(theme_preference, 'light'), COALESCE(can_upload_to_allowed, false)
FROM users
ON CONFLICT (user_id) DO UPDATE SET
  theme_preference = EXCLUDED.theme_preference,
  can_upload_to_allowed = EXCLUDED.can_upload_to_allowed,
  updated_at = NOW();

INSERT INTO user_bulk_permissions (
  user_id,
  can_bulk_move,
  can_bulk_copy,
  can_bulk_delete,
  can_bulk_rename,
  can_bulk_download
)
SELECT
  id,
  COALESCE(can_bulk_move, true),
  COALESCE(can_bulk_copy, true),
  COALESCE(can_bulk_delete, false),
  COALESCE(can_bulk_rename, true),
  COALESCE(can_bulk_download, true)
FROM users
ON CONFLICT (user_id) DO UPDATE SET
  can_bulk_move = EXCLUDED.can_bulk_move,
  can_bulk_copy = EXCLUDED.can_bulk_copy,
  can_bulk_delete = EXCLUDED.can_bulk_delete,
  can_bulk_rename = EXCLUDED.can_bulk_rename,
  can_bulk_download = EXCLUDED.can_bulk_download,
  updated_at = NOW();

INSERT INTO user_department_permissions (user_id, department, can_upload)
SELECT id, department, true
FROM users
WHERE department IS NOT NULL
ON CONFLICT (user_id, department) DO UPDATE SET
  can_upload = EXCLUDED.can_upload,
  updated_at = NOW();

INSERT INTO user_department_permissions (user_id, department, can_upload)
SELECT u.id, d.department, COALESCE(u.can_upload_to_allowed, false)
FROM users u
CROSS JOIN LATERAL UNNEST(COALESCE(u.allowed_departments, '{}'::TEXT[])) AS d(department)
ON CONFLICT (user_id, department) DO UPDATE SET
  can_upload = EXCLUDED.can_upload,
  updated_at = NOW();
