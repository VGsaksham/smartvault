# 🚀 SmartVault: Bare-Metal Production Deployment Guide

This guide outlines the process for deploying the SmartVault application (Next.js Frontend, Node.js API, PostgreSQL, and MinIO) onto a fresh Ubuntu 22.04+ LTS production server.

---

## ✅ Newborn Mode: Run these commands in order (copy/paste)

If you don’t know Linux/servers, follow this section top-to-bottom. Replace the things marked `YOUR_...` only.

### Step 0 — login + update server

```bash
sudo apt update && sudo apt upgrade -y
```

### Step 1 — install requirements

```bash
# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Core services
sudo apt install -y postgresql postgresql-contrib nginx libreoffice

# PM2 (keeps services alive + starts on reboot)
sudo npm install -g pm2
```

### Step 2 — mount disks (HDD/SSD) and make permanent

Use Part 2.2 + 2.3. When done, verify:

```bash
df -hT
findmnt /mnt/hdd01
findmnt /mnt/backup
findmnt /mnt/storage/minio
```

### Step 3 — PostgreSQL create DB + user (copy/paste)

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

### Step 3.1 — Initialize Base Schema (Fresh Installs Only)

Because the repository migrations only *modify* existing tables, a completely fresh server needs the initial tables created first. Run this block to build the initial schema and assign ownership to `vaultadmin`:

```bash
sudo -u postgres psql -d smartvault_db <<'EOF'
-- 1. Wipe slate clean if partially created by accident
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO vaultadmin;
GRANT ALL ON SCHEMA public TO public;

-- 2. Create the complete schema
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

### Step 4 — download MinIO binary

```bash
wget https://dl.min.io/server/minio/release/linux-amd64/minio
chmod +x minio
sudo mv minio /usr/local/bin/
sudo mkdir -p /mnt/storage/minio
sudo chown -R $USER:$USER /mnt/storage/minio
```

### Step 5 — deploy app code

```bash
sudo mkdir -p /opt/smartvault
sudo chown -R $USER:$USER /opt/smartvault
cd /opt/smartvault

# Clone your repo
git clone YOUR_REPO_URL_HERE .
```

### Step 5.1 — very important: expected folder layout after clone

After cloning, your folder should look like this:

```text
/opt/smartvault
├─ src/                      (frontend)
├─ package.json              (frontend package)
├─ smartvault-api/           (backend folder)
│  ├─ server.js
│  ├─ package.json
│  └─ src/
└─ DEPLOYMENT_GUIDE.md
```

If `smartvault-api` is not inside `/opt/smartvault`, stop and fix that first.

---

### Step 5.2 — do frontend and backend need special path connection?

Short answer: **No hardcoded absolute path is needed** if you keep this layout.

- Frontend runs from `/opt/smartvault`
- Backend runs from `/opt/smartvault/smartvault-api`
- NGINX connects them by routing:
  - `/` -> frontend
  - `/api` -> backend

So frontend does not need to know `/home/...` or `/opt/...` backend path directly.

For deployment, keep frontend API config as:

```env
# frontend .env.local (recommended with NGINX)
NEXT_PUBLIC_API_BASE_URL=
```

This means browser calls same origin `/api/...`, and NGINX forwards to backend.

### Step 6 — backend env + install + migrations + preflight

```bash
cd /opt/smartvault/smartvault-api
npm install --production
cp .env.example .env
nano .env
```

After editing `.env`, run:

```bash
bash scripts/db-migrate.sh
npm run preflight
```

> **Note:** `npm run preflight` only checks that connections are working. It does **NOT** create the admin user automatically.

### Step 6.1 — Create the First Admin User (Required)

The `ADMIN_BOOTSTRAP_ENABLED` flag in `.env` does nothing — the admin account must be manually injected into the database. Run this command, replacing the email and password with the credentials you want to use to log in:

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

When it prints `Admin user created: [your email]`, the account is live. No server restart needed.

### Step 7 — frontend env + build

```bash
cd /opt/smartvault
npm install

# If using NGINX same-origin /api, leave NEXT_PUBLIC_API_BASE_URL blank (recommended).
# If NOT using NGINX (local/direct testing), you MUST set this to the backend's IP and port:
# NEXT_PUBLIC_API_BASE_URL=http://YOUR_SERVER_IP:5005
# DO NOT include /api at the end — the code adds that automatically.
nano .env.local

npm run build
```

> ⚠️ **Important:** `NEXT_PUBLIC_API_BASE_URL` is baked into the code at build time. If you change it in `.env.local`, you MUST run `npm run build` again for the change to take effect. Simply restarting the server will NOT pick up the new value.

### Step 8 — start services with PM2 (auto restart + reboot)

```bash
# API
cd /opt/smartvault/smartvault-api
pm2 start server.js --name sv-api

# Frontend
cd /opt/smartvault
pm2 start npm --name sv-frontend -- start

# MinIO
pm2 start minio --name sv-minio -- server /mnt/storage/minio --console-address ":9001"

# Enable reboot persistence
pm2 save
pm2 startup
```

Run the `sudo ...` command PM2 prints.

### Step 8.1 — Start Once, Keep Running Forever (copy/paste checklist)

Use this in production (not `npm run dev`):

```bash
# Backend
cd /opt/smartvault/smartvault-api
pm2 start server.js --name sv-api

# Frontend (production)
cd /opt/smartvault
npm run build
pm2 start npm --name sv-frontend -- start

# MinIO
pm2 start minio --name sv-minio -- server /mnt/storage/minio --console-address ":9001"

# Save + boot persistence
pm2 save
pm2 startup
```

Then run the printed `sudo ...` command once.

Quick checks:

```bash
pm2 status
pm2 logs sv-api --lines 80
pm2 logs sv-frontend --lines 80
pm2 logs sv-minio --lines 80
```

### Step 9 — configure NGINX reverse proxy

Use Part 7, then test:

```bash
sudo nginx -t
sudo systemctl restart nginx
```

## 📂 Part 1: Project Architecture Overview
Your application is split into two main parts:
1.  **Frontend (`/opt/smartvault`)**: A Next.js application that provides the user interface.
2.  **Backend API (`/opt/smartvault/smartvault-api`)**: A Node.js/Express server. 
    *   **Entry Point:** `server.js`
    *   **API Routes:** Separated into `src/routes/` (Admin, Audit, Auth, Companies, Export, FY, Users).
    *   **Storage Logic:** Videos/Audio are stored on your local External HDD; Documents/Images are stored in MinIO.

---

## 💾 Part 2: Hardware Setup (External Hard Drive)
SmartVault requires a physical drive for high-speed media streaming. You must "mount" your hard drive so it stays connected after reboots.

1.  **Find your drive:**
    ```bash
    lsblk
    ```
    *Look for your large drive (e.g., `sdb1`).*

2.  **Mount the Drive:**
    ```bash
    sudo mkdir -p /mnt/smartvault_data
    sudo mount /dev/sdb1 /mnt/smartvault_data
    ```

3.  **Make it Permanent:**
    *   Find the UUID: `sudo blkid /dev/sdb1`
    *   Open fstab: `sudo nano /etc/fstab`
    *   Add this line at the bottom: 
        `UUID=your-uuid-here /mnt/smartvault_data ext4 defaults 0 2`

4.  **Set Permissions:**
    ```bash
    sudo chown -R $USER:$USER /mnt/smartvault_data
    ```

### 2.1 Path discovery guide (for your SSD/HDD layout)

If you are not sure where each disk is mounted, run:

```bash
# Show block devices + mount points + filesystem
lsblk -o NAME,SIZE,FSTYPE,MOUNTPOINTS

# Show mounted filesystems with usage
df -hT

# Resolve exact mount source for a path
findmnt /opt/smartvault
findmnt /var/lib/postgresql
findmnt /mnt/storage/minio
findmnt /mnt/hdd01
findmnt /mnt/hdd02
findmnt /mnt/backup
```

For a layout like your diagram, use:

- App code: `/opt/smartvault`
- PostgreSQL data: `/var/lib/postgresql`
- Elasticsearch data: `/var/lib/elasticsearch`
- Redis data: `/var/lib/redis`
- NGINX config: `/etc/nginx`
- MinIO data: `/mnt/storage/minio`
- Media drive 1: `/mnt/hdd01`
- Media drive 2: `/mnt/hdd02`
- Backup drive: `/mnt/backup`

Set SmartVault env paths accordingly:

```env
EXTERNAL_DRIVE_PATH=/mnt/hdd01
MEDIA_PREVIEW_CACHE_PATH=/mnt/hdd01/preview_cache
BACKUP_STORAGE_PATH=/mnt/backup
```

Optional (for live disk cards on Admin Dashboard), add:

```env
# Format: LABEL:/mount/path,LABEL2:/mount/path2
STORAGE_PATH_MAP=OS Root:/,App:/opt/smartvault,PostgreSQL:/var/lib/postgresql,Elasticsearch:/var/lib/elasticsearch,Redis:/var/lib/redis,NGINX:/etc/nginx,MinIO:/mnt/storage/minio,HDD-01:/mnt/hdd01,HDD-02:/mnt/hdd02,Backup:/mnt/backup
```

This same map is also used by the **All Files** page live storage cards.

### 2.2 Beginner: Detect disks → mount them → make mounts permanent (copy/paste)

If you are new to Linux, treat this as the “do exactly this” section.

#### Step A — list disks

```bash
lsblk -o NAME,SIZE,TYPE,FSTYPE,MOUNTPOINTS,MODEL
```

What you’re looking for:
- Your OS SSD usually mounted at `/`
- Extra disks that show **no MOUNTPOINT** yet (these are the ones to mount)

#### Step B — get the disk UUID (needed for permanent mounts)

Example (replace `sdb1` with your partition):

```bash
sudo blkid /dev/sdb1
```

You’ll see something like:
- `UUID="xxxx-xxxx-xxxx"`

#### Step C — (optional) format a disk (WARNING: erases everything)

Only do this if the disk is empty / you don’t need its data.

```bash
sudo mkfs.ext4 -F /dev/sdb1
```

#### Step D — create mount folders

Match your target layout (example from your diagram):

```bash
sudo mkdir -p /mnt/storage/minio
sudo mkdir -p /mnt/hdd01
sudo mkdir -p /mnt/hdd02
sudo mkdir -p /mnt/backup
```

#### Step E — mount disks now (temporary until reboot)

Example:

```bash
sudo mount /dev/sdb1 /mnt/hdd01
```

Verify:

```bash
df -hT | head
findmnt /mnt/hdd01
```

#### Step F — make mounts permanent (fstab)

Open fstab:

```bash
sudo nano /etc/fstab
```

Add a line for each disk mount. Example:

```txt
UUID=YOUR-UUID-HERE  /mnt/hdd01  ext4  defaults,nofail  0  2
```

Notes:
- `nofail` helps the system boot even if a disk is unplugged.
- Do this once per disk (hdd01/hdd02/backup/minio).

Then test fstab:

```bash
sudo mount -a
df -hT
```

#### Step G — permissions so the app can write

```bash
sudo chown -R $USER:$USER /mnt/hdd01 /mnt/hdd02 /mnt/backup /mnt/storage/minio
```

### 2.3 Beginner: Move data folders to your mounted disks (Postgres + MinIO + SmartVault)

This is how you keep your data on SSD/HDD exactly where you want.

#### 2.3.1 Move PostgreSQL data directory to SSD (optional but recommended)

If you’re keeping Postgres at `/var/lib/postgresql` and it already lives on SSD, you can skip this.

1) Stop Postgres:

```bash
sudo systemctl stop postgresql
```

2) Copy data to new location (example: `/mnt/ssd_pgdata`):

```bash
sudo mkdir -p /mnt/ssd_pgdata
sudo rsync -aHAX /var/lib/postgresql/ /mnt/ssd_pgdata/
```

3) Point Postgres to new location:

```bash
sudo nano /etc/postgresql/*/main/postgresql.conf
```

Find `data_directory` and set it:

```txt
data_directory = '/mnt/ssd_pgdata'
```

4) Fix ownership and start:

```bash
sudo chown -R postgres:postgres /mnt/ssd_pgdata
sudo systemctl start postgresql
sudo systemctl status postgresql --no-pager
```

If you get stuck here, keep Postgres at the default path and just ensure that path is on SSD.

#### 2.3.2 Put MinIO data on the MinIO disk

We recommend storing MinIO under:
- `/mnt/storage/minio`

In your PM2 start command (Part 6), make sure MinIO uses that path:

```bash
pm2 start minio --name "sv-minio" -- server /mnt/storage/minio --console-address ":9001"
```

#### 2.3.3 Put SmartVault media + backups on the correct disks

Use these in backend `.env`:

```env
EXTERNAL_DRIVE_PATH=/mnt/hdd01
MEDIA_PREVIEW_CACHE_PATH=/mnt/hdd01/preview_cache
BACKUP_STORAGE_PATH=/mnt/backup
```

Then create them once:

```bash
mkdir -p /mnt/hdd01/preview_cache
mkdir -p /mnt/backup
```

Finally run:

```bash
cd /opt/smartvault/smartvault-api
npm run preflight
```

If preflight passes, your disks/paths are correct.

---

## 🏗 Part 3: System Requirements
Run these commands on your fresh server to install the core software:

```bash
# 1. Update OS
sudo apt update && sudo apt upgrade -y

# 2. Install Node.js v20 (LTS)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 3. Install Database, Proxy & Preview Tools
sudo apt install -y postgresql postgresql-contrib nginx libreoffice

# 4. Install PM2 (Process Manager)
sudo npm install -g pm2
```

---

## 🗄 Part 4: Database & MinIO Setup

### 4.1 PostgreSQL Setup
```bash
sudo -u postgres psql
```
Inside the prompt, run:
```sql
CREATE DATABASE smartvault_db;
CREATE USER vaultadmin WITH ENCRYPTED PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE smartvault_db TO vaultadmin;
\c smartvault_db
GRANT ALL ON SCHEMA public TO vaultadmin;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO vaultadmin;
\q
```

### 4.1.0 Initial Base Schema (Fresh Installs)

If this is a completely fresh database, the repository's `db-migrate.sh` will fail because it expects base tables to already exist. Run this massive block in your terminal to create the required foundational tables and assign them directly to `vaultadmin`:

```bash
sudo -u postgres psql -d smartvault_db <<'EOF'
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO vaultadmin;
GRANT ALL ON SCHEMA public TO public;

CREATE TABLE companies (id SERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL, type VARCHAR(50) DEFAULT 'Independent', parent_company_id INTEGER REFERENCES companies(id), storage_quota_gb INTEGER DEFAULT 0);
ALTER TABLE companies OWNER TO vaultadmin;

CREATE TABLE financial_years (id SERIAL PRIMARY KEY, company_id INTEGER REFERENCES companies(id), name VARCHAR(50) NOT NULL, start_date DATE NOT NULL, end_date DATE NOT NULL, status VARCHAR(20) DEFAULT 'Active');
ALTER TABLE financial_years OWNER TO vaultadmin;

CREATE TABLE users (id SERIAL PRIMARY KEY, username VARCHAR(255) NOT NULL, email VARCHAR(255) UNIQUE NOT NULL, password_hash VARCHAR(255) NOT NULL, role VARCHAR(50) DEFAULT 'Staff', department VARCHAR(100), allowed_departments TEXT[] DEFAULT ARRAY[]::TEXT[], can_bulk_move BOOLEAN DEFAULT true, can_bulk_copy BOOLEAN DEFAULT true, can_bulk_delete BOOLEAN DEFAULT false, can_bulk_rename BOOLEAN DEFAULT true, can_bulk_download BOOLEAN DEFAULT true, can_upload_to_allowed BOOLEAN DEFAULT false, theme_preference VARCHAR(20) DEFAULT 'light', status VARCHAR(50) DEFAULT 'Active', last_ip_address VARCHAR(255), created_at TIMESTAMP DEFAULT NOW(), token_version INTEGER DEFAULT 0);
ALTER TABLE users OWNER TO vaultadmin;

CREATE TABLE vault_files (id SERIAL PRIMARY KEY, original_name VARCHAR(500) NOT NULL, minio_filename VARCHAR(500) NOT NULL, size_bytes BIGINT NOT NULL, mime_type VARCHAR(255), department VARCHAR(100), folder VARCHAR(255), file_hash VARCHAR(255), uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL, auto_name VARCHAR(255), custom_name VARCHAR(255), upload_date TIMESTAMP DEFAULT NOW(), tags JSONB DEFAULT '[]'::jsonb);
ALTER TABLE vault_files OWNER TO vaultadmin;

CREATE TABLE user_company_access (user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE, department VARCHAR(100), can_upload BOOLEAN DEFAULT false, is_primary BOOLEAN DEFAULT false, created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW(), PRIMARY KEY (user_id, company_id));
ALTER TABLE user_company_access OWNER TO vaultadmin;

CREATE TABLE vault_user_metadata (user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE);
ALTER TABLE vault_user_metadata OWNER TO vaultadmin;

CREATE TABLE vault_file_metadata (file_id INTEGER PRIMARY KEY REFERENCES vault_files(id) ON DELETE CASCADE, company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE, fy_id INTEGER REFERENCES financial_years(id) ON DELETE CASCADE);
ALTER TABLE vault_file_metadata OWNER TO vaultadmin;

CREATE TABLE file_sequences (department VARCHAR(100), year_month VARCHAR(20), last_sequence INTEGER DEFAULT 1, PRIMARY KEY (department, year_month));
ALTER TABLE file_sequences OWNER TO vaultadmin;

CREATE TABLE starred_files (id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, file_id INTEGER REFERENCES vault_files(id) ON DELETE CASCADE, created_at TIMESTAMP DEFAULT NOW());
ALTER TABLE starred_files OWNER TO vaultadmin;

CREATE TABLE user_preferences (user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, theme_preference VARCHAR(20) DEFAULT 'light', can_upload_to_allowed BOOLEAN DEFAULT false, updated_at TIMESTAMP DEFAULT NOW());
ALTER TABLE user_preferences OWNER TO vaultadmin;

CREATE TABLE user_bulk_permissions (user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, can_bulk_move BOOLEAN DEFAULT true, can_bulk_copy BOOLEAN DEFAULT true, can_bulk_delete BOOLEAN DEFAULT false, can_bulk_rename BOOLEAN DEFAULT true, can_bulk_download BOOLEAN DEFAULT true, updated_at TIMESTAMP DEFAULT NOW());
ALTER TABLE user_bulk_permissions OWNER TO vaultadmin;

CREATE TABLE user_department_permissions (id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, department VARCHAR(100) NOT NULL, can_upload BOOLEAN DEFAULT false, updated_at TIMESTAMP DEFAULT NOW(), UNIQUE(user_id, department));
ALTER TABLE user_department_permissions OWNER TO vaultadmin;

CREATE TABLE audit_logs (id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE SET NULL, action_type TEXT NOT NULL, file_id INTEGER REFERENCES vault_files(id) ON DELETE SET NULL, details TEXT, ip_address VARCHAR(255), created_at TIMESTAMP DEFAULT NOW());
ALTER TABLE audit_logs OWNER TO vaultadmin;

CREATE TABLE audit_undo_payloads (audit_log_id INTEGER PRIMARY KEY REFERENCES audit_logs(id) ON DELETE CASCADE, action_type TEXT NOT NULL, payload JSONB NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT NOW());
ALTER TABLE audit_undo_payloads OWNER TO vaultadmin;

CREATE TABLE company_departments (id SERIAL PRIMARY KEY, company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE, fy_id INTEGER REFERENCES financial_years(id) ON DELETE CASCADE, name VARCHAR(255) NOT NULL, created_at TIMESTAMP DEFAULT NOW());
ALTER TABLE company_departments OWNER TO vaultadmin;

CREATE TABLE company_department_folders (id SERIAL PRIMARY KEY, department_id INTEGER REFERENCES company_departments(id) ON DELETE CASCADE, name VARCHAR(255) NOT NULL, created_at TIMESTAMP DEFAULT NOW());
ALTER TABLE company_department_folders OWNER TO vaultadmin;
EOF
```

### 4.1.1 DB password and user checklist (important)

Use one password and keep it exactly the same in both places:

1) In PostgreSQL:
```bash
sudo -u postgres psql -c "ALTER USER vaultadmin WITH PASSWORD 'your_secure_password';"
```

2) In backend `.env`:
```env
DB_USER=vaultadmin
DB_PASSWORD=your_secure_password
DB_NAME=smartvault_db
DB_HOST=127.0.0.1
DB_PORT=5432
```

If these values do not match exactly, API startup will fail with auth error `28P01`.

### 4.1.2 Verify DB roles and databases quickly

```bash
sudo -u postgres psql -c "\du"
sudo -u postgres psql -c "\l"
```

You should see:
- role: `vaultadmin`
- database: `smartvault_db`
- privileges granted to `vaultadmin`

### 4.1.3 Grant default privileges for future tables/sequences

Run once after initial setup:

```bash
sudo -u postgres psql -d smartvault_db -c "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO vaultadmin;"
sudo -u postgres psql -d smartvault_db -c "GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO vaultadmin;"
sudo -u postgres psql -d smartvault_db -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO vaultadmin;"
sudo -u postgres psql -d smartvault_db -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO vaultadmin;"
\q
```

### 4.1.4 User permissions tables (auto-created/auto-upgraded by API)

SmartVault stores user permissions across multiple tables. **The API will auto-create and auto-upgrade** these on startup / when saving permissions (no manual migration needed for a fresh install), as long as your DB user has privileges.

- **`user_company_access`**: per-user company + department access (read/write) and primary company
  - columns used: `user_id`, `company_id`, `department`, `can_upload`, `is_primary`, `created_at`, `updated_at`
  - the API will also **ALTER** this table if it exists but is missing columns (common after partial setup)
- **`user_department_permissions`**: per-user department upload toggles
  - columns used: `user_id`, `department`, `can_upload`
- **`user_bulk_permissions`**: bulk operation toggles
  - columns used: `user_id`, `can_bulk_move`, `can_bulk_copy`, `can_bulk_delete`, `can_bulk_rename`, `can_bulk_download`
- **`user_preferences`**: user preferences like `theme_preference` and `can_upload_to_allowed`

If your DB user is missing grants, these tables may fail to create/alter and you’ll see errors when saving permissions.

### 4.2 MinIO Installation
```bash
wget https://dl.min.io/server/minio/release/linux-amd64/minio
chmod +x minio
sudo mv minio /usr/local/bin/
sudo mkdir -p /mnt/data/minio
sudo chown -R $USER:$USER /mnt/data/minio
```

### 4.2.1 MinIO setup (NO browser required — terminal only)

You can manage MinIO entirely from terminal using the MinIO Client `mc`. This is the easiest way on a headless Ubuntu server.

#### Step A — install `mc`

```bash
curl -fsSL https://dl.min.io/client/mc/release/linux-amd64/mc -o mc
chmod +x mc
sudo mv mc /usr/local/bin/mc
mc --version
```

#### Step B — start MinIO with root credentials

Pick strong root credentials:

```bash
export MINIO_ROOT_USER="minioadmin"
export MINIO_ROOT_PASSWORD="YOUR_STRONG_ROOT_PASSWORD"
```

Start MinIO (example data path from your disk layout):

```bash
minio server /mnt/storage/minio --console-address ":9001"
```

If running via PM2, use the same root env vars when you start it (see Part 6).

#### Step C — connect `mc` to MinIO (alias)

```bash
mc alias set sv http://127.0.0.1:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"
```

Verify:

```bash
mc admin info sv
```

#### Step D — create the SmartVault bucket (optional)

SmartVault can auto-create the bucket if `AUTO_CREATE_MINIO_BUCKET=true`, but you can create it manually too:

```bash
mc mb -p sv/smartvault-files
```

#### Step E — create a dedicated SmartVault app user (recommended)

```bash
mc admin user add sv smartvault-app "YOUR_STRONG_APP_PASSWORD"
mc admin policy attach sv readwrite --user smartvault-app
```

Create access keys for the app user (service account):

```bash
mc admin user svcacct add sv smartvault-app \
  --access-key "YOUR_MINIO_ACCESS_KEY" \
  --secret-key "YOUR_MINIO_SECRET_KEY"
```

#### Step F — set backend `.env` MinIO values

```env
MINIO_ENDPOINT=127.0.0.1
MINIO_PORT=9000
MINIO_USE_SSL=false
MINIO_BUCKET=smartvault-files
AUTO_CREATE_MINIO_BUCKET=true

# App user credentials (recommended)
MINIO_ACCESS_KEY=YOUR_MINIO_ACCESS_KEY
MINIO_SECRET_KEY=YOUR_MINIO_SECRET_KEY

# Optional: root creds (ops only)
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=YOUR_STRONG_ROOT_PASSWORD
```

Restart the API after updating `.env`.

#### Quick troubleshooting (terminal)

```bash
# list buckets
mc ls sv

# verify the bucket exists
mc ls sv/smartvault-files

# check minio server health
mc admin info sv
```

---

## 🚀 Part 5: App Deployment

### 5.1 Clone Code
```bash
sudo mkdir -p /opt/smartvault
sudo chown -R $USER:$USER /opt/smartvault
cd /opt/smartvault
# Clone your repo here
git clone https://github.com/yourusername/smartvault.git .
```

### 5.2 Backend API Configuration
```bash
cd /opt/smartvault/smartvault-api
npm install --production

# Create .env from template
cp .env.example .env
nano .env
```
**Paste this into the `.env`:**
```env
NODE_ENV=production
HOST=0.0.0.0
PORT=5005
JWT_SECRET=generate_a_long_random_string_here
CORS_ORIGINS=http://your-server-ip,http://localhost:3000,https://your-domain.com

# DB CONFIG
DB_USER=vaultadmin
DB_PASSWORD=your_secure_password
DB_HOST=127.0.0.1
DB_NAME=smartvault_db
DB_PORT=5432

# MEDIA PATHS (from Part 2 mount)
EXTERNAL_DRIVE_PATH=/mnt/smartvault_data/media
MEDIA_PREVIEW_CACHE_PATH=/mnt/smartvault_data/preview_cache
AUTO_CREATE_MEDIA_DIRS=true

# MINIO APP CLIENT CONFIG (used by API)
MINIO_ENDPOINT=127.0.0.1
MINIO_PORT=9000
MINIO_USE_SSL=false
MINIO_ACCESS_KEY=your_minio_app_user
MINIO_SECRET_KEY=your_minio_app_password
MINIO_BUCKET=smartvault-files
AUTO_CREATE_MINIO_BUCKET=true

# OPTIONAL: MINIO ROOT CREDS (for infrastructure bootstrap only)
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=your_minio_root_password

# OPTIONAL: ONE-TIME ADMIN BOOTSTRAP
# Turn true only for first startup, then set to false.
ADMIN_BOOTSTRAP_ENABLED=true
ADMIN_BOOTSTRAP_USERNAME=admin
ADMIN_BOOTSTRAP_EMAIL=admin@yourcompany.com
ADMIN_BOOTSTRAP_PASSWORD=your_strong_admin_password
ADMIN_BOOTSTRAP_DEPARTMENT=Admin

# OPTIONAL: SEARCH
USE_ELASTICSEARCH=false
ELASTICSEARCH_URL=http://127.0.0.1:9200
ELASTICSEARCH_INDEX=smartvault_files

# BACKUP SCHEDULER
BACKUP_STORAGE_PATH=/mnt/smartvault_data/backups
BACKUP_CRON=0 2 * * *
BACKUP_RETENTION_DAYS=30
```

✅ **Important (production fail-fast):** the backend will now refuse to start in `NODE_ENV=production` if any of these are missing/unsafe:
- `JWT_SECRET` (must be set and long)
- `CORS_ORIGINS` (must be set; **do not use `*`**)
- `DB_PASSWORD`
- `MINIO_ACCESS_KEY`
- `MINIO_SECRET_KEY`

### 5.2.1 Deep guide: where to put each variable and how to choose values

Use this exact mapping while deploying:

- **API binding**
  - `HOST`: usually `0.0.0.0` on server.
  - `PORT`: backend listen port, usually `5005`.
- **Security**
  - `JWT_SECRET`: must be long and random (at least 32+ chars).
  - Generate with:
    ```bash
    openssl rand -base64 48
    ```
- **CORS**
  - `CORS_ORIGINS`: comma-separated frontend origins.
  - Include every URL users will open, e.g. `http://ip`, `https://domain`.
- **Database**
  - `DB_*`: must match the PostgreSQL user/database created in Part 4.
- **Media storage**
  - `EXTERNAL_DRIVE_PATH`: folder where media files (video/audio) live.
  - `MEDIA_PREVIEW_CACHE_PATH`: folder for preview/transcoding cache.
  - `AUTO_CREATE_MEDIA_DIRS=true`: API creates missing folders on startup.
- **Backup storage and schedule**
  - `BACKUP_STORAGE_PATH`: where full backups are saved (DB snapshot + MinIO objects + local media copies).
  - `BACKUP_CRON`: cron expression for scheduled backup (`0 2 * * *` = 2:00 AM daily).
  - `BACKUP_RETENTION_DAYS`: backups older than this are auto-pruned.
- **MinIO**
  - `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY`: credentials the API uses.
  - `MINIO_BUCKET`: object bucket name (default `smartvault-files`).
  - `AUTO_CREATE_MINIO_BUCKET=true`: creates bucket if missing.
  - `MINIO_ROOT_*`: optional reference for server bootstrap/ops.
- **Admin bootstrap**
  - `ADMIN_BOOTSTRAP_*`: automatically creates first Admin account if not present.
  - Keep `ADMIN_BOOTSTRAP_ENABLED=true` only for first boot.
- **Search (optional)**
  - Keep `USE_ELASTICSEARCH=false` unless Elasticsearch is installed.

### 5.2.2 How to find all supported backend variables from code

If you want to verify future changes, run:

```bash
cd /opt/smartvault/smartvault-api

# 1) Central env map (primary source of truth)
sed -n '1,220p' src/config/env.js

# 2) Every direct process.env usage in backend code
rg "process\\.env\\.[A-Z0-9_]+" src server.js
```

This gives a full list of variables supported by the running backend version.

### 5.2.3 How to verify variables are actually loaded on server

```bash
cd /opt/smartvault/smartvault-api

# Check file exists and has values (do not share secrets)
ls -la .env

# Quick check for required keys (prints only matching lines)
rg "^(HOST|PORT|JWT_SECRET|DB_HOST|DB_NAME|DB_USER|MINIO_ENDPOINT|MINIO_ACCESS_KEY|MINIO_BUCKET|EXTERNAL_DRIVE_PATH|BACKUP_STORAGE_PATH|BACKUP_CRON|ADMIN_BOOTSTRAP_ENABLED)=" .env
```

After start:
- `pm2 logs sv-api` should show startup checks for:
  - media storage path readiness
  - preview cache path readiness
  - backup storage path readiness
  - MinIO bucket readiness
  - admin bootstrap status (created/skipped)

### 5.2.4 First boot checklist (very important)

1. Set `ADMIN_BOOTSTRAP_ENABLED=true`.
2. Start API once and verify admin creation in logs.
3. Login with bootstrap admin credentials.
4. Immediately change password in app.
5. Set `ADMIN_BOOTSTRAP_ENABLED=false`.
6. Restart API:
   ```bash
   pm2 restart sv-api
   ```

**Run Database Migrations:**
```bash
# This script applies all the split SQL files (permissions, folders, etc.)
bash scripts/db-migrate.sh
```

### 5.3 Frontend Configuration
```bash
cd /opt/smartvault
npm install

# Create .env.local
nano .env.local
```
**Paste this into `.env.local`:**
```env
# Recommended for NGINX same-origin deployment:
# leave unset and frontend will call /api on same host.
#
# If frontend and API are on different hosts/domains, set explicitly:
# NEXT_PUBLIC_API_BASE_URL=https://api.your-domain.com
```

**Build:**
```bash
npm run build
```

---

## 🚦 Part 6: Starting the Services (PM2)
```bash
# 1. Start API
cd /opt/smartvault/smartvault-api

# Preflight checks (recommended before first start and after env changes)
npm run preflight

pm2 start server.js --name "sv-api"

# 2. Start Frontend
cd /opt/smartvault
pm2 start npm --name "sv-frontend" -- start

# 3. Start MinIO
pm2 start minio --name "sv-minio" -- server /mnt/data/minio --console-address ":9001"

# Save for auto-reboot
pm2 save
pm2 startup
```

---

## 🌐 Part 7: Network Access (same Wi-Fi / LAN) — Baby Mode

If your client users are on the **same Wi-Fi** as the server, this is the easiest setup.

Goal: users open one simple link like:

- `http://192.168.1.50`

No port needed, no domain needed, no HTTPS needed for LAN testing.

### 7.1 Understand the flow (very simple)

- Next.js frontend runs on `3000`
- Node API runs on `5005`
- NGINX listens on `80` and forwards:
  - `/` -> `3000`
  - `/api` -> `5005`

So users only open one link: `http://SERVER_LAN_IP`

### 7.2 Find your server LAN IP

Run:

```bash
ip a
```

Look for an address like `192.168.x.x` or `10.x.x.x` on your active network interface.

Example result you will share with users later:

- `192.168.1.50`

### 7.3 Make sure app processes are running

```bash
pm2 status
```

You should see:

- `sv-frontend` (Next.js)
- `sv-api` (backend)
- `sv-minio` (optional but recommended)

If not running, start them from Part 6.

### 7.4 Create NGINX site config

```bash
sudo nano /etc/nginx/sites-available/smartvault
```

Paste this:

```nginx
server {
    listen 80;
    server_name _;

    # Allow large uploads
    client_max_body_size 1000M;

    # Frontend
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Backend API
    location /api/ {
        proxy_pass http://127.0.0.1:5005;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 7.5 Enable config + reload NGINX

```bash
sudo rm -f /etc/nginx/sites-enabled/default
sudo ln -sf /etc/nginx/sites-available/smartvault /etc/nginx/sites-enabled/smartvault
sudo nginx -t
sudo systemctl restart nginx
sudo systemctl enable nginx
```

If `nginx -t` says OK, you are good.

### 7.6 Open firewall so other devices can reach it

```bash
sudo ufw allow 80/tcp
sudo ufw allow OpenSSH
sudo ufw reload
sudo ufw status
```

You should see `80/tcp ALLOW`.

### 7.7 Test from server itself first

```bash
curl -I http://127.0.0.1
curl -I http://127.0.0.1/api/health || true
```

Then test from another phone/laptop on same Wi-Fi:

- open browser: `http://SERVER_LAN_IP`
- example: `http://192.168.1.50`

### 7.8 Share link with client users

Share exactly this format:

- `http://192.168.1.50`

Do not share `localhost` (localhost works only on server machine itself).

### 7.9 If it does not open (quick fixes)

1. Check app is up:
   ```bash
   pm2 status
   pm2 logs sv-frontend --lines 80
   pm2 logs sv-api --lines 80
   ```
2. Check NGINX:
   ```bash
   sudo nginx -t
   sudo systemctl status nginx
   ```
3. Check firewall:
   ```bash
   sudo ufw status
   ```
4. Re-check server LAN IP (it may have changed after reboot/router reconnect):
   ```bash
   ip a
   ```
5. Router may have **AP isolation / client isolation** enabled (devices on same Wi-Fi blocked from each other). Disable that in router settings.

### 7.10 Make LAN link stable (recommended)

To avoid IP changing every reboot:

- Reserve a **DHCP static lease** in your router for this server MAC address.
- Or set a static IP on server network config.

This ensures client link stays the same.

---

## 🛠 Part 8: Troubleshooting & Maintenance
*   **Live Logs:** `pm2 logs`
*   **Restart Everything:** `pm2 restart all`
*   **Check DB snapshot:** `node check_db.js` (inside api folder)
*   **Run deployment preflight:** `npm run preflight` (inside api folder)
*   **Media Folder Permissions:** `ls -ld /mnt/smartvault_data/media`
*   **Preview Cache Permissions:** `ls -ld /mnt/smartvault_data/preview_cache`
*   **Check Loaded Env File Keys:** `rg "^[A-Z0-9_]+=" .env`
*   **Check Missing Startup Variables Quickly:**
    ```bash
    cd /opt/smartvault/smartvault-api
    for k in HOST PORT JWT_SECRET DB_HOST DB_NAME DB_USER DB_PASSWORD MINIO_ENDPOINT MINIO_ACCESS_KEY MINIO_SECRET_KEY MINIO_BUCKET EXTERNAL_DRIVE_PATH BACKUP_STORAGE_PATH BACKUP_CRON; do
      grep -q "^${k}=" .env || echo "MISSING: ${k}"
    done
    ```
*   **Common Errors and Fixes (copy/paste ready):**
    - `EACCES: permission denied, mkdir '/var/backups/smartvault'`
      - Cause: backup path not writable.
      - Fix:
        ```bash
        mkdir -p /home/saksham/backup
        # In .env:
        # BACKUP_STORAGE_PATH=/home/saksham/backup
        ```
    - `password authentication failed for user "vaultadmin" (28P01)`
      - Cause: `.env` DB password != PostgreSQL password.
      - Fix:
        ```bash
        sudo -u postgres psql -c "ALTER USER vaultadmin WITH PASSWORD 'your_secure_password';"
        ```
        Then set the same password in `.env` as `DB_PASSWORD`.
    - `permission denied for sequence vault_files_id_seq`
      - Cause: DB user can write table rows but lacks sequence permissions.
      - Fix:
        ```bash
        sudo -u postgres psql -d smartvault_db -c "GRANT USAGE, SELECT, UPDATE ON SEQUENCE vault_files_id_seq TO vaultadmin;"
        # or for all sequences:
        sudo -u postgres psql -d smartvault_db -c "GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO vaultadmin;"
        ```
    - `Failed to update permissions: column "can_upload" (or "department"/"is_primary") of relation "user_company_access" does not exist`
      - Cause: `user_company_access` table was created partially (missing columns). `CREATE TABLE IF NOT EXISTS` does not add missing columns.
      - Fix:
        - Restart the backend API (it will auto-ALTER the table on startup when saving permissions).
        - If your DB user lacks privileges, rerun Part **4.1.3** grants and restart again.
    - `Failed to delete user: update or delete on table "users" violates foreign key constraint ...`
      - Cause: the user is referenced by other rows (most commonly uploaded files / metadata / audit logs). This is expected once a user has activity.
      - Fix options:
        - **Recommended (production)**: don’t delete — set status to `Suspended` (Admin Users page).
        - **If you must delete**: reassign ownership first (example pattern):
          - update any `uploaded_by` / `user_id` references to a system/admin user, then retry delete.
    - `Backup restore failed: column "... does not exist"`
      - Cause: schema drift between backup metadata and current DB.
      - Fix:
        - Run migrations: `bash scripts/db-migrate.sh`
        - Restart API and retry restore.
    - `Failed to restore backup` with HTTP 500
      - Cause: generic restore failure.
      - Fix flow:
        1. Check backend logs (`pm2 logs sv-api` or terminal output).
        2. Fix reported DB/permission/path issue.
        3. Retry restore from Admin > Backups.

---

## 🔐 Part 9: Production Hardening (Strongly Recommended)

### 9.1 Storage layout for SSD/HDD deployments

Using dedicated disks for DB/media/backups is a good production design. Keep mount points explicit and stable:

- PostgreSQL data directory on fast SSD (recommended)
- App code on root/system disk (`/opt/smartvault`)
- Media and backups on large HDD/SSD mount

Example layout:

```bash
/opt/smartvault                      # frontend + backend code
/mnt/smartvault_data/media           # EXTERNAL_DRIVE_PATH
/mnt/smartvault_data/preview_cache   # MEDIA_PREVIEW_CACHE_PATH
/mnt/smartvault_data/backups         # BACKUP_STORAGE_PATH
/mnt/data/minio                      # MinIO object data
```

Then set the same paths in backend `.env`:

```env
EXTERNAL_DRIVE_PATH=/mnt/smartvault_data/media
MEDIA_PREVIEW_CACHE_PATH=/mnt/smartvault_data/preview_cache
BACKUP_STORAGE_PATH=/mnt/smartvault_data/backups
```

### 9.2 PM2 auto-restart + auto-start on reboot

```bash
cd /opt/smartvault/smartvault-api
pm2 start server.js --name sv-api

cd /opt/smartvault
pm2 start npm --name sv-web -- start

pm2 save
pm2 startup
```

After `pm2 startup`, run the printed `sudo ...` command once.

Useful commands:

```bash
pm2 status
pm2 logs sv-api
pm2 logs sv-web
pm2 restart all
```

### 9.3 NGINX + HTTPS (Let’s Encrypt)

Install certbot:

```bash
sudo apt update
sudo apt install -y certbot python3-certbot-nginx
```

Issue certificate:

```bash
sudo certbot --nginx -d your-domain.com -d www.your-domain.com
```

Auto-renew check:

```bash
sudo systemctl status certbot.timer
sudo certbot renew --dry-run
```

### 9.4 Firewall (UFW) baseline

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status
```

Do **not** expose DB/MinIO ports publicly unless you explicitly need to.

### 9.5 Power outage resilience checklist

- Use a UPS for server + network device.
- Keep PostgreSQL on SSD with journaling filesystem (ext4/xfs).
- Verify mounts persist after reboot (`/etc/fstab`).
- Keep at least 20% free disk space on DB/media disks.
- Run `npm run preflight` before first boot and after infra changes.
- Test backup restore monthly (not just backup creation).

### 9.6 One-command preflight before go-live

```bash
cd /opt/smartvault/smartvault-api
npm run preflight
```

This checks:
- env/security basics
- DB connection
- writable media/preview/backup paths
- MinIO reachability + bucket existence

If preflight fails, fix the printed error before starting production traffic.

---

## 🔁 Part 10: Auto-update server when GitHub repo changes

If you push frontend/backend changes to GitHub and want server to auto-pull updates, use this simple method.

### 10.1 Create update script on server

```bash
sudo tee /usr/local/bin/smartvault-update.sh >/dev/null <<'BASH'
#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/opt/smartvault"
API_DIR="/opt/smartvault/smartvault-api"

cd "$APP_DIR"
git pull origin main

# Frontend deps/build (safe to run repeatedly)
npm install
npm run build

# Backend deps
cd "$API_DIR"
npm install --production

# Restart services
pm2 restart sv-api
pm2 restart sv-frontend

echo "[smartvault-update] done at $(date)"
BASH

sudo chmod +x /usr/local/bin/smartvault-update.sh
```

### 10.2 Test update script manually

```bash
/usr/local/bin/smartvault-update.sh
```

### 10.3 Run update automatically every 5 minutes (easy mode)

```bash
crontab -e
```

Add this line:

```cron
*/5 * * * * /usr/local/bin/smartvault-update.sh >> /var/log/smartvault-update.log 2>&1
```

This checks GitHub every 5 minutes and updates server automatically.

### 10.4 Notes (important)

- This works when server has GitHub access and saved auth.
- If your push includes broken code, auto-update will deploy broken code too.
- Safer pattern: push to staging first, then merge to main after testing.
- If you want instant update on each push (not every 5 minutes), use GitHub Webhook + deploy endpoint later.

---

## 🔥 Part 11: Troubleshooting — Real-World Errors & Fixes

This section documents every real error encountered during deployment and how to fix it.

---

### 11.1 `must be owner of table users` during `db-migrate.sh`

**Symptom:**
```
psql:add_permissions.sql:1: ERROR: must be owner of table users
```

**Cause:** The base tables were created by the `postgres` system user instead of `vaultadmin`. PostgreSQL blocks `vaultadmin` from altering tables it doesn't own.

**Fix:** Wipe the schema and recreate it correctly using the full base schema script in **Step 3.1** of this guide. That script uses `DROP SCHEMA public CASCADE` to remove all broken tables and then rebuilds them with `ALTER TABLE ... OWNER TO vaultadmin`.

---

### 11.2 `relation "companies" does not exist` during `db-migrate.sh`

**Symptom:**
```
psql:normalize_company_management.sql:2: ERROR: relation "companies" does not exist
```

**Cause:** The `db-migrate.sh` script is incremental — it only modifies existing tables. It does NOT create the initial schema on a fresh database. The `companies` and `financial_years` tables are missing.

**Fix:** Run the full base schema block in **Step 3.1** first, then run `db-migrate.sh`.

---

### 11.3 `JSON.parse: unexpected character at line 1 column 1` on Login

**Symptom:** The login page shows a red error: `JSON.parse: unexpected character at line 1 column 1 of the JSON data`.

**Cause:** The frontend sent the login request to a URL that returned an HTML page (a 404 or error page) instead of a JSON response. This happens when the frontend is pointed at the wrong backend address.

**Fix:** Check the browser's Network tab (F12 → Network → click the failed login request). Look at what URL it tried to reach and what port it used.
- If the URL port matches the frontend port (e.g., `:3000`), the `NEXT_PUBLIC_API_BASE_URL` variable is missing or wrong.
- If NGINX is not set up yet, set `NEXT_PUBLIC_API_BASE_URL=http://YOUR_SERVER_IP:5005` in `.env.local` and rebuild.

---

### 11.4 Login returns `404 Not Found` (Frontend calling itself)

**Symptom:**
```
POST http://192.168.1.104:3000/api/auth/login [HTTP/1.1 404 Not Found]
```

**Cause:** The frontend is sending API requests to its own port (3000) instead of the backend API port (5005). This means `NEXT_PUBLIC_API_BASE_URL` is not set.

**Fix:**
1. Open `.env.local` in the frontend folder.
2. Add: `NEXT_PUBLIC_API_BASE_URL=http://YOUR_SERVER_IP:5005`
3. Run `npm run build` — this is **mandatory**, the variable is baked at build time.
4. Restart the frontend.

---

### 11.5 Wrong variable name — `NEXT_PUBLIC_API_URL` vs `NEXT_PUBLIC_API_BASE_URL`

**Symptom:** You set the env variable but login still hits the wrong port.

**Cause:** The correct variable name used by the frontend code (`src/lib/api.ts`) is `NEXT_PUBLIC_API_BASE_URL`. If you write `NEXT_PUBLIC_API_URL` (without `_BASE_`), the code silently ignores it and falls back to the default.

**Fix:** Make sure the variable in `.env.local` is spelled exactly: `NEXT_PUBLIC_API_BASE_URL`

---

### 11.6 Login returns `500 Internal Server Error`

**Symptom:**
```
POST http://192.168.1.104:5005/api/auth/login [HTTP/1.1 500 Internal Server Error]
```

**Cause:** The backend crashed while processing the login. Most common causes:
- The database password in the backend `.env` is wrong.
- The admin user does not exist in the database yet.
- A `JWT_SECRET` is missing or too short in the backend `.env`.

**Fix:** Look at the terminal where the backend is running. It will print the exact error. Then:
- If it's a DB connection error, fix `DB_PASSWORD` in `.env` and restart backend.
- If it's `invalid password` or user not found, run the admin creation script in **Step 6.1**.

---

### 11.7 `CORS blocked origin` error in backend logs

**Symptom:** Backend console shows:
```
Error: CORS blocked origin: http://192.168.1.104:3000
```

**Cause:** The backend has a strict CORS allowlist (`CORS_ORIGINS` in `.env`). The frontend's origin (IP + port) is not on that list, so the backend rejects all requests from it.

**Fix:** Open the backend `.env` and add the frontend URL to `CORS_ORIGINS`:
```env
# For testing without NGINX (allow any origin):
CORS_ORIGINS=*

# For production (allow only your specific frontend URL):
CORS_ORIGINS=http://YOUR_SERVER_IP:3000,https://yourdomain.com
```
Then **restart the backend** (`pm2 restart sv-api` or `node server.js`).

> ⚠️ Do NOT leave `CORS_ORIGINS=*` in production — it allows any website to call your API.

---

### 11.8 Login returns `400 Bad Request` — Invalid credentials

**Symptom:**
```
POST http://192.168.1.104:5005/api/auth/login [HTTP/1.1 400 Bad Request]
```

**Cause:** The network and backend are working perfectly. The email and password entered do not match any account in the database.

**Fix:** Run the admin creation script from **Step 6.1** to create or reset the admin account. Then log in with the exact email and password you put in that script.

---

### 11.9 `ADMIN_BOOTSTRAP_ENABLED` does nothing

**Symptom:** You set `ADMIN_BOOTSTRAP_ENABLED=true` in `.env` and ran `preflight`, but still can't log in.

**Cause:** The `ADMIN_BOOTSTRAP_ENABLED` variable is not referenced anywhere in the backend code. It is a dead variable that has no effect. The `npm run preflight` script only checks connectivity — it never creates users.

**Fix:** Use the manual admin creation script in **Step 6.1**.

---

### 11.10 `/api/api/auth/login` double-API in the URL

**Symptom:**
```
POST http://192.168.1.104:5005/api/api/auth/login [404]
```

**Cause:** The `NEXT_PUBLIC_API_BASE_URL` in `.env.local` ends with `/api` (e.g., `http://IP:5005/api`). The frontend code automatically appends `/api` to every request, resulting in a doubled path.

**Fix:** The variable must NOT end with `/api`. Set it as just the base URL:
```env
NEXT_PUBLIC_API_BASE_URL=http://YOUR_SERVER_IP:5005
```
Then rebuild with `npm run build`.
