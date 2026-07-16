require('/opt/smartvault/smartvault-api/node_modules/dotenv').config({ path: '/opt/smartvault/smartvault-api/.env' });
const pool = require('/opt/smartvault/smartvault-api/src/db/pool');

async function fix() {
  try {
    await pool.query('ALTER TABLE company_department_folders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW()');
    console.log('Successfully added updated_at to company_department_folders');
  } catch (e) {
    console.error(e);
  } finally {
    pool.end();
  }
}
fix();
