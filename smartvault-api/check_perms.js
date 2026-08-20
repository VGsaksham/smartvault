const pool = require('./src/db/pool');

async function run() {
  try {
    const res = await pool.query(`
      SELECT 
        u.username, 
        u.role,
        ub.can_bulk_move as ub_move, 
        u.can_bulk_move as u_move,
        COALESCE(ub.can_bulk_move, u.can_bulk_move, true) as final_move
      FROM users u 
      LEFT JOIN user_bulk_permissions ub ON u.id = ub.user_id
    `);
    console.table(res.rows);
  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
}
run();
