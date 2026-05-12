# SmartVault — full teaching deployment guide

Read this when you want **every step explained slowly**, with **when to do what**, **when NOT to**, and **when `npm run build` matters**.  
Target: **one Ubuntu 22.04 LTS bare-metal server** with SSD + HDD layout like your hardware plan.

---

## Table of contents

1. [Which document should I use?](#1-which-document-should-i-use)
2. [Will following the docs be “enough”?](#2-will-following-the-docs-be-enough)
3. [The moving parts (explained simply)](#3-the-moving-parts-explained-simply)
4. [Order you must follow (do not shuffle)](#4-order-you-must-follow-do-not-shuffle)
5. [Commands cheat sheet: `npm install` vs `npm run build` vs other](#5-commands-cheat-sheet-npm-install-vs-npm-run-build-vs-other)
6. [Phase A — Prepare the operating system](#phase-a--prepare-the-operating-system)
7. [Phase B — Mount disks and folders](#phase-b--mount-disks-and-folders)
8. [Phase C — Install programs (Node, Postgres, nginx, …)](#phase-c--install-programs-node-postgres-nginx-)
9. [Phase D — PostgreSQL: create empty “notebook” + draw all tables](#phase-d--postgresql-create-empty-notebook--draw-all-tables)
10. [Phase E — MinIO (object storage)](#phase-e--minio-object-storage)
11. [Phase F — Put SmartVault code on the server](#phase-f--put-smartvault-code-on-the-server)
12. [Phase G — Backend configuration (`.env`)](#phase-g--backend-configuration-env)
13. [Phase H — Backend dependencies](#phase-h--backend-dependencies)
14. [Phase I — Database migrations (after tables exist)](#phase-i--database-migrations-after-tables-exist)
15. [Phase J — Preflight (sanity check)](#phase-j--preflight-sanity-check)
16. [Phase K — First administrator account](#phase-k--first-administrator-account)
17. [Phase L — Frontend configuration + **when you must `npm run build`**](#phase-l--frontend-configuration--when-you-must-npm-run-build)
18. [Phase M — Start processes (PM2)](#phase-m--start-processes-pm2)
19. [Phase N — nginx (one front door)](#phase-n--nginx-one-front-door)
20. [Phase O — Firewall](#phase-o--firewall)
21. [Phase P — First week inside the app](#phase-p--first-week-inside-the-app)
22. [If something breaks](#22-if-something-breaks)

---

## 1. Which document should I use?

| Document | Purpose |
|----------|---------|
| **`BAREMETAL_DEPLOY.md`** | Short **map**: paths (NVMe vs HDD), env examples, PM2 + nginx skeleton. Read first for orientation. |
| **This file (`DEPLOYMENT_TEACHING_GUIDE.md`)** | **Long teaching path**: what each step does, **when / when not**, order rules, includes **copy-paste SQL + admin script**. |
| **`DEPLOYMENT_GUIDE.md`** | Very long **reference + symptom → fix** encyclopedia (duplicate SQL, extra troubleshooting). Use when something fails and you need more error recipes. |

**Recommended workflow:** skim **`BAREMETAL_DEPLOY.md`** → follow **this teaching guide** from top to bottom → open **`DEPLOYMENT_GUIDE.md`** only when you hit an error message you do not understand.

---

## 2. Will following the docs be “enough”?

**It is enough if you respect the order** (especially: **base database tables before migrations**) and **make passwords match** everywhere.

Nothing can promise **zero** surprises on real iron (wrong disk name, typo, router firewall). This guide minimizes them.

**Rules that prevent most pain:**

1. **Never run `bash scripts/db-migrate.sh` on a totally empty database** until you have created the **base tables** (Phase D.2). Otherwise you get errors like “relation … does not exist”.
2. **`DB_PASSWORD` in `.env` must equal** the password you gave PostgreSQL user `vaultadmin`.
3. **`CORS_ORIGINS`** must list the **exact** URL users type in the browser (including `http://` and IP). **Do not use `*`** in production — the backend refuses it.
4. **nginx must forward `Authorization`** to the API (included in Phase N). If not, the UI may kick people to `/login` randomly.
5. After changing **`NEXT_PUBLIC_*`** in `.env.local`, you **must** run **`npm run build`** again (Phase L).
6. **`npm run preflight`** checks plumbing; it **does not create users**.

---

## 3. The moving parts (explained simply)

- **Ubuntu Linux**: the operating system on your bare-metal PC.
- **SmartVault “frontend”**: the website UI (Next.js). Users see buttons and pages.
- **SmartVault “API”**: a small server program (Node.js) that talks to the database and storage. Listens on port **5005** by default.
- **PostgreSQL**: the **database** — users, companies, which file belongs where, audit rows. Lives under **`/var/lib/postgresql`** by default.
- **MinIO**: private “Amazon S3–like” storage for **files** (documents/images/etc.) on **`/mnt/storage/minio`** in your layout.
- **Large HDD paths (`/mnt/hdd01`, `/mnt/hdd02`)**: folders where **big media** can live; the API uses **`EXTERNAL_DRIVE_PATH`** (often **`/mnt/hdd01`**) as the **main media root**. Second disk can be **linked** under that tree (see `BAREMETAL_DEPLOY.md` §6).
- **Backup folder (`/mnt/backup`)**: where scheduled backups write — **`BACKUP_STORAGE_PATH`**.
- **nginx**: the **front door** on port **80** (and **443** if HTTPS). Sends `/` to the UI and `/api/` to the API so browsers use **one address**.
- **PM2**: babysitter — keeps Node + MinIO processes alive and can restart them after reboot.
- **Elasticsearch / Redis** (optional): not required for core SmartVault. Elasticsearch only matters if you intentionally enable search features and install ES.

---

## 4. Order you must follow (do not shuffle)

```
OS update → mount disks → install packages → PostgreSQL (DB + base tables) → MinIO running + keys in .env
→ clone code → backend .env → npm install (API) → migrations → preflight → admin user → frontend .env.local
→ npm run build (frontend) → PM2 (API + web + MinIO) → nginx → firewall → test in browser
```

**Never:**

- Run migrations **before** base tables exist.
- Run **`npm run build`** **before** you are happy with **`.env.local`** for production (you will rebuild anyway if you change `NEXT_PUBLIC_*` later — that is normal).

---

## 5. Commands cheat sheet: `npm install` vs `npm run build` vs other

| Command | Where | When to run | What it does | When **NOT** to run |
|---------|--------|--------------|--------------|---------------------|
| `npm ci` or `npm install` | `/opt/smartvault` (frontend) | After clone or after updating dependencies / `git pull` | Downloads JavaScript packages for the website | Do not run as **root** if your app files are owned by a normal user — stay consistent |
| `npm ci --omit=dev` or `npm install --production` | `/opt/smartvault/smartvault-api` | Same — first deploy and after backend dependency changes | Downloads packages for the API | Same user/permission note |
| **`npm run build`** | `/opt/smartvault` | **Every time** you change **`.env.local`** values that start with **`NEXT_PUBLIC_`**, or after upgrading frontend code you want in production | Compiles the Next.js site into **`/.next`** — **bakes in** `NEXT_PUBLIC_*` | Do not skip before **`pm2 start npm -- start`** in production — old build may still run |
| **`npm run preflight`** | `/opt/smartvault/smartvault-api` | After `.env` is filled and disks exist | Checks DB, writable folders, MinIO bucket — **does not create admin user** | Not a substitute for migrations |
| `bash scripts/db-migrate.sh` | `/opt/smartvault/smartvault-api` | **Only after** Phase D.2 base schema exists | Applies incremental SQL patches | **Never** on empty DB without Phase D.2 |
| `npm run dev` | local developer PC only | Local testing | Hot reload dev server — **not** for production | **Never** as your “forever” production mode |

**Remember:** changing **backend** `.env` usually needs **`pm2 restart sv-api`** only. Changing frontend **`NEXT_PUBLIC_*`** needs **`npm run build`** **and** restart **`sv-web`** (or whatever you named it).

---

## Phase A — Prepare the operating system

**Goal:** safe, updated Ubuntu.

```bash
sudo apt update && sudo apt upgrade -y
```

**Why:** gets security patches so networking and disks behave predictably.

**When not to:** skip upgrades long-term — you accumulate broken SSL / library issues.

---

## Phase B — Mount disks and folders

**Goal:** every drive comes back after reboot with stable paths.

**Simple idea:** `/mnt/hdd01` is just an **empty parking spot** until you **mount** a disk there.

1. Find partitions: `lsblk`
2. Format **only** empty disks you truly intend to erase: `sudo mkfs.ext4 /dev/sdXN` (careful).
3. Create folders: `sudo mkdir -p /mnt/storage/minio /mnt/hdd01 /mnt/hdd02 /mnt/backup`
4. Mount once: `sudo mount /dev/sdXN /mnt/hdd01` (example).
5. Get UUID: `sudo blkid`
6. Add lines to `/etc/fstab` like:  
   `UUID=xxxx /mnt/hdd01 ext4 defaults,nofail 0 2`
7. Test: `sudo mount -a` then `findmnt /mnt/hdd01`

Create writable app dirs:

```bash
mkdir -p /mnt/hdd01/preview_cache
```

**Ownership:** the Linux user that runs PM2 must **write** these paths. Often:

```bash
sudo chown -R "$USER:$USER" /mnt/hdd01 /mnt/hdd02 /mnt/backup /mnt/storage/minio
```

**When not to:** mount the wrong partition (triple-check `blkid`).

---

## Phase C — Install programs (Node, Postgres, nginx, …)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs postgresql postgresql-contrib nginx libreoffice
sudo npm install -g pm2
```

| Piece | Why SmartVault wants it |
|-------|-------------------------|
| **Node.js 20** | Runs the API and builds tooling |
| **PostgreSQL** | Database |
| **nginx** | Reverse proxy — single URL for UI + API |
| **LibreOffice** | Helps previews/conversions where used |
| **PM2** | Keeps processes alive |

Install MinIO binary:

```bash
curl -fsSL https://dl.min.io/server/minio/release/linux-amd64/minio -o minio
chmod +x minio && sudo mv minio /usr/local/bin/
```

---

## Phase D — PostgreSQL: create empty “notebook” + draw all tables

Think: **database** = notebook; **tables** = pages with rows.

### D.1 Create database and login role

Replace **`YOUR_DB_PASSWORD`** once and remember it — it must match **`DB_PASSWORD`** later.

```bash
sudo -u postgres psql <<'SQL'
CREATE DATABASE smartvault_db;
CREATE USER vaultadmin WITH ENCRYPTED PASSWORD 'YOUR_DB_PASSWORD';
GRANT ALL PRIVILEGES ON DATABASE smartvault_db TO vaultadmin;
\c smartvault_db
GRANT ALL ON SCHEMA public TO vaultadmin;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO vaultadmin;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO vaultadmin;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO vaultadmin;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO vaultadmin;
SQL
```

### D.2 Base schema (fresh installs only)

**Why:** the repo’s `db-migrate.sh` **updates** existing installs; it does **not** magically create the first empty tables on a brand-new server.

**When not to:** run this if you already have production data you care about — **this block wipes `public` schema** if you use the DROP line. For **brand new** server, that is what we want.

```bash
sudo -u postgres psql -d smartvault_db <<'EOF'
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO vaultadmin;
GRANT ALL ON SCHEMA public TO public;

CREATE TABLE companies (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) DEFAULT 'Independent',
    parent_company_id INTEGER REFERENCES companies(id),
    storage_quota_gb INTEGER DEFAULT 0
);
ALTER TABLE companies OWNER TO vaultadmin;

CREATE TABLE financial_years (
    id SERIAL PRIMARY KEY,
    company_id INTEGER REFERENCES companies(id),
    name VARCHAR(50) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status VARCHAR(20) DEFAULT 'Active'
);
ALTER TABLE financial_years OWNER TO vaultadmin;

CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'Staff',
    department VARCHAR(100),
    allowed_departments TEXT[] DEFAULT ARRAY[]::TEXT[],
    can_bulk_move BOOLEAN DEFAULT true,
    can_bulk_copy BOOLEAN DEFAULT true,
    can_bulk_delete BOOLEAN DEFAULT false,
    can_bulk_rename BOOLEAN DEFAULT true,
    can_bulk_download BOOLEAN DEFAULT true,
    can_upload_to_allowed BOOLEAN DEFAULT false,
    theme_preference VARCHAR(20) DEFAULT 'light',
    status VARCHAR(50) DEFAULT 'Active',
    last_ip_address VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    token_version INTEGER DEFAULT 0
);
ALTER TABLE users OWNER TO vaultadmin;

CREATE TABLE vault_files (
    id SERIAL PRIMARY KEY,
    original_name VARCHAR(500) NOT NULL,
    minio_filename VARCHAR(500) NOT NULL,
    size_bytes BIGINT NOT NULL,
    mime_type VARCHAR(255),
    department VARCHAR(100),
    folder VARCHAR(255),
    file_hash VARCHAR(255),
    uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    auto_name VARCHAR(255),
    custom_name VARCHAR(255),
    upload_date TIMESTAMP DEFAULT NOW(),
    tags JSONB DEFAULT '[]'::jsonb
);
ALTER TABLE vault_files OWNER TO vaultadmin;

CREATE TABLE user_company_access (
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
    department VARCHAR(100),
    can_upload BOOLEAN DEFAULT false,
    is_primary BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (user_id, company_id)
);
ALTER TABLE user_company_access OWNER TO vaultadmin;

CREATE TABLE vault_user_metadata (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE
);
ALTER TABLE vault_user_metadata OWNER TO vaultadmin;

CREATE TABLE vault_file_metadata (
    file_id INTEGER PRIMARY KEY REFERENCES vault_files(id) ON DELETE CASCADE,
    company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
    fy_id INTEGER REFERENCES financial_years(id) ON DELETE CASCADE
);
ALTER TABLE vault_file_metadata OWNER TO vaultadmin;

CREATE TABLE file_sequences (
    department VARCHAR(100),
    year_month VARCHAR(20),
    last_sequence INTEGER DEFAULT 1,
    PRIMARY KEY (department, year_month)
);
ALTER TABLE file_sequences OWNER TO vaultadmin;

CREATE TABLE starred_files (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    file_id INTEGER REFERENCES vault_files(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW()
);
ALTER TABLE starred_files OWNER TO vaultadmin;

CREATE TABLE user_preferences (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    theme_preference VARCHAR(20) DEFAULT 'light',
    can_upload_to_allowed BOOLEAN DEFAULT false,
    updated_at TIMESTAMP DEFAULT NOW()
);
ALTER TABLE user_preferences OWNER TO vaultadmin;

CREATE TABLE user_bulk_permissions (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    can_bulk_move BOOLEAN DEFAULT true,
    can_bulk_copy BOOLEAN DEFAULT true,
    can_bulk_delete BOOLEAN DEFAULT false,
    can_bulk_rename BOOLEAN DEFAULT true,
    can_bulk_download BOOLEAN DEFAULT true,
    updated_at TIMESTAMP DEFAULT NOW()
);
ALTER TABLE user_bulk_permissions OWNER TO vaultadmin;

CREATE TABLE user_department_permissions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    department VARCHAR(100) NOT NULL,
    can_upload BOOLEAN DEFAULT false,
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, department)
);
ALTER TABLE user_department_permissions OWNER TO vaultadmin;

CREATE TABLE audit_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action_type TEXT NOT NULL,
    file_id INTEGER REFERENCES vault_files(id) ON DELETE SET NULL,
    details TEXT,
    ip_address VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW()
);
ALTER TABLE audit_logs OWNER TO vaultadmin;

CREATE TABLE audit_undo_payloads (
    audit_log_id INTEGER PRIMARY KEY REFERENCES audit_logs(id) ON DELETE CASCADE,
    action_type TEXT NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
ALTER TABLE audit_undo_payloads OWNER TO vaultadmin;

CREATE TABLE company_departments (
    id SERIAL PRIMARY KEY,
    company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
    fy_id INTEGER REFERENCES financial_years(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);
ALTER TABLE company_departments OWNER TO vaultadmin;

CREATE TABLE company_department_folders (
    id SERIAL PRIMARY KEY,
    department_id INTEGER REFERENCES company_departments(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);
ALTER TABLE company_department_folders OWNER TO vaultadmin;
EOF
```

The API may **upgrade** these tables later (extra columns). That is normal.

---

## Phase E — MinIO (object storage)

**Simple idea:** MinIO holds **file bytes**. PostgreSQL holds **who owns what**.

### E.1 Run MinIO with a data folder

Pick strong root credentials (environment variables):

```bash
export MINIO_ROOT_USER="minioadmin"
export MINIO_ROOT_PASSWORD="YOUR_STRONG_ROOT_PASSWORD"
```

Start (foreground test):

```bash
minio server /mnt/storage/minio --console-address ":9001"
```

API port **9000**, console **9001**. Stop with **Ctrl+C** after testing — Phase M will use PM2.

### E.2 MinIO Client (`mc`) — create app keys

```bash
curl -fsSL https://dl.min.io/client/mc/release/linux-amd64/mc -o mc
chmod +x mc && sudo mv mc /usr/local/bin/mc
mc alias set sv http://127.0.0.1:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"
mc admin info sv
```

Optional bucket (API can auto-create if `AUTO_CREATE_MINIO_BUCKET=true`):

```bash
mc mb -p sv/smartvault-files
```

Recommended: dedicated app user + access keys — see **`DEPLOYMENT_GUIDE.md`** §4.2.1 Steps D–E for `mc admin user` / `svcacct` if you need the full recipe.

Put **`MINIO_ACCESS_KEY`** / **`MINIO_SECRET_KEY`** into API `.env` (Phase G).

---

## Phase F — Put SmartVault code on the server

```bash
sudo mkdir -p /opt/smartvault
sudo chown -R "$USER:$USER" /opt/smartvault
cd /opt/smartvault
git clone <YOUR_REPOSITORY_URL> .
```

Expected layout:

```
/opt/smartvault/           ← frontend (Next.js)
/opt/smartvault/smartvault-api/   ← backend (Node API)
```

---

## Phase G — Backend configuration (`.env`)

Path: **`/opt/smartvault/smartvault-api/.env`**.

Create it if missing (`cp .env.example .env` only works if that file exists in your repo).

**Minimal production mindset:**

- **`JWT_SECRET`**: long random string (`openssl rand -base64 48`).
- **`CORS_ORIGINS`**: exact origins — example: `http://192.168.1.50,http://myvault.local`
- **Database:** `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`, `DB_NAME` — password **must match** Phase D.1.
- **Paths:** align with your mounts:

```env
EXTERNAL_DRIVE_PATH=/mnt/hdd01
MEDIA_PREVIEW_CACHE_PATH=/mnt/hdd01/preview_cache
BACKUP_STORAGE_PATH=/mnt/backup
AUTO_CREATE_MEDIA_DIRS=true
```

- **MinIO:** endpoint/port/ssl/bucket + keys from Phase E.

Optional first admin via bootstrap (API creates user on startup if email not taken):

```env
ADMIN_BOOTSTRAP_ENABLED=true
ADMIN_BOOTSTRAP_EMAIL=admin@yourcompany.com
ADMIN_BOOTSTRAP_PASSWORD=your_long_password
```

After first login, set **`ADMIN_BOOTSTRAP_ENABLED=false`** and restart API.

---

## Phase H — Backend dependencies

```bash
cd /opt/smartvault/smartvault-api
npm ci --omit=dev
# or: npm install --production
```

**When again:** after **`git pull`** that changes `package.json` / lockfile.

---

## Phase I — Database migrations (after tables exist)

```bash
cd /opt/smartvault/smartvault-api
bash scripts/db-migrate.sh
```

**Why:** applies smaller `.sql` files that patch schema for upgrades.

**When not:** before Phase D.2 — you will get errors.

---

## Phase J — Preflight (sanity check)

```bash
cd /opt/smartvault/smartvault-api
npm run preflight
```

**Does:** tries DB connect, writable media paths, MinIO bucket presence (warnings ok if auto-create on).

**Does not:** create admin user.

Fix printed errors **before** going live.

---

## Phase K — First administrator account

**Option A — Bootstrap (Phase G env vars)**  
Start API once (Phase M); read logs for `[Startup] Bootstrap admin created:`.

**Option B — Manual insert**

```bash
cd /opt/smartvault/smartvault-api
node -e "
const pool = require('./src/db/pool');
const bcrypt = require('bcryptjs');

async function run() {
  const email = 'PUT_ADMIN_EMAIL_HERE';
  const password = 'PUT_ADMIN_PASSWORD_HERE';
  const hash = await bcrypt.hash(password, 10);
  await pool.query(
    \`INSERT INTO users (username, email, password_hash, role, department, status)
     VALUES (\$1, \$2, \$3, 'Admin', 'Management', 'Active')
     ON CONFLICT (email) DO UPDATE SET password_hash = \$3, role = 'Admin', status = 'Active'\`,
    ['Admin', email, hash]
  );
  console.log('Admin user created:', email);
  await pool.end();
}
run().catch(e => { console.error(e.message); process.exit(1); });
"
```

---

## Phase L — Frontend configuration + **when you must `npm run build`**

```bash
cd /opt/smartvault
nano .env.local
```

**Same-origin through nginx (recommended):**

```env
NEXT_PUBLIC_API_BASE_URL=
```

Meaning: empty string → browser calls **`/api/...`** on the **same host** as the website.

**Only if** you do **not** use nginx and browse straight to port 3000:

```env
NEXT_PUBLIC_API_BASE_URL=http://SERVER_IP:5005
```

**Never** put `/api` at the end — the code adds `/api` paths itself.

### The important build rule

```bash
npm run build
```

Run **`npm run build`**:

- **Before** first production start of the frontend.
- **Again every time** you change **`NEXT_PUBLIC_*`** in `.env.local`.

**Why:** Next.js **bakes** `NEXT_PUBLIC_*` into the compiled JS at **build time**. Restarting PM2 alone **does not** change old baked values.

**When not:** do not edit `.env.local` on the server and forget rebuild — users will still hit the old API URL behavior.

---

## Phase M — Start processes (PM2)

Example names — yours can differ.

```bash
export MINIO_ROOT_USER=minioadmin
export MINIO_ROOT_PASSWORD=YOUR_STRONG_ROOT_PASSWORD

pm2 start /usr/local/bin/minio --name sv-minio -- server /mnt/storage/minio --console-address ":9001"
pm2 start /opt/smartvault/smartvault-api/server.js --name sv-api --cwd /opt/smartvault/smartvault-api
pm2 start npm --name sv-web --cwd /opt/smartvault -- start

pm2 save
pm2 startup
```

Run the **`sudo env PATH=... pm2 startup ...`** command PM2 prints **once**.

**Logs:** `pm2 logs sv-api --lines 100`

---

## Phase N — nginx (one front door)

Put a server block like **`BAREMETAL_DEPLOY.md` §8** — **`Authorization`** header on `/api/` is **mandatory** for JWT login stability.

Enable site, test:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

---

## Phase O — Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status
```

Do **not** expose PostgreSQL (5432) or MinIO (9000) to the public internet unless you really intend to.

---

## Phase P — First week inside the app

**Normal:** empty department dropdowns until you create **Company → Financial Year → Departments** in Admin.

**Use:** Admin Dashboard tiles preserve **`companyId`/`fyId`** in the URL when possible — avoids empty metadata lists on a fresh DB.

---

## 22. If something breaks

1. **`pm2 logs sv-api`** and **`pm2 logs sv-web`**
2. **`npm run preflight`** again after any path/env change
3. **`DEPLOYMENT_GUIDE.md`** Part 11 — error symptom index

---

**End.** You now have one long teaching file plus shorter **`BAREMETAL_DEPLOY.md`** for quick layout recall and **`DEPLOYMENT_GUIDE.md`** for extra troubleshooting depth.
