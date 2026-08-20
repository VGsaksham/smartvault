const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:postgres@localhost:5432/smartvault_db' });
async function run() {
  try {
    const query = \SELECT f.* FROM vault_files f LEFT JOIN vault_file_metadata m ON f.id = m.file_id WHERE f.category = \\ AND m.masterfolder_id = \\ AND (CAST(\\ AS TEXT) = '' OR f.folder = \\ OR f.folder LIKE \\)\;
    const params = ['Mushoku Tensei: Jobless Reincarnation', 1, '', '%'];
    const res = await pool.query(query, params);
    console.log('Success, rows:', res.rows.length);
  } catch (err) {
    console.error('ERROR:', err.message);
  }
  pool.end();
}
run();
