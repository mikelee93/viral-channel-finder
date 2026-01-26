const fs = require('fs');

console.log('Restoring from backup...');

// Read backup
const backup = fs.readFileSync('server.js.backup', 'utf8');

// Write it back
fs.writeFileSync('server.js', backup, 'utf8');

console.log('✅ Restored successfully!');

// Now let's find the exact duplicate endpoints
const lines = backup.split('\n');
console.log(`\nTotal lines in backup: ${lines.length}`);

// Find all occurrences of "app.post('/api/hot-channels'"
const occurrences = [];
lines.forEach((line, index) => {
    if (line.includes("app.post('/api/hot-channels'")) {
        occurrences.push(index + 1); // 1-indexed
    }
});

console.log(`\nFound ${occurrences.length} occurrences of app.post('/api/hot-channels' at lines:`);
occurrences.forEach((lineNum, i) => {
    console.log(`  ${i + 1}. Line ${lineNum}`);
});
