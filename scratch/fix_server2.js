const fs = require('fs');
let code = fs.readFileSync('smartvault-api/server.js', 'utf8');

code = code.replace(/company_departments/g, 'masterfolder_categories');
code = code.replace(/company_department_folders/g, 'masterfolder_category_folders');
code = code.replace(/department_id/g, 'category_id');

// Fix ensureFolderExists query (remove fy_id from masterfolder_categories)
code = code.replace(
  /'SELECT id FROM masterfolder_categories WHERE masterfolder_id = \$1 AND fy_id = \$2 AND LOWER\(name\) = LOWER\(\$3\)',\n\s*\[masterfolderId, fyId, departmentName\]/g,
  `'SELECT id FROM masterfolder_categories WHERE masterfolder_id = $1 AND LOWER(name) = LOWER($2)',\n    [masterfolderId, departmentName]`
);

code = code.replace(
  /'INSERT INTO masterfolder_categories \(masterfolder_id, fy_id, name\) VALUES \(\$1, \$2, \$3\) RETURNING id',\n\s*\[masterfolderId, fyId, departmentName\]/g,
  `'INSERT INTO masterfolder_categories (masterfolder_id, name) VALUES ($1, $2) RETURNING id',\n      [masterfolderId, departmentName]`
);

// Fix the dashboard query in server.js to use masterfolder_categories correctly
// Wait, the dashboard query in line 1119:
code = code.replace(
  /SELECT name\n\s*FROM masterfolder_categories\n\s*WHERE masterfolder_id = \$1 AND fy_id = \$2\n\s*ORDER BY LOWER\(name\) ASC`,\n\s*\[normalizedCompanyId, normalizedFyId\]/g,
  `SELECT name
           FROM masterfolder_categories
           WHERE masterfolder_id = $1
           ORDER BY LOWER(name) ASC\`,
          [normalizedCompanyId]`
);

code = code.replace(
  /FROM masterfolder_categories\n\s*WHERE masterfolder_id = \$1 AND fy_id = \$2\n\s*`,\n\s*\[masterfolderId, fyId\]/g,
  `FROM masterfolder_categories
         WHERE masterfolder_id = $1
        \`,
        [masterfolderId]`
);

fs.writeFileSync('smartvault-api/server.js', code);
console.log('Fixed company_departments in server.js');
