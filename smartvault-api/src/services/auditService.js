const pool = require('../db/pool');

async function logAction(userId, actionType, fileId, details, ipAddress) {
  try {
    await pool.query(
      `INSERT INTO audit_logs (user_id, action_type, file_id, details, ip_address)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, actionType, fileId, details, ipAddress]
    );
  } catch (err) {
    console.error('Failed to insert audit log:', err.message);
  }
}

module.exports = { logAction };
