const fs = require('fs');
const path = require('path');

const indexPath = 'index.html';
let content = fs.readFileSync(indexPath, 'utf8');

// Find the target area
const targetStart = '            // Slider value update';
const targetEnd = '        });\n\n        function saveApiKeys()';

const startIndex = content.indexOf(targetStart);
const endIndex = content.indexOf('        });', startIndex) + '        });'.length;

if (startIndex === -1) {
    console.error('Could not find start marker');
    process.exit(1);
}

const newInitialization = `            // Slider value update
            const slider = document.getElementById('viralThreshold');
            const output = document.getElementById('thresholdValue');
            if (slider && output) {
                slider.oninput = function () {
                    output.innerHTML = this.value + '%';
                }
            }

            // === HOT Channel Finder Initialization ===
            initializeCategoryButtons();
            
            // Tab Button Event Listeners
            const videoTabBtn = document.getElementById('tab-video-search');
            if (videoTabBtn) {
                videoTabBtn.addEventListener('click', () => switchTab('video-search'));
            }
            
            const channelTabBtn = document.getElementById('tab-channel-finder');
            if (channelTabBtn) {
                channelTabBtn.addEventListener('click', () => switchTab('channel-finder'));
            }
        });`;

const updatedContent = content.substring(0, startIndex) + newInitialization + content.substring(endIndex);

fs.writeFileSync(indexPath, updatedContent, 'utf8');
console.log('Successfully updated index.html initialization');
