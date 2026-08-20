const fs = require('fs');
const path = require('path');

function fix(filename) {
    if (!fs.existsSync(filename)) return;
    let code = fs.readFileSync(filename, 'utf8');
    let original = code;
    code = code.replace(/const null = /g, "const dummyNull = ");
    code = code.replace(/let null = /g, "let dummyNull = ");
    if (code !== original) {
        fs.writeFileSync(filename, code);
    }
}

fix('smartvault-api/server.js');
const routes = fs.readdirSync('smartvault-api/src/routes');
for (const r of routes) {
    if (r.endsWith('.js')) fix('smartvault-api/src/routes/' + r);
}
const services = fs.readdirSync('smartvault-api/src/services');
for (const s of services) {
    if (s.endsWith('.js')) fix('smartvault-api/src/services/' + s);
}
