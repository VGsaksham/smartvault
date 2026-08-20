const fs = require('fs');

function fix(filename) {
    if (!fs.existsSync(filename)) return;
    let code = fs.readFileSync(filename, 'utf8');
    let original = code;

    code = code.replace(/masterfolderId: null,/g, "masterfolderId,");
    
    if (code !== original) {
        fs.writeFileSync(filename, code);
    }
}
fix('src/routes/admin.js');
