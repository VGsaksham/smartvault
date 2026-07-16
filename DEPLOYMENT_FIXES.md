# SmartVault Deployment Fixes Log

This document tracks all the critical deployment and schema fixes we've applied to the SmartVault application during deployment to the VPS.

### 1. Database Installation Target (July 15, 2026)
- **Issue**: The schema generation script (`run-migrations.js`) was applying the database schema to the default `postgres` database instead of the newly created `smartvault_db`. This caused the application to crash on startup with `relation "users" does not exist`.
- **Fix**: Updated `DATABASE_URL` during migrations to explicitly point to `smartvault_db` (`postgres://postgres:password@localhost:5432/smartvault_db`).

### 2. Administrator Bootstrap Password (July 15, 2026)
- **Issue**: The default backend bootstrap process generates a hardcoded `admin` password, but the user requested `sanyasi@1981`. Our initial script to update it failed due to the API trying to connect to the wrong database (see above).
- **Fix**: The bootstrap password logic in `check_db.js` actually uses the `ADMIN_PASSWORD` environment variable, which was successfully set to `sanyasi@1981` during the deployment script, so no manual password patching was required once the DB connection was fixed.

### 3. MinIO Storage Credentials Mismatch (July 15, 2026)
- **Issue**: `sv-api` was using a fallback Access Key (`smartvault-app`) instead of the root MinIO credentials (`minioadmin`) that were configured during `minio` setup. This caused all file uploads and bucket creation to fail with `The Access Key Id you provided does not exist in our records`.
- **Fix**: Updated the `/opt/smartvault/smartvault-api/.env` file to use `MINIO_ACCESS_KEY=minioadmin`. The `MINIO_SECRET_KEY` was already correctly set to `sanyasi@1981`. Restarted `sv-minio` and `sv-api`.

### 4. MinIO Bucket Initialization (July 15, 2026)
- **Issue**: Because the MinIO credentials were wrong on the first boot, the backend failed to create the default storage bucket `smartvault-files`. 
- **Fix**: Executed the API backend's bucket creation logic with the fixed credentials, successfully provisioning the bucket. 

### 5. CSV Export Path Separator Bug (July 15, 2026)
- **Issue**: When exporting "user aliases" to CSV, the API used a slash (`/`) as the folder separator (e.g. `1/1`). Excel automatically parsed this as a date (January 1st) and reformatted it to `1-Jan`.
- **Fix**: Updated `src/routes/export.js` to use ` > ` as the path separator (e.g. `1 > 1`). Excel interprets this strictly as text, avoiding the unwanted date formatting.

### 6. Missing API Route for Folders (July 15, 2026)
- **Issue**: The "Folder Access" modal for assigning users to folders was failing to populate because the frontend requested `/api/folders`, which did not exist on the backend.
- **Fix**: Added `router.get('/folders')` to `smartvault-api/src/routes/admin.js` to properly return the folder paths for a department, and updated the frontend to call `/api/admin/folders`.

- **Financial Year Archived/Locked Logic**: Allowed file uploads to Archived Financial Years while strictly preventing deletion, moving, renaming, and tagging. Locked Financial Years remain completely immutable.

- **Infinite Reload Loop**: Fixed an issue where the frontend AuthHeartbeat would infinitely reload the page. This happened randomly because PostgreSQL doesn't guarantee the order of returned rows without an ORDER BY clause. Added ORDER BY to folder_access and department_permissions queries in the backend accessService to make the user payload 100% deterministic.

- **Department Update Error**: Fixed an issue where renaming a department failed due to the missing 'updated_at' column in the 'company_departments' table by adding the column directly into the PostgreSQL database schema.
- **Dynamic Folder Layout Toggle**: Updated the layout toggle (Grid/List views) in the File Dashboard to correctly apply the layout view to the folder elements (now displaying folders as list items when the list view is toggled, similar to files).

- **Folder Update Error**: Fixed a similar issue where renaming a folder failed due to the missing 'updated_at' column in the 'company_department_folders' table by adding the column directly into the PostgreSQL database schema.
