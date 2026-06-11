#!/usr/bin/env bash
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
PASS='sanyasi@1981'
SUDO_PASS='123456'
LAN_IP="${LAN_IP:-192.168.1.104}"
JWT_SECRET="${JWT_SECRET:-sanyasi@1981_sanyasi@1981_smartvault_jwt}"

sudo_cmd() { echo "$SUDO_PASS" | sudo -S "$@"; }

echo "=== [1/8] apt + node + postgres + nginx ==="
sudo_cmd apt-get update -qq
sudo_cmd apt-get upgrade -y -qq
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo_cmd -E bash -
sudo_cmd apt-get install -y nodejs postgresql postgresql-contrib nginx libreoffice git curl
sudo_cmd npm install -g pm2

echo "=== [2/8] minio + data dirs (NVMe paths) ==="
curl -fsSL https://dl.min.io/server/minio/release/linux-amd64/minio -o /tmp/minio
chmod +x /tmp/minio && sudo_cmd mv /tmp/minio /usr/local/bin/minio
sudo_cmd mkdir -p /opt/smartvault /opt/smartvault-data/minio /opt/smartvault-data/media /opt/smartvault-data/preview_cache /opt/smartvault-data/backup
sudo_cmd chown -R "$USER:$USER" /opt/smartvault /opt/smartvault-data

echo "=== [3/8] postgresql ==="
sudo_cmd -u postgres psql -v ON_ERROR_STOP=1 <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'vaultadmin') THEN
    CREATE USER vaultadmin WITH ENCRYPTED PASSWORD '$PASS';
  ELSE
    ALTER USER vaultadmin WITH PASSWORD '$PASS';
  END IF;
END \$\$;
SELECT 'CREATE DATABASE smartvault_db OWNER vaultadmin' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'smartvault_db')\gexec
SQL
sudo_cmd -u postgres psql -d smartvault_db -v ON_ERROR_STOP=1 -f /tmp/deploy-base-schema.sql

echo "=== [4/8] clone repo ==="
if [[ -d /opt/smartvault/.git ]]; then
  git -C /opt/smartvault pull origin main
else
  git clone https://github.com/VGsaksham/smartvault.git /opt/smartvault
fi

echo "=== [5/8] backend .env ==="
cat > /opt/smartvault/smartvault-api/.env <<ENV
NODE_ENV=production
HOST=0.0.0.0
PORT=5005
JWT_SECRET=$JWT_SECRET
CORS_ORIGINS=http://$LAN_IP,http://$LAN_IP:3000

DB_USER=vaultadmin
DB_PASSWORD=$PASS
DB_HOST=127.0.0.1
DB_PORT=5432
DB_NAME=smartvault_db

EXTERNAL_DRIVE_PATH=/opt/smartvault-data/media
MEDIA_PREVIEW_CACHE_PATH=/opt/smartvault-data/preview_cache
BACKUP_STORAGE_PATH=/opt/smartvault-data/backup
AUTO_CREATE_MEDIA_DIRS=true

MINIO_ENDPOINT=127.0.0.1
MINIO_PORT=9000
MINIO_USE_SSL=false
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=$PASS
MINIO_BUCKET=smartvault-files
AUTO_CREATE_MINIO_BUCKET=true
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=$PASS

BACKUP_CRON=0 2 * * *
BACKUP_RETENTION_DAYS=30

ADMIN_BOOTSTRAP_ENABLED=true
ADMIN_BOOTSTRAP_EMAIL=admin@smartvault.local
ADMIN_BOOTSTRAP_PASSWORD=$PASS
ENV

cd /opt/smartvault/smartvault-api
npm ci --omit=dev
bash scripts/db-migrate.sh
npm run preflight

echo "=== [6/8] frontend build ==="
cd /opt/smartvault
echo 'NEXT_PUBLIC_API_BASE_URL=' > .env.local
npm ci
npm run build

echo "=== [7/8] pm2 ==="
cat > /opt/smartvault/ecosystem.config.cjs <<ECO
module.exports = {
  apps: [
    {
      name: 'sv-minio',
      script: '/usr/local/bin/minio',
      args: 'server /opt/smartvault-data/minio --console-address :9001',
      env: {
        MINIO_ROOT_USER: 'minioadmin',
        MINIO_ROOT_PASSWORD: '$PASS',
      },
    },
    {
      name: 'sv-api',
      script: '/opt/smartvault/smartvault-api/server.js',
      cwd: '/opt/smartvault/smartvault-api',
    },
    {
      name: 'sv-web',
      script: 'npm',
      args: 'start',
      cwd: '/opt/smartvault',
    },
  ],
};
ECO
pm2 delete all 2>/dev/null || true
pm2 start /opt/smartvault/ecosystem.config.cjs
pm2 save
STARTUP=$(pm2 startup systemd -u "$USER" --hp "$HOME" | tail -1)
echo "$SUDO_PASS" | eval "$STARTUP" || true

echo "=== [8/8] nginx ==="
sudo_cmd tee /etc/nginx/sites-available/smartvault >/dev/null <<'NGINX'
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
sudo_cmd ln -sf /etc/nginx/sites-available/smartvault /etc/nginx/sites-enabled/smartvault
sudo_cmd rm -f /etc/nginx/sites-enabled/default
sudo_cmd nginx -t
sudo_cmd systemctl enable nginx
sudo_cmd systemctl reload nginx

echo "=== DEPLOY OK ==="
echo "URL: http://$LAN_IP"
echo "Admin: admin@smartvault.local / (password you set)"
pm2 status
