const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { verifyToken } = require('../middleware/auth');
const { logAction } = require('../services/auditService');

// GET /api/masterfolders
router.get('/', verifyToken, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT m.*
      FROM masterfolders m
      ORDER BY m.name ASC
    `);
    res.json(rows);
  } catch (err) {
    console.error('Masterfolders fetch error:', err.message);
    res.status(500).json({ error: 'Failed to fetch masterfolders' });
  }
});

// POST /api/masterfolders — Admin only
router.post('/', verifyToken, async (req, res) => {
  if (req.user.role !== 'Admin')
    return res.status(403).json({ error: 'Only Administrators can create masterfolders.' });

  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Masterfolder name is required.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `INSERT INTO masterfolders (name)
       VALUES ($1) RETURNING *`,
      [name.trim()]
    );
    const masterfolder = rows[0];

    await client.query('COMMIT');
    await logAction(req.user.id, 'CREATE_MASTERFOLDER', null, `Created masterfolder ${masterfolder.name}`, req.ip);
    res.json({ success: true, masterfolder });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err.code === '23505') return res.status(409).json({ error: 'Masterfolder with this name already exists.' });
    console.error('Create masterfolder error:', err.message);
    res.status(500).json({ error: 'Failed to create masterfolder.' });
  } finally {
    client.release();
  }
});

// PATCH /api/masterfolders/:id — Admin only
router.patch('/:id', verifyToken, async (req, res) => {
  if (req.user.role !== 'Admin')
    return res.status(403).json({ error: 'Only Administrators can update masterfolders.' });

  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });

  try {
    const { rows } = await pool.query(
      `UPDATE masterfolders
       SET name = COALESCE($1, name)
       WHERE id = $2 RETURNING *`,
      [name.trim(), req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Masterfolder not found.' });
    await logAction(req.user.id, 'UPDATE_MASTERFOLDER', null, `Updated masterfolder ${rows[0].name}`, req.ip);
    res.json({ success: true, masterfolder: rows[0] });
  } catch (err) {
    console.error('Update masterfolder error:', err.message);
    res.status(500).json({ error: 'Failed to update masterfolder.' });
  }
});

// DELETE /api/masterfolders/:id — Admin only
router.delete('/:id', verifyToken, async (req, res) => {
  if (req.user.role !== 'Admin') {
    return res.status(403).json({ error: 'Only Administrators can delete masterfolders.' });
  }
  const masterfolderId = Number(req.params.id);
  if (!Number.isFinite(masterfolderId)) return res.status(400).json({ error: 'Invalid masterfolder id.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const exists = await client.query('SELECT id, name FROM masterfolders WHERE id = $1 LIMIT 1', [masterfolderId]);
    if (exists.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Masterfolder not found.' });
    }

    const fileCount = await client.query(
      `SELECT COUNT(*)::int AS n
       FROM vault_file_metadata
       WHERE masterfolder_id = $1`,
      [masterfolderId]
    ).catch(() => ({ rows: [{ n: 0 }] }));
    if ((fileCount.rows[0]?.n || 0) > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Cannot delete masterfolder: files exist under this masterfolder.' });
    }

    await client.query('DELETE FROM masterfolders WHERE id = $1', [masterfolderId]);
    await client.query('COMMIT');
    await logAction(req.user.id, 'DELETE_MASTERFOLDER', null, `Deleted masterfolder ${exists.rows[0].name}`, req.ip);
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    res.status(500).json({ error: `Failed to delete masterfolder: ${err.message}` });
  } finally {
    client.release();
  }
});

module.exports = router;
