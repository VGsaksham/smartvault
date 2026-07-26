-- Rename tables
ALTER TABLE masterfolder_categories RENAME TO masterfolder_categories;
ALTER TABLE masterfolder_category_folders RENAME TO masterfolder_category_folders;
ALTER TABLE user_category_permissions RENAME TO user_category_permissions;

-- Rename columns in renamed tables
ALTER TABLE masterfolder_category_folders RENAME COLUMN category_id TO category_id;
ALTER TABLE user_category_permissions RENAME COLUMN category TO category;

-- Rename columns in other tables
ALTER TABLE user_folder_access RENAME COLUMN category TO category;
ALTER TABLE users RENAME COLUMN allowed_categories TO allowed_categories;
ALTER TABLE users RENAME COLUMN category TO category;
ALTER TABLE vault_files RENAME COLUMN category TO category;
ALTER TABLE file_sequences RENAME COLUMN category TO category;
ALTER TABLE user_masterfolder_access RENAME COLUMN category TO category;
