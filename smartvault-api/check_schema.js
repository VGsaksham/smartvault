const { Pool } = require('pg');
const pool = new Pool({user: 'vaultadmin', host: '127.0.0.1', database: 'smartvault_db', password: 'password123', port: 5432});

async function run() {
  const res = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'users'");
  console.log(res.rows);
  
  // Add theme_preference if it doesn't exist
  const hasTheme = res.rows.some(r => r.column_name === 'theme_preference');
  if (!hasTheme) {
    console.log("Adding theme_preference column...");
    await pool.query("ALTER TABLE users ADD COLUMN theme_preference VARCHAR(20) DEFAULT 'light'");
  }
  process.exit(0);
}
run();
