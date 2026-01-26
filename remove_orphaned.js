const fs = require('fs');

const content = fs.readFileSync('server.js', 'utf8');
let lines = content.split('\n');

console.log(`Total lines before: ${lines.length}`);

// Find and remove the entire orphaned block between the comments
const start1 = lines.findIndex(line => line.includes('/* DISABLED DUPLICATE ENDPOINT 1 BODY - START */'));
const end1 = lines.findIndex(line => line.includes('/* DISABLED DUPLICATE ENDPOINT 1 BODY - END */'));

if (start1 > 0 && end1 > start1) {
    console.log(`Found first orphaned block: lines ${start1 + 1} to ${end1 + 1}`);
    // Remove from start to end (inclusive of both comment lines)
    lines.splice(start1, end1 - start1 + 1);
    console.log('✅ Removed first orphaned block');
}

// Recalculate for second block after first removal
const start2 = lines.findIndex(line => line.includes('/* DISABLED DUPLICATE ENDPOINT 2 BODY - START */'));
const end2 = lines.findIndex(line => line.includes('/* DISABLED DUPLICATE ENDPOINT 2 BODY - END */'));

if (start2 > 0 && end2 > start2) {
    console.log(`Found second orphaned block: lines ${start2 + 1} to ${end2 + 1}`);
    lines.splice(start2, end2 - start2 + 1);
    console.log('✅ Removed second orphaned block');
}

fs.writeFileSync('server.js', lines.join('\n'), 'utf8');
console.log(`\nTotal lines after: ${lines.length}`);
console.log('✅ Cleaned up! Orphaned code blocks removed.');
