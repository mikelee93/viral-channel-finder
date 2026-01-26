const fs = require('fs');
const path = require('path');

const indexPath = 'index.html';
let content = fs.readFileSync(indexPath, 'utf8');

// 1. Identify and extract the HOT Channel Finder block
// It starts with <!-- HOT Channel Finder Tab --> and ends with <!-- End of HOT Channel Finder Tab -->
const blockStart = '<!-- HOT Channel Finder Tab -->';
const blockEnd = '<!-- End of HOT Channel Finder Tab -->';

const startIndex = content.indexOf(blockStart);
const endIndex = content.indexOf(blockEnd) + blockEnd.length;

if (startIndex === -1 || endIndex === -1) {
    console.error('Could not find Channel Finder block');
    process.exit(1);
}

const channelFinderBlock = content.substring(startIndex, endIndex);

// 2. Remove the block AND the premature closing div of video search tab
// The premature closing div is just before the block. 
// It was previously <!-- TEMPORARY TEST -->
const prematureDiv = '</div> <!-- TEMPORARY TEST -->';
const divIndex = content.lastIndexOf(prematureDiv, startIndex);

let cleanContent = '';
if (divIndex !== -1) {
    cleanContent = content.substring(0, divIndex) + content.substring(endIndex);
} else {
    // Fallback search if TEMPORARY TEST was not applied correctly
    const fallbackDiv = '</div> <!-- End of Video Search Tab -->';
    const fallbackIndex = content.lastIndexOf(fallbackDiv, startIndex);
    if (fallbackIndex !== -1) {
        cleanContent = content.substring(0, fallbackIndex) + content.substring(endIndex);
    } else {
        cleanContent = content.substring(0, startIndex) + content.substring(endIndex);
    }
}

// 3. Find the right place to re-insert
// We want to insert it before the AI Analysis Modal, which means at the end of the main container.
const mainContainerEndMarker = '<!-- AI Analysis Modal -->';
const insertIndex = cleanContent.indexOf(mainContainerEndMarker);

if (insertIndex === -1) {
    console.error('Could not find insertion marker');
    process.exit(1);
}

// We need to close the content-video-search tab right before the insertion
const finalContent = cleanContent.substring(0, insertIndex) +
    '    </div> <!-- Properly End of Video Search Tab -->\n\n        ' +
    channelFinderBlock +
    '\n\n    ' +
    cleanContent.substring(insertIndex);

// 4. Save the file
fs.writeFileSync(indexPath, finalContent, 'utf8');
console.log('Successfully reorganized index.html tabs structure');
