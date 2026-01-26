const fs = require('fs');
const path = require('path');

// Read the file
const filePath = path.join(__dirname, 'index.html');
const content = fs.readFileSync(filePath, 'utf-8');
const lines = content.split('\n');

console.log(`Total lines before: ${lines.length}`);
console.log(`Line 7619: ${lines[7618].substring(0, 80)}`);
console.log(`Line 7620: ${lines[7619].substring(0, 80)}`);
console.log(`Line 7816: ${lines[7815].substring(0, 80)}`);
console.log(`Line 7817: ${lines[7816].substring(0, 80)}`);

// Remove lines 7620-7816 (indices 7619-7815 in 0-indexed)
const newLines = [...lines.slice(0, 7619), ...lines.slice(7816)];

console.log(`\nTotal lines after: ${newLines.length}`);

// Write back
fs.writeFileSync(filePath, newLines.join('\n'), 'utf-8');

console.log('Done! Removed lines 7620-7816');
