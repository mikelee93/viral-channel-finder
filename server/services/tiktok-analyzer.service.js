/**
 * TikTok 영상 분석 서비스 (CommonJS)
 * 
 * 역할: TikTok 영상의 메타데이터, 자막(텍스트) 추출
 * 패턴: YouTube analyzer와 동일한 구조
 */

async function analyzeTikTokVideo(url) {
    const videoId = extractTikTokId(url);

    // 기존 /api/analyze-social 엔드포인트 활용
    // TikTok은 Apify를 통해 메타데이터와 텍스트를 가져옴
    const result = await fetchTikTokData(url);

    return {
        platform: 'tiktok',
        videoId,
        videoUrl: url,
        transcript: result.transcript || result.text || '자막을 가져올 수 없습니다',
        metadata: {
            title: result.title || videoId,
            author: result.author || 'Unknown',
            views: result.viewCount || 0,
            likes: result.likeCount || 0
        },
        comments: result.comments || [],
        errors: result.errors || []
    };
}

/**
 * TikTok URL에서 비디오 ID 추출
 * @param {string} url 
 * @returns {string} 비디오 ID
 */
function extractTikTokId(url) {
    // TikTok URL 형식: https://www.tiktok.com/@username/video/7449895905123241246
    const match = url.match(/\/video\/(\d+)/);

    if (match) {
        return match[1];
    }

    throw new Error('Invalid TikTok URL format');
}

/**
 * TikTok 데이터 가져오기 (Apify 활용)
 * @param {string} url 
 * @returns {Promise<Object>}
 */
async function fetchTikTokData(url) {
    // 기존 server.js의 Apify 로직을 재사용
    const { ApifyClient } = require('apify-client');
    const APIFY_TOKEN = process.env.APIFY_TOKEN;

    if (!APIFY_TOKEN) {
        throw new Error('APIFY_TOKEN is not configured');
    }

    const client = new ApifyClient({ token: APIFY_TOKEN });

    try {
        console.log('[TikTok Analyzer] Starting Apify scraper...');

        const actorId = 'clockworks/free-tiktok-scraper';
        const input = {
            "postURLs": [url],
            "commentsPerVideo": 20,
            "shouldDownloadVideos": false,
            "shouldDownloadCovers": false,
            "shouldDownloadSlideshowImages": false
        };

        const run = await client.actor(actorId).call(input);
        const { items } = await client.dataset(run.defaultDatasetId).listItems();

        if (!items || items.length === 0) {
            throw new Error('No data returned from TikTok scraper');
        }

        const item = items[0];

        // 댓글 처리
        let comments = [];
        if (item.commentsDatasetUrl) {
            try {
                const datasetIdMatch = item.commentsDatasetUrl.match(/datasets\/([a-zA-Z0-9]+)/);
                if (datasetIdMatch && datasetIdMatch[1]) {
                    const commentsData = await client.dataset(datasetIdMatch[1]).listItems({ limit: 50 });
                    if (commentsData.items && commentsData.items.length > 0) {
                        comments = commentsData.items.map(c => c.text).filter(t => t);
                    }
                }
            } catch (err) {
                console.warn('[TikTok] Failed to fetch comments:', err);
            }
        }

        return {
            transcript: item.text || item.desc || '',
            text: item.text || item.desc || '',
            title: item.text || item.desc || 'TikTok Video',
            author: item.authorMeta?.nickName || item.authorMeta?.name || 'Unknown',
            viewCount: item.playCount || 0,
            likeCount: item.diggCount || 0,
            comments: comments,
            errors: []
        };

    } catch (error) {
        console.error('[TikTok Analyzer] Error:', error);
        throw new Error(`TikTok 영상 분석 실패: ${error.message}`);
    }
}

module.exports = { analyzeTikTokVideo, extractTikTokId };
