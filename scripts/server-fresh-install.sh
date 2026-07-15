#!/usr/bin/env bash
# SmartVault — fresh Ubuntu 22.04 bare-metal install
# Run ON THE SERVER as a user with sudo (e.g. sanyasi):
#   curl -fsSL ... | bash   OR   bash server-fresh-install.sh
#
# Layout: see DEPLOY.md ( /opt/smartvault, /opt/smartvault-data/*, HDD mounts later )

set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/VGsaksham/smartvault.git}"
APP_DIR="${APP_DIR:-/opt/smartvault}"
DB_NAME="${DB_NAME:-smartvault_db}"
DB_USER="${DB_USER:-vaultadmin}"
DB_PASS="${DB_PASS:-CHANGE_ME_db_password}"
JWT_SECRET="${JWT_SECRET:-$(openssl rand -base64 48)}"
MINIO_ROOT_USER="${MINIO_ROOT_USER:-minioadmin}"
MINIO_ROOT_PASSWORD="${MINIO_ROOT_PASSWORD:-CHANGE_ME_minio_root}"
MINIO_ACCESS_KEY="${MINIO_ACCESS_KEY:-smartvault-app}"
MINIO_SECRET_KEY="${MINIO_SECRET_KEY:-CHANGE_ME_minio_app_secret}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@local}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-CHANGE_ME_admin}"
LAN_IP="${LAN_IP:-$(hostname -I | awk '{print $1}')}"
CORS_ORIGINS="${CORS_ORIGINS:-http://${LAN_IP},http://${LAN_IP}:3000}"

echo "=== SmartVault fresh install ==="
echo "APP_DIR=$APP_DIR  LAN_IP=$LAN_IP"

export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=a
export NEEDRESTART_SUSPEND=1
sudo apt-get update -qq
sudo apt-get install -y curl ca-certificates
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs postgresql postgresql-contrib nginx libreoffice git curl
sudo npm install -g pm2

curl -fsSL https://dl.min.io/server/minio/release/linux-amd64/minio -o /tmp/minio
chmod +x /tmp/minio && sudo mv /tmp/minio /usr/local/bin/minio

sudo mkdir -p /mnt/storage/minio /mnt/hdd01/preview_cache /mnt/hdd02 /mnt/backup "$APP_DIR"
sudo chown -R "$USER:$USER" /mnt/storage/minio /mnt/hdd01 /mnt/hdd02 /mnt/backup 2>/dev/null || true

# PostgreSQL
sudo -u postgres psql <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '$DB_USER') THEN
    CREATE USER $DB_USER WITH ENCRYPTED PASSWORD '$DB_PASS';
  END IF;
END \$\$;
SELECT 'CREATE DATABASE $DB_NAME OWNER $DB_USER' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$DB_NAME')\gexec
SQL

sudo -u postgres psql -d "$DB_NAME" <<'EOSQL'
GRANT ALL ON SCHEMA public TO vaultadmin;
EOSQL

# Clone or update app
if [[ -d "$APP_DIR/.git" ]]; then
  git -C "$APP_DIR" pull origin main
else
  sudo mkdir -p "$APP_DIR"
  sudo chown -R "$USER:$USER" "$APP_DIR"
  git clone "$REPO_URL" "$APP_DIR"
fi

# Base schema only if companies table missing
if ! sudo -u postgres psql -d "$DB_NAME" -tAc "SELECT 1 FROM information_schema.tables WHERE table_name='companies'" | grep -q 1; then
  echo "Applying base schema (first install)..."
  sudo -u postgres psql -d "$DB_NAME" -f - <<'EOF' || true
-- Minimal check: use DEPLOY.md Phase 2 for full schema if this fails
SELECT 1;
EOF
  echo "IMPORTANT: If DB is empty, run Phase 2 from DEPLOY.md once."
fi

# Backend .env
API_ENV="$APP_DIR/smartvault-api/.env"
if [[ ! -f "$API_ENV" ]]; then
  cat > "$API_ENV" <<ENV
NODE_ENV=production
HOST=0.0.0.0
PORT=5005
JWT_SECRET=$JWT_SECRET
CORS_ORIGINS=$CORS_ORIGINS

DB_USER=$DB_USER
DB_PASSWORD=$DB_PASS
DB_HOST=127.0.0.1
DB_PORT=5432
DB_NAME=$DB_NAME

EXTERNAL_DRIVE_PATH=/mnt/hdd01
MEDIA_PREVIEW_CACHE_PATH=/mnt/hdd01/preview_cache
BACKUP_STORAGE_PATH=/mnt/backup
AUTO_CREATE_MEDIA_DIRS=true

MINIO_ENDPOINT=127.0.0.1
MINIO_PORT=9000
MINIO_USE_SSL=false
MINIO_ACCESS_KEY=$MINIO_ACCESS_KEY
MINIO_SECRET_KEY=$MINIO_SECRET_KEY
MINIO_BUCKET=smartvault-files
AUTO_CREATE_MINIO_BUCKET=true

BACKUP_CRON=0 2 * * *
BACKUP_RETENTION_DAYS=30

ADMIN_BOOTSTRAP_ENABLED=true
ADMIN_BOOTSTRAP_EMAIL=$ADMIN_EMAIL
ADMIN_BOOTSTRAP_PASSWORD=$ADMIN_PASSWORD
ENV
  echo "Created $API_ENV — edit secrets if you used defaults."
fi

cd "$APP_DIR/smartvault-api"
npm ci --omit=dev
bash scripts/db-migrate.sh 2>/dev/null || echo "Run db-migrate after base schema from teaching guide"
npm run preflight || true

# Frontend
cd "$APP_DIR"
[[ -f .env.local ]] || echo "NEXT_PUBLIC_API_BASE_URL=" > .env.local
npm install
npm run build

# PM2
export MINIO_ROOT_USER MINIO_ROOT_PASSWORD
pm2 delete sv-minio sv-api sv-web 2>/dev/null || true
pm2 start /usr/local/bin/minio --name sv-minio -- server /mnt/storage/minio --console-address ":9001"
pm2 start "$APP_DIR/smartvault-api/server.js" --name sv-api --cwd "$APP_DIR/smartvault-api"
pm2 start npm --name sv-web --cwd "$APP_DIR" -- start
pm2 save
pm2 startup | tail -1 | bash || true

# nginx
sudo tee /etc/nginx/sites-available/smartvault >/dev/null <<'NGINX'
server {
    listen 80;
    server_name _;
    client_max_body_size 2G;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    location /api/ {
        proxy_pass http://127.0.0.1:5005;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Authorization $http_authorization;
    }
}
NGINX
sudo ln -sf /etc/nginx/sites-available/smartvault /etc/nginx/sites-enabled/smartvault
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

echo ""
echo "=== Done ==="
echo "Open: http://$LAN_IP"
echo "Admin bootstrap: $ADMIN_EMAIL (change ADMIN_BOOTSTRAP_ENABLED=false after login)"
echo "Run base schema from DEPLOY.md Phase 2 if preflight/DB fails."
