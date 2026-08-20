const pool = require('./smartvault-api/src/db/pool');
async function check() {
  const r = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'users'");
  console.log('users columns:', r.rows.map(x=>x.column_name));
  
  const r2 = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'user_bulk_permissions'");
  console.log('bulk permissions columns:', r2.rows.map(x=>x.column_name));
  process.exit();
}
check();
