const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { verifyToken } = require('../middleware/auth');
const { logAction } = require('../services/auditService');

// GET /api/financial-years
router.get('/', verifyToken, async (req, res) => {
  try {
    const { companyId } = req.query;
    let query = 'SELECT * FROM financial_years';
    const values = [];
    if (companyId) {
      query += ' WHERE company_id = $1';
      values.push(companyId);
    }
    query += ' ORDER BY start_date DESC';
    const { rows } = await pool.query(query, values);
    res.json(rows);
  } catch (err) {
    console.error('FY fetch error:', err.message);
    res.status(500).json({ error: 'Failed to fetch financial years' });
  }
});

// POST /api/financial-years — Admin only
router.post('/', verifyToken, async (req, res) => {
  if (req.user.role !== 'Admin')
    return res.status(403).json({ error: 'Only Administrators can create financial years.' });

  const { company_id, name, start_date, end_date, status } = req.body;
  if (!company_id || !name || !start_date || !end_date)
    return res.status(400).json({ error: 'company_id, name, start_date and end_date are required.' });

  const fyStatus = ['Active', 'Planned', 'Archived', 'Locked'].includes(status) ? status : 'Planned';
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const companyCheck = await client.query('SELECT id FROM companies WHERE id = $1 LIMIT 1', [company_id]);
    if (companyCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Company not found.' });
    }

    const duplicate = await client.query(
      'SELECT id FROM financial_years WHERE company_id = $1 AND name = $2 LIMIT 1',
      [company_id, name]
    );
    if (duplicate.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Financial year already exists for this company.' });
    }

    if (fyStatus === 'Active') {
      await client.query(
        "UPDATE financial_years SET status = 'Archived' WHERE company_id = $1 AND status = 'Active'",
        [company_id]
      );
    }

    const { rows } = await client.query(
      `INSERT INTO financial_years (company_id, name, start_date, end_date, status)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [company_id, name, start_date, end_date, fyStatus]
    );

    await client.query('COMMIT');
    await logAction(req.user.id, 'CREATE_FINANCIAL_YEAR', null, `Created ${name} for company ${company_id}`, req.ip);
    res.json({ success: true, financial_year: rows[0] });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Create FY error:', err.message);
    res.status(500).json({ error: 'Failed to create financial year.' });
  } finally {
    client.release();
  }
});

// PATCH /api/financial-years/:id — Admin only
router.patch('/:id', verifyToken, async (req, res) => {
  if (req.user.role !== 'Admin') {
    return res.status(403).json({ error: 'Only Administrators can update financial years.' });
  }
  const fyId = Number(req.params.id);
  if (!Number.isFinite(fyId)) return res.status(400).json({ error: 'Invalid financial year id.' });

  const { name, start_date, end_date, status } = req.body || {};
  const fyStatus = status && ['Active', 'Planned', 'Archived', 'Locked'].includes(status) ? status : null;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query('SELECT * FROM financial_years WHERE id = $1 LIMIT 1', [fyId]);
    if (current.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Financial year not found.' });
    }
    const row = current.rows[0];
    const companyId = row.company_id;

    if (name && String(name).trim()) {
      const dup = await client.query(
        'SELECT id FROM financial_years WHERE company_id = $1 AND name = $2 AND id <> $3 LIMIT 1',
        [companyId, String(name).trim(), fyId]
      );
      if (dup.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Financial year name already exists for this company.' });
      }
    }

    if (fyStatus === 'Active') {
      await client.query(
        "UPDATE financial_years SET status = 'Archived' WHERE company_id = $1 AND status = 'Active' AND id <> $2",
        [companyId, fyId]
      );
    }

    const updated = await client.query(
      `UPDATE financial_years
       SET name = COALESCE($1, name),
           start_date = COALESCE($2, start_date),
           end_date = COALESCE($3, end_date),
           status = COALESCE($4, status)
       WHERE id = $5
       RETURNING *`,
      [
        name && String(name).trim() ? String(name).trim() : null,
        start_date || null,
        end_date || null,
        fyStatus,
        fyId,
      ]
    );

    await client.query('COMMIT');
    await logAction(req.user.id, 'UPDATE_FINANCIAL_YEAR', null, `Updated FY ${updated.rows[0].name} for company ${companyId}`, req.ip);
    res.json({ success: true, financial_year: updated.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    res.status(500).json({ error: `Failed to update financial year: ${err.message}` });
  } finally {
    client.release();
  }
});

// DELETE /api/financial-years/:id — Admin only
router.delete('/:id', verifyToken, async (req, res) => {
  if (req.user.role !== 'Admin') {
    return res.status(403).json({ error: 'Only Administrators can delete financial years.' });
  }
  const fyId = Number(req.params.id);
  if (!Number.isFinite(fyId)) return res.status(400).json({ error: 'Invalid financial year id.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query('SELECT id, company_id, name FROM financial_years WHERE id = $1 LIMIT 1', [fyId]);
    if (current.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Financial year not found.' });
    }
    const row = current.rows[0];

    const fileCount = await client.query(
      'SELECT COUNT(*)::int AS n FROM vault_file_metadata WHERE fy_id = $1',
      [fyId]
    ).catch(() => ({ rows: [{ n: 0 }] }));
    if ((fileCount.rows[0]?.n || 0) > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Cannot delete financial year: files exist under this FY.' });
    }

    await client.query('DELETE FROM financial_years WHERE id = $1', [fyId]);
    await client.query('COMMIT');
    await logAction(req.user.id, 'DELETE_FINANCIAL_YEAR', null, `Deleted FY ${row.name} for company ${row.company_id}`, req.ip);
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    res.status(500).json({ error: `Failed to delete financial year: ${err.message}` });
  } finally {
    client.release();
  }
});

module.exports = router;
