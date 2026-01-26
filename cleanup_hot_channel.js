const fs = require('fs');

const indexPath = 'index.html';
let content = fs.readFileSync(indexPath, 'utf-8');

console.log('🧹 Cleaning up old HOT Channel Finder components...');

// Remove Advanced Filter Modal
const advModalStart = content.indexOf('<!-- ========================================\n     HOT Channel Finder - Advanced Filter Modal');
if (advModalStart === -1) {
    const advModalStart2 = content.indexOf('<!-- ========================================\r\n     HOT Channel Finder - Advanced Filter Modal');
    if (advModalStart2 !== -1) {
        const advModalEnd = content.indexOf('</div>\n\n<!-- ========================================\n     HOT Channel Finder - Category Filter Modal', advModalStart2);
        if (advModalEnd !== -1) {
            content = content.substring(0, advModalStart2) + content.substring(advModalEnd + 7);
        }
    }
} else {
    const advModalEnd = content.indexOf('</div>\n\n<!-- ========================================\n     HOT Channel Finder - Category Filter Modal', advModalStart);
    if (advModalEnd !== -1) {
        content = content.substring(0, advModalStart) + content.substring(advModalEnd + 7);
    }
}

// Remove Category Filter Modal  
const catModalStart = content.indexOf('<!-- ========================================\n     HOT Channel Finder - Category Filter Modal');
if (catModalStart === -1) {
    const catModalStart2 = content.indexOf('<!-- ========================================\r\n     HOT Channel Finder - Category Filter Modal');
    if (catModalStart2 !== -1) {
        const catModalEnd = content.indexOf('</div>\n\n<!-- ========================================', catModalStart2);
        if (catModalEnd !== -1) {
            content = content.substring(0, catModalStart2) + content.substring(catModalEnd + 7);
        }
    }
} else {
    const catModalEnd = content.indexOf('</div>\n\n<!-- ========================================', catModalStart);
    if (catModalEnd !== -1) {
        content = content.substring(0, catModalStart) + content.substring(catModalEnd + 7);
    }
}

// Remove JavaScript Functions
const scriptStart = content.indexOf('<!-- ========================================\n     HOT Channel Finder - Insert this BEFORE </body> tag');
if (scriptStart === -1) {
    const scriptStart2 = content.indexOf('<!-- ========================================\r\n     HOT Channel Finder - Insert this BEFORE </body> tag');
    if (scriptStart2 !== -1) {
        const scriptEnd = content.indexOf('</script>\n</body>', scriptStart2);
        if (scriptEnd !== -1) {
            content = content.substring(0, scriptStart2) + '</body>\n\n</html>\n';
        }
    }
} else {
    const scriptEnd = content.indexOf('</script>\n</body>', scriptStart);
    if (scriptEnd !== -1) {
        content = content.substring(0, scriptStart) + '</body>\n\n</html>\n';
    }
}

// Write the cleaned content
fs.writeFileSync(indexPath, content, 'utf-8');

console.log('✅ Successfully cleaned index.html!');
console.log('📝 Removed all HOT Channel Finder components.');
console.log('🔄 Now run: node insert_hot_channel.js');
