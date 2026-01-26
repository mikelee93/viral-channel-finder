const fs = require('fs');
const path = require('path');

// Read hot_channel_functions.js
const filePath = path.join(__dirname, 'hot_channel_functions.js');
let content = fs.readFileSync(filePath, 'utf-8');

// Add the switchChannelSubTab function at the end
const functionToAdd = `

// ========================================
// Channel Sub-Tab Switching Function
// ========================================
function switchChannelSubTab(subTab) {
    console.log('Switching to sub-tab:', subTab);

    // Get all content sections
    const hotChannels = document.getElementById('channel-finder-main-content');
    const trendingVideos = document.getElementById('trending-videos-main-content');
    const multilangKeywords = document.getElementById('multilang-keywords-content');

    // Get all tab buttons
    const hotTabBtn = document.querySelector('[onclick="switchChannelSubTab(\\'hot-channels\\')"]');
    const trendingTabBtn = document.querySelector('[onclick="switchChannelSubTab(\\'trending-videos\\')"]');
    const multilangTabBtn = document.querySelector('[onclick="switchChannelSubTab(\\'multilang-keywords\\')"]');

    // Hide all content sections
    if (hotChannels) hotChannels.classList.add('hidden');
    if (trendingVideos) trendingVideos.classList.add('hidden');
    if (multilangKeywords) multilangKeywords.classList.add('hidden');

    // Remove active styles from all tabs
    [hotTabBtn, trendingTabBtn, multilangTabBtn].forEach(btn => {
        if (btn) {
            btn.classList.remove('border-brand-500', 'text-brand-400');
            btn.classList.add('border-transparent', 'text-slate-400');
        }
    });

    // Show selected content and activate tab
    if (subTab === 'hot-channels') {
        if (hotChannels) hotChannels.classList.remove('hidden');
        if (hotTabBtn) {
            hotTabBtn.classList.add('border-brand-500', 'text-brand-400');
            hotTabBtn.classList.remove('border-transparent', 'text-slate-400');
        }
    } else if (subTab === 'trending-videos') {
        if (trendingVideos) trendingVideos.classList.remove('hidden');
        if (trendingTabBtn) {
            trendingTabBtn.classList.add('border-brand-500', 'text-brand-400');
            trendingTabBtn.classList.remove('border-transparent', 'text-slate-400');
        }

        // Initial load if empty
        const tableBody = document.getElementById('trendingVideosTableBody');
        if (tableBody && (tableBody.children.length === 0 || tableBody.innerText.includes('클릭하여'))) {
            if (typeof loadTrendingVideos === 'function') {
                loadTrendingVideos('all', 'KR');
            }
        }
    } else if (subTab === 'multilang-keywords') {
        if (multilangKeywords) multilangKeywords.classList.remove('hidden');
        if (multilangTabBtn) {
            multilangTabBtn.classList.add('border-brand-500', 'text-brand-400');
            multilangTabBtn.classList.remove('border-transparent', 'text-slate-400');
        }

        // Initialize categories if needed
        if (typeof initMultilangCategories === 'function') {
            initMultilangCategories();
        }
    }
}
`;

content += functionToAdd;

// Write back
fs.writeFileSync(filePath, content, 'utf-8');

console.log('✅ Added switchChannelSubTab function to hot_channel_functions.js');
