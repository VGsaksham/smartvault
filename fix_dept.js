const fs = require('fs');
let content = fs.readFileSync('src/components/CategoryDashboard.tsx', 'utf8');
content = content.replace(/\{ category, masterfolderId, null \}/g, '{ category, masterfolderId }');
content = content.replace(/masterfolderId: string \| null; null: string \| null/g, 'masterfolderId: string | null');
content = content.replace(/&null=\$\{null\}/g, '');
content = content.replace(/, null\]\)/g, '])');
fs.writeFileSync('src/components/CategoryDashboard.tsx', content);

let mainContent = fs.readFileSync('src/components/MainDashboard.tsx', 'utf8');
mainContent = mainContent.replace(/null=\{null\}/g, '');
mainContent = mainContent.replace(/&null=\$\{null\}/g, '');
fs.writeFileSync('src/components/MainDashboard.tsx', mainContent);
