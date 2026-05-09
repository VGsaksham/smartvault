sudo -u postgres psql -d smartvault_db -c "ALTER TABLE users ADD COLUMN IF NOT EXISTS theme_preference VARCHAR(20) DEFAULT 'light';"
sudo -u postgres psql -d smartvault_db -c "ALTER TABLE users ADD COLUMN IF NOT EXISTS can_upload_to_allowed BOOLEAN DEFAULT false;"
