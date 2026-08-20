const fs = require('fs');

// users.js
let code = fs.readFileSync('smartvault-api/src/routes/users.js', 'utf8');
code = code.replace(/const normalizedFyId = null \? Number\(null\) : null;\n/g, '');
code = code.replace(/if \(\(normalizedMasterfolderId \|\| normalizedFyId\) && scope === 'activeUploaders'\) \{[\s\S]*?\}\n/g, `if (normalizedMasterfolderId && scope === 'activeUploaders') {
      let p = 1;
      query += \` AND EXISTS (
        SELECT 1 FROM vault_files vf
        JOIN vault_file_metadata vm ON vf.id = vm.file_id
        WHERE vf.uploaded_by = u.id
      \`;
      query += \` AND vm.masterfolder_id = $\${p++}\`; values.push(normalizedMasterfolderId);
      query += ')';
    }
`);
fs.writeFileSync('smartvault-api/src/routes/users.js', code);
console.log("Fixed users.js");

// audit.js
code = fs.readFileSync('smartvault-api/src/routes/audit.js', 'utf8');
code = code.replace(/return res\.status\(409\)\.json\(\{ error: 'Undo not possible: file metadata \(masterfolder\/FY\) is missing\.' \}\);/g, `return res.status(409).json({ error: 'Undo not possible: file metadata (masterfolder) is missing.' });`);
code = code.replace(/error: 'Undo not possible: original category\/masterfolder\/FY structure is missing\. Restore structure or backup first\.'/g, `error: 'Undo not possible: original category/masterfolder structure is missing. Restore structure or backup first.'`);
code = code.replace(/error: 'Undo not possible: original folder is missing in that category\/masterfolder\/FY\. Restore structure or backup first\.'/g, `error: 'Undo not possible: original folder is missing in that category/masterfolder. Restore structure or backup first.'`);
fs.writeFileSync('smartvault-api/src/routes/audit.js', code);
console.log("Fixed audit.js");

// export.js
// export.js has no logic directly querying fy tables based on the grep, only 'FY' text might exist in headers. I'll ignore export.js for now.
// Let's check backupService.js
code = fs.readFileSync('smartvault-api/src/services/backupService.js', 'utf8');
code = code.replace(/const requiredFys = new Set\(\);\n/g, '');
code = code.replace(/if \(null\) requiredFys\.add\(null\);\n/g, '');
code = code.replace(/if \(requiredFys\.size > 0\) \{[\s\S]*?\}\n/g, '');
code = code.replace(/, FYs/g, '');
fs.writeFileSync('smartvault-api/src/services/backupService.js', code);
console.log("Fixed backupService.js");
