const fs = require('fs');

const file = 'src/components/MainDashboard.tsx';
let code = fs.readFileSync(file, 'utf8');

// Replace `if (masterfolderId && dummyNull)` with `if (masterfolderId)`
code = code.replace(/if \(masterfolderId && dummyNull\)/g, 'if (masterfolderId)');

// Replace `!masterfolderId || !dummyNull` with `!masterfolderId`
code = code.replace(/!masterfolderId \|\| !dummyNull/g, '!masterfolderId');

// Remove `dummyNull` from dependencies: `[masterfolderId, dummyNull,` -> `[masterfolderId,`
code = code.replace(/\[masterfolderId, dummyNull,/g, '[masterfolderId,');
code = code.replace(/\[masterfolderId, dummyNull\]/g, '[masterfolderId]');

// Replace `fetchFiles(masterfolderId, dummyNull)` with `fetchFiles(masterfolderId)`
code = code.replace(/fetchFiles\(masterfolderId, dummyNull\)/g, 'fetchFiles(masterfolderId)');

// Replace `new URLSearchParams({ masterfolderId, dummyNull })` with `{ masterfolderId }`
code = code.replace(/new URLSearchParams\(\{ masterfolderId, dummyNull \}\)/g, 'new URLSearchParams({ masterfolderId })');

// Replace fetchFiles dummyNull checks
code = code.replace(/const f = fId \?\? dummyNull;/g, '');
code = code.replace(/if \(!c \|\| !f\)/g, 'if (!c)');
code = code.replace(/\{ c, f \}/g, '{ c }');
code = code.replace(/companyId or fyId missing/g, 'masterfolderId missing');
code = code.replace(/masterfolderId or dummyNull missing/g, 'masterfolderId missing');
code = code.replace(/dummyNull=\$\{f\}/g, '');
code = code.replace(/&dummyNull=\$\{f\}/g, '');
code = code.replace(/, FY:\$\{f\}/g, '');
code = code.replace(/, dummyNull: detailFy/g, '');
code = code.replace(/\|\| Number\(detailFy\) !== Number\(dummyNull\)/g, '');

fs.writeFileSync(file, code);
