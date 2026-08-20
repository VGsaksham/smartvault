const fs = require('fs');

function fix(filename) {
    if (!fs.existsSync(filename)) return;
    let code = fs.readFileSync(filename, 'utf8');
    let original = code;

    // Fix destructuring 'null,'
    code = code.replace(/\bnull,\n/g, "dummyNull,\n");
    code = code.replace(/\bnull,\r\n/g, "dummyNull,\r\n");
    code = code.replace(/\bnull,/g, "dummyNull,");
    code = code.replace(/masterfolders,\s*masterfolders,/g, "masterfolders,");
    
    // Specifically looking at any trailing or leading 
ull in destructuring:
    code = code.replace(/\{([^}]*)dummyNull([^}]*)\}/g, (match) => {
        // Just let dummyNull be dummyNull
        return match;
    });

    if (code !== original) {
        fs.writeFileSync(filename, code);
        console.log('Fixed ' + filename);
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
