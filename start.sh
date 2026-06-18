#!/bin/bash
# Start Postgres
service postgresql start

# Start PM2 processes
cd /mnt/c/Users/saksham/Desktop/codes/webapps/smartvault
pm2 start ecosystem.config.cjs
