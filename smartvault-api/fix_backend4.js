const fs = require('fs');

function fix(filename) {
    if (!fs.existsSync(filename)) return;
    let code = fs.readFileSync(filename, 'utf8');
    let original = code;

    code = code.replace(/\.1\b/g, ".dummyNull");
    code = code.replace(/dummyNull:/g, "dummyNull:");
    
    // In admin.js, maybe there's a syntax error around masterfolders, masterfolders,
    code = code.replace(/masterfolders,\s*masterfolders,/g, "masterfolders,");
    
    if (code !== original) {
        fs.writeFileSync(filename, code);
    }
}

fix('src/routes/admin.js');
fix('src/routes/audit.js');
fix('src/services/backupService.js');
