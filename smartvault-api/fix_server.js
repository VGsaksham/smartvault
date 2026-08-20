const fs = require('fs');

let code = fs.readFileSync('server.js', 'utf8');

// Replace company/companies/companyId
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

// Strip out FY logic
// Replace all WHERE fy_id = ... logic
code = code.replace(/AND\s+m\.fy_id\s*=\s*\$[0-9]+/g, "");
code = code.replace(/AND\s+fy_id\s*=\s*\$[0-9]+/g, "");
code = code.replace(/,\s*fy_id/g, "");
code = code.replace(/,\s*m\.fy_id/g, "");
code = code.replace(/m\.fy_id/g, "1"); // if used in SELECT, fallback
code = code.replace(/fy_id/g, "1"); // fallback
code = code.replace(/fyId/g, "null");
code = code.replace(/financialYear/gi, "masterfolder"); // Fallback
code = code.replace(/fyName/g, "masterfolderName");
code = code.replace(/LEFT JOIN financial_years fy ON fy\.id = m\.1/g, "");
code = code.replace(/LEFT JOIN financial_years fy ON fy\.id = m\.fy_id/g, "");

// Specifically for syncFinancialYears and other blocks, it's safer to just let it break if we don't need it.
// Actually, since I'm removing FYs entirely, the easiest is to just remove the syncFinancialYears function body.
code = code.replace(/async function syncFinancialYears\(\) \{[\s\S]*?\n\}/, "async function syncFinancialYears() {}");

fs.writeFileSync('server.js', code);
