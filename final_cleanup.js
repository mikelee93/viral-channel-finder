const fs = require('fs');

const path = 'server.js';
let content = fs.readFileSync(path, 'utf8');

// The goal is to replace the entire discoverHotChannels function area with a fresh, correct version.
const startMarker = '// Discover HOT channels';
const endMarker = "app.post('/api/hot-channels'";

const startIdx = content.indexOf(startMarker);
const endIdx = content.indexOf(endMarker);

if (startIdx !== -1 && endIdx !== -1) {
    const freshFunction = `// Discover HOT channels from trending or search
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
                            } catch (err) { }
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
                            estimatedRevenue: Math.floor((parseInt(channel.statistics.viewCount) || 0) / 1000 * 201 / 30)
                        });
                    }
                }
            }
        }

        console.log(\`[HOT Discovery] Discovered \${discoveredChannels.length} HOT channels\`);

        // 5. Save to MongoDB
        const HotChannel = require('./models/HotChannel');
        for (const channel of discoveredChannels) {
            await HotChannel.findOneAndUpdate(
                { channelId: channel.channelId },
                {
                    channelId: channel.channelId,
                    channelTitle: channel.name,
                    subscriberCount: channel.subscribers,
                    totalViews: channel.totalViews,
                    viewCount: channel.totalViews,
                    videoCount: channel.videoCount,
                    categoryName: channel.category,
                    recentVideos: channel.recentVideos,
                    avgViewsPerVideo: Math.floor(channel.totalViews / Math.max(1, channel.videoCount)),
                    estimatedRevenue: channel.estimatedRevenue.toString(),
                    lastUpdated: new Date()
                },
                { upsert: true, new: true }
            );
        }

        console.log('[HOT Discovery] Saved to MongoDB');
        return discoveredChannels;
    } catch (error) {
        console.error('[HOT Discovery] Error:', error);
        throw error;
    }
}

`;

    // Replace everything between startIdx and endIdx
    const finalContent = content.substring(0, startIdx) + freshFunction + content.substring(endIdx);
    fs.writeFileSync(path, finalContent, 'utf8');
    console.log('✅ COMPLETELY REWRITTEN discoverHotChannels and fixed all SyntaxErrors!');
} else {
    console.log('❌ Could not find markers');
}
