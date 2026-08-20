const fs = require('fs');
let content = fs.readFileSync('src/components/CategoryDashboard.tsx', 'utf8');
content = content.replace(/\|\| !null/g, '');
fs.writeFileSync('src/components/CategoryDashboard.tsx', content);

let sideContent = fs.readFileSync('src/components/Sidebar.tsx', 'utf8');
sideContent = sideContent.replace(/\|\| !null/g, '');
fs.writeFileSync('src/components/Sidebar.tsx', sideContent);
