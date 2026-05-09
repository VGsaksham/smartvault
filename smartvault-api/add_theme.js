const { Pool } = require('pg');
const pool = new Pool({user: 'postgres', host: '127.0.0.1', database: 'smartvault_db', port: 5432}); // Or just connect as owner
async function run() {
  await pool.query("ALTER TABLE users ADD COLUMN theme_preference VARCHAR(20) DEFAULT 'light'");
  console.log("Added theme");
  process.exit(0);
}
run();
