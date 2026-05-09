const { Pool } = require('pg');
const pool = new Pool({user: 'postgres', host: '127.0.0.1', database: 'smartvault_db', password: 'password123', port: 5432});

async function run() {
  try {
    await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS theme_preference VARCHAR(20) DEFAULT 'light'");
    console.log("Added theme_preference");
  } catch(e) { console.log(e.message); }

  try {
    await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS can_upload_to_allowed BOOLEAN DEFAULT false");
    console.log("Added can_upload_to_allowed");
  } catch(e) { console.log(e.message); }

  process.exit(0);
}
run();
