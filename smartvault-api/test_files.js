const pool = require('./src/db/pool');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('./src/config/env');

async function testFiles() {
  // Get admin user
  const userResult = await pool.query("SELECT id, username, role, department, allowed_departments, token_version FROM users WHERE role = 'Admin' LIMIT 1");
  const user = userResult.rows[0];
  console.log('Admin user:', JSON.stringify(user));
  
  // Generate a real token
  const token = jwt.sign({
    id: user.id,
    role: user.role,
    department: user.department,
    allowed_departments: user.allowed_departments,
    token_version: user.token_version
  }, JWT_SECRET, { expiresIn: '1h' });
  
  // Test /api/files with companyId=1&fyId=2
  const http = require('http');
  
  const urls = [
    'http://localhost:5005/api/files?companyId=1&fyId=2',
    'http://localhost:5005/api/files?companyId=1',
    'http://localhost:5005/api/files',
  ];
  
  for (const url of urls) {
    await new Promise((resolve, reject) => {
      http.get(url, { headers: { 'Authorization': `Bearer ${token}` } }, (res) => {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => {
          try {
            const data = JSON.parse(body);
            console.log(`\n${url}`);
            console.log(`  Status: ${res.statusCode}, Count: ${Array.isArray(data) ? data.length : 'NOT_ARRAY'}`);
            if (Array.isArray(data) && data.length > 0) {
              console.log(`  First file: ${data[0].original_name} (company_id=${data[0].company_id}, fy_id=${data[0].fy_id})`);
            } else if (!Array.isArray(data)) {
              console.log(`  Response: ${JSON.stringify(data).substring(0, 200)}`);
            }
          } catch(e) { console.log(`  Parse error: ${body.substring(0, 200)}`); }
          resolve();
        });
      }).on('error', reject);
    });
  }
  
  process.exit(0);
}
testFiles().catch(e => { console.error(e); process.exit(1); });
