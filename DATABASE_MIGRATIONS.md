# Database Migrations Guide

When deploying SmartVault to a new server or updating an existing deployment, you must ensure that the PostgreSQL database schema is up-to-date with all the latest tables and indexes.

## Automated Migrations

We have added a new automated migration system to make deployments seamless.

1. **`run-migrations.js` Script:** 
   Inside the `smartvault-api` directory, there is now a `run-migrations.js` script. 
   This script automatically scans for all `.sql` files in the API folder and executes them against the database. Because most of our SQL scripts use `CREATE TABLE IF NOT EXISTS`, it is completely safe to run this multiple times.

2. **NPM Script:**
   You can trigger the migrations manually from the `smartvault-api` folder using:
   ```bash
   npm run migrate
   ```

3. **Deployment Integration:**
   The `scripts/deploy_baremetal.js` script has been updated to automatically run `npm run migrate` every time you deploy.
   
   If you ever use a different deployment method (like Docker or another CI/CD pipeline), just make sure your pipeline executes `cd smartvault-api && npm run migrate` before starting the `sv-api` process.

## Manual Migration (If Needed)

If you ever need to manually apply a SQL file without the automated script, you can run:

```bash
PGPASSWORD="<your_password>" psql -U vaultadmin -h 127.0.0.1 -d smartvault_db -f <path_to_sql_file>
```
