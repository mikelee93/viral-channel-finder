/**
 * AI Production Pipeline Routes
 * Handles Style Selection and Script Generation
 */

const express = require('express');
const router = express.Router();
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");
const { analyzeVideoUrl } = require('../services/url-analyzer.service');
const { geminiGenerateJSON } = require('../utils/gemini.util');
const HotChannel = require('../../models/HotChannel'); // Adjusted path to root models
const { extractYouTubeId } = require('../services/youtube-analyzer.service');

/**
 * GET /api/production/styles
 * Returns list of available styles (Hot Channels)
 */
router.get('/styles', async (req, res) => {
    try {
        const fs = require('fs');
        const path = require('path');
        const DB_PATH = path.join(__dirname, '../../channel_personas.json'); // Path to Style Lab DB

        // 1. Fetch from MongoDB (HotChannel)
        const mongoStyles = await HotChannel.find({
            'aiAnalysis.strategy': { $exists: true }
        })
            .select('channelId channelTitle categoryName thumbnail aiAnalysis.strategy aiAnalysis.summary')
            .sort({ lastUpdated: -1 })
            .lean();

        // 2. Fetch from JSON File (Style Lab)
        let jsonStyles = [];
        try {
            if (fs.existsSync(DB_PATH)) {
                const data = fs.readFileSync(DB_PATH, 'utf8');
                const personas = JSON.parse(data);

                // Map JSON structure to MongoDB structure
                jsonStyles = personas.map(p => ({
                    channelId: p.id,
                    channelTitle: p.name,
                    categoryName: p.category, // e.g. 'entertainment' (lowercase ID)
                    thumbnail: null, // JSON DB might not have thumbnail stored persistently?
                    aiAnalysis: {
                        strategy: p.analysis, // Takes the whole analysis object
                        summary: p.analysis.summary
                    },
                    isJsonSource: true
                }));
            }
        } catch (e) {
            console.error('[Production] Error reading channel_personas.json', e);
        }

        // 3. Merge & Deduplicate
        const styles = [...mongoStyles, ...jsonStyles];

        // Category Mapping (English -> Korean) matching Hot Channel functions
        const CATEGORY_MAPPING = {
            'Film & Animation': '영화/애니메이션',
            'Autos & Vehicles': '자동차',
            'Music': '음악',
            'Pets & Animals': '반려동물/동물',
            'Sports': '스포츠',
            'Travel & Events': '여행/이벤트',
            'Gaming': '게임',
            'People & Blogs': '인물/블로그',
            'Comedy': '코미디',
            'Entertainment': '엔터테인먼트',
            'News & Politics': '뉴스/정치',
            'Howto & Style': '노하우/스타일',
            'Education': '교육',
            'Science & Technology': '과학기술',
            'Nonprofits & Activism': '비영리/사회운동',
            // Lowercase IDs from Style Lab
            'film': '영화/애니메이션',
            'autos': '자동차',
            'music': '음악',
            'pets': '반려동물/동물',
            'sports': '스포츠',
            'travel': '여행/이벤트',
            'gaming': '게임',
            'people': '인물/블로그',
            'comedy': '코미디',
            'entertainment': '엔터테인먼트',
            'news': '뉴스/정치',
            'howto': '노하우/스타일',
            'education': '교육',
            'tech': '과학기술',
            'nonprofit': '비영리/사회운동',
            'general': '일반'
        };

        // Group by Category
        const stylesByCategory = {};
        styles.forEach(style => {
            const rawCat = style.categoryName || 'General';
            // Translate to Korean if possible, otherwise use raw
            const cat = CATEGORY_MAPPING[rawCat] || rawCat;

            // Normalize "General" fallback
            const finalCat = (cat === 'General') ? '일반' : cat;

            if (!stylesByCategory[finalCat]) stylesByCategory[finalCat] = [];

            // Avoid duplicate IDs
            if (!stylesByCategory[finalCat].find(s => s.id === style.channelId)) {
                stylesByCategory[finalCat].push({
                    id: style.channelId,
                    name: style.channelTitle,
                    thumbnail: style.thumbnail,
                    strategy: style.aiAnalysis?.strategy, // Use strategy properly
                    summary: style.aiAnalysis?.summary
                });
            }
        });

        res.json({ success: true, styles: stylesByCategory });

    } catch (error) {
        console.error('[Production API] Error fetching styles:', error);
        res.status(500).json({ error: 'Failed to load styles' });
    }
});

/**
 * POST /api/production/generate
 * Generates AI Script based on Source Video and Selected Style
 */
router.post('/generate', async (req, res) => {
    try {
        const { sourceUrl, styleId, transcriptText } = req.body;

        if ((!sourceUrl && !transcriptText) || !styleId) {
            return res.status(400).json({ error: 'Source URL (or Transcript) and Style ID are required' });
        }

        console.log(`[Production] Generating script using style ${styleId}`);

        // 1. Get Source Transcript
        let finalTranscript = '';
        let sourceMetadata = {};

        if (transcriptText) {
            // Case A: Transcript provided directly (from Local File Whisper)
            finalTranscript = transcriptText;
            sourceMetadata = { title: 'Local File Upload' };
        } else {
            // Case B: URL provided (YouTube)
            try {
                const sourceAnalysis = await analyzeVideoUrl(sourceUrl);
                if (!sourceAnalysis.transcript) {
                    return res.status(400).json({ error: 'No transcript found for this video.' });
                }
                finalTranscript = sourceAnalysis.transcript;
                sourceMetadata = {
                    title: sourceAnalysis.metadata?.title,
                    thumbnail: 'https://img.youtube.com/vi/' + extractYouTubeId(sourceUrl) + '/maxresdefault.jpg'
                };
            } catch (err) {
                return res.status(400).json({ error: `Video Analysis Failed: ${err.message}` });
            }
        }

        // 2. Fetch Selected Style Data
        let styleChannel = await HotChannel.findOne({ channelId: styleId }).lean();

        // Fallback: Check Style Lab JSON (channel_personas.json)
        if (!styleChannel) {
            try {
                const fs = require('fs');
                const path = require('path');
                const DB_PATH = path.join(__dirname, '../../channel_personas.json');

                if (fs.existsSync(DB_PATH)) {
                    const data = fs.readFileSync(DB_PATH, 'utf8');
                    const personas = JSON.parse(data);
                    const found = personas.find(p => p.id === styleId);

                    if (found) {
                        console.log(`[Production] Found style in Style Lab File: ${found.name}`);
                        // Map JSON to MongoDB structure expected below
                        styleChannel = {
                            channelTitle: found.name,
                            thumbnail: null, // Fallback
                            aiAnalysis: {
                                strategy: {
                                    persona: found.analysis.prompt_instruction, // Map 'prompt_instruction' to 'persona'
                                    tone: found.analysis.tone,
                                    hooks: found.analysis.hook_style,
                                    director_rules: found.analysis.director_rules,
                                    structure_template: found.analysis.structure_template
                                }
                            }
                        };
                    }
                }
            } catch (e) {
                console.error('[Production] Error checking Style Lab file:', e);
            }
        }

        if (!styleChannel) {
            return res.status(404).json({ error: 'Style Channel not found' });
        }

        // 3. Construct Gemini Prompt
        const stylePersona = styleChannel.aiAnalysis?.strategy?.persona || 'A witty and engaging narrator';
        const styleTone = styleChannel.aiAnalysis?.strategy?.tone || 'Energetic and fast-paced';
        const styleHooks = styleChannel.aiAnalysis?.strategy?.hooks || 'Ask a surprising question';
        const directorRules = JSON.stringify(styleChannel.aiAnalysis?.strategy?.director_rules || []);
        const structureTemplate = JSON.stringify(styleChannel.aiAnalysis?.strategy?.structure_template || []);

        const prompt = `
        Role: You are a professional YouTube Shorts Director mirroring a specific Creator Persona.
        
        Target Persona:
        - Name: ${styleChannel.channelTitle}
        - Tone: ${styleTone}
        - Style: ${stylePersona}
        - Hook Strategy: ${styleHooks}
        - Director Rules: ${directorRules}
        - Structure Template: ${structureTemplate}

        Task: 
        Rewrite the following source video transcript into a new Viral Shorts Script adhering strictly to the Target Persona's style.
        The output must be a "Full Shorts Processing" script that transforms the source into a high-retention short.
        
        Processing Guidelines:
        1. **Plot Analysis**: Understand the twist and irony of the source.
        2. **Persona Voice**: Apply the specific tone (e.g. cynical, detached, excited) to the narration.
        3. **Dialogue Translation**: If characters speak, translate their lines to natural Japanese dialogue (do not summarize them as narration unless appropriate).
        4. **Structure**: Follow the 'Structure Template' (e.g. Hook -> Twist -> Punchline).
        5. **Ending (CTA)**: MUST end with a strong Call To Action (CTA) or question to the audience to induce comments (e.g., "What would you do?").

        Source Transcript:
        "${finalTranscript.slice(0, 6000)}" 

        Output Requirements:
        1. **Title**: Catchy, viral title in Korean.
        2. **Timeline**: 00:00 - 00:60 (Max 60 sec).
        3. **Script Content**:
           - "section": Hook / Body / Twist / Conclusion / CTA
           - "type": Narration (Narrator) or Dialogue (Character)
           - "text_jp": Natural Japanese line.
           - "text_pron": Japanese Pronunciation in Romanji or Hangul.
           - "text_kr": Korean Translation.
           - "sfx": Specific sound effect cue.
           - "visual_cue": Camera direction.

        Output Format (JSON):
        {
          "title": "Viral Title (KR)",
          "bgm_mood": "Mood description",
          "keywords": ["#Shorts", "#Keyword"],
          "script": [
            {
              "time": "00:00",
              "section": "Hook",
              "type": "Narration",
              "speaker": "Narrator",
              "text_jp": "...",
              "text_pron": "...",
              "text_kr": "...",
              "sfx": "Boom",
              "visual_cue": "Close up"
            }
          ]
        }
        `;

        // 4. Call Gemini (Direct Client with Stability Settings)
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({
            model: "gemini-2.5-flash",
            generationConfig: {
                maxOutputTokens: 65536,
                temperature: 0.7,
                responseMimeType: "application/json"
            },
            safetySettings: [
                { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
                { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
                { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
                { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
            ]
        }, {
            timeout: 1800000 // 30 mins timeout
        });

        const result = await model.generateContent([prompt]);
        const responseText = result.response.text();

        let scriptJson;
        try {
            // Direct JSON parse since responseMimeType is set
            scriptJson = JSON.parse(responseText);
        } catch (e) {
            console.warn('[Production] ⚠️ JSON Parse Failed. Attempting Truncation Repair...');
            const jsonStr = responseText;
            const lastSegmentEnd = jsonStr.lastIndexOf('},');

            if (lastSegmentEnd !== -1) {
                const repairedJson = jsonStr.substring(0, lastSegmentEnd + 1) + '] }';
                try {
                    scriptJson = JSON.parse(repairedJson);
                    console.log('[Production] 🔧 JSON Repaired Successfully!');
                } catch (repairError) {
                    console.error('[Production] ❌ Repair Failed:', repairError);
                    throw e;
                }
            } else {
                throw e;
            }
        }

        console.log('[Production] Script Generated Successfully');

        res.json({
            success: true,
            data: result,
            sourceMetadata,
            styleMetadata: {
                name: styleChannel.channelTitle,
                thumbnail: styleChannel.thumbnail
            }
        });

    } catch (error) {
        console.error('[Production API] Generate Error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
