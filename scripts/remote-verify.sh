#!/bin/bash
pm2 status
curl -s -w "\nHTTP:%{http_code}\n" -X POST http://127.0.0.1:5005/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@smartvault.local","password":"sanyasi@1981"}'
echo
cd /opt/smartvault/smartvault-api && npm run preflight
