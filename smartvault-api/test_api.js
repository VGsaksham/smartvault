const http = require('http');

const req = http.request({
  hostname: '127.0.0.1',
  port: 5005,
  path: '/api/admin/backups/config',
  method: 'GET',
  headers: { 'Authorization': 'Bearer test' }
}, res => {
  console.log("Status:", res.statusCode);
  res.on('data', d => process.stdout.write(d));
});
req.on('error', console.error);
req.end();
