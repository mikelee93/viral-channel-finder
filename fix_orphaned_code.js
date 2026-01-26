const fs = require('fs');

const content = fs.readFileSync('server.js', 'utf8');
const lines = content.split('\n');

console.log(`Total lines: ${lines.length}`);

// We need to comment out the orphaned function body from line 5355 to 5641
// This is the body of the first duplicate endpoint

// Strategy: wrap lines 5355 to 5640 (0-indexed: 5354 to 5639) in a multi-line comment
lines.splice(5354, 0, '/* DISABLED DUPLICATE ENDPOINT 1 BODY - START */');
lines.splice(5641 + 1, 0, '/* DISABLED DUPLICATE ENDPOINT 1 BODY - END */');

console.log('✅ Commented out first duplicate endpoint body (lines 5355-5641)');

// Now handle the second duplicate endpoint body (originally around line 5964-6142)
// After adding 2 lines above, these indices shift, but let's find it dynamically

const secondDupStart = lines.findIndex((line, idx) =>
    idx > 5700 && line.includes('// DISABLED DUPLICATE 2:')
);

if (secondDupStart > 0) {
    console.log(`Found second duplicate at line ${secondDupStart + 1}`);

    // Find the closing of this endpoint (should be around +178 lines later, ending with });)
    let endLine = secondDupStart;
    let braceCount = 0;
    let foundStart = false;

    for (let i = secondDupStart; i < Math.min(secondDupStart + 300, lines.length); i++) {
        const line = lines[i];
        if (line.includes('async (req, res) => {')) {
            foundStart = true;
            braceCount = 1;
            continue;
        }
        if (foundStart) {
            braceCount += (line.match(/{/g) || []).length;
            braceCount -= (line.match(/}/g) || []).length;
            if (braceCount === 0 && line.includes('});')) {
                endLine = i;
                break;
            }
        }
    }

    if (endLine > secondDupStart) {
        console.log(`  Body ends at line ${endLine + 1}`);
        // Comment out from next line after the declaration to the end
        lines.splice(secondDupStart + 1, 0, '/* DISABLED DUPLICATE ENDPOINT 2 BODY - START */');
        lines.splice(endLine + 2, 0, '/* DISABLED DUPLICATE ENDPOINT 2 BODY - END */');
        console.log('✅ Commented out second duplicate endpoint body');
    }
}

// Write back
fs.writeFileSync('server.js', lines.join('\n'), 'utf8');
console.log('\n✅ Fixed! All duplicate endpoint bodies have been disabled.');
