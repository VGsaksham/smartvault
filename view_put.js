const fs = require('fs');
const lines = fs.readFileSync('smartvault-api/src/routes/users.js', 'utf8').split('\n');
const reqIdx = lines.findIndex(l => l.includes("router.put('/:id'"));
console.log(lines.slice(Math.max(0, reqIdx-5), reqIdx+100).join('\n'));
