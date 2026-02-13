/**
 * Viral Analysis Routes
 *
 * Description: Video analysis endpoints for viral content analysis
 * Note: This is a partial extraction. More endpoints remain in server.js and should be migrated.
 */

const express = require('express');
const { geminiGenerateJSON } = require('../utils/gemini.util');

const router = express.Router();

// Helper function to save analysis to local archive
function saveToLocalArchive(viralData) {
    const fs = require('fs');
    const path = require('path');

    const archivePath = path.join(__dirname, '../../viral_examples.json');

    try {
        let archive = [];
        if (fs.existsSync(archivePath)) {
            const data = fs.readFileSync(archivePath, 'utf-8');
            archive = JSON.parse(data);
        }

        archive.push(viralData);
        fs.writeFileSync(archivePath, JSON.stringify(archive, null, 2));
        console.log(`[Archive] Saved viral analysis for: ${viralData.title}`);
    } catch (error) {
        console.error('[Archive Error]', error);
    }
}

/**
 * POST /api/analyze-and-save
 * Analyze video for viral factors and save results
 *
 * Request body:
 * - videoId: string - YouTube video ID (required)
 * - title: string - Video title (required)
 * - transcript: string - Video transcript (required)
 * - comments: string - Video comments
 * - viewCount: number - View count
 *
 * Response:
 * - success: boolean
 * - data: Object - Analysis results with viral factors
 */
router.post('/analyze-and-save', async (req, res) => {
    try {
        const { videoId, title, transcript, comments, viewCount } = req.body;

        if (!videoId || !title || !transcript) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: videoId, title, transcript'
            });
        }

        console.log(`[Viral Analysis] Analyzing: ${title}`);

        // 1. Analyze with Gemini
        const analysisPrompt = `
Analyze this YouTube video transcript and comments to identify why it went viral.
Video Title: ${title}
Transcript Summary: ${transcript.slice(0, 1000)}...
Comments Summary: ${comments ? comments.slice(0, 500) : 'N/A'}...

Output purely in JSON format without markdown code blocks:
{
  "hook": "The specific hook used (1 sentence)",
  "structure": "The narrative structure (e.g., Build-up -> Twist -> Climax)",
  "emotion": "The primary emotion targeted (e.g., Outrage, Curiosity, Heartwarming)",
  "viral_reason": "Why this specific combination worked (1-2 sentences)",
  "score": 85 (Estimated viral potential score 0-100)
}
`;

        let viralPoint = {};
        try {
            viralPoint = await geminiGenerateJSON(
                process.env.GEMINI_API_KEY,
                'gemini-2.5-flash',
                [{ text: analysisPrompt }]
            );
        } catch (e) {
            console.error("Gemini Analysis Error:", e);
            viralPoint = { error: "Failed to analyze video with AI" };
        }

        const viralData = {
            id: videoId,
            title,
            viewCount,
            analyzedAt: new Date().toISOString(),
            viralPoint
        };

        // 2. Save to Local JSON
        saveToLocalArchive(viralData);

        // 3. Save to Google Sheets (if available)
        // TODO: Import and use google sheets service
        // const googleSheetsService = require('../services/google_sheets_service');
        // await googleSheetsService.appendRow({ ... });

        return res.json({
            success: true,
            data: viralData
        });

    } catch (error) {
        console.error('[Viral Analysis Error]', error);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/analyze-trends
 * Analyze trending topics and patterns
 *
 * Request body:
 * - videos: Array - Array of video objects to analyze
 * - timeframe: string - Time period for analysis
 *
 * Response:
 * - success: boolean
 * - data: Object - Trend analysis results
 */
router.post('/analyze-trends', async (req, res) => {
    try {
        const { videos, timeframe } = req.body;

        if (!videos || !Array.isArray(videos)) {
            return res.status(400).json({
                success: false,
                error: 'Videos array is required'
            });
        }

        // TODO: Implement trend analysis logic
        // This is a placeholder for the actual implementation

        return res.json({
            success: true,
            data: {
                message: 'Trend analysis endpoint - implementation pending',
                videoCount: videos.length,
                timeframe: timeframe || 'default'
            }
        });

    } catch (error) {
        console.error('[Trend Analysis Error]', error);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
