import fs from 'fs';

const content = fs.readFileSync('src/pages/Sales.tsx', 'utf8');
const lines = content.split('\n');

lines.forEach((line, i) => {
  // Check for unmatched backticks
  const backticks = (line.match(/`/g) || []).length;
  if (backticks % 2 !== 0) {
    console.log('Line', i+1, 'odd backticks:', line.substring(0, 100));
  }
  // Check for unmatched ${ in template literals
  const openBraces = (line.match(/\$\{/g) || []).length;
  const closeBraces = (line.match(/\}/g) || []).length;
  if (openBraces !== closeBraces) {
    console.log('Line', i+1, 'unmatched braces:', openBraces, closeBraces, line.substring(0, 100));
  }
});

console.log('Check complete');