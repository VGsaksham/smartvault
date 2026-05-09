const jwt = require('jsonwebtoken');
const pool = require('../db/pool');
const env = require('../config/env');

const verifyToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = (authHeader ? authHeader.split(' ')[1] : null) || req.query.token;
  if (!token) return res.status(401).json({ error: 'Access Denied. No token provided.' });

  jwt.verify(token, env.JWT_SECRET, async (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token.' });
    try {
      const { rows } = await pool.query(
        'SELECT status, token_version FROM users WHERE id = $1 LIMIT 1',
        [user.id]
      );
      if (rows.length === 0) return res.status(403).json({ error: 'User not found.' });
      if (rows[0].status === 'Suspended') return res.status(403).json({ error: 'Your account is suspended.' });
      if (rows[0].token_version !== user.token_version)
        return res.status(403).json({ error: 'Session expired. Please log in again.' });
      req.user = user;
      next();
    } catch (dbErr) {
      console.error('Token verification DB error:', dbErr.message);
      return res.status(500).json({ error: 'Server error during token verification.' });
    }
  });
};

module.exports = { verifyToken };
