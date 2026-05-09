#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/opt/smartvault-api"
SERVICE_NAME="smartvault-api.service"

if [[ $EUID -ne 0 ]]; then
  echo "Run as root: sudo bash scripts/deploy-baremetal.sh"
  exit 1
fi

if [[ ! -d "$APP_DIR" ]]; then
  mkdir -p "$APP_DIR"
fi

rsync -a --delete --exclude node_modules ./ "$APP_DIR"/
cd "$APP_DIR"

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "Created $APP_DIR/.env from .env.example. Edit it before starting service."
fi

npm ci --omit=dev
chmod +x scripts/*.sh

sudo -u root bash scripts/db-migrate.sh

cp deploy/systemd/smartvault-api.service /etc/systemd/system/smartvault-api.service
systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
systemctl restart "$SERVICE_NAME"

echo "Deployment complete."
echo "Check status: systemctl status $SERVICE_NAME"
