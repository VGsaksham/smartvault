CREATE TABLE IF NOT EXISTS user_folder_access (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  department TEXT NOT NULL,
  folder_path TEXT NOT NULL,
  is_exclusion BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, company_id, department, folder_path)
);

CREATE INDEX IF NOT EXISTS idx_ufa_user_id ON user_folder_access(user_id);
CREATE INDEX IF NOT EXISTS idx_ufa_company_id ON user_folder_access(company_id);
CREATE INDEX IF NOT EXISTS idx_ufa_department ON user_folder_access(department);
