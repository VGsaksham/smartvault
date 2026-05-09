const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { verifyToken } = require('../middleware/auth');

router.get('/audit-logs', verifyToken, async (req, res) => {
  if (req.user.role !== 'Admin') return res.status(403).json({ error: "Only Administrators can export system audit logs." });
  try {
    const companyId = req.query.companyId;
    const fyId = req.query.fyId;
    let query = `
      SELECT a.id, a.action_type, u.username, u.email, u.department, a.file_id, a.details, a.ip_address, a.created_at
      FROM audit_logs a
      LEFT JOIN users u ON a.user_id = u.id
    `;
    const values = [];
    if (companyId && fyId) {
      query += `
        LEFT JOIN vault_files f ON a.file_id = f.id
        LEFT JOIN vault_file_metadata m ON f.id = m.file_id
        WHERE (m.company_id = $1 AND m.fy_id = $2) OR a.file_id IS NULL
      `;
      values.push(companyId, fyId);
    }
    query += ` ORDER BY a.created_at DESC`;
    const { rows } = await pool.query(query, values);
    let csv = 'ID,Action,User,Email,Department,File ID,Details,IP Address,Timestamp\n';
    rows.forEach(row => {
      const details = (row.details || '').replace(/"/g, '""');
      csv += `${row.id},${row.action_type},${row.username || 'System'},${row.email || ''},${row.department || ''},${row.file_id || ''},"${details}",${row.ip_address || ''},${new Date(row.created_at).toISOString()}\n`;
    });
    res.header('Content-Type', 'text/csv');
    res.attachment('system_audit_logs.csv');
    return res.send(csv);
  } catch (err) { res.status(500).json({ error: "Failed to export audit logs" }); }
});

router.get('/activity-report/:dept', verifyToken, async (req, res) => {
  const { dept } = req.params;
  const { companyId, fyId } = req.query;
  if (req.user.role !== 'Admin' && req.user.department !== dept) return res.status(403).json({ error: "Access denied" });
  try {
    const { rows } = await pool.query(`
      SELECT a.id, a.action_type, u.username, f.original_name, f.size_bytes, a.details, a.created_at
      FROM audit_logs a JOIN vault_files f ON a.file_id = f.id JOIN vault_file_metadata m ON m.file_id = f.id JOIN users u ON a.user_id = u.id
      WHERE f.department = $1 ${companyId ? 'AND m.company_id = $2' : ''} ${fyId && companyId ? 'AND m.fy_id = $3' : ''}
      ORDER BY a.created_at DESC
    `, companyId && fyId ? [dept, companyId, fyId] : companyId ? [dept, companyId] : [dept]);
    let csv = 'ID,Action,User,File Name,Size (Bytes),Details,Timestamp\n';
    rows.forEach(row => {
      const details = (row.details || '').replace(/"/g, '""');
      const filename = (row.original_name || '').replace(/"/g, '""');
      csv += `${row.id},${row.action_type},${row.username},"${filename}",${row.size_bytes || 0},"${details}",${new Date(row.created_at).toISOString()}\n`;
    });
    res.header('Content-Type', 'text/csv');
    res.attachment(`activity_report_${dept}.csv`);
    return res.send(csv);
  } catch (err) { res.status(500).json({ error: "Failed to export activity report" }); }
});

module.exports = router;
