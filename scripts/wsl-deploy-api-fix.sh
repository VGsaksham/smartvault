#!/bin/bash
set -e
HOST=sanyasi@192.168.1.104
PASS=123456
LOCAL=/mnt/c/Users/saksh/Desktop/app/SmartVault
ssh_cmd() { sshpass -p "$PASS" ssh -o StrictHostKeyChecking=no "$HOST" "$@"; }

sshpass -p "$PASS" scp -o StrictHostKeyChecking=no \
  "$LOCAL/smartvault-api/server.js" \
  "$LOCAL/smartvault-api/add_expiry_date.sql" \
  "$HOST:/opt/smartvault/smartvault-api/"

ssh_cmd 'cd /opt/smartvault/smartvault-api && set -a && source .env && set +a && PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f add_expiry_date.sql && pm2 restart sv-api && sleep 2'

ssh_cmd 'python3 << "PY"
import json, urllib.request, urllib.error
login = json.dumps({"email": "admin@smartvault.local", "password": "sanyasi@1981"}).encode()
req = urllib.request.Request("http://127.0.0.1:5005/api/auth/login", data=login, headers={"Content-Type": "application/json"})
token = json.loads(urllib.request.urlopen(req).read())["token"]
h = {"Authorization": "Bearer " + token}
for path in ["/api/files/starred", "/api/files/recent", "/api/stats/department/Accounts?companyId=1&fyId=1"]:
    try:
        r = urllib.request.Request("http://127.0.0.1:5005" + path, headers=h)
        resp = urllib.request.urlopen(r)
        print(path, resp.status, resp.read().decode()[:80])
    except urllib.error.HTTPError as e:
        print(path, e.code, e.read().decode()[:120])
PY'
