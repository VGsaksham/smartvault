#!/bin/bash
set -e
echo 123456 | sudo -S tee /etc/nginx/sites-available/smartvault >/dev/null <<'NGINX'
server {
    listen 80;
    server_name _;
    client_max_body_size 2G;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    location /api/ {
        proxy_pass http://127.0.0.1:5005;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Authorization $http_authorization;
    }
}
NGINX
echo 123456 | sudo -S ln -sf /etc/nginx/sites-available/smartvault /etc/nginx/sites-enabled/smartvault
echo 123456 | sudo -S rm -f /etc/nginx/sites-enabled/default
echo 123456 | sudo -S nginx -t
echo 123456 | sudo -S systemctl enable nginx
echo 123456 | sudo -S systemctl reload nginx
pm2 status
echo DEPLOY_COMPLETE http://192.168.1.104
echo Admin: admin@smartvault.local password in .env
