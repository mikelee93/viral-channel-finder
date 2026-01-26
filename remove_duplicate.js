const fs = require('fs');
const path = require('path');

// Read the file
const filePath = path.join(__dirname, 'hot_channel_functions.js');
let content = fs.readFileSync(filePath, 'utf-8');

console.log('Original file length:', content.length);

// Find the first switchChannelSubTab function
const firstFuncIndex = content.indexOf('function switchChannelSubTab(tabId)');
console.log('First function starts at index:', firstFuncIndex);

if (firstFuncIndex === -1) {
    console.log('❌ First function not found!');
    process.exit(1);
}

// Find where the first function ends by counting braces
let braceCount = 0;
let funcStart = firstFuncIndex;
let i = content.indexOf('{', funcStart);
braceCount = 1;
i++;

while (i < content.length && braceCount > 0) {
    if (content[i] === '{') braceCount++;
    else if (content[i] === '}') braceCount--;
    i++;
}

const funcEnd = i;
console.log('First function ends at index:', funcEnd);
console.log('Function length:', funcEnd - funcStart);

// Extract the function to verify
const extractedFunc = content.substring(funcStart, funcEnd);
console.log('\n=== Extracted function (first 200 chars) ===');
console.log(extractedFunc.substring(0, 200));

// Remove the first function
const newContent = content.substring(0, funcStart) + content.substring(funcEnd);

console.log('\nNew file length:', newContent.length);
console.log('Removed', content.length - newContent.length, 'characters');

// Write back
fs.writeFileSync(filePath, newContent, 'utf-8');

console.log('\n✅ Removed first switchChannelSubTab(tabId) function from hot_channel_functions.js');
console.log('The second switchChannelSubTab(subTab) function remains.');
