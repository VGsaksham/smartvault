#!/bin/bash
HOST=sanyasi@192.168.1.104
PASS=123456
ssh_cmd() { sshpass -p "$PASS" ssh -o StrictHostKeyChecking=no "$HOST" "$@"; }

# PM2 survives reboot
ssh_cmd "echo $PASS | sudo -S env PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin pm2 startup systemd -u sanyasi --hp /home/sanyasi"

# MinIO env in PM2 dump (restart with update-env)
ssh_cmd 'export MINIO_ROOT_USER=minioadmin MINIO_ROOT_PASSWORD=sanyasi@1981; pm2 restart sv-minio --update-env; pm2 save'

# Health via nginx
ssh_cmd 'curl -s -o /dev/null -w "nginx:%{http_code}\n" http://127.0.0.1/'
ssh_cmd 'curl -s -o /dev/null -w "api_health:%{http_code}\n" http://127.0.0.1/api/health 2>/dev/null || curl -s -o /dev/null -w "api_root:%{http_code}\n" http://127.0.0.1/api/'
