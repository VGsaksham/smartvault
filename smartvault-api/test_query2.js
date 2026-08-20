const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://vaultadmin:sanyasi@1981@127.0.0.1:5432/smartvault_db' });
async function test() {
  try {
    const res = await pool.query('SELECT storage_quota_gb FROM masterfolders LIMIT 1');
    console.log('Query OK:', res.rows);
  } catch (err) {
    console.error('Query Failed:', err.message);
  } finally {
    pool.end();
  }
}
test();
