const fs = require('fs');

const path = 'server.js';
let content = fs.readFileSync(path, 'utf8');
let lines = content.split(/\r?\n/);

console.log(`Total lines: ${lines.length}`);

// Find the first occurrence of "return discoveredChannels;"
// and the final "app.post('/api/hot-channels'"
// There is a mess between them.

let firstReturnIdx = -1;
let apiEndpointIdx = -1;

for (let i = 6000; i < lines.length; i++) {
    if (lines[i].includes('return discoveredChannels;') && firstReturnIdx === -1) {
        firstReturnIdx = i;
    }
    if (lines[i].includes("app.post('/api/hot-channels'")) {
        apiEndpointIdx = i;
        break;
    }
}

if (firstReturnIdx !== -1 && apiEndpointIdx !== -1) {
    console.log(`Found first return at line ${firstReturnIdx + 1}`);
    console.log(`Found API endpoint at line ${apiEndpointIdx + 1}`);

    // The code between them should be cleaned up.
    // We want to insert the MongoDB save logic before the return.

    const mongoSaveLogic = [
        '        // 5. Save to MongoDB',
        '        for (const channel of discoveredChannels) {',
        '            await HotChannel.findOneAndUpdate(',
        '                { channelId: channel.channelId },',
        '                {',
        '                    channelId: channel.channelId,',
        '                    channelTitle: channel.name,',
        '                    subscriberCount: channel.subscribers,',
        '                    videoCount: channel.videoCount,',
        '                    viewCount: channel.totalViews,',
        '                    categoryName: channel.category,',
        '                    recentVideos: channel.recentVideos,',
        '                    avgViewsPerVideo: Math.floor(channel.totalViews / Math.max(1, channel.videoCount)),',
        '                    estimatedRevenue: channel.estimatedRevenue.toString(),',
        '                    lastUpdated: new Date()',
        '                },',
        '                { upsert: true, new: true }',
        '            );',
        '        }',
        '',
        '        console.log(\'[HOT Discovery] Saved to MongoDB\');'
    ];

    // Find the start of the discoverHotChannels function to know where to start replacing
    const functionStartIdx = lines.slice(0, apiEndpointIdx).lastIndexOf('// Discover HOT channels');

    if (functionStartIdx !== -1) {
        console.log(`Discovering function starts around line ${functionStartIdx + 1}`);

        // We will keep everything from function start to just before the "return"
        // Then add mongoSaveLogic
        // Then add return and close function
        // Then skip everything until apiEndpointIdx

        // Let's find the ACTUAL return discoveredChannels; inside the function.
        // The one we want is the first one in the NEW block we added.

        const returnLineIdx = lines.findIndex((l, idx) => idx > functionStartIdx && l.includes('return discoveredChannels;'));

        if (returnLineIdx !== -1) {
            const beforeReturn = lines.slice(0, returnLineIdx);
            const afterEndpoint = lines.slice(apiEndpointIdx);

            const newContent = [
                ...beforeReturn,
                ...mongoSaveLogic,
                '        return discoveredChannels;',
                '    } catch (error) {',
                '        console.error(\'[HOT Discovery] Error:\', error);',
                '        throw error;',
                '    }',
                '}',
                '',
                ...afterEndpoint
            ].join('\n');

            fs.writeFileSync(path, newContent, 'utf8');
            console.log('✅ Cleaned up server.js and restored MongoDB logic.');
        }
    }
} else {
    console.error('❌ Could not find search markers');
    console.log('firstReturnIdx:', firstReturnIdx);
    console.log('apiEndpointIdx:', apiEndpointIdx);
}
