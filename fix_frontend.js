const fs = require('fs');

// TopBar.tsx
let code = fs.readFileSync('src/components/TopBar.tsx', 'utf8');
code = code.replace(/const \[scope, setScope\] = useState<'all_masterfolders'\|'fy'\|'category'\|'folder'>\('fy'\);\n/g, `const [scope, setScope] = useState<'all_masterfolders'|'category'|'folder'>('category');\n`);
code = code.replace(/if \(file\.fy_id\) params\.set\('null', String\(file\.fy_id\)\);\n/g, '');
code = code.replace(/\['fy', 'This FY only'\],\n/g, '');
code = code.replace(/<span>\{file\.masterfolder_name \|\| '-'}<\/span><span>›<\/span><span>\{file\.fy_name \|\| '-'}<\/span><span>›<\/span><span>\{file\.category \|\| '-'}<\/span>/g, `<span>{file.masterfolder_name || '-'}</span><span>›</span><span>{file.category || '-'}</span>`);
code = code.replace(/masterfolders & FY/g, 'Masterfolders');
fs.writeFileSync('src/components/TopBar.tsx', code);
console.log("Fixed TopBar.tsx");

// SearchFilters.tsx
code = fs.readFileSync('src/components/SearchFilters.tsx', 'utf8');
code = code.replace(/const rawScope = searchParams\.get\('scope'\) \|\| 'fy';\n/g, `const rawScope = searchParams.get('scope') || 'category';\n`);
code = code.replace(/const activeScope = \(rawScope === 'all' \|\| rawScope === 'masterfolder'\) \? 'fy' : rawScope;\n/g, `const activeScope = (rawScope === 'all' || rawScope === 'masterfolder') ? 'category' : rawScope;\n`);
code = code.replace(/const currentFyName = searchParams\.get\('fyLabel'\) \|\| 'This FY';\n/g, '');
code = code.replace(/params\.set\('scope', 'fy'\);\n/g, `params.set('scope', 'category');\n`);
code = code.replace(/const applyQuickDate = \(preset: 'today' \| 'week' \| 'month' \| 'fy'\) => \{\n/g, `const applyQuickDate = (preset: 'today' | 'week' | 'month') => {\n`);
code = code.replace(/\} else if \(preset === 'fy'\) \{\n[\s\S]*?\}\n/g, '');
code = code.replace(/fy: 'This FY only',\n/g, '');
code = code.replace(/\|\| 'This FY only'\), \[activeScope, folder\]\);\n/g, `|| 'This Dept only'), [activeScope, folder]);\n`);
code = code.replace(/\['fy', currentFyName\],\n/g, '');
code = code.replace(/\{preset === 'fy' \? 'This FY' : preset\[0\]\.toUpperCase\(\) \+ preset\.slice\(1\)\}/g, `{preset[0].toUpperCase() + preset.slice(1)}`);
code = code.replace(/\['today','week','month','fy'\]/g, `['today','week','month']`);
fs.writeFileSync('src/components/SearchFilters.tsx', code);
console.log("Fixed SearchFilters.tsx");

// MainDashboard.tsx
code = fs.readFileSync('src/components/MainDashboard.tsx', 'utf8');
code = code.replace(/<p className="text-\[11px\] text-gray-400 mt-0\.5">\{qrFile\.fy_name \|\| 'Current FY'} • \{new Date\(qrFile\.upload_date \|\| Date\.now\(\)\)\.toLocaleDateString\(\)}<\/p>\n/g, `<p className="text-[11px] text-gray-400 mt-0.5">{new Date(qrFile.upload_date || Date.now()).toLocaleDateString()}</p>\n`);
code = code.replace(/<p className="text-\[10px\] text-gray-400 mt-0\.5">\{file\.fy_name \|\| 'Current FY'}<\/p>\n/g, '');
fs.writeFileSync('src/components/MainDashboard.tsx', code);
console.log("Fixed MainDashboard.tsx");

// StarredView.tsx
code = fs.readFileSync('src/components/StarredView.tsx', 'utf8');
code = code.replace(/starred across all FYs/g, 'starred');
fs.writeFileSync('src/components/StarredView.tsx', code);
console.log("Fixed StarredView.tsx");

