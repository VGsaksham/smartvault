const { Pool } = require('pg');
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'smartvault_db',
  password: 'password',
  port: 5432,
});

async function run() {
  try {
    const res = await pool.query("DELETE FROM vault_files WHERE category = 'Uncategorized'");
    console.log('Deleted rows:', res.rowCount);
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

run();
