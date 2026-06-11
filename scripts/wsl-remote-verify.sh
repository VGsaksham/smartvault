#!/bin/bash
set -e
HOST=sanyasi@192.168.1.104
PASS=123456
ssh_cmd() {
  sshpass -p "$PASS" ssh -o StrictHostKeyChecking=no "$HOST" "$@"
}
ssh_cmd 'python3 << "PY"
import urllib.request, json
data = json.dumps({"email": "admin@smartvault.local", "password": "sanyasi@1981"}).encode()
req = urllib.request.Request(
    "http://127.0.0.1:5005/api/auth/login",
    data=data,
    headers={"Content-Type": "application/json"},
)
try:
    resp = urllib.request.urlopen(req)
    print(resp.status, resp.read().decode()[:400])
except urllib.error.HTTPError as e:
    print(e.code, e.read().decode()[:400])
PY'
ssh_cmd 'cd /opt/smartvault/smartvault-api && npm run preflight'
ssh_cmd 'pm2 startup systemd -u sanyasi --hp /home/sanyasi 2>&1 | tail -1'
