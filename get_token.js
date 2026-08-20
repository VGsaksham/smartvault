const jwt = require('jsonwebtoken');
const env = require('./smartvault-api/src/config/env');

// Generate an admin token
const token = jwt.sign({ id: 1, role: 'Admin' }, env.JWT_SECRET);
console.log(token);
