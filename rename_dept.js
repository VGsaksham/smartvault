const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      if (!file.includes('node_modules') && !file.includes('.next') && !file.includes('.git')) {
        results = results.concat(walk(file));
      }
    } else {
      if (file.endsWith('.js') || file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.sql')) {
        results.push(file);
      }
    }
  });
  return results;
}

const files = walk('.');

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let original = content;

  // Exact replacements
  content = content.replace(/\bcategory\b/g, 'category');
  content = content.replace(/\bcategories\b/g, 'categories');
  content = content.replace(/\bCategory\b/g, 'Category');
  content = content.replace(/\bCategories\b/g, 'Categories');

  // camelCase / pascalCase replacements
  content = content.replace(/Category/g, 'Category');
  content = content.replace(/category/g, 'category');
  
  // Specific variable renames for "category"
  content = content.replace(/activeCategory/g, 'activeCategory');
  content = content.replace(/allowedCategories/g, 'allowedCategories');
  content = content.replace(/structureCategories/g, 'structureCategories');
  content = content.replace(/userCategories/g, 'userCategories');
  content = content.replace(/selectedCategoryId/g, 'selectedCategoryId');
  content = content.replace(/selectedCategory/g, 'selectedCategory');
  content = content.replace(/editCategoryId/g, 'editCategoryId');
  content = content.replace(/editCategoryName/g, 'editCategoryName');
  content = content.replace(/newCategoryName/g, 'newCategoryName');
  content = content.replace(/categoryId/g, 'categoryId');
  content = content.replace(/rawCategory/g, 'rawCategory');
  content = content.replace(/userCategory/g, 'userCategory');
  content = content.replace(/setUserCategory/g, 'setUserCategory');
  content = content.replace(/\bdept\b/g, 'category');
  content = content.replace(/\bdepts\b/g, 'categories');

  if (content !== original) {
    fs.writeFileSync(file, content, 'utf8');
    console.log(`Updated: ${file}`);
  }
});
