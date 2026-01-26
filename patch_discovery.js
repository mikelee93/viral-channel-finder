const fs = require('fs');

const path = 'server.js';
let content = fs.readFileSync(path, 'utf8');

const newFunction = `// Discover HOT channels from trending or search
async function discoverHotChannels(contentType = 'shorts', maxChannels = 50) {
    try {
        console.log(\`[HOT Discovery] Starting discovery for: \${contentType}\`);

        let targetVideos = [];

        if (contentType === 'shorts') {
            // Use search for shorts to guarantee results
            const searchQuery = encodeURIComponent('#shorts #쇼츠');
            const searchUrl = \`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoDuration=short&q=\${searchQuery}&regionCode=KR&relevanceLanguage=ko&maxResults=50&order=viewCount&key=\${getYouTubeApiKey()}\`;
            
            console.log('[HOT Discovery] Fetching via Search API...');
            const { data: searchData } = await fetchWithKeyRotation(searchUrl);
            
            if (searchData.items) {
                const videoIds = searchData.items.map(item => item.id.videoId).filter(Boolean);
                if (videoIds.length > 0) {
                    const videoUrl = \`https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id=\${videoIds.join(',')}&key=\${getYouTubeApiKey()}\`;
                    const { data: videoData } = await fetchWithKeyRotation(videoUrl);
                    targetVideos = videoData.items || [];
                }
            }
        } else {
            // Use trending for long form
            const trendingUrl = \`https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&chart=mostPopular&regionCode=KR&maxResults=50&key=\${getYouTubeApiKey()}\`;
            console.log('[HOT Discovery] Fetching via Trending API...');
            const { data: trendingData } = await fetchWithKeyRotation(trendingUrl);
            targetVideos = trendingData.items || [];
        }

        if (targetVideos.length === 0) {
            console.warn('[HOT Discovery] No videos found to analyze');
            return [];
        }

        console.log(\`[HOT Discovery] Analyzing \${targetVideos.length} candidate videos\`);

        // 2. Filter by exact content type
        const filteredVideos = targetVideos.filter(video => {
            const duration = video.contentDetails.duration;
            let totalSeconds = 0;
            const hours = duration.match(/(\\d+)H/);
            const mins = duration.match(/(\\d+)M/);
            const secs = duration.match(/(\\d+)S/);
            if (hours) totalSeconds += parseInt(hours[1]) * 3600;
            if (mins) totalSeconds += parseInt(mins[1]) * 60;
            if (secs) totalSeconds += parseInt(secs[1]);
            
            const isShort = totalSeconds > 0 && totalSeconds <= 60;
            return contentType === 'shorts' ? isShort : !isShort;
        });

        console.log(\`[HOT Discovery] \${filteredVideos.length} \${contentType} videos matched duration filter\`);

        // 3. Get unique channel IDs
        const channelIds = [...new Set(filteredVideos.map(v => v.snippet.channelId))];

        // 4. Fetch channel details
        const discoveredChannels = [];

        for (let i = 0; i < channelIds.length; i += 50) {
            const batch = channelIds.slice(i, i + 50);
            const channelUrl = \`https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&id=\${batch.join(',')}&key=\${getYouTubeApiKey()}\`;
            const { data: channelData } = await fetchWithKeyRotation(channelUrl);

            if (channelData.items) {
                for (const channel of channelData.items) {
                    const hotScore = calculateHotScore(channel);

                    if (hotScore >= 1.0) { 
                        const uploadsPlaylistId = channel.contentDetails?.relatedPlaylists?.uploads;
                        let recentVideos = [];
                        
                        if (uploadsPlaylistId) {
                            try {
                                const videosUrl = \`https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=\${uploadsPlaylistId}&maxResults=5&key=\${getYouTubeApiKey()}\`;
                                const { data: videosData } = await fetchWithKeyRotation(videosUrl);
                                recentVideos = (videosData.items || []).map(v => ({
                                    videoId: v.contentDetails.videoId,
                                    title: v.snippet.title,
                                    thumbnail: v.snippet.thumbnails?.medium?.url || v.snippet.thumbnails?.default?.url || '',
                                    publishedAt: v.snippet.publishedAt
                                }));
                            } catch (err) {
                                console.warn(\`Failed to fetch videos for \${channel.id}\`);
                            }
                        }

                        discoveredChannels.push({
                            channelId: channel.id,
                            name: channel.snippet.title,
                            thumbnail: channel.snippet.thumbnails?.medium?.url || channel.snippet.thumbnails?.default?.url || '',
                            subscribers: parseInt(channel.statistics.subscriberCount) || 0,
                            totalViews: parseInt(channel.statistics.viewCount) || 0,
                            videoCount: parseInt(channel.statistics.videoCount) || 0,
                            category: '엔터테인먼트',
                            recentVideos,
                            hotScore,
                            dailyGrowth: Math.floor((parseInt(channel.statistics.viewCount) || 0) / 365),
                            estimatedRevenue: Math.floor((parseInt(channel.statistics.viewCount) || 0) / 1000 * 200 / 30)
                        });
                    }
                }
            }
        }

        console.log(\`[HOT Discovery] Discovered \${discoveredChannels.length} HOT channels\`);
        return discoveredChannels;
    } catch (error) {
        console.error('[HOT Discovery] Error:', error);
        throw error;
    }
}`;

// Use regex to locate the old function and replace it
// This matches from async function discoverHotChannels down to the return discoveredChannels; line or similar
const functionStartIdx = content.indexOf('async function discoverHotChannels');
const endMarker = 'console.log(`[HOT Discovery] Discovered ${discoveredChannels.length} HOT channels`);';
const endMarkerIdx = content.indexOf(endMarker);

if (functionStartIdx !== -1 && endMarkerIdx !== -1) {
    // Find the next two } after endMarkerIdx to close the function
    let closingIdx = endMarkerIdx + endMarker.length;
    let foundBraces = 0;
    while (foundBraces < 2 && closingIdx < content.length) {
        if (content[closingIdx] === '}') foundBraces++;
        closingIdx++;
    }

    const oldPart = content.substring(functionStartIdx, closingIdx);
    content = content.replace(oldPart, newFunction);
    fs.writeFileSync(path, content, 'utf8');
    console.log('✅ Successfully patched discoverHotChannels in server.js');
} else {
    console.error('❌ Could not find function boundaries in server.js');
    console.log('functionStartIdx:', functionStartIdx);
    console.log('endMarkerIdx:', endMarkerIdx);
}
