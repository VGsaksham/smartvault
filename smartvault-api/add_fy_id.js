require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME
});

async function addFyId() {
  try {
    await pool.query(`ALTER TABLE vault_file_metadata ADD COLUMN fy_id INTEGER REFERENCES financial_years(id)`);
    console.log("Added fy_id");
  } catch (e) {
    if (e.code === '42701') {
      console.log("Column already exists");
    } else {
      console.error(e);
    }
  } finally {
    pool.end();
  }
}
addFyId();
