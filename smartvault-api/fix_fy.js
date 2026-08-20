require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME
});

async function fixDB() {
  try {
    console.log("Creating financial_years table...");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS financial_years (
        id SERIAL PRIMARY KEY,
        masterfolder_id INTEGER REFERENCES masterfolders(id),
        name VARCHAR(50) NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        status VARCHAR(20) DEFAULT 'Active'
      )
    `);

    const compRes = await pool.query('SELECT id FROM masterfolders ORDER BY id ASC LIMIT 1');
    if (compRes.rows.length > 0) {
      const defaultCompId = compRes.rows[0].id;
      console.log("Inserting Default FY...");
      const fyRes = await pool.query(`
        INSERT INTO financial_years (masterfolder_id, name, start_date, end_date, status)
        SELECT $1, 'FY 2024-25', '2024-04-01', '2025-03-31', 'Active'
        WHERE NOT EXISTS (SELECT 1 FROM financial_years WHERE name = 'FY 2024-25' AND masterfolder_id = $1)
        RETURNING id
      `, [defaultCompId]);
      
      let defaultFyId;
      if (fyRes.rows.length > 0) {
        defaultFyId = fyRes.rows[0].id;
      } else {
        const existingFy = await pool.query("SELECT id FROM financial_years WHERE name = 'FY 2024-25' AND masterfolder_id = $1", [defaultCompId]);
        defaultFyId = existingFy.rows[0].id;
      }

      console.log("Adding fy_id to vault_file_metadata...");
      try {
        await pool.query('ALTER TABLE vault_file_metadata ADD COLUMN fy_id INTEGER REFERENCES financial_years(id)');
      } catch(e) {
        if(e.code !== '42701') throw e; // 42701 means column exists
      }

      console.log("Populating fy_id...");
      await pool.query('UPDATE vault_file_metadata SET fy_id = $1 WHERE fy_id IS NULL', [defaultFyId]);
    } else {
      console.log("No masterfolders found, skipping FY creation.");
    }
    
    console.log("Fix complete.");
  } catch (e) {
    console.error(e);
  } finally {
    pool.end();
  }
}
fixDB();
