require('dotenv').config({ path: '../smartvault-api/.env' });
const pool = require('../smartvault-api/src/db/pool');
async function setup() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS starred_folders (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        folder_id INTEGER NOT NULL REFERENCES masterfolder_category_folders(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, folder_id)
      );
    `);
    console.log("starred_folders table created or already exists.");
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
setup();
