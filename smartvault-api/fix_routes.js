const fs = require('fs');

function processFile(filename) {
    if (!fs.existsSync(filename)) return;
    let code = fs.readFileSync(filename, 'utf8');

    code = code.replace(/company_id/g, "masterfolder_id");
    code = code.replace(/companyId/g, "masterfolderId");
    code = code.replace(/normalizedCompanyId/g, "normalizedMasterfolderId");
    code = code.replace(/CompanyId/g, "MasterfolderId");
    code = code.replace(/company_name/g, "masterfolder_name");
    code = code.replace(/companyName/g, "masterfolderName");
    code = code.replace(/companies c/g, "masterfolders m");
    code = code.replace(/companies/g, "masterfolders");
    code = code.replace(/company\./g, "masterfolder.");
    code = code.replace(/company-/g, "masterfolder-");
    code = code.replace(/company_/g, "masterfolder_");
    code = code.replace(/company_access/g, "masterfolder_access");
    code = code.replace(/companyAccess/g, "masterfolderAccess");
    code = code.replace(/company_category/g, "masterfolder_category");
    code = code.replace(/company/gi, "masterfolder");

    code = code.replace(/AND\s+m\.fy_id\s*=\s*\$[0-9]+/g, "");
    code = code.replace(/AND\s+fy_id\s*=\s*\$[0-9]+/g, "");
    code = code.replace(/,\s*fy_id/g, "");
    code = code.replace(/,\s*m\.fy_id/g, "");
    code = code.replace(/m\.fy_id/g, "1");
    code = code.replace(/fy_id/g, "1");
    code = code.replace(/fyId/g, "null");
    code = code.replace(/financial_years/gi, "masterfolders");
    code = code.replace(/financial_year/gi, "masterfolder");
    code = code.replace(/financialYears/gi, "masterfolders");
    code = code.replace(/financialYear/gi, "masterfolder");

    fs.writeFileSync(filename, code);
}

processFile('src/routes/users.js');
processFile('src/routes/admin.js');
processFile('src/routes/auth.js');
processFile('src/routes/audit.js');
processFile('src/routes/export.js');
processFile('src/services/accessService.js');
processFile('src/services/backupService.js');

