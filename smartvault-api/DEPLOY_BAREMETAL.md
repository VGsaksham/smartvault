## Bare-metal deploy (single Ubuntu server)

### 1) First-time setup
- Copy backend to server at `/opt/smartvault-api`
- Create env file:
  - `cp .env.example .env`
  - Edit secrets in `.env`

### 2) Run one-command deploy
- `sudo bash scripts/deploy-baremetal.sh`

This will:
- install production dependencies
- run DB migrations
- install/update systemd service
- restart API

### 3) Check health
- `systemctl status smartvault-api`
- `journalctl -u smartvault-api -n 200 --no-pager`

### 4) NGINX reverse proxy
- Copy `deploy/nginx/smartvault-api.conf` to `/etc/nginx/sites-available/smartvault-api.conf`
- Enable:
  - `sudo ln -sf /etc/nginx/sites-available/smartvault-api.conf /etc/nginx/sites-enabled/smartvault-api.conf`
  - `sudo nginx -t`
  - `sudo systemctl reload nginx`

### 5) Update deploy
From new code version, run again:
- `sudo bash scripts/deploy-baremetal.sh`

### Notes
- One server is enough. You do not need separate backend servers.
- Keep Postgres and MinIO running as services on the same machine.
- Optional: enable Elasticsearch for advanced search filters/scale.
  - Set `USE_ELASTICSEARCH=true` and `ELASTICSEARCH_URL` in `.env`
  - Run `npm run search:reindex` after bulk imports or large migrations
