const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = dir + '/' + file;
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else {
      if (file.endsWith('.tsx') || file.endsWith('.ts')) {
        results.push(file);
      }
    }
  });
  return results;
}

const files = walk('src/components');
files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let newContent = content;
  // Fix multi-line { masterfolderId, null }
  newContent = newContent.replace(/\{\s*masterfolderId,\s*null\s*\}/g, '{ masterfolderId }');
  // Fix useEffect dependency arrays with null
  newContent = newContent.replace(/\[masterfolderId,\s*null/g, '[masterfolderId');
  newContent = newContent.replace(/masterfolderId,\s*null,/g, 'masterfolderId,');
  if (content !== newContent) {
    fs.writeFileSync(file, newContent);
    console.log('Fixed:', file);
  }
});
