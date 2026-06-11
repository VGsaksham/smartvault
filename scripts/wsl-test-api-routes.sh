#!/bin/bash
HOST=sanyasi@192.168.1.104
PASS=123456
ssh_cmd() { sshpass -p "$PASS" ssh -o StrictHostKeyChecking=no "$HOST" "$@"; }

ssh_cmd 'python3 << "PY"
import json, urllib.request, urllib.error
login = json.dumps({"email": "admin@smartvault.local", "password": "sanyasi@1981"}).encode()
req = urllib.request.Request("http://127.0.0.1:5005/api/auth/login", data=login, headers={"Content-Type": "application/json"})
token = json.loads(urllib.request.urlopen(req).read())["token"]
h = {"Authorization": "Bearer " + token}
paths = [
    "/api/files/starred",
    "/api/files/recent",
    "/api/files/recent?companyId=1&fyId=1",
]
for path in paths:
    try:
        r = urllib.request.Request("http://127.0.0.1:5005" + path, headers=h)
        resp = urllib.request.urlopen(r)
        body = resp.read().decode()[:120]
        print(path, resp.status, body)
    except urllib.error.HTTPError as e:
        print(path, e.code, e.read().decode()[:200])
PY'

ssh_cmd 'tail -20 /home/sanyasi/.pm2/logs/sv-api-error.log'
