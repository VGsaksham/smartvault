#!/bin/bash
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y curl git
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs postgresql postgresql-contrib
npm install -g pm2

curl -fsSL https://dl.min.io/server/minio/release/linux-amd64/minio -o /usr/local/bin/minio
chmod +x /usr/local/bin/minio

mkdir -p /opt/smartvault-data/minio \
  /opt/smartvault-data/media \
  /opt/smartvault-data/preview_cache \
  /opt/smartvault-data/backup

echo "Installation complete."
