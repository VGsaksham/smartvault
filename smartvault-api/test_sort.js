const { Pool } = require('pg');
const env = require('./src/config/env');
const pool = new Pool({ connectionString: env.DATABASE_URL });

async function run() {
  const query = `
    SELECT id, original_name, custom_name, upload_date,
      (CASE WHEN split_part(original_name, '.', 1) ILIKE '7' THEN 0
            WHEN custom_name ILIKE '7' THEN 0 ELSE 1 END) as priority
    FROM vault_files
    WHERE original_name ILIKE '%7%' OR custom_name ILIKE '%7%'
    ORDER BY priority ASC, upload_date DESC
    LIMIT 10
  `;
  const res = await pool.query(query);
  console.table(res.rows);
  pool.end();
}
run();
