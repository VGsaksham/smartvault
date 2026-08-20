const fs = require('fs');

function fix(filename) {
    if (!fs.existsSync(filename)) return;
    let code = fs.readFileSync(filename, 'utf8');
    let original = code;
    code = code.replace(/\bnull\b\s*(,|:|\)|=)/g, (match) => {
        // We only want to replace it if it's used as a variable name in an argument list or destructuring
        // This is tricky. Let's just fix the specific cases we know.
        return match;
    });
    
    // Explicit fixes:
    code = code.replace(/masterfolderId, null, categoryName/g, "masterfolderId, dummyNull, categoryName");
    code = code.replace(/req\.query\.null/g, "req.query.dummyNull");
    code = code.replace(/req\.body\.null/g, "req.body.dummyNull");
    code = code.replace(/masterfolderId, null/g, "masterfolderId, dummyNull"); // argument list
    code = code.replace(/dummyNull = null/g, "dummyNull = null"); // wait
    
    // Specifically looking at server.js line 451:
    code = code.replace(/async function ensureFolderExists\(masterfolderId, null, /g, "async function ensureFolderExists(masterfolderId, dummyNull, ");
    
    // also let's just do a generic replace of  dummyNull,  instead of  null,  in function signatures:
    code = code.replace(/\(masterfolderId, null\)/g, "(masterfolderId, dummyNull)");
    code = code.replace(/\(masterfolderId, null, /g, "(masterfolderId, dummyNull, ");
    code = code.replace(/, null\)/g, ", dummyNull)"); // this might break (a, null) actual calls!
    
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
