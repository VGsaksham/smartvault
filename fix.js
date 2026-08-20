const fs = require('fs');
let code = fs.readFileSync('smartvault-api/server.js', 'utf8');

// 1. Remove stats endpoint normalizedFyId
code = code.replace(/const normalizedFyId = null \? Number\(null\) : null;\n/g, '');
code = code.replace(/ \|\| !normalizedFyId/g, '');
code = code.replace(/ \|\| Number\.isNaN\(normalizedFyId\)/g, '');

code = code.replace(/const fyMatch = await pool\.query\([\s\S]*?Financial year does not belong to the selected masterfolder\." \}\);\n\s+\}/, '');

code = code.replace(/, normalizedMasterfolderId, normalizedFyId\]/g, ', normalizedMasterfolderId]');
code = code.replace(/, normalizedFyId/g, '');
code = code.replace(/AND m\.fy_id = \$3 /g, '');

// 2. Remove cross-FY comparison block completely
code = code.replace(/\/\/ 7\. Cross-FY Comparison[\s\S]*?lastFyStats = \{[\s\S]*?\};\n\s+\}\n/g, '');
code = code.replace(/cross_fy: \{[\s\S]*?previous: lastFyStats\n\s+\}/g, '');
code = code.replace(/,\n\s+cross_fy:/, '');

// 3. Remove fy.status logic in download/bulk endpoints
code = code.replace(/LEFT JOIN financial_years fy ON fy\.id = 1/g, '');
code = code.replace(/, fy\.status as fy_status/g, '');
code = code.replace(/\n\s+\/\/ FY state checks?\n\s+if \(fileRecord\.fy_status === 'Locked'\) \{[\s\S]*?\}\n/g, '');
code = code.replace(/\n\s+if \(fileRecord\.fy_status === 'Archived'.*?\) \{[\s\S]*?\}\n/g, '');
code = code.replace(/\n\s+if \(fileRecord\.fy_status === 'Archived'\) \{[\s\S]*?\}\n/g, '');
code = code.replace(/\/\/ FY state check\n\s+if \(fileRecord\.fy_status === 'Locked'\) \{[\s\S]*?\}\n/g, '');

fs.writeFileSync('smartvault-api/server.js', code);
console.log("Fixed server.js");
