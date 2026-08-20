const fs = require('fs');
let code = fs.readFileSync('smartvault-api/server.js', 'utf8');

code = code.replace(/company_id/g, 'masterfolder_id');
code = code.replace(/companyId/g, 'masterfolderId');
code = code.replace(/companies/g, 'masterfolders');
code = code.replace(/company_names/g, 'masterfolder_names');
code = code.replace(/allowedCompanyIds/g, 'allowedMasterfolderIds');
code = code.replace(/company_access/g, 'masterfolder_access');
code = code.replace(/companyRows/g, 'masterfolderRows');
code = code.replace(/companyName/g, 'masterfolderName');
code = code.replace(/company_name/g, 'masterfolder_name');
code = code.replace(/getAllowedDepartmentsForCompany/g, 'getAllowedDepartmentsForMasterfolder');
code = code.replace(/const company /g, 'const masterfolder ');
code = code.replace(/for \(const company of/g, 'for (const masterfolder of');

fs.writeFileSync('smartvault-api/server.js', code);
console.log('Fixed server.js');
