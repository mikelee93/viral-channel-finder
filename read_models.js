const fs = require('fs');

try {
    const content = fs.readFileSync('models.json', 'binary');

    console.log('--- Regex Search (Cleaned) ---');
    // Remove null bytes for UTF-16 basic handling
    const clean = content.replace(/\x00/g, '');
    const regex = /"name":\s*"models\/([^"]+)"/g;
    let match2;
    while ((match2 = regex.exec(clean)) !== null) {
        console.log(match2[1]);
    }
} catch (e) {
    console.log('Error:', e.message);
}
