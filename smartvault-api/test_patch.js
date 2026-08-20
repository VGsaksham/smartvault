const token = require('fs').readFileSync('.auth_token', 'utf-8').trim();
fetch('http://127.0.0.1:5005/api/users/3/permissions', {
  method: 'PATCH',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    can_manage_structure: true
  })
}).then(res => res.json()).then(console.log).catch(console.error);
