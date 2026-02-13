const fs = require('fs');
const path = require('path');

// Read index.html
const filePath = path.join(__dirname, 'index.html');
let content = fs.readFileSync(filePath, 'utf-8');

console.log('Original file length:', content.length);

// Find the let advancedFilterState declaration
const targetIndex = content.indexOf('let advancedFilterState');
console.log('Found at index:', targetIndex);

if (targetIndex === -1) {
    console.log('❌ Declaration not found!');
    process.exit(1);
}

// Show context before
console.log('\n=== Context before (100 chars) ===');
console.log(content.substring(targetIndex - 100, targetIndex));

// Find the end of this variable declaration (find the closing brace and semicolon)
let depth = 0;
let i = content.indexOf('{', targetIndex);
depth = 1;
i++;

while (i < content.length && depth > 0) {
    if (content[i] === '{') depth++;
    else if (content[i] === '}') depth--;
    i++;
}

// Find the semicolon after the closing brace
while (i < content.length && content[i] !== ';') {
    i++;
}
i++; // Include the semicolon

const declarationEnd = i;
console.log('Declaration ends at index:', declarationEnd);
console.log('Declaration length:', declarationEnd - targetIndex);

// Extract what we're removing
const removed = content.substring(targetIndex, declarationEnd);
console.log('\n=== Removing (first 300 chars) ===');
console.log(removed.substring(0, 300));

// Show context after
console.log('\n=== Context after (100 chars) ===');
console.log(content.substring(declarationEnd, declarationEnd + 100));

// Remove the declaration
const newContent = content.substring(0, targetIndex) + content.substring(declarationEnd);

console.log('\nNew file length:', newContent.length);
console.log('Removed', content.length - newContent.length, 'characters');

// Write back
fs.writeFileSync(filePath, newContent, 'utf-8');

console.log('\n✅ Removed duplicate advancedFilterState declaration from index.html');
