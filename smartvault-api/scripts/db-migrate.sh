#!/usr/bin/env bash
set -euo pipefail

if [[ ! -f .env ]]; then
  echo "Missing .env file in $(pwd)"
  exit 1
fi

set -a
source ./.env
set +a

psql_cmd=(
  psql
  -h "${DB_HOST:-127.0.0.1}"
  -p "${DB_PORT:-5432}"
  -U "${DB_USER:-vaultadmin}"
  -d "${DB_NAME:-smartvault_db}"
)

export PGPASSWORD="${DB_PASSWORD:-}"

for migration in add_permissions.sql add_folder.sql normalize_user_access_schema.sql normalize_company_management.sql; do
  if [[ -f "$migration" ]]; then
    echo "Applying $migration"
    "${psql_cmd[@]}" -f "$migration"
  fi
done

echo "Database migrations completed."
