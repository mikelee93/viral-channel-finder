const fs = require('fs');

const content = fs.readFileSync('server.js', 'utf8');
let lines = content.split('\n');

console.log(`Total lines: ${lines.length}`);

// Change the first duplicate (line 5349, 0-indexed: 5348)
const line1 = 5348;
if (lines[line1].includes("app.post('/api/hot-channels'")) {
    lines[line1] = lines[line1].replace(
        "app.post('/api/hot-channels'",
        "// DISABLED DUPLICATE 1: app.post('/api/hot-channels-DISABLED-1'"
    );
    console.log('✅ Disabled duplicate 1 at line 5349');
}

// Change the second duplicate (line 5964, 0-indexed: 5963)
const line2 = 5963;
if (lines[line2].includes("app.post('/api/hot-channels'")) {
    lines[line2] = lines[line2].replace(
        "app.post('/api/hot-channels'",
        "// DISABLED DUPLICATE 2: app.post('/api/hot-channels-DISABLED-2'"
    );
    console.log('✅ Disabled duplicate 2 at line 5964');
}

// Keep the third one (line 6758) as is
console.log('✅ Keeping original endpoint at line 6758');

// Write back
fs.writeFileSync('server.js', lines.join('\n'), 'utf8');
console.log('\n✅ Fixed! First two duplicates disabled.');
