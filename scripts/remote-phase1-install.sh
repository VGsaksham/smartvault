#!/bin/bash
set -e
export DEBIAN_FRONTEND=noninteractive
echo 123456 | sudo -S apt-get update -qq
echo 123456 | sudo -S apt-get install -y -qq curl git
curl -fsSL https://deb.nodesource.com/setup_20.x -o /tmp/nodesource-setup.sh
echo 123456 | sudo -S -E bash /tmp/nodesource-setup.sh
echo 123456 | sudo -S apt-get install -y nodejs postgresql postgresql-contrib nginx libreoffice
echo 123456 | sudo -S npm install -g pm2
curl -fsSL https://dl.min.io/server/minio/release/linux-amd64/minio -o /tmp/minio
chmod +x /tmp/minio
echo 123456 | sudo -S mv /tmp/minio /usr/local/bin/minio
echo 123456 | sudo -S mkdir -p /opt/smartvault /opt/smartvault-data/minio /opt/smartvault-data/media /opt/smartvault-data/preview_cache /opt/smartvault-data/backup
echo 123456 | sudo -S chown -R sanyasi:sanyasi /opt/smartvault /opt/smartvault-data
node -v
pm2 -v
echo PHASE1_OK
