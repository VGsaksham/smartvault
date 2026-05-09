const { Pool } = require('pg');
const pool = new Pool({ user: 'vaultadmin', host: '127.0.0.1', database: 'smartvault_db', password: 'password123', port: 5432 });
async function run() {
  await pool.query('ALTER TABLE vault_files ADD COLUMN IF NOT EXISTS starred BOOLEAN DEFAULT false');
  console.log('starred column added OK');
  await pool.end();
}
run().catch(e => { console.error(e.message); pool.end(); });
