const pool = require('./src/db/pool');

async function run() {
  try {
    const res = await pool.query('SELECT * FROM user_folder_access');
    console.log(res.rows);
  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
}
run();
