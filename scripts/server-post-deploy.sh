#!/bin/bash
# Run on the Ubuntu server as deploy user (e.g. sanyasi) after PM2 apps are installed.
set -e
PASS="${SMARTVAULT_PASS:-sanyasi@1981}"

if [[ -f /opt/smartvault/ecosystem.config.cjs ]]; then
  pm2 start /opt/smartvault/ecosystem.config.cjs 2>/dev/null || pm2 reload /opt/smartvault/ecosystem.config.cjs
else
  export MINIO_ROOT_USER=minioadmin MINIO_ROOT_PASSWORD="$PASS"
  pm2 restart sv-minio --update-env 2>/dev/null || true
fi
pm2 restart sv-api 2>/dev/null || true
pm2 save

echo "=== Preflight ==="
cd /opt/smartvault/smartvault-api && npm run preflight

echo "=== PM2 ==="
pm2 status

echo "=== Login smoke test ==="
python3 <<PY
import json, urllib.request
data = json.dumps({"email": "admin@smartvault.local", "password": "$PASS"}).encode()
req = urllib.request.Request(
    "http://127.0.0.1:5005/api/auth/login",
    data=data,
    headers={"Content-Type": "application/json"},
)
with urllib.request.urlopen(req) as r:
    print("API login:", r.status)
PY

echo "=== nginx ==="
curl -s -o /dev/null -w "http://127.0.0.1/ -> %{http_code}\n" http://127.0.0.1/

echo ""
echo "Enable PM2 on boot (run the sudo line it prints once):"
pm2 startup systemd -u "$(whoami)" --hp "$HOME"
