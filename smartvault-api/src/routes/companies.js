const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { verifyToken } = require('../middleware/auth');
const { logAction } = require('../services/auditService');

// GET /api/companies
router.get('/', verifyToken, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT c.*, p.name AS parent_company_name
      FROM companies c
      LEFT JOIN companies p ON p.id = c.parent_company_id
      ORDER BY c.name ASC
    `);
    res.json(rows);
  } catch (err) {
    console.error('Companies fetch error:', err.message);
    res.status(500).json({ error: 'Failed to fetch companies' });
  }
});

// POST /api/companies — Admin only
router.post('/', verifyToken, async (req, res) => {
  if (req.user.role !== 'Admin')
    return res.status(403).json({ error: 'Only Administrators can create companies.' });

  const { name, type, parent_company_id, storage_quota_gb } = req.body;
  if (!name) return res.status(400).json({ error: 'Company name is required.' });
  const validTypes = ['Parent', 'Subsidiary', 'Division/Branch', 'Independent'];
  const companyType = validTypes.includes(type) ? type : 'Independent';

  try {
    const { rows } = await pool.query(
      `INSERT INTO companies (name, type, parent_company_id, storage_quota_gb)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [name.trim(), companyType, parent_company_id || null, storage_quota_gb || 5]
    );
    await logAction(req.user.id, 'CREATE_COMPANY', null, `Created company ${rows[0].name}`, req.ip);
    res.json({ success: true, company: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Company with this name already exists.' });
    console.error('Create company error:', err.message);
    res.status(500).json({ error: 'Failed to create company.' });
  }
});

// PATCH /api/companies/:id — Admin only
router.patch('/:id', verifyToken, async (req, res) => {
  if (req.user.role !== 'Admin')
    return res.status(403).json({ error: 'Only Administrators can update companies.' });

  const { name, type, parent_company_id, storage_quota_gb } = req.body;
  const validTypes = ['Parent', 'Subsidiary', 'Division/Branch', 'Independent'];
  const companyType = type && validTypes.includes(type) ? type : null;

  try {
    const { rows } = await pool.query(
      `UPDATE companies
       SET name = COALESCE($1, name),
           type = COALESCE($2, type),
           parent_company_id = COALESCE($3, parent_company_id),
           storage_quota_gb = COALESCE($4, storage_quota_gb)
       WHERE id = $5 RETURNING *`,
      [name ? name.trim() : null, companyType, parent_company_id ?? null, storage_quota_gb ?? null, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Company not found.' });
    await logAction(req.user.id, 'UPDATE_COMPANY', null, `Updated company ${rows[0].name}`, req.ip);
    res.json({ success: true, company: rows[0] });
  } catch (err) {
    console.error('Update company error:', err.message);
    res.status(500).json({ error: 'Failed to update company.' });
  }
});

// DELETE /api/companies/:id — Admin only
router.delete('/:id', verifyToken, async (req, res) => {
  if (req.user.role !== 'Admin') {
    return res.status(403).json({ error: 'Only Administrators can delete companies.' });
  }
  const companyId = Number(req.params.id);
  if (!Number.isFinite(companyId)) return res.status(400).json({ error: 'Invalid company id.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const exists = await client.query('SELECT id, name FROM companies WHERE id = $1 LIMIT 1', [companyId]);
    if (exists.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Company not found.' });
    }

    const fyCount = await client.query('SELECT COUNT(*)::int AS n FROM financial_years WHERE company_id = $1', [companyId]);
    if ((fyCount.rows[0]?.n || 0) > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Cannot delete company: financial years exist for this company.' });
    }

    const fileCount = await client.query(
      `SELECT COUNT(*)::int AS n
       FROM vault_file_metadata
       WHERE company_id = $1`,
      [companyId]
    ).catch(() => ({ rows: [{ n: 0 }] }));
    if ((fileCount.rows[0]?.n || 0) > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Cannot delete company: files exist under this company.' });
    }

    await client.query('DELETE FROM companies WHERE id = $1', [companyId]);
    await client.query('COMMIT');
    await logAction(req.user.id, 'DELETE_COMPANY', null, `Deleted company ${exists.rows[0].name}`, req.ip);
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    res.status(500).json({ error: `Failed to delete company: ${err.message}` });
  } finally {
    client.release();
  }
});

module.exports = router;
