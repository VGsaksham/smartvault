const { Pool } = require('pg');

// Connect as postgres superuser equivalent via trust auth
const pool = new Pool({
  user: 'vaultadmin',
  host: '127.0.0.1',
  database: 'smartvault_db',
  password: 'password123',
  port: 5432,
});

async function run() {
  const client = await pool.connect();
  try {
    // Add folder column - use raw DDL via superuser workaround
    // vaultadmin may not own the table; try anyway
    await client.query(`ALTER TABLE vault_files ADD COLUMN IF NOT EXISTS folder TEXT DEFAULT NULL`);
    console.log('folder column added');
  } catch (err) {
    if (err.code === '42701') {
      console.log('Column already exists, skipping.');
    } else if (err.code === '42501') {
      console.log('Permission denied — run: sudo -u postgres psql -d smartvault_db -c "ALTER TABLE vault_files ADD COLUMN IF NOT EXISTS folder TEXT DEFAULT NULL;"');
    } else {
      console.error(err.message);
    }
  } finally {
    client.release();
    await pool.end();
  }
}
run();
