const fs = require('fs');
function fix(filename) {
    if (!fs.existsSync(filename)) return;
    let code = fs.readFileSync(filename, 'utf8');
    let original = code;
    code = code.replace(/null: 1 \?\? null,/g, "null,");
    if (code !== original) {
        fs.writeFileSync(filename, code);
    }
}
fix('src/services/backupService.js');
