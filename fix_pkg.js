const fs = require('fs');
let pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
pkg.scripts.dev = "next dev --webpack -H 0.0.0.0 -p 3000";
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2));
