CREATE TABLE IF NOT EXISTS user_file_aliases (
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    file_id INTEGER REFERENCES vault_files(id) ON DELETE CASCADE,
    alias_name VARCHAR(500) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (user_id, file_id)
);

CREATE TABLE IF NOT EXISTS user_folder_aliases (
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    folder_id INTEGER REFERENCES company_category_folders(id) ON DELETE CASCADE,
    alias_name VARCHAR(500) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (user_id, folder_id)
);

ALTER TABLE user_file_aliases OWNER TO vaultadmin;
ALTER TABLE user_folder_aliases OWNER TO vaultadmin;
