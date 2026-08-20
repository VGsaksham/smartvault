const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');
code = code.replace(/\.1\b/g, ".dummyNull");
fs.writeFileSync('server.js', code);
