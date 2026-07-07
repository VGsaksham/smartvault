const jwt = require('jsonwebtoken');
const env = require('./src/config/env');
const pool = require('./src/db/pool');
pool.query('SELECT token_version FROM users WHERE id = 1').then(res => {
  const version = res.rows[0].token_version;
  const token = jwt.sign({ id: 1, role: 'Admin', department: 'Admin', token_version: version }, env.JWT_SECRET);
  fetch('http://localhost:5005/api/folders?companyId=1&department=1', { headers: { 'Authorization': 'Bearer ' + token }})
  .then(r => r.json()).then(data => { console.log(JSON.stringify(data)); process.exit(0); });
});
