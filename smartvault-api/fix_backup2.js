const fs = require('fs');
function fix(filename) {
    if (!fs.existsSync(filename)) return;
    let code = fs.readFileSync(filename, 'utf8');
    let original = code;
    code = code.replace(/compId, null, deptName/g, "compId, deptName");
    if (code !== original) {
        fs.writeFileSync(filename, code);
    }
}
fix('src/services/backupService.js');
