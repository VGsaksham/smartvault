# SmartVault — bare-metal deploy guide

Single Ubuntu server: **Next.js UI** + **Node API** + **PostgreSQL** + **MinIO** + **nginx** + **PM2**.

Use this doc to rebuild from scratch on any machine. All paths below match a real production install on NVMe (`/opt/smartvault-data/*`). Later you can point media/MinIO at HDD mounts.

---

## 1. Before you start

### 1.1 What you need

| Item | Example (change yours) |
|------|-------------------------|
| Server OS | Ubuntu 22.04 or 24.04 LTS |
| SSH user | `sanyasi` |
| Server IP (LAN/VPN) | `192.168.1.104` |
| SSH login password | `123456` (change after deploy) |
| sudo password | same as SSH in our install |
| App/DB/MinIO/admin password | `sanyasi@1981` |
| Git repo | `https://github.com/VGsaksham/smartvault.git` |
| Admin login email | `admin@smartvault.local` |

### 1.2 Layout (NVMe — default in scripts)

| Path | Purpose |
|------|---------|
| `/opt/smartvault` | Git clone (frontend + `smartvault-api/`) |
| `/opt/smartvault-data/minio` | MinIO object storage |
| `/opt/smartvault-data/media` | Large local media (`EXTERNAL_DRIVE_PATH`) |
| `/opt/smartvault-data/preview_cache` | Preview cache |
| `/opt/smartvault-data/backup` | Backup output |
| `/var/lib/postgresql` | PostgreSQL data (default) |

### 1.3 Ports

| Service | Port |
|---------|------|
| nginx (public) | 80 |
| Next.js (`sv-web`) | 3000 |
| API (`sv-api`) | 5005 |
| MinIO API | 9000 |
| MinIO console | 9001 |

### 1.4 Dev machine: sync backend into repo

The API lives in `smartvault-api/` inside this repo. From your Windows/WSL dev box:

```bash
cd /path/to/SmartVault
npm run backend   # copies WSL smartvault-api → smartvault-api/ → push to GitHub when ready
```

Server always deploys from **GitHub**, not from your laptop directly (unless you `scp` hotfixes).

---

## 2. Deploy overview (order matters)

```
0. Fix apt (only if CD-ROM mirror breaks apt)
1. Install Node 20, PostgreSQL, nginx, LibreOffice, PM2, MinIO binary, data dirs
2. Create DB user + database + base schema + SQL migrations
3. Clone repo, write .env, npm ci, build frontend, PM2 start all apps
4. nginx reverse proxy (UI + /api → API, forward Authorization header)
5. PM2 startup on boot + smoke tests
```

**Rules**

- Run **base schema** (`deploy-base-schema.sql`) **before** `smartvault-api/scripts/db-migrate.sh`.
- Run **`npm run build`** in `/opt/smartvault` after any frontend change or `.env.local` change.
- Quote cron in `.env`: `BACKUP_CRON="0 2 * * *"` (unquoted breaks `source .env` in migrate script).
- Frontend production: `NEXT_PUBLIC_API_BASE_URL=` (empty) so the browser uses same-origin `/api` via nginx.

---

## 3. Run on the server (SSH)

SSH in:

```bash
ssh sanyasi@192.168.1.104
```

Set variables once per session:

```bash
export DEPLOY_USER=sanyasi
export SERVER_IP=192.168.1.104
export SUDO_PASS='123456'          # your sudo password
export APP_PASS='sanyasi@1981'     # DB, MinIO app, admin bootstrap
export JWT_SECRET='sanyasi@1981_sanyasi@1981_smartvault_jwt'
export REPO=https://github.com/VGsaksham/smartvault.git
```

Helper:

```bash
sudo_cmd() { echo "$SUDO_PASS" | sudo -S "$@"; }
```

---

### Phase 0 — Fix apt (only if `apt update` fails on `file:///cdrom`)

```bash
sudo_cmd tee /etc/apt/sources.list >/dev/null <<'EOF'
deb http://archive.ubuntu.com/ubuntu/ noble main restricted universe multiverse
deb http://archive.ubuntu.com/ubuntu/ noble-updates main restricted universe multiverse
deb http://security.ubuntu.com/ubuntu/ noble-security main restricted universe multiverse
EOF
sudo_cmd apt-get update -qq
```

For Ubuntu 22.04, replace `noble` with `jammy` in the URLs.

---

### Phase 1 — System packages + directories

```bash
export DEBIAN_FRONTEND=noninteractive
sudo_cmd apt-get update -qq
sudo_cmd apt-get install -y curl git
curl -fsSL https://deb.nodesource.com/setup_20.x -o /tmp/nodesource-setup.sh
sudo_cmd -E bash /tmp/nodesource-setup.sh
sudo_cmd apt-get install -y nodejs postgresql postgresql-contrib nginx libreoffice
sudo_cmd npm install -g pm2

curl -fsSL https://dl.min.io/server/minio/release/linux-amd64/minio -o /tmp/minio
chmod +x /tmp/minio
sudo_cmd mv /tmp/minio /usr/local/bin/minio

sudo_cmd mkdir -p /opt/smartvault \
  /opt/smartvault-data/minio \
  /opt/smartvault-data/media \
  /opt/smartvault-data/preview_cache \
  /opt/smartvault-data/backup
sudo_cmd chown -R "$USER:$USER" /opt/smartvault /opt/smartvault-data

node -v    # expect v20.x
pm2 -v
```

---

### Phase 2 — PostgreSQL + schema

Copy base schema to the server (from your PC with WSL):

```bash
# On your PC (WSL)
scp scripts/deploy-base-schema.sql sanyasi@192.168.1.104:/tmp/
```

On the server:

```bash
sudo_cmd -u postgres psql -v ON_ERROR_STOP=1 <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'vaultadmin') THEN
    CREATE USER vaultadmin WITH ENCRYPTED PASSWORD '$APP_PASS';
  ELSE
    ALTER USER vaultadmin WITH PASSWORD '$APP_PASS';
  END IF;
END \$\$;
SELECT 'CREATE DATABASE smartvault_db OWNER vaultadmin'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'smartvault_db')\gexec
SQL

sudo_cmd -u postgres psql -d smartvault_db -v ON_ERROR_STOP=1 -f /tmp/deploy-base-schema.sql
```

Clone repo (needed for migrations), then migrate:

```bash
if [[ ! -d /opt/smartvault/.git ]]; then
  git clone "$REPO" /opt/smartvault
else
  git -C /opt/smartvault pull origin main
fi

cd /opt/smartvault/smartvault-api
# migrations: add_permissions, add_folder, normalize_*, add_expiry_date
bash scripts/db-migrate.sh
```

`add_expiry_date.sql` is required for the **department dashboard** (expiry warnings).

---

### Phase 3 — App env, build, PM2

```bash
cat > /opt/smartvault/smartvault-api/.env <<ENV
NODE_ENV=production
HOST=0.0.0.0
PORT=5005
JWT_SECRET=$JWT_SECRET
CORS_ORIGINS=http://$SERVER_IP,http://$SERVER_IP:3000
DB_USER=vaultadmin
DB_PASSWORD=$APP_PASS
DB_HOST=127.0.0.1
DB_PORT=5432
DB_NAME=smartvault_db
EXTERNAL_DRIVE_PATH=/opt/smartvault-data/media
MEDIA_PREVIEW_CACHE_PATH=/opt/smartvault-data/preview_cache
BACKUP_STORAGE_PATH=/opt/smartvault-data/backup
AUTO_CREATE_MEDIA_DIRS=true
MINIO_ENDPOINT=127.0.0.1
MINIO_PORT=9000
MINIO_USE_SSL=false
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=$APP_PASS
MINIO_BUCKET=smartvault-files
AUTO_CREATE_MINIO_BUCKET=true
BACKUP_CRON="0 2 * * *"
BACKUP_RETENTION_DAYS=30
ADMIN_BOOTSTRAP_ENABLED=true
ADMIN_BOOTSTRAP_EMAIL=admin@smartvault.local
ADMIN_BOOTSTRAP_PASSWORD=$APP_PASS
ENV

cd /opt/smartvault/smartvault-api
npm ci --omit=dev
npm run preflight

cd /opt/smartvault
echo 'NEXT_PUBLIC_API_BASE_URL=' > .env.local
npm ci
npm run build
```

PM2 ecosystem (keeps MinIO root password across restarts):

```bash
cat > /opt/smartvault/ecosystem.config.cjs <<ECO
module.exports = {
  apps: [
    {
      name: 'sv-minio',
      script: '/usr/local/bin/minio',
      args: 'server /opt/smartvault-data/minio --console-address :9001',
      env: {
        MINIO_ROOT_USER: 'minioadmin',
        MINIO_ROOT_PASSWORD: '$APP_PASS',
      },
    },
    {
      name: 'sv-api',
      script: '/opt/smartvault/smartvault-api/server.js',
      cwd: '/opt/smartvault/smartvault-api',
    },
    {
      name: 'sv-web',
      script: 'npm',
      args: 'start',
      cwd: '/opt/smartvault',
    },
  ],
};
ECO

pm2 delete all 2>/dev/null || true
pm2 start /opt/smartvault/ecosystem.config.cjs
pm2 save
pm2 status
```

---

### Phase 4 — nginx

```bash
sudo_cmd tee /etc/nginx/sites-available/smartvault >/dev/null <<'NGINX'
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

sudo_cmd ln -sf /etc/nginx/sites-available/smartvault /etc/nginx/sites-enabled/smartvault
sudo_cmd rm -f /etc/nginx/sites-enabled/default
sudo_cmd nginx -t
sudo_cmd systemctl enable nginx
sudo_cmd systemctl reload nginx
```

**Important:** `Authorization` must be forwarded or the UI gets 401 and redirects to login.

---

### Phase 5 — Boot persistence + verify

```bash
pm2 startup systemd -u "$USER" --hp "$HOME"
# Copy-paste and run the sudo command PM2 prints, e.g.:
# sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u sanyasi --hp /home/sanyasi

cd /opt/smartvault/smartvault-api && npm run preflight
```

Smoke tests:

```bash
# Login
curl -s -X POST http://127.0.0.1:5005/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@smartvault.local","password":"'"$APP_PASS"'"}'

# UI via nginx
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1/
```

**Browser:** `http://192.168.1.104`  
**Admin:** `admin@smartvault.local` / `sanyasi@1981` (or your `APP_PASS`)

---

## 4. Optional: deploy from Windows (WSL + sshpass)

Install on WSL: `sudo apt install -y sshpass`

```bash
export HOST=sanyasi@192.168.1.104
export SSH_PASS=123456

# Copy schema + run phases (scripts live in repo)
scp scripts/deploy-base-schema.sql $HOST:/tmp/
scp scripts/remote-phase1-install.sh scripts/remote-phase2-db.sh \
    scripts/remote-phase3-app.sh scripts/remote-phase4-nginx.sh $HOST:/tmp/

sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no $HOST 'bash /tmp/remote-phase1-install.sh'
sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no $HOST 'bash /tmp/remote-phase2-db.sh'
sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no $HOST 'bash /tmp/remote-phase3-app.sh'
sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no $HOST 'bash /tmp/remote-phase4-nginx.sh'
```

Edit passwords/IP inside those scripts before running, or use the manual commands in §3.

Post-deploy on server:

```bash
bash /opt/smartvault/scripts/server-post-deploy.sh
```

---

## 5. One-shot script on server

Full automated install (same steps as §3):

```bash
# Copy deploy-base-schema.sql to /tmp/ first, then:
bash /opt/smartvault/scripts/remote-deploy.sh
```

Or run phases from repo `scripts/remote-phase*.sh` in order.

---

## 6. Update / redeploy after code changes

```bash
cd /opt/smartvault
git pull origin main

cd smartvault-api
bash scripts/db-migrate.sh
npm ci --omit=dev
npm run preflight
pm2 restart sv-api

cd /opt/smartvault
npm ci
npm run build
pm2 restart sv-web
```

Hotfix API only (from PC):

```bash
scp smartvault-api/server.js sanyasi@192.168.1.104:/opt/smartvault/smartvault-api/
ssh sanyasi@192.168.1.104 'pm2 restart sv-api'
```

---

## 7. PM2 processes

| Name | What |
|------|------|
| `sv-minio` | `/usr/local/bin/minio server /opt/smartvault-data/minio` |
| `sv-api` | `smartvault-api/server.js` on port 5005 |
| `sv-web` | `npm start` (Next production) on port 3000 |

```bash
pm2 status
pm2 logs sv-api --lines 50
pm2 restart sv-api
pm2 save
```

If MinIO shows **errored** after reboot:

```bash
export MINIO_ROOT_USER=minioadmin MINIO_ROOT_PASSWORD='sanyasi@1981'
pm2 restart sv-minio --update-env
pm2 restart sv-api
pm2 save
```

---

## 8. Troubleshooting

| Symptom | Cause | Fix |
|---------|--------|-----|
| Starred / Recent empty or 500 | Express route `/api/files/:id` caught `starred`/`recent` | Use current `server.js` (literal routes **before** `:id`) |
| Department dashboard blank | Missing `expiry_date` column | `psql ... -f smartvault-api/add_expiry_date.sql` or `db-migrate.sh` |
| `db-migrate.sh` fails on `.env` | `BACKUP_CRON=0 2 * * *` unquoted | Use `BACKUP_CRON="0 2 * * *"` |
| MinIO PM2 errored | Empty `MINIO_ROOT_PASSWORD` at start | Use `ecosystem.config.cjs` env block or `--update-env` |
| Login works in curl, not browser | nginx missing `Authorization` | See § Phase 4 |
| Frontend build fails | Invalid `next.config` / preview page | Use repo `next.config.ts` (empty config) and Suspense on preview page |
| `apt update` fails | CD-ROM source | Phase 0 |
| CORS errors on `:3000` | Direct port access | Use nginx `:80` or add origin to `CORS_ORIGINS` |

API route order in `smartvault-api/server.js` must be:

1. `GET /api/files`
2. `GET /api/files/starred`
3. `GET /api/files/recent`
4. `GET /api/files/search`
5. `GET /api/files/:id` (numeric ids only — non-numeric returns 404)

---

## 9. Security checklist (after it works)

- Change SSH password and use SSH keys.
- Change `APP_PASS`, `JWT_SECRET`, MinIO keys.
- Restrict port 80/22 to LAN/VPN firewall.
- Do not commit `/opt/smartvault/ecosystem.config.cjs` (contains secrets) to git.

---

## 10. Script index (in repo)

| Script | Role |
|--------|------|
| `scripts/deploy-base-schema.sql` | Fresh DB tables |
| `scripts/remote-phase1-install.sh` | Phase 1 packages |
| `scripts/remote-phase2-db.sh` | Phase 2 DB |
| `scripts/remote-phase3-app.sh` | Phase 3 app + PM2 |
| `scripts/remote-phase4-nginx.sh` | Phase 4 nginx |
| `scripts/remote-deploy.sh` | All-in-one on server |
| `scripts/server-post-deploy.sh` | Preflight + login test + `pm2 startup` hint |
| `scripts/fix-apt-cdrom.sh` | Phase 0 apt fix |
| `smartvault-api/scripts/db-migrate.sh` | Incremental SQL migrations |
| `smartvault-api/add_expiry_date.sql` | Department dashboard column |

---

## 11. Credentials reference (change in production)

| Use | Value |
|-----|--------|
| SSH | `sanyasi@192.168.1.104` / `123456` |
| sudo | `123456` |
| PostgreSQL | user `vaultadmin`, db `smartvault_db`, password `sanyasi@1981` |
| MinIO root | `minioadmin` / `sanyasi@1981` |
| App admin | `admin@smartvault.local` / `sanyasi@1981` |
| JWT | `sanyasi@1981_sanyasi@1981_smartvault_jwt` |

---

*Last updated from production deploy on Ubuntu bare metal at `192.168.1.104` (NVMe paths, nginx same-origin API).*
