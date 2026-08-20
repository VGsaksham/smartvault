const fs = require('fs');

function fix(filename) {
    if (!fs.existsSync(filename)) return;
    let code = fs.readFileSync(filename, 'utf8');
    code = code.replace(/const \[masterfolders, setmasterfolders\] = useState<any\[\]>\(\[\]\);\r?\n\s*const \[masterfolders, setmasterfolders\] = useState<any\[\]>\(\[\]\);/g, "const [masterfolders, setmasterfolders] = useState<any[]>([]);");
    
    // Fallbacks just in case
    code = code.replace(/const \[masterfolders, setmasterfolders\] = useState/g, "const [masterfolders, setmasterfolders] = useState");
    
    fs.writeFileSync(filename, code);
}
fix('src/components/TopBar.tsx');
fix('src/app/(app)/admin/masterfolders/page.tsx');
