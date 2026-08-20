const fs = require('fs');
const path = require('path');

function processDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            processDir(fullPath);
        } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
            let code = fs.readFileSync(fullPath, 'utf8');
            let original = code;
            
            // Fix the syntax errors
            code = code.replace(/const null = /g, "const dummyNull = ");
            code = code.replace(/\[null, setFyId\]/g, "[dummyNull, setFyId]");
            code = code.replace(/const \[masterfolders, setmasterfolders\] = useState<masterfolder\[\]>\(\[\]\);\r?\n\s*const \[masterfolders, setmasterfolders\] = useState<masterfolder\[\]>\(\[\]\);/g, "const [masterfolders, setmasterfolders] = useState<masterfolder[]>([]);");

            if (code !== original) {
                fs.writeFileSync(fullPath, code);
            }
        }
    }
}

processDir('src');
