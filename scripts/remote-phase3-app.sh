#!/bin/bash
set -e
PASS='sanyasi@1981'
JWT='sanyasi@1981_sanyasi@1981_smartvault_jwt'
LAN='192.168.1.104'
if [[ ! -d /opt/smartvault/.git ]]; then
  git clone https://github.com/VGsaksham/smartvault.git /opt/smartvault
else
  git -C /opt/smartvault pull origin main
fi
cat > /opt/smartvault/smartvault-api/.env <<ENV
NODE_ENV=production
HOST=0.0.0.0
PORT=5005
JWT_SECRET=$JWT
CORS_ORIGINS=http://$LAN,http://$LAN:3000
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
BACKUP_CRON="0 2 * * *"
BACKUP_RETENTION_DAYS=30
ADMIN_BOOTSTRAP_ENABLED=true
ADMIN_BOOTSTRAP_EMAIL=admin@smartvault.local
ADMIN_BOOTSTRAP_PASSWORD=$PASS
ENV
cd /opt/smartvault/smartvault-api && npm ci --omit=dev
bash scripts/db-migrate.sh
npm run preflight || true
cd /opt/smartvault && echo 'NEXT_PUBLIC_API_BASE_URL=' > .env.local
npm ci
npm run build
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
echo PHASE3_OK
