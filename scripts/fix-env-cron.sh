#!/bin/bash
sed -i 's/^BACKUP_CRON=.*/BACKUP_CRON="0 2 * * *"/' /opt/smartvault/smartvault-api/.env
cd /opt/smartvault/smartvault-api
bash scripts/db-migrate.sh
npm run preflight
cd /opt/smartvault
echo 'NEXT_PUBLIC_API_BASE_URL=' > .env.local
npm ci
npm run build
