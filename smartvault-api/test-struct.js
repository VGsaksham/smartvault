const jwt = require('jsonwebtoken');
const env = require('./src/config/env');
const pool = require('./src/db/pool');
pool.query('SELECT token_version FROM users WHERE id = 6').then(res => {
  const version = res.rows[0].token_version;
  const token = jwt.sign({ id: 6, role: 'Staff', category: 'ho', token_version: version }, env.JWT_SECRET);
  fetch('http://localhost:5005/api/structure?companyId=1&fyId=1', { headers: { 'Authorization': 'Bearer ' + token }})
  .then(r => r.json()).then(data => { console.log(JSON.stringify(data)); process.exit(0); });
});
