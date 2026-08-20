const fs = require('fs');
let code = fs.readFileSync('smartvault-api/src/routes/admin.js', 'utf8');

code = code.replace(/company_id/g, 'masterfolder_id');
code = code.replace(/companyId/g, 'masterfolderId');
code = code.replace(/normalizedCompanyId/g, 'normalizedMasterfolderId');
code = code.replace(/CompanyId/g, 'MasterfolderId');
code = code.replace(/company_name/g, 'masterfolder_name');
code = code.replace(/companyName/g, 'masterfolderName');
code = code.replace(/company_categories/g, 'masterfolder_categories');
code = code.replace(/company_category_folders/g, 'masterfolder_category_folders');
code = code.replace(/ensureCompanyStructureSchema/g, 'ensuremasterfolderStructureSchema');

code = code.replace(/const fyId = Number\(req\.query\.fyId\);\n/g, '');
code = code.replace(/const fyId = Number\(req\.body\.fy_id\);\n/g, '');
code = code.replace(/\|\| !Number\.isFinite\(fyId\)/g, '');
code = code.replace(/and fyId are required/g, 'is required');

code = code.replace(/AND fy_id = \$2/g, '');
code = code.replace(/, fyId/g, '');
code = code.replace(/, fy_id/g, '');
code = code.replace(/, \$3/g, '');
code = code.replace(/masterfolderId, name/g, 'masterfolderId, name');

fs.writeFileSync('smartvault-api/src/routes/admin.js', code);
console.log('Fixed admin.js');
