const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgres://postgres:postgres@localhost:5432/smartvault_db' });
pool.query("SELECT * FROM vault_files WHERE category = $1 AND (folder = $2 OR folder LIKE $2 || '/%') AND company_id = $3", ['1', '1', 1])
.then(res => console.log(res.rows))
.catch(console.error)
.finally(() => pool.end());
