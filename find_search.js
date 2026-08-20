const fs = require('fs');
const path = require('path');
function walk(dir) {
  fs.readdirSync(dir).forEach(f => {
    let d = path.join(dir, f);
    if(fs.statSync(d).isDirectory()) walk(d);
    else if (fs.readFileSync(d, 'utf8').includes('placeholder="Search')) console.log(d);
  });
}
walk('src');
