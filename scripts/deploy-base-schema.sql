DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO vaultadmin;
GRANT ALL ON SCHEMA public TO public;

CREATE TABLE masterfolders (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL
);
ALTER TABLE masterfolders OWNER TO vaultadmin;

CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'Staff',
    category VARCHAR(100),
    allowed_categories TEXT[] DEFAULT ARRAY[]::TEXT[],
    can_bulk_move BOOLEAN DEFAULT true,
    can_bulk_copy BOOLEAN DEFAULT true,
    can_bulk_delete BOOLEAN DEFAULT false,
    can_bulk_rename BOOLEAN DEFAULT true,
    can_bulk_download BOOLEAN DEFAULT true,
    can_upload_to_allowed BOOLEAN DEFAULT false,
    theme_preference VARCHAR(20) DEFAULT 'light',
    status VARCHAR(50) DEFAULT 'Active',
    last_ip_address VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    token_version INTEGER DEFAULT 0
);
ALTER TABLE users OWNER TO vaultadmin;

CREATE TABLE vault_files (
    id SERIAL PRIMARY KEY,
    original_name VARCHAR(500) NOT NULL,
    minio_filename VARCHAR(500) NOT NULL,
    size_bytes BIGINT NOT NULL,
    mime_type VARCHAR(255),
    category VARCHAR(100),
    folder VARCHAR(255),
    file_hash VARCHAR(255),
    uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    auto_name VARCHAR(255),
    custom_name VARCHAR(255),
    upload_date TIMESTAMP DEFAULT NOW(),
    tags JSONB DEFAULT '[]'::jsonb,
    expiry_date TIMESTAMP
);
ALTER TABLE vault_files OWNER TO vaultadmin;

CREATE TABLE user_masterfolder_access (
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    masterfolder_id INTEGER REFERENCES masterfolders(id) ON DELETE CASCADE,
    category VARCHAR(100),
    can_upload BOOLEAN DEFAULT false,
    is_primary BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (user_id, masterfolder_id)
);
ALTER TABLE user_masterfolder_access OWNER TO vaultadmin;

CREATE TABLE vault_user_metadata (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    masterfolder_id INTEGER REFERENCES masterfolders(id) ON DELETE CASCADE
);
ALTER TABLE vault_user_metadata OWNER TO vaultadmin;

CREATE TABLE vault_file_metadata (
    file_id INTEGER PRIMARY KEY REFERENCES vault_files(id) ON DELETE CASCADE,
    masterfolder_id INTEGER REFERENCES masterfolders(id) ON DELETE CASCADE
);
ALTER TABLE vault_file_metadata OWNER TO vaultadmin;

CREATE TABLE file_sequences (
    category VARCHAR(100),
    year_month VARCHAR(20),
    last_sequence INTEGER DEFAULT 1,
    PRIMARY KEY (category, year_month)
);
ALTER TABLE file_sequences OWNER TO vaultadmin;

CREATE TABLE starred_files (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    file_id INTEGER REFERENCES vault_files(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW()
);
ALTER TABLE starred_files OWNER TO vaultadmin;

CREATE TABLE user_preferences (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    theme_preference VARCHAR(20) DEFAULT 'light',
    can_upload_to_allowed BOOLEAN DEFAULT false,
    updated_at TIMESTAMP DEFAULT NOW()
);
ALTER TABLE user_preferences OWNER TO vaultadmin;

CREATE TABLE user_bulk_permissions (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    can_bulk_move BOOLEAN DEFAULT true,
    can_bulk_copy BOOLEAN DEFAULT true,
    can_bulk_delete BOOLEAN DEFAULT false,
    can_bulk_rename BOOLEAN DEFAULT true,
    can_bulk_download BOOLEAN DEFAULT true,
    updated_at TIMESTAMP DEFAULT NOW()
);
ALTER TABLE user_bulk_permissions OWNER TO vaultadmin;

CREATE TABLE user_category_permissions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    category VARCHAR(100) NOT NULL,
    can_upload BOOLEAN DEFAULT false,
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, category)
);
ALTER TABLE user_category_permissions OWNER TO vaultadmin;

CREATE TABLE audit_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action_type TEXT NOT NULL,
    file_id INTEGER REFERENCES vault_files(id) ON DELETE SET NULL,
    details TEXT,
    ip_address VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW()
);
ALTER TABLE audit_logs OWNER TO vaultadmin;

CREATE TABLE audit_undo_payloads (
    audit_log_id INTEGER PRIMARY KEY REFERENCES audit_logs(id) ON DELETE CASCADE,
    action_type TEXT NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
ALTER TABLE audit_undo_payloads OWNER TO vaultadmin;

CREATE TABLE masterfolder_categories (
    id SERIAL PRIMARY KEY,
    masterfolder_id INTEGER REFERENCES masterfolders(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);
ALTER TABLE masterfolder_categories OWNER TO vaultadmin;

CREATE TABLE masterfolder_category_folders (
    id SERIAL PRIMARY KEY,
    category_id INTEGER REFERENCES masterfolder_categories(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);
ALTER TABLE masterfolder_category_folders OWNER TO vaultadmin;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO vaultadmin;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO vaultadmin;
