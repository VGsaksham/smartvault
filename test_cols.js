const { Pool } = require('pg');
const env = require('./smartvault-api/src/config/env');
const pool = new Pool({ connectionString: env.DATABASE_URL });
pool.query("SELECT * FROM information_schema.columns WHERE table_name = 'masterfolders'")
  .then(res => console.log(res.rows.map(r => r.column_name)))
  .catch(console.error)
  .finally(() => pool.end());
