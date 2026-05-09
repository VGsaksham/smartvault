const { Pool } = require('pg');
const pool = new Pool({
  user: 'vaultadmin',
  host: '127.0.0.1',
  database: 'smartvault_db',
  password: 'password123',
  port: 5432,
});

async function runMigration() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    console.log("Creating companies table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS companies (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(50) DEFAULT 'Independent',
        parent_company_id INTEGER REFERENCES companies(id)
      )
    `);

    console.log("Creating financial_years table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS financial_years (
        id SERIAL PRIMARY KEY,
        company_id INTEGER REFERENCES companies(id),
        name VARCHAR(50) NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        status VARCHAR(20) DEFAULT 'Active'
      )
    `);

    console.log("Creating user_company_access table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_company_access (
        user_id INTEGER REFERENCES users(id),
        company_id INTEGER REFERENCES companies(id),
        PRIMARY KEY (user_id, company_id)
      )
    `);

    console.log("Inserting Default Company...");
    const compRes = await client.query(`
      INSERT INTO companies (name, type) 
      SELECT 'Default Company', 'Independent' 
      WHERE NOT EXISTS (SELECT 1 FROM companies WHERE name = 'Default Company')
      RETURNING id
    `);
    
    let defaultCompId;
    if (compRes.rows.length > 0) {
      defaultCompId = compRes.rows[0].id;
    } else {
      const existingComp = await client.query("SELECT id FROM companies WHERE name = 'Default Company'");
      defaultCompId = existingComp.rows[0].id;
    }

    console.log("Inserting Default FY...");
    const fyRes = await client.query(`
      INSERT INTO financial_years (company_id, name, start_date, end_date, status)
      SELECT $1, 'FY 2024-25', '2024-04-01', '2025-03-31', 'Active'
      WHERE NOT EXISTS (SELECT 1 FROM financial_years WHERE name = 'FY 2024-25' AND company_id = $1)
      RETURNING id
    `, [defaultCompId]);
    
    let defaultFyId;
    if (fyRes.rows.length > 0) {
      defaultFyId = fyRes.rows[0].id;
    } else {
      const existingFy = await client.query("SELECT id FROM financial_years WHERE name = 'FY 2024-25' AND company_id = $1", [defaultCompId]);
      defaultFyId = existingFy.rows[0].id;
    }

    console.log("Creating vault_user_metadata...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS vault_user_metadata (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        company_id INTEGER REFERENCES companies(id)
      )
    `);
    
    console.log("Populating vault_user_metadata...");
    await client.query(`
      INSERT INTO vault_user_metadata (user_id, company_id)
      SELECT id, $1 FROM users
      ON CONFLICT DO NOTHING
    `, [defaultCompId]);

    console.log("Granting all users access to Default Company...");
    await client.query(`
      INSERT INTO user_company_access (user_id, company_id)
      SELECT id, $1 FROM users
      ON CONFLICT DO NOTHING
    `, [defaultCompId]);

    console.log("Creating vault_file_metadata...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS vault_file_metadata (
        file_id INTEGER PRIMARY KEY REFERENCES vault_files(id) ON DELETE CASCADE,
        company_id INTEGER REFERENCES companies(id),
        fy_id INTEGER REFERENCES financial_years(id)
      )
    `);
    
    console.log("Populating vault_file_metadata...");
    await client.query(`
      INSERT INTO vault_file_metadata (file_id, company_id, fy_id)
      SELECT id, $1, $2 FROM vault_files
      ON CONFLICT DO NOTHING
    `, [defaultCompId, defaultFyId]);

    await client.query('COMMIT');
    console.log("Migration successful!");
  } catch (error) {
    await client.query('ROLLBACK');
    console.error("Migration failed:", error);
  } finally {
    client.release();
    pool.end();
  }
}

runMigration();
