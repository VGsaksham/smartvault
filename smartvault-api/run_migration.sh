#!/bin/bash
echo 'Veron1920@' | sudo -S -u postgres psql -d smartvault_db -c "ALTER TABLE vault_files ADD COLUMN IF NOT EXISTS folder TEXT DEFAULT NULL; GRANT SELECT, INSERT, UPDATE, DELETE ON vault_files TO vaultadmin;"
