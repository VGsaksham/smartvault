const fs = require('fs');
const lines = fs.readFileSync('src/components/MainDashboard.tsx', 'utf8').split('\n');
const reqIdx = lines.findIndex(l => l.includes("localStorage.getItem('user')"));
console.log(lines.slice(Math.max(0, reqIdx-5), reqIdx+15).join('\n'));
