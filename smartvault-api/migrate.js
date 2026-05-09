const { Pool } = require('pg');

const pool = new Pool({
  user: 'vaultadmin',
  host: '127.0.0.1',
  database: 'smartvault_db',
  password: 'password123',
  port: 5432,
});

async function migrate() {
  try {
    await pool.query("ALTER TABLE vault_files ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]';");
    await pool.query("ALTER TABLE vault_files ADD COLUMN IF NOT EXISTS expiry_date TIMESTAMP;");
    console.log("Migration successful");
  } catch (err) {
    console.error("Migration failed:", err);
  } finally {
    pool.end();
  }
}

migrate();
