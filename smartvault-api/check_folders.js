const pool = require('./src/db/pool');
async function check() {
  const files = await pool.query('SELECT f.id, f.original_name, f.department, f.folder, m.company_id, m.fy_id FROM vault_files f JOIN vault_file_metadata m ON m.file_id = f.id WHERE m.company_id = 1 AND m.fy_id = 2');
  console.log('FILES:', JSON.stringify(files.rows));
  process.exit(0);
}
check().catch(e => { console.error(e.message); process.exit(1); });
