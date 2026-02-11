const { geminiGenerateJSON } = require('./gemini.util');

/**
 * Analyzes a channel's strategy and reasons for selection using Gemini.
 * @param {Object} channelData - The channel data object including statistics and recent videos
 * @param {string} apiKey - Gemini API Key
 * @returns {Promise<Object>} - JSON containing analysis result
 */
async function analyzeChannelStrategy(channelData, apiKey) {
    if (!apiKey) {
        throw new Error('Gemini API Key is missing');
    }

    const recentVideosSummary = (channelData.recentVideos || [])
        .slice(0, 5)
        .map(v => `- "${v.title}" (${v.viewCount || 0} views)`)
        .join('\n');

    const prompt = `
Analyze this YouTube channel's Shorts content to explain why it's a good candidate for benchmarking and what its Shorts strategy is.

Channel Name: ${channelData.channelTitle || channelData.name}
Subscribers: ${channelData.subscriberCount || channelData.subscribers}
Total Views: ${channelData.viewCount || channelData.totalViews}
Recent Shorts:
${recentVideosSummary}

Please provide the output in JSON format with the following structure (Keep the text in Korean):
{
  "reason_for_selection": "Why this channel is worth analyzing for Shorts (emphasize hook, pacing, or specific niche success). 1-2 sentences.",
  "shorts_strategy": "What seems to be their Shorts strategy (e.g., visual hooks, looping, text overlays, sound design). Bullet points or a short paragraph."
}
`;

    try {
        const analysis = await geminiGenerateJSON(apiKey, 'gemini-2.5-flash', [{ text: prompt }]);
        return analysis;
    } catch (error) {
        console.error('[Channel Analyzer] Gemini Error:', error);
        return {
            reason_for_selection: "AI 분석 중 오류가 발생했습니다.",
            long_term_strategy: "잠시 후 다시 시도해주세요."
        };
    }
}

module.exports = { analyzeChannelStrategy };
