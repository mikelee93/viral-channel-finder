const fs = require('fs');

// Read the file
const content = fs.readFileSync('server.js', 'utf8');
const lines = content.split('\n');

console.log(`Total lines: ${lines.length}`);

// Find and mark the duplicate endpoints
// Duplicate 1: around line 5348-5641
// Duplicate 2: around line 5957-6135
// Keep: around line 6751

// Remove lines 5348-5641 (first duplicate - already partially commented)
// Remove lines 5957-6135 (second duplicate)

const linesToRemove1Start = 5347; // 0-indexed: 5348
const linesToRemove1End = 5640;   // 0-indexed: 5641

const linesToRemove2Start = 5956; // 0-indexed: 5957 (will shift after first removal)
const linesToRemove2End = 6134;   // 0-indexed: 6135

// First, remove the first duplicate
const afterFirst = [
    ...lines.slice(0, linesToRemove1Start),
    '// [REMOVED DUPLICATE ENDPOINT 1/3] - See line ~6400 for correct implementation',
    '',
    ...lines.slice(linesToRemove1End + 1)
];

console.log(`After first removal: ${afterFirst.length} lines`);

// Adjust indices for second removal (shifted by removal amount)
const shiftAmount = (linesToRemove1End - linesToRemove1Start + 1) - 2; // -2 for the comment lines we added
const adjustedStart2 = linesToRemove2Start - shiftAmount;
const adjustedEnd2 = linesToRemove2End - shiftAmount;

// Remove the second duplicate
const final = [
    ...afterFirst.slice(0, adjustedStart2),
    '// [REMOVED DUPLICATE ENDPOINT 2/3] - See line ~6400 for correct implementation',
    '',
    ...afterFirst.slice(adjustedEnd2 + 1)
];

console.log(`Final: ${final.length} lines`);

// Write back
fs.writeFileSync('server.js', final.join('\n'), 'utf8');
console.log('✅ Fixed! Removed duplicate endpoints.');
