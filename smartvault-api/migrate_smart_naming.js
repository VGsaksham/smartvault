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
    await pool.query(`
      CREATE TABLE IF NOT EXISTS file_sequences (
        department VARCHAR(50),
        year_month VARCHAR(7),
        last_sequence INTEGER DEFAULT 0,
        PRIMARY KEY (department, year_month)
      );
    `);
    await pool.query("ALTER TABLE vault_files ADD COLUMN IF NOT EXISTS auto_name VARCHAR(255);");
    await pool.query("ALTER TABLE vault_files ADD COLUMN IF NOT EXISTS custom_name VARCHAR(255);");
    console.log("Smart Naming Migration successful");
  } catch (err) {
    console.error("Migration failed:", err);
  } finally {
    pool.end();
  }
}

migrate();
