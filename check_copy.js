const fs = require('fs');
const lines = fs.readFileSync('src/components/MainDashboard.tsx', 'utf8').split('\n');
const reqIdx = lines.findIndex(l => l.includes("action: 'COPY'"));
console.log(lines.slice(Math.max(0, reqIdx-10), reqIdx+10).join('\n'));
