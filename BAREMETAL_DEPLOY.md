# SmartVault — bare-metal deploy (target layout)

Single Ubuntu **22.04 LTS** server.

**How to use the docs**

1. Read **`DEPLOYMENT_TEACHING_GUIDE.md`** first if you want **step-by-step teaching** (what each step does, **when / when not**, **`npm run build` rules**, full SQL + admin script — **one long file**).
2. Keep **this file (`BAREMETAL_DEPLOY.md`)** open as a **short map**: paths, `.env` skeleton, PM2 + nginx.
3. Use **`DEPLOYMENT_GUIDE.md`** when something breaks — extra troubleshooting recipes and duplicate procedures.

Following **TEACHING + BAREMETAL** in order is enough for a normal deploy if you respect ordering (base DB schema **before** `db-migrate.sh`). No guide can promise zero typos on real hardware.

---

## 1. Target hardware (≈20–50 users)

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| CPU | 4-core (e.g. i5) | 8-core (i7/i9/Xeon) |
| RAM | 16 GB | 32 GB |
| M.2 NVMe | 256 GB | 512 GB |
| File HDD (MinIO / docs) | 2 TB | 4–8 TB RAID |
| External HDDs | per your drives | mount + label each |
| Backup HDD | 4 TB | 8 TB (SmartVault backups only) |
| Network | 100 Mbps LAN | 1 Gbps |
| OS | Ubuntu 22.04 LTS | same |

**Elasticsearch:** reserve **≥4 GB RAM** for JVM heap if you enable search; Elasticsearch data on SSD is typical.

---

## 2. Storage layout (mount map)

| Role | Drive | Mount | Contents |
|------|--------|--------|----------|
| OS + app | NVMe SSD | `/` | Ubuntu, `/opt/smartvault` |
| PostgreSQL | NVMe SSD | `/var/lib/postgresql` (default) | DB |
| Elasticsearch *(optional)* | NVMe SSD | `/var/lib/elasticsearch` | indices |
| Redis *(optional)* | NVMe SSD | `/var/lib/redis` | only if you run apps that use Redis — **not required** by SmartVault API core |
| nginx | NVMe SSD | `/etc/nginx` | config |
| MinIO | large HDD | `/mnt/storage/minio` | documents, images, Office-class objects |
| Media 1 | HDD | `/mnt/hdd01` | video (MP4, MOV, …) — **`EXTERNAL_DRIVE_PATH`** |
| Media 2 | HDD | `/mnt/hdd02` | audio — use **symlink** under `hdd01` (see §6) |
| Backups | HDD | `/mnt/backup` | **`BACKUP_STORAGE_PATH`** |

Persist mounts: **`/etc/fstab`** with **UUID=…**, use **`nofail`** for removable drives. After mount: `sudo chown -R $USER:$USER` (or dedicated `smartvault` user) for paths the API must write.

Verify:

```bash
findmnt /mnt/storage/minio /mnt/hdd01 /mnt/hdd02 /mnt/backup
```

---

## 3. Install stack

```bash
sudo apt update && sudo apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs postgresql postgresql-contrib nginx libreoffice
sudo npm install -g pm2
```

**MinIO**

```bash
curl -fsSL https://dl.min.io/server/minio/release/linux-amd64/minio -o minio
chmod +x minio && sudo mv minio /usr/local/bin/
sudo mkdir -p /mnt/storage/minio
```

**Optional: Elasticsearch** (only if `USE_ELASTICSEARCH=true` — see `smartvault-api/DEPLOY_BAREMETAL.md` and `npm run search:reindex`; you may need **`@elastic/elasticsearch`** in `smartvault-api/package.json`).

**Optional: Redis** — install only if something else in your stack requires it; SmartVault Node API does not depend on Redis for core operation.

---

## 4. PostgreSQL + schema

1. Create DB + role + grants — **`DEPLOYMENT_TEACHING_GUIDE.md`** Phase D.1 or **`DEPLOYMENT_GUIDE.md`** Step 3.
2. **Fresh DB:** base schema — **`DEPLOYMENT_TEACHING_GUIDE.md`** Phase D.2 (full SQL inline) or **`DEPLOYMENT_GUIDE.md`** Step 3.1.
3. Apply repo migrations:

```bash
cd /opt/smartvault/smartvault-api
bash scripts/db-migrate.sh
npm run preflight
```

---

## 5. Repo layout + install

```bash
sudo mkdir -p /opt/smartvault && sudo chown -R "$USER:$USER" /opt/smartvault
cd /opt/smartvault && git clone <YOUR_GIT_URL> .
```

```bash
mkdir -p /mnt/hdd01/preview_cache /mnt/backup

cd /opt/smartvault/smartvault-api
cp .env.example .env 2>/dev/null || true   # create .env manually if no example in repo
npm ci --omit=dev

cd /opt/smartvault
npm ci
```

### Backend `.env` (aligned to §2)

Adjust secrets; **production** requires non-empty `JWT_SECRET` (long), `DB_PASSWORD`, `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY`, and **`CORS_ORIGINS`** must **not** be `*`.

```env
NODE_ENV=production
HOST=0.0.0.0
PORT=5005
JWT_SECRET=<openssl rand -base64 48>
CORS_ORIGINS=http://YOUR_LAN_IP,https://your-domain.com

DB_USER=vaultadmin
DB_PASSWORD=<same as postgres>
DB_HOST=127.0.0.1
DB_PORT=5432
DB_NAME=smartvault_db

EXTERNAL_DRIVE_PATH=/mnt/hdd01
MEDIA_PREVIEW_CACHE_PATH=/mnt/hdd01/preview_cache
BACKUP_STORAGE_PATH=/mnt/backup
AUTO_CREATE_MEDIA_DIRS=true

MINIO_ENDPOINT=127.0.0.1
MINIO_PORT=9000
MINIO_USE_SSL=false
MINIO_ACCESS_KEY=<app key>
MINIO_SECRET_KEY=<app secret>
MINIO_BUCKET=smartvault-files
AUTO_CREATE_MINIO_BUCKET=true

BACKUP_CRON=0 2 * * *
BACKUP_RETENTION_DAYS=30

# Optional: dashboard “disk cards” labels (comma-separated LABEL:path)
STORAGE_PATH_MAP=OS:/,App:/opt/smartvault,PostgreSQL:/var/lib/postgresql,Elasticsearch:/var/lib/elasticsearch,Redis:/var/lib/redis,NGINX:/etc/nginx,MinIO:/mnt/storage/minio,HDD-01:/mnt/hdd01,HDD-02:/mnt/hdd02,Backup:/mnt/backup
```

First admin: **`ADMIN_BOOTSTRAP_ENABLED=true`** + **`ADMIN_BOOTSTRAP_EMAIL`** + **`ADMIN_BOOTSTRAP_PASSWORD`** then start API once; **or** manual insert — **`DEPLOYMENT_TEACHING_GUIDE.md`** Phase K or **`DEPLOYMENT_GUIDE.md`** Step 6.

### Frontend `.env.local`

Same-origin via nginx (recommended):

```env
NEXT_PUBLIC_API_BASE_URL=
```

Then: `npm run build` (changing this requires **rebuild**).

---

## 6. Two media HDDs (video + audio)

The API exposes **one** media root: `EXTERNAL_DRIVE_PATH`. Common pattern:

```bash
mkdir -p /mnt/hdd01/audio
# if empty and you want all audio on second disk:
sudo mount /dev/sdYN1 /mnt/hdd02   # your partition
sudo rmdir /mnt/hdd01/audio 2>/dev/null; sudo ln -s /mnt/hdd02 /mnt/hdd01/audio
```

Or keep audio in a subfolder on `hdd02` and symlink that path under `hdd01`. App and backup jobs then see a single tree under `/mnt/hdd01`.

---

## 7. Process manager (PM2)

Set MinIO root credentials in the environment (shell or `pm2 ecosystem` file — do not commit secrets).

```bash
export MINIO_ROOT_USER=minioadmin
export MINIO_ROOT_PASSWORD=<strong>

pm2 start /usr/local/bin/minio --name sv-minio -- server /mnt/storage/minio --console-address ":9001"
pm2 start /opt/smartvault/smartvault-api/server.js --name sv-api --cwd /opt/smartvault/smartvault-api
pm2 start npm --name sv-web --cwd /opt/smartvault -- start

pm2 save
pm2 startup
# run the printed sudo command once
```

---

## 8. nginx — full site (UI + API + JWT)

**Critical:** forward **`Authorization`** to Node or APIs return **401** and the browser goes to **`/login`**.

`/etc/nginx/sites-available/smartvault` (example):

```nginx
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
```

```bash
sudo ln -sf /etc/nginx/sites-available/smartvault /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

HTTPS: `certbot --nginx` when you have a DNS name.

Firewall: **`ufw allow OpenSSH`** and **`http`/`https`** — do **not** expose Postgres/MinIO/ES to the public internet unless intentional.

---

## 9. Go-live checklist

- [ ] All mounts survive reboot (`mount -a`)
- [ ] `npm run preflight` in **`smartvault-api`** passes
- [ ] **`CORS_ORIGINS`** includes exact origin users use (e.g. `http://192.168.x.x`)
- [ ] Admin exists; bootstrap disabled after first use
- [ ] Companies + FY + departments created in UI (fresh DB has no dept names until you add structure)
- [ ] Smoke: login, upload, admin structure

---

## 10. Reference

| Topic | Document |
|--------|-----------|
| **Full teaching deploy (toddler-paced, order rules, npm build table, SQL + admin)** | **`DEPLOYMENT_TEACHING_GUIDE.md`** |
| Short layout + env skeleton (this file) | **`BAREMETAL_DEPLOY.md`** |
| Extra troubleshooting / duplicate procedures | **`DEPLOYMENT_GUIDE.md`** |
| API-only systemd deploy | **`smartvault-api/DEPLOY_BAREMETAL.md`** |
| Project overview | **`README.md`** |
