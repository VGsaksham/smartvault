#!/bin/bash
set -e
PASS='sanyasi@1981'
echo 123456 | sudo -S -u postgres psql -v ON_ERROR_STOP=1 <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'vaultadmin') THEN
    CREATE USER vaultadmin WITH ENCRYPTED PASSWORD '$PASS';
  ELSE
    ALTER USER vaultadmin WITH PASSWORD '$PASS';
  END IF;
END \$\$;
SELECT 'CREATE DATABASE smartvault_db OWNER vaultadmin' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'smartvault_db')\gexec
SQL
echo 123456 | sudo -S -u postgres psql -d smartvault_db -v ON_ERROR_STOP=1 -f /tmp/deploy-base-schema.sql
echo PHASE2_OK
