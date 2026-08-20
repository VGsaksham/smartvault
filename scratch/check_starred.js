const pool = require('../smartvault-api/db/pool');
pool.query("SELECT tablename FROM pg_tables WHERE tablename = 'starred_folders'").then(r => {
  console.log(r.rows);
  process.exit(0);
}).catch(e => {
  console.error(e);
  process.exit(1);
});
