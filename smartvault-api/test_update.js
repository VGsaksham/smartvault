const pool = require('./src/db/pool');
async function run() {
  const client = await pool.connect();
  try {
    await client.query('UPDATE users SET allowed_categories = $1, can_manage_structure = $3 WHERE id = $2', [['IT'], 1, true]);
    console.log('Success');
  } catch (err) {
    console.log('Error:', err);
  } finally {
    client.release();
    pool.end();
  }
}
run();
