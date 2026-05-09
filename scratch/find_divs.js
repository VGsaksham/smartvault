
const fs = require('fs');
const content = fs.readFileSync('src/components/MainDashboard.tsx', 'utf8');

// Find all <div> openers (including multiline)
// This regex matches <div followed by any characters until a > that isn't preceded by a / (self-closing)
const openerRegex = /<div(?!\s*\/>)(\s|[^>])*?>/g;
const closerRegex = /<\/div>/g;

let stack = [];
let results = [];
let openersFound = 0;
let closersFound = 0;

// We need to parse the whole file to handle multiline tags correctly
// A better way is to find all tags with their positions
let tags = [];
let match;

while ((match = openerRegex.exec(content)) !== null) {
  tags.push({ type: 'open', pos: match.index, content: match[0] });
  openersFound++;
}
while ((match = closerRegex.exec(content)) !== null) {
  tags.push({ type: 'close', pos: match.index });
  closersFound++;
}

tags.sort((a, b) => a.pos - b.pos);

tags.forEach(tag => {
  if (tag.type === 'open') {
    stack.push(tag);
  } else {
    if (stack.length > 0) {
      stack.pop();
    } else {
      const line = content.substring(0, tag.pos).split('\n').length;
      results.push(`Stray closer at line ${line}`);
    }
  }
});

stack.forEach(tag => {
  const line = content.substring(0, tag.pos).split('\n').length;
  results.push(`Unclosed opener at line ${line}: ${tag.content.substring(0, 50)}...`);
});

console.log(`Summary: ${openersFound} openers, ${closersFound} closers`);
console.log(results.join('\n'));
