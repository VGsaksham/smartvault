#!/bin/bash
# Start Postgres
service postgresql start

# Configure Postgres DB
sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'vaultadmin') THEN
    CREATE USER vaultadmin WITH ENCRYPTED PASSWORD 'sanyasi@1981';
  ELSE
    ALTER USER vaultadmin WITH PASSWORD 'sanyasi@1981';
  END IF;
END \$\$;
SELECT 'CREATE DATABASE smartvault_db OWNER vaultadmin'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'smartvault_db')\gexec
SQL

# Apply base schema
sudo -u postgres psql -d smartvault_db -v ON_ERROR_STOP=1 -f scripts/deploy-base-schema.sql

cd smartvault-api

# .env for api
cat > .env <<ENV
NODE_ENV=development
HOST=0.0.0.0
PORT=5005
JWT_SECRET=sanyasi@1981_sanyasi@1981_smartvault_jwt
CORS_ORIGINS=http://localhost:3000
DB_USER=vaultadmin
DB_PASSWORD=sanyasi@1981
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
MINIO_SECRET_KEY=sanyasi@1981
MINIO_BUCKET=smartvault-files
AUTO_CREATE_MINIO_BUCKET=true
BACKUP_CRON="0 2 * * *"
BACKUP_RETENTION_DAYS=30
ADMIN_BOOTSTRAP_ENABLED=true
ADMIN_BOOTSTRAP_EMAIL=admin@smartvault.local
ADMIN_BOOTSTRAP_PASSWORD=sanyasi@1981
ENV

# Run api migrations
bash scripts/db-migrate.sh

npm install

cd ..
echo 'NEXT_PUBLIC_API_BASE_URL=http://localhost:5005/api' > .env.local
npm install

cat > ecosystem.config.cjs <<ECO
module.exports = {
  apps: [
    {
      name: 'sv-minio',
      script: '/usr/local/bin/minio',
      args: 'server /opt/smartvault-data/minio --console-address :9001',
      env: {
        MINIO_ROOT_USER: 'minioadmin',
        MINIO_ROOT_PASSWORD: 'sanyasi@1981',
      },
    },
    {
      name: 'sv-api',
      script: 'npm',
      args: 'run dev',
      cwd: '/mnt/c/Users/saksham/Desktop/codes/webapps/smartvault/smartvault-api',
    },
    {
      name: 'sv-web',
      script: 'npm',
      args: 'run dev',
      cwd: '/mnt/c/Users/saksham/Desktop/codes/webapps/smartvault',
    },
  ],
};
ECO

pm2 delete all 2>/dev/null || true
pm2 start ecosystem.config.cjs
pm2 save

echo "Setup and start complete."
