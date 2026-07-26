#!/bin/bash
# Start Postgres
echo "Starting PostgreSQL (this might prompt for your WSL password)..."
sudo service postgresql start

# Start PM2 processes
echo "Starting Next.js, API, and Minio..."
cd /mnt/c/Users/saksham/Desktop/codes/webapps/smartvault
pm2 start ecosystem.config.cjs
