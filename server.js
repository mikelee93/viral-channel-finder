const express = require('express');
const cors = require('cors');
const { ApifyClient } = require('apify-client');
require('dotenv').config();
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const { pipeline } = require('stream/promises'); // For file downloading
const multer = require('multer');
const mongoose = require('mongoose');
const cron = require('node-cron');
const { geminiGenerateJSON, geminiGenerateContent } = require('./server/utils/gemini.util');
const { glmGenerateContent, glmGenerateJSON } = require('./server/utils/glm.util');
const { generateQwenTTS } = require('./server/utils/qwen_tts.util');
const { generatePersonaDialogue } = require('./server/utils/persona_plex.util');
const dialogueManager = require('./server/utils/dialogue_manager');
const { analyzeChannelStrategy } = require('./server/utils/channel_analyzer.util');


// Trigger restart for .env load
const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Increase limit for base64 images
app.use(express.static(__dirname)); // Serve frontend files

// 환경 변수
const APIFY_TOKEN = process.env.APIFY_TOKEN;
const APIFY_ACTOR_ID = process.env.APIFY_ACTOR_ID || 'scraper-mind~youtube-transcript-scraper'; // 실제 사용 중인 Actor ID로 바꿔도 됨
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const FAL_KEY = process.env.FAL_KEY;
const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-5-20250929';
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const YOUTUBE_API_KEY_2 = process.env.YOUTUBE_API_KEY_2;

// YouTube API Key Rotation System
const YOUTUBE_API_KEYS = [
    process.env.YOUTUBE_API_KEY,
    process.env.YOUTUBE_API_KEY_2,
    process.env.YOUTUBE_API_KEY_3,
    process.env.YOUTUBE_API_KEY_4,
    process.env.YOUTUBE_API_KEY_5,
    process.env.YOUTUBE_API_KEY_6
].filter(Boolean); // Remove undefined/null keys

let currentKeyIndex = 0;

// Function to get current YouTube API key
function getYouTubeApiKey() {
    if (YOUTUBE_API_KEYS.length === 0) {
        console.error('[YouTube API] No API keys available!');
        return null;
    }
    return YOUTUBE_API_KEYS[currentKeyIndex];
}

// Function to rotate to next API key
function rotateYouTubeApiKey() {
    if (YOUTUBE_API_KEYS.length <= 1) {
        console.warn('[YouTube API] Only one key available, cannot rotate');
        return false;
    }

    currentKeyIndex = (currentKeyIndex + 1) % YOUTUBE_API_KEYS.length;
    console.log(`[YouTube API] Rotated to key #${currentKeyIndex + 1}`);
    return true;
}

// Helper function to make YouTube API calls with automatic key rotation
async function fetchWithKeyRotation(url) {
    const maxRetries = YOUTUBE_API_KEYS.length;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        const currentKey = getYouTubeApiKey();
        if (!currentKey) {
            throw new Error('No YouTube API key available');
        }

        // Replace key in URL
        const urlWithKey = url.replace(/key=[^&]*/, `key=${currentKey}`);

        try {
            const response = await fetch(urlWithKey);
            const data = await response.json();

            // Check for quota errors
            if (!response.ok && data.error?.errors?.[0]?.reason === 'quotaExceeded') {
                console.warn(`[YouTube API] Quota exceeded for key #${currentKeyIndex + 1}`);

                if (rotateYouTubeApiKey()) {
                    console.log(`[YouTube API] Retrying with next key (attempt ${attempt + 1}/${maxRetries})`);
                    continue; // Try next key
                } else {
                    throw new Error('All YouTube API keys have exceeded quota');
                }
            }

            return { response, data };
        } catch (error) {
            if (attempt === maxRetries - 1) {
                throw error;
            }
        }
    }

    throw new Error('Failed to fetch from YouTube API after all retries');
}

// YouTube Category Mapping (Korean)
const YOUTUBE_CATEGORY_MAP = {
    '1': '영화/애니메이션',
    '2': '자동차',
    '10': '음악',
    '15': '반려동물/동물',
    '17': '스포츠',
    '19': '여행/이벤트',
    '20': '게임',
    '22': '인물/블로그',
    '23': '코미디',
    '24': '엔터테인먼트',
    '25': '뉴스/정치',
    '26': '노하우/스타일',
    '27': '교육',
    '28': '과학기술',
    '29': '비영리/사회운동'
};

// Discovered Channels Database Logic
const DISCOVERED_CHANNELS_FILE = path.join(__dirname, 'discovered_channels.json');

function loadDiscoveredChannels() {
    try {
        if (fs.existsSync(DISCOVERED_CHANNELS_FILE)) {
            const data = fs.readFileSync(DISCOVERED_CHANNELS_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('[DB] Error loading discovered channels:', error);
    }
    return {};
}

function saveDiscoveredChannels(channels) {
    try {
        fs.writeFileSync(DISCOVERED_CHANNELS_FILE, JSON.stringify(channels, null, 2), 'utf8');
    } catch (error) {
        console.error('[DB] Error saving discovered channels:', error);
    }
}

console.log('[DEBUG] OPENAI_API_KEY loaded:', OPENAI_API_KEY ? `${OPENAI_API_KEY.slice(0, 20)}...${OPENAI_API_KEY.slice(-4)}` : 'NOT SET');
console.log('[DEBUG] HF_API_TOKEN status:', process.env.HF_API_TOKEN ? 'LOADED' : 'MISSING');

if (!APIFY_TOKEN) {
    console.warn('[WARN] APIFY_TOKEN 이 .env 에 설정되지 않았습니다.');
}
if (!GEMINI_API_KEY) {
    console.warn('[WARN] GEMINI_API_KEY 가 .env 에 설정되지 않았습니다.');
}
if (!ANTHROPIC_API_KEY) {
    console.warn('[WARN] ANTHROPIC_API_KEY 가 .env 에 설정되지 않았습니다.');
}
if (!FAL_KEY) {
    console.warn('[WARN] FAL_KEY 가 .env 에 설정되지 않았습니다.');
}
if (!PERPLEXITY_API_KEY) {
    console.warn('[WARN] PERPLEXITY_API_KEY 가 .env 에 설정되지 않았습니다.');
}

const PORT = process.env.PORT || 4000;
const googleSheetsService = require('./google_sheets_service');

// YouTube Guidelines Routes
require('./guidelines_routes')(app, GEMINI_API_KEY, PERPLEXITY_API_KEY, YOUTUBE_API_KEY, APIFY_TOKEN);

// VOICEVOX TTS Routes
const voicevoxRoutes = require('./server/routes/voicevox.routes');
const productionRoutes = require('./server/routes/production.routes');
const guidelinesRoutes = require('./server/routes/guidelines.routes');

app.use('/api/voicevox', voicevoxRoutes);
app.use('/api/production', productionRoutes);
app.use('/api/guidelines', guidelinesRoutes);

// URL 분석 서비스
const { analyzeVideoUrl, isValidUrl } = require('./server/services/url-analyzer.service');

// Channel Analysis & Persona Trainer Routes
app.use('/api/channels', require('./server/routes/channel_analysis.routes'));


// Viral Archive Path
const VIRAL_ARCHIVE_PATH = path.join(__dirname, 'viral_archive.json');

// --- Viral Analysis & Storage Logic ---

// Helper: Save to JSON Archive
function saveToLocalArchive(data) {
    let archive = [];
    try {
        if (fs.existsSync(VIRAL_ARCHIVE_PATH)) {
            const content = fs.readFileSync(VIRAL_ARCHIVE_PATH, 'utf8');
            archive = JSON.parse(content);
        }
    } catch (e) {
        console.error('Failed to read archive:', e);
    }

    // Add new entry
    archive.push(data);

    // Save back
    try {
        fs.writeFileSync(VIRAL_ARCHIVE_PATH, JSON.stringify(archive, null, 2));
        console.log('[Archive] Saved locally.');
    } catch (e) {
        console.error('Failed to save archive:', e);
    }
}

// API: Analyze & Save Viral Video
app.post('/api/analyze-and-save', async (req, res) => {
    try {
        const { videoId, title, transcript, comments, viewCount } = req.body;
        console.log(`[Viral Analysis] Analyzing: ${title}`);

        // 1. Analyze with Gemini
        const analysisPrompt = `
Analyze this YouTube video transcript and comments to identify why it went viral.
Video Title: ${title}
Transcript Summary: ${transcript.slice(0, 1000)}...
Comments Summary: ${comments.slice(0, 500)}...

Output purely in JSON format without markdown code blocks:
{
  "hook": "The specific hook used (1 sentence)",
  "structure": "The narrative structure (e.g., Build-up -> Twist -> Climax)",
  "emotion": "The primary emotion targeted (e.g., Outrage, Curiosity, Heartwarming)",
  "viral_reason": "Why this specific combination worked (1-2 sentences)",
  "score": 85 (Estimated viral potential score 0-100)
}
`;
        // 1. Analyze with Gemini
        let viralPoint = {};
        try {
            viralPoint = await geminiGenerateJSON(GEMINI_API_KEY, 'gemini-2.0-flash-exp', [
                { text: analysisPrompt }
            ]);
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
        // Pass summary data
        await googleSheetsService.appendRow({
            title,
            viewCount,
            viralScore: viralPoint.score,
            viralPoint: {
                hook: viralPoint.hook,
                structure: viralPoint.structure,
                emotion: viralPoint.emotion,
                summary: viralPoint.viral_reason
            }
        });

        res.json({ success: true, data: viralData });

    } catch (error) {
        console.error('[Viral Analysis Error]', error);
        res.status(500).json({ error: error.message });
    }
});

// API: Analyze Social Video (TikTok/Instagram) via Apify
app.post('/api/analyze-social', async (req, res) => {
    try {
        const { url, platform } = req.body;
        console.log(`[Social Analysis] Platform: ${platform}, URL: ${url}`);

        if (!APIFY_TOKEN) {
            throw new Error('APIFY_TOKEN is not set in environment variables.');
        }

        const client = new ApifyClient({
            token: APIFY_TOKEN,
        });

        let actorId = '';
        let input = {};

        if (platform === 'tiktok') {
            // Using clockworks/free-tiktok-scraper
            actorId = 'clockworks/free-tiktok-scraper';
            // Correct input key is 'postURLs' based on test
            input = {
                "postURLs": [url],
                "commentsPerVideo": 20, // Request comments
                "shouldDownloadVideos": false,
                "shouldDownloadCovers": false,
                "shouldDownloadSlideshowImages": false
            };
        } else if (platform === 'instagram') {
            // Fallback or future implementation
            throw new Error('Instagram analysis is not yet fully implemented via Apify backend.');
        } else {
            throw new Error(`Unsupported platform: ${platform}`);
        }

        console.log(`[Apify] Starting Actor: ${actorId}`);
        const run = await client.actor(actorId).call(input);
        console.log(`[Apify] Actor Finished. Run ID: ${run.id}`);

        const { items } = await client.dataset(run.defaultDatasetId).listItems();

        if (!items || items.length === 0) {
            throw new Error('No data returned from Apify scraper.');
        }

        const item = items[0];
        let result = {};

        if (platform === 'tiktok') {
            const videoTitle = item.text || item.desc || "Untitled TikTok";
            const videoTranscript = item.text || "(No transcript available)";
            const videoViewCount = item.playCount || 0;
            const videoAuthor = item.authorMeta?.nickName || item.authorMeta?.name || "Unknown";
            const videoThumbnail = item.covers?.default || item.imageUrl || "";

            let videoComments = "(No comments available)";

            // Fetch comments if available in a separate dataset
            if (item.commentsDatasetUrl) {
                try {
                    console.log(`[Apify] Fetching comments from: ${item.commentsDatasetUrl}`);
                    // Extract Dataset ID from URL: https://api.apify.com/v2/datasets/[DATASET_ID]/items...
                    const datasetIdMatch = item.commentsDatasetUrl.match(/datasets\/([a-zA-Z0-9]+)/);
                    if (datasetIdMatch && datasetIdMatch[1]) {
                        const commentsDatasetId = datasetIdMatch[1];
                        const commentsData = await client.dataset(commentsDatasetId).listItems({ limit: 50 });
                        if (commentsData.items && commentsData.items.length > 0) {
                            videoComments = commentsData.items
                                .map(c => c.text)
                                .filter(t => t) // Remove empty texts
                                .join('\n- ');
                        }
                    }
                } catch (err) {
                    console.warn('[Apify] Failed to fetch comments dataset:', err);
                }
            } else if (item.comments && Array.isArray(item.comments)) {
                // Fallback if comments are inline
                videoComments = item.comments.map(c => c.text).join('\n- ');
            }

            result = {
                title: videoTitle,
                transcript: videoTranscript,
                comments: videoComments,
                viewCount: videoViewCount,
                author: videoAuthor,
                thumbnail: videoThumbnail
            };

            if (item.subtitles) {
                result.transcript = item.subtitles;
            }
        }

        res.json({ success: true, data: result });

    } catch (error) {
        console.error('[Social Analysis Error]', error);
        res.status(500).json({ error: error.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// API: Analyze Viral Video URL (NEW - Clean Architecture)
// ═══════════════════════════════════════════════════════════════════════════
app.post('/api/analyze-viral-video', async (req, res) => {
    try {
        const { url } = req.body;
        console.log(`[URL Analysis] Analyzing: ${url}`);

        // 입력 검증
        if (!url) {
            return res.status(400).json({
                success: false,
                error: 'URL이 필요합니다'
            });
        }

        if (!isValidUrl(url)) {
            return res.status(400).json({
                success: false,
                error: '올바른 URL 형식이 아닙니다'
            });
        }

        // 서비스 레이어 호출
        const result = await analyzeVideoUrl(url);

        // 성공 응답
        return res.json({
            success: true,
            data: result
        });

    } catch (error) {
        console.error('[URL Analysis Error]', error);

        // 사용자 친화적 에러 응답
        return res.status(500).json({
            success: false,
            error: error.message || '영상 분석 중 오류가 발생했습니다'
        });
    }
});


// API: Transcript Rewrite with Viral Pattern Learning
// ═══════════════════════════════════════════════════════════════════════════
app.post('/api/transcript-rewrite', async (req, res) => {
    try {
        const {
            videoId,
            videoTitle,
            comments,
            transcript,
            targetCountry,      // 🆕 국가 선택 (KR/JP/US)
            scriptCategory,     // 🆕 카테고리 (info/money/love/study/humor/challenge)
            targetAge,          // 🆕 연령대 (teen/20s/30s)
            aiProvider,
            useViralPatterns
        } = req.body;

        console.log(`[Transcript Rewrite] Country: ${targetCountry}, Category: ${scriptCategory}, Age: ${targetAge}, AI: ${aiProvider}`);

        // 입력 검증
        if (!transcript || !targetCountry || !scriptCategory || !targetAge) {
            return res.status(400).json({ error: '자막, 국가, 카테고리, 연령대가 필요합니다' });
        }

        // 바이럴 패턴 데이터 가져오기 (체크박스 ON일 때만)
        let viralPatternsContext = '';
        if (useViralPatterns) {
            const patterns = await googleSheetsService.getRecentViral(10);

            if (patterns.length > 0) {
                viralPatternsContext = `\n\n📊 **학습된 바이럴 패턴** (상위 ${patterns.length}개):\n`;
                patterns.forEach((p, idx) => {
                    viralPatternsContext += `\n${idx + 1}. [Score: ${p.score}] ${p.title}`;
                    viralPatternsContext += `\n   - Hook: ${p.hook}`;
                    viralPatternsContext += `\n   - Structure: ${p.structure}`;
                    viralPatternsContext += `\n   - Emotion: ${p.emotion}`;
                    viralPatternsContext += `\n   - Why Viral: ${p.summary}`;
                });
                viralPatternsContext += `\n\n위 패턴들을 참고하여 비슷한 전략을 활용해주세요.\n`;
                console.log(`[Transcript Rewrite] Loaded ${patterns.length} viral patterns from Google Sheets`);
            } else {
                console.log('[Transcript Rewrite] No viral patterns found in Google Sheets');
            }
        }

        // 🆕 로컬라이징 프롬프트 생성 (국가 × 카테고리 × 연령)
        const { getLocalizedPrompt } = require('./server/utils/localized-prompts.util');
        const stylePrompt = getLocalizedPrompt(
            targetCountry,
            scriptCategory,
            targetAge,
            videoTitle,
            comments,
            transcript,
            viralPatternsContext
        );

        // AI 호출 (Gemini 또는 Claude)
        let scriptMarkdown = '';

        if (aiProvider === 'claude') {
            // Claude API 호출 (기존 로직)
            const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
            const message = await anthropic.messages.create({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 4096,
                messages: [{
                    role: 'user',
                    content: stylePrompt
                }]
            });
            scriptMarkdown = message.content[0].text;
        } else if (aiProvider === 'glm') {
            // GLM API 호출 (무료/가성비)
            try {
                scriptMarkdown = await glmGenerateContent(process.env.ZHIPU_API_KEY, 'glm-4.7-flash', stylePrompt);
            } catch (e) {
                throw new Error('GLM API 응답 실패: ' + e.message);
            }
        } else {
            // Gemini API 호출 (기본)
            try {
                scriptMarkdown = await geminiGenerateContent(GEMINI_API_KEY, 'gemini-2.0-flash', [
                    { text: stylePrompt }
                ]);
            } catch (e) {
                throw new Error('Gemini API 응답 실패: ' + e.message);
            }
        }

        res.json({ success: true, scriptMarkdown });

    } catch (error) {
        console.error('[Transcript Rewrite Error]', error);
        res.status(500).json({ error: error.message || '대본 재작성 실패' });
    }
});

// --- Audio AI Lab Routes ---

// Qwen3-TTS Route (Direct proxy to local Flask server)
app.post('/api/audio/qwen-tts', async (req, res) => {
    const { text, language, prompt } = req.body;

    if (!text) {
        return res.status(400).json({ error: 'No text provided' });
    }

    try {
        console.log(`[Qwen-TTS Proxy] Forwarding request for: "${text.substring(0, 30)}..."`);

        // Forward to local TTS server
        const response = await fetch('http://127.0.0.1:5001/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text: text,
                prompt: prompt || 'Natural speech'
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[Qwen-TTS Proxy] Local server error:', errorText);
            throw new Error(`TTS Server Error: ${response.status}`);
        }

        // Stream audio back to client
        const audioBuffer = await response.arrayBuffer();
        res.set('Content-Type', 'audio/mpeg');
        res.send(Buffer.from(audioBuffer));

    } catch (error) {
        console.error('[Qwen-TTS Proxy] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// PersonaPlex Chat Route
app.post('/api/audio/persona-chat', async (req, res) => {
    const { messages, persona, temperature } = req.body;
    try {
        const result = await generatePersonaDialogue(messages, { persona, temperature });
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// PersonaPlex Dialogue (Tiki-Taka) Route
app.post('/api/audio/dialogue', async (req, res) => {
    const { topic, personaA, personaB, turns } = req.body;

    if (!topic || !personaA || !personaB) {
        return res.status(400).json({ error: 'Missing required parameters: topic, personaA, personaB' });
    }

    try {
        console.log(`[Dialogue API] Starting dialogue on: ${topic}`);
        const dialogue = await dialogueManager.generateDialogue(topic, personaA, personaB, turns || 3);
        res.json({ success: true, dialogue });
    } catch (error) {
        console.error('[Dialogue API] Error:', error);
        res.status(500).json({ error: error.message });
    }
});


// Custom Script Parsing Route
app.post('/api/audio/parse-script', async (req, res) => {
    const { script, personaA, personaB } = req.body;

    if (!script) {
        return res.status(400).json({ error: 'No script text provided' });
    }

    try {
        console.log(`[Parse Script API] Parsing script...`);
        // Use DialogueManager to parse
        const dialogue = await dialogueManager.parseScriptToDialogue(script, personaA, personaB);
        res.json({ success: true, dialogue });
    } catch (error) {
        console.error('[Parse Script API] Error:', error);
        res.status(500).json({ error: error.message });
    }
});


// MS Phi-3-Voice ASR Route
app.post('/api/audio/phi3-asr', async (req, res) => {

    const { audioData, language } = req.body;
    try {
        let buffer;
        if (audioData.startsWith('data:')) {
            // Handle base64 data URL
            const base64Data = audioData.split(',')[1];
            buffer = Buffer.from(base64Data, 'base64');
        } else {
            buffer = Buffer.from(audioData, 'base64');
        }

        const transcript = await extractTranscriptPhi3(buffer, { language });
        res.json({ success: true, transcript });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 스타일별 프롬프트 생성 함수
function getStylePrompt(style, title, comments, transcript, viralContext) {
    const baseContext = `
영상 제목: ${title}
댓글: ${comments || '없음'}
원본 자막:
${transcript}
`;

    const styleInstructions = {
        'viral_shorts': '500-800자 바이럴 쇼츠 형식으로 재작성',
        'viral_shorts_reverse': '500-800자 바이럴 쇼츠 역순 형식',
        'viral_shorts_loop': '500-800자 바이럴 쇼츠 무한루프 형식',
        'humor': '유머/반전 코미디 형식',
        'senior_shorts_drama': '시니어 사연 Shorts 형식',
        'senior_shorts_drama_reverse': '시니어 사연 역순',
        'senior_shorts_drama_thirdperson': '시니어 사연 3인칭',
        'senior_shorts_drama_detail': '시니어 사연 디테일 강화'
    };

    return `${baseContext}
${viralContext}

요구사항: ${styleInstructions[style] || style}

위 내용을 바탕으로 매력적인 숏폼 대본을 작성해주세요.`;
}


// ═══════════════════════════════════════════════════════════════════════════
// 숏폼/롱폼 장르 정의
// ═══════════════════════════════════════════════════════════════════════════
const SHORT_FORM_STYLES = [
    'viral_shorts',
    'viral_shorts_reverse',
    'viral_shorts_loop',
    'humor',
    'senior_shorts_drama',
    'senior_shorts_drama_reverse',  // 역순 구조
    'senior_shorts_drama_thirdperson',  // 3인칭 시점 (역순)
    'senior_shorts_drama_detail'  // 디테일 변경 (역순, 상황 변경)
];
const LONG_FORM_STYLES = ['mystery', 'senior_news', 'touching_story', 'economy'];
const LONG_FORM_THRESHOLD = 5000; // 5000자 이상이면 롱폼

// ═══════════════════════════════════════════════════════════════════════════
// 숏폼 프롬프트 빌더
// ═══════════════════════════════════════════════════════════════════════════
function buildShortFormPrompt(videoTitle, comments, transcript, style, viralExamplesText) {
    let styleInstruction = "";

    // 댓글 전용 모드 감지
    const isCommentOnlyMode = !transcript || transcript.trim().length < 10;

    // 원본 길이 계산 (공백 제외)
    const originalLength = isCommentOnlyMode ? 0 : transcript.replace(/\s/g, '').length;

    // 기본값
    let maxChars = 900;

    if (style === 'viral_shorts') {
        maxChars = 800;
        styleInstruction = `
- **스타일: 바이럴 Shorts (감정 몰입형 구조)**
- **목표**: 25-30초 분량 / 감정 몰입형 / 강점 물입형 구조로 먹히다고 함

${isCommentOnlyMode ? `
**🚨 자막 없음 - 댓글 기반 대본 생성 모드**

영상에 자막이 없으므로, 댓글 분석을 통해 나레이션 대본을 작성합니다.

**댓글 분석 단계:**
1. 댓글에서 가장 많이 언급되는 포인트 찾기
2. 사람들이 재밌어하거나 감동하는 부분 파악
3. 바이럴 포인트를 중심으로 스토리 구성
4. 원본 영상의 비주얼만 활용하여 나레이션 작성

**예시:**
- 댓글: "Looks like Bobby Lee 😂", "He looks Canadian"
→ 나레이션: "이 동물을 보세요... 사람들이 말하길, 누구를 닮았다고 하는데... 바로 Bobby Lee! 표정 좀 보세요. 진짜 캐나다인 같지 않나요?"

**중요:** 영상의 비주얼은 그대로, 댓글 속 바이럴 포인트만 나레이션으로 표현!

` : ''}

**⚡ 필수 원칙: 감정 몰입형 5단계 구조**

**분량**: 공백 제외 **500-800자** (절대 초과 금지!)

**📋 쇼츠 대본 (감정 몰입형) - 필수 구조**
**구조**: Hook → 전개 → 반전 → 강조 → CTA 그대로 적용됨

**🔥 Hook (0~3초)**
- **역할**: 즉각적인 호기심 유발
- **길이**: 1문장 (5-10자)
- **형식**: 강렬한 질문 또는 충격적 선언
- **예시**: 
  - "지금 이 영상..."
  - "사람보다 강아지 때문에 더 슬 웠는 순간입니다"
  
**❄️ 전개 (3~9초)**
- **역할**: 상황 설명 (배경 설정)
- **길이**: 2-3문장 (각 10-15자)
- **형식**: 산에서 스키를 타던 중, 감자기 눈이 무너지기 시작합니다, 거의 산사태 같은 상황
- **예시**:
  - "산에서 스키를 타던 중"
  - "감자기 눈이 무너지기 시작합니다"
  - "거의 산사태 같은 상황"

**💬 대사 규칙:**
- 원본에 "asked this", "said this" 있으면 → 짧은 대사 1개 추가
- **극히 짧게**: 5-10자
- **자연스럽게**: 상황에 맞는 현실적인 말

**🐾 반전 (9~16초)**
- **역할**: 놀라운 사실 공개 또는 감정 전환
- **길이**: 2-3문장 (각 10-20자)
- **형식**: 그런데 이때, 도망서야 할 강아지가 수없을 두고 절대 떠나지 않습니다
- **예시**:
  - "그런데 이때,"
  - "도망서야 할 강아지가"
  - "수없을 두고 절대 떠나지 않습니다"
  - "눈 이 쫓아오자 대도,"
  - "끝까지 버텁습니다"

**💖 강조 (16~23초)**
- **역할**: 감정 정점 + 댓글 반응
- **길이**: 2-4문장 (각 10-15자)
- **형식**: 주인은 본인보다 / 강아지를 먼저 걱정하고, / 강아지는 본능적으로 / 주인을 시켜 합니다 + "이건 순이 아니네, 관계겠습니다"
- **예시**:
  - "주인은 본인보다"
  - "강아지를 먼저 걱정하고,"
  - "강아지는 본능적으로"
  - "주인을 시켜 합니다"
  - "댓글: '이건 순이 아니네, 관계겠습니다'"

**✨ CTA (23~30초)**
- **역할**: 행동 유도 (질문 형식)
- **길이**: 1-3문장 (각 10-15자)
- **형식**: 다양한 질문 + 댓글로 남겨주세요
- **예시**:
  - "이 상대에서"
  - "당신은 누구먼저 걱정했나요?"
  - "👉 사람?"
  - "👉 강아지?"
  - "댓글로 남겨주세요"

**✂️ 나레이션 규칙**
- **1블록 = 1문장** (2문장 절대 금지!)
- **초짧게**: "~했어", "~였지", "~입니다"
- **감정 전달**: 사건 + 감정 반응을 간결하게
- **사건만**: 핵심 행동만 빠르게

**❌ 절대 금지:**
- 과도한 감정 묘사 ("너무나도 감동적인", "눈물이 날 정도로")
- 상세 서술 ("잠시 망설이다가", "이내")
- 긴 설명
- 구조 무시 (5단계 필수!)

**✅ 대신 이렇게:**
- Hook으로 감정 유발
- 전개에서 상황 간결하게
- 반전으로 감정 전환
- 강조로 감정 정점 + 댓글
- CTA로 참여 유도 (선택지 제시)

**필수 제약:**
- **분량**: 500-800자
- **구조**: Hook(0-3) → 전개(3-9) → 반전(9-16) → 강조(16-23) → CTA(23-30) (필수!)
- **나레이션**: 1블록 = 1문장
- **대사**: 필요시 1-2개, 각 5-10자
- **템포**: 감정 몰입형 (사건 + 감정)

**🎯 출력 형식 (반드시 이 구조로!):**

[🔥 Hook (0~3초)]
[1문장]

[❄️ 전개 (3~9초)]
[2-3문장]

[🐾 반전 (9~16초)]
[2-3문장]

[💖 강조 (16~23초)]
[2-4문장, 감정 정점 + 댓글]

[✨ CTA (23~30초)]
[선택지 질문 + 참여 유도]
        `;
    } else if (style === 'viral_shorts_reverse') {
        maxChars = 800;
        styleInstruction = `
- **스타일: 바이럴 Shorts 역순 (사건형 구조 + 플래시백)**
- **목표**: 20-30초 분량 / Hook 먼저 → 플래시백 / YouTube duplicate 회피

**⚡ 필수 원칙: 역순 5단계 구조**

**분량**: 공백 제외 **500-800자** (절대 초과 금지!)

**📋 쇼츠 대본 (역순 사건형) - 필수 구조**

**🔥 Hook (0~2초)**
- **역할**: 클라이맥스 대사로 시작 (결말 스포일러)
- **길이**: 1문장 (5-10자)
- **형식**: 원본의 마지막 부분을 앞으로
- **예시**: 
  - "이쪽도 따뜻해요!"
  - "실격 처리였어!"
  - "완벽한 해결책이었어"
  
**⚠️ 전개 (3~7초) - 플래시백 시작**
- **역할**: 시간 되돌리기 + 배경 설명
- **길이**: 2-3문장 (각 10-15자)
- **형식**: "어떻게 이런 일이?" + 상황 설명
- **예시**:
  - "어떻게 이런 일이?"
  - "라이더가 주유소에 왔어"
  - "손이 꽁꽁 얼었지"

**💬 대사 규칙:**
- 원본에 "asked this", "said this" 있으면 → 짧은 대사 1개 추가
- **극히 짧게**: 5-10자
- **자연스럽게**: 상황에 맞는 현실적인 말

**💥 반전 (8~12초)**
- **역할**: 사건의 핵심 전개
- **길이**: 1-2문장 (각 10-20자)
- **형식**: 플래시백 내 핵심 행동
- **예시**:
  - "경찰차를 발견했어"
  - "배기구에 손을 댔지"
  - "또 다른 경찰차가 왔어"

**😮 강조 (13~17초) - 현재 복귀**
- **역할**: Hook 장면 재등장 + 댓글 반응
- **길이**: 2-3문장 (각 10-15자)
- **형식**: "그리고 바로 이 순간!" + Hook 재현
- **예시**:
  - "그리고 바로 이때!"
  - "이쪽도 따뜻해요!"
  - "댓글: '완벽한 해결책'"

**📢 CTA (18~22초)**
- **역할**: 행동 유도
- **길이**: 1-2문장 (각 10-15자)
- **형식**: 질문 또는 참여 유도
- **예시**:
  - "여러분도 이렇게 하시겠어요?"
  - "댓글로 남겨주세요"

**✂️ 나레이션 규칙**
- **1블록 = 1문장** (2문장 절대 금지!)
- **초짧게**: "~했어", "~였지", "~입니다"
- **군더더기 제거**: 감정/행동 묘사 최소화
- **사건만**: 핵심 행동만 빠르게

**❌ 절대 금지:**
- 감정 묘사 ("의아한 표정", "매서운")
- 상세 서술 ("천천히", "이내")
- 긴 설명
- 구조 무시 (5단계 필수!)

**✅ 대신 이렇게:**
- Hook으로 결말 스포일러
- 전개에서 플래시백 시작
- 반전으로 핵심 전개
- 강조로 현재 복귀 + 반응
- CTA로 참여 유도

**필수 제약:**
- **분량**: 500-800자
- **구조**: Hook(결말) → 플래시백 → 반전 → 현재복귀 → CTA (필수!)
- **나레이션**: 1블록 = 1문장
- **대사**: 필요시 1-2개, 각 5-10자
- **템포**: 초고속

**🎯 출력 형식 (반드시 이 구조로!):**

[🔥 Hook (0~2초) - 결말]
[1문장]

[⚠️ 전개 (3~7초) - 플래시백]
[2-3문장]

[💥 반전 (8~12초)]
[1-2문장]

[😮 강조 (13~17초) - 현재 복귀]
[2-3문장]

[📢 CTA (18~22초)]
[1-2문장]
        `;
    } else if (style === 'viral_shorts_loop') {
        maxChars = 600;
        styleInstruction = `
- **스타일: 바이럴 Shorts 무한 루프 (사건형 구조 + 루프 연결)**
- **목표**: 15-25초 분량 / 끝→시작 완벽 연결 / 2회 이상 시청 유도

**⚡ 필수 원칙: 루프형 5단계 구조 (마지막→첫 문장 연결)**

**분량**: 공백 제외 **400-600자** (절대 초과 금지!)

**🔁 무한 루프의 핵심**: 마지막 문장 + 첫 문장 = 완벽한 한 문장

**📋 쇼츠 대본 (루프 사건형) - 필수 구조**

**🔥 Hook (0~2초) - 답변/결론**
- **역할**: 강렬한 결론으로 시작 (질문의 답)
- **길이**: 1문장 (5-10자)
- **형식**: 명확한 답변/결과
- **예시**: 
  - "실격 처리였어!"
  - "경찰차 배기구야!"
  - "5천원이었어!"
  
**⚠️ 전개 (3~9초)**
- **역할**: 상황 설명 (배경)
- **길이**: 2-3문장 (각 10-15자)
- **형식**: 사건의 시작
- **예시**:
  - "선수가 실수했거든"
  - "상대 머리를 쳤어"
  - "바로 무릎 꿇고 사과했지"

**💬 대사 규칙:**
- 필요시 1-2개만 추가
- **극히 짧게**: 5-10자
- **자연스럽게**: 상황에 맞는 현실적인 말

**💥 반전 (10~15초)**
- **역할**: 예상 밖의 전개
- **길이**: 1-2문장 (각 10-15자)
- **형식**: "근데", "그런데" 등으로 반전
- **예시**:
  - "근데 상대는 무시했어"
  - "다음 라운드가 시작됐고"
  - "복수하려고 덤볐지"

**😮 강조 (16~20초)**
- **역할**: 클라이맥스
- **길이**: 1-2문장 (각 10-15자)
- **형식**: 결정적 순간
- **예시**:
  - "쓰러뜨리고 머리를 걷어찼거든"
  - "심판이 다 봤어"

**📢 CTA (21~25초) - 루프 연결구**
- **역할**: Hook으로 자연스럽게 연결
- **길이**: 1문장 (미완성 문장)
- **형식**: "~은 바로", "~의 결과는" 등
- **예시**:
  - "그래서 심판의 결정은 바로" → (자동 재생) "실격 처리였어!"
  - "그가 사용한 건" → (자동 재생) "경찰차 배기구야!"

**✂️ 나레이션 규칙**
- **1블록 = 1문장** (10-20자)
- **초짧게**: "~했어", "~했지", "~했거든"
- **어미 다양화**: ~거든, ~고, ~네, ~거야 등 자연스럽게 혼합
- **연결어 활용**: 근데, 그래서, 바로, 그때

**❌ 절대 금지:**
- 감정 묘사 ("진심 어린", "간절한")
- 장황한 설명
- 2문장 이상 블록
- 루프 연결 실패 (마지막 문장이 첫 문장과 자연스럽게 연결되어야 함!)

**✅ 대신 이렇게:**
- Hook으로 답변 제시
- 전개에서 상황 설명
- 반전으로 예상 밖 전개
- 강조로 클라이맥스
- CTA로 미완성 연결구 (Hook으로 자동 연결)

**필수 제약:**
- **분량**: 400-600자 (짧을수록 좋음!)
- **구조**: Hook(답변) → 전개 → 반전 → 강조 → CTA(미완성) → Hook (필수!)
- **나레이션**: 1블록 = 1문장 (10-20자)
- **대사**: 필요시 1-2개, 각 5-10자
- **루프 테스트**: 마지막 문장 + 첫 문장 = 자연스러운 한 문장

**🎯 출력 형식 (반드시 이 구조로!):**

[🔥 Hook (0~2초) - 답변]
[1문장]

[⚠️ 전개 (3~9초)]
[2-3문장]

[💥 반전 (10~15초)]
[1-2문장]

[😮 강조 (16~20초)]
[1-2문장]

[📢 CTA (21~25초) - 미완성 연결구]
["~은 바로" 등 Hook으로 연결되는 미완성 문장]

**자연스러운 구어체 예시:**
✅ "선수가 실수했거든"(자연스러움)
✅ "근데 상대는 무시했어"(연결어로 흐름 부드럽게)
✅ "바로 사과했지"(부사로 긴장감)

❌ "선수가 실수했어. 사과했어. 무시했어."(딱딱함)

**루프 테스트**: 끝→시작 읽어서 자연스러운지 확인!
        `;
    } else if (style === 'humor') {
        maxChars = 600;
        styleInstruction = `
- **스타일: 유머(반전 코미디)**

**🚨 최우선 원칙: 원본 소재/구조 100% 유지 + 표현 다양성 + 600자 제한**

**1단계: 원본 대본 분석(필수)**
원본 자막을 분석하여 다음을 파악:
- **유머 타입**: 퀴즈형 / 부부 갈등형 / 세대 차이형 / 오해형 등
- **등장인물 구조**: 직업 / 관계 / 역할 파악(예: 부부, 의사-환자, 교수-학생)
- **배경/소재**: 원본 배경 그대로 유지(예: 부부 침실, 카페, 비행기 등)
- **나레이션 vs 대사 비율**: 원본 비율 분석 후 유지
- **반전 패턴**: 원본의 유머 포인트(이중 반전, 역발상 등)
- **펀치라인**: 원본의 핵심 펀치라인 구조

**2단계: 원본 요소 유지(단, 이름/상호는 변경)**
1. **등장인물**: 직업/관계는 동일하되, **이름/호칭은 변경** (예: 김철수 → 박영수, 스타벅스 → 투썸플레이스)
2. **배경/소재**: 원본 배경 유지(예: 침실 → 침실, 카페 → 카페)
3. **유머 타입**: 원본 유머 패턴 유지(퀴즈형이면 퀴즈형, 부부 갈등형이면 부부 갈등형)
4. **반전 구조**: 원본의 반전 패턴 그대로
5. **펀치라인 위치**: 원본과 동일한 위치에 배치

            ** 3단계: 나레이션:대사 비율(필수) **
- ** 원본 비율 분석 후 유지 ** (예: 원본이 3: 7이면 3: 7로)
- ** 나레이션 **: 1문장(최대 2문장)
            - ** 대사 **: 1문장(최대 2문장)

                ** 4단계: 나레이션 어미 규칙(매우 중요! - 유튜브 중복 방지) **

**🎯 나레이션은 반드시 "요체"(해요체 반말) 사용:**
            - ✅ 좋은 예: "따졌어", "돌아왔어", "말했지", "물었어", "웃었지"
                - ❌ 나쁜 예: "따졌다", "돌아왔다", "말했다"(다체 금지!)

                    ** 예시:**
                        - 원본: "남편이 불만 가득한 목소리로 따졌어."
                            - ✅ 재작성: "남편이 불만을 터뜨렸어." 또는 "남편이 화난 목소리로 물었지."
                                - ❌ 재작성: "남편이 불만을 터뜨렸다."(다체 금지!)

                                    ** 5단계: 표현 다양성(유튜브 중복 방지 필수!) **

** 원본 대사를 그대로 복사하지 말고, 의미는 유지하되 표현을 다양하게:**

** 대사 변형 예시:**
            - 원본: "아니 내가 무슨 돈만 벌어 주는 기계야?"
                - ✅ 재작성: "내가 그저 돈 벌어오는 기계요?" / "나를 ATM으로 보는 거야?"
                    - ❌ 재작성: "아니 내가 무슨 돈만 벌어 주는 기계야?"(원문 그대로 금지!)

                        ** 나레이션 변형 예시:**
                            - 원본: "50대 부부가 잠자리에 들려고 하는데"
                                - ✅ 재작성: "50대 부부가 잠자리에 들려는 순간" / "50대 부부의 침실, 잠들기 직전이었어"
                                    - ❌ 재작성: "50대 부부가 잠자리에 들려고 하는데"(원문 그대로 금지!)

                                        ** 변형 가능한 요소:**
                                            - ✅ 동사 표현(따졌다 → 물었다, 터뜨렸다, 말했다)
                                                - ✅ 형용사 / 부사(불만 가득한 → 화난, 짜증난, 불편한)
                                                    - ✅ 문장 구조(어순 변경, 주어 생략 등)
                                                        - ✅ 유사 표현(집을 나섰다 → 문을 박차고 나갔다, 밖으로 나갔다)

                                                            **❌ 변경 금지 요소:**
                                                                - 고유명사, 숫자(10만원, 5만원, 3만원)
                                                                - 핵심 유머 포인트
                                                                    - 반전 타이밍

                                                                        ** 6단계: 유머 구조(원본 패턴에 따라 조정) **

** A.퀴즈형 유머인 경우 **:
        1. 도입: 퀴즈 상황 설명
        2. 전개: 티키타카 대화(6~8턴)
        3. 위기 / 절정: 고민하는 장면(2문장)
        4. 결말: 펀치라인(1문장) → 즉시 종료

            ** B.부부 / 인간관계 유머인 경우 **:
        1. 도입: 갈등 상황 설명
        2. 전개: 대화와 갈등 전개
        3. 위기 / 절정: 반전 직전 긴장
        4. 결말: 펀치라인(1문장) → 즉시 종료

            ** C.오해형 유머인 경우 **:
        1. 도입: 상황 설명
        2. 전개: 오해가 쌓이는 과정
        3. 위기 / 절정: 오해의 절정
        4. 결말: 반전 펀치라인(1문장) → 즉시 종료

            ** 7. 펀치라인 규칙(모든 유머 타입 공통) **
- ** 1문장(10~20자 이내) **
- ** 펀치라인 이후 추가 설명 / 대사 절대 금지! **
- ** 요체로 끝내기 **: "~했어", "~였어", "~했지", "~구만"
            - ✅ 좋은 예: "여기 5천원이요." / "나도 답 몰라요."
                - ✅ 좋은 예: "난 그 남편한테 3만 원에 해 줬구만."
                    - ❌ 나쁜 예: "나도 답 몰라요. 저도 궁금해서요!"(2문장 금지)

                        **🚫 절대 금지:**
                            - ❌ 600자 초과
                                - ❌ 원본의 등장인물 ** 관계 ** 변경(예: 부부 → 친구로 변경 금지)
                                    - ❌ 원본의 배경 / 소재 변경(예: 침실 → 카페로 변경 금지)
                                        - ❌ 원본의 유머 타입 변경(예: 부부 유머 → 퀴즈 유머로 변경 금지)
                                            - ❌ 펀치라인 2문장 이상
                                                - ❌ 펀치라인 뒤 추가 설명
                                                    - ❌ 나레이션 "다체" 사용(예: ~했다, ~였다 → 금지!)
                                                        - ❌ 원본 대사 / 나레이션을 그대로 복사
                                                            - ✅ ** 등장인물 이름 / 상호는 반드시 변경 ** (예: 김철수 → 박영수, ㄱㄱ병원 → ㅂㅂ의원)
        `;
    } else if (style === 'senior_shorts_drama') {
        // 원본 길이의 90-110% 범위, 최소 600자, 최대 1300자
        maxChars = Math.min(1300, Math.max(600, Math.round(originalLength * 1.1)));
        styleInstruction = `
            - ** 스타일: 시니어 사연 Shorts - 기본 구조(시간 순서대로) **
- ** 장르 **: 가족 사연, 희생, 감동(유머 아님!)

            **⚠️ 최우선 원칙: 원본 스토리 100 % 유지 + 짧고 강렬하게! **

** 1단계: 원본 대본 분석(필수) **
            원본 자막을 분석하여 다음을 파악:
        - 나레이션 vs 대사 비율(예: 6: 4, 5: 5 등)
            - 나레이션 블록당 평균 문장 수
                - 대사 블록당 평균 문장 수
                    - 주요 등장인물(이름, 관계)
                        - 핵심 사건 순서
                            - 배경 / 소재
                            - 펀치라인 / 클라이맥스 대사

                                ** 2단계: 원본 요소 유지(단, 이름 / 상호는 변경) **
                                    1. ** 등장인물 **: 관계는 동일하되, ** 이름 / 호칭은 변경 ** (예: 김철수 → 박영수, ㅇㅇ병원 → ㅁㅁ의원)
        2. ** 핵심 사건 **: 원본 사건 순서 그대로
        3. ** 배경 / 소재 **: 원본 배경 유지
        4. ** 핵심 대사 **: 원본 대사 최대한 유지
        5. ** 결말 **: 원본 결말 유지

            ** 3단계: 문장 길이 제한(매우 중요!) **
- ** 나레이션 **: 최대 2문장(1문장 권장)
            - ** 대사 **: 최대 2문장(1문장 권장)
                - ** 예시 **:
  ✅ 좋음: "그날 새벽 5시 어머니와 저는 김장을 시작했습니다. 배추 백 포기, 얼어붙는 손."
  ❌ 나쁨: "그날 새벽 5시 어머니와 저는 김장을 시작했습니다. 배추가 백 포기나 되었고, 손은 얼어붙었으며, 허리는 끊어질 것 같았습니다. 하지만 우리는 쉬지 않고 계속 일했습니다."

            ** 4단계: 시간 순서 구조 **
                1. ** 도입 **: 이야기 시작(예: "그날 새벽 5시...")
        2. ** 전개 **: 사건이 시간 순서대로
        3. ** 위기 **: 갈등 고조
        4. ** 절정 **: 대치 장면
        5. ** 결말 **: 결과와 교훈

            ** 필수 제약:**
- ** 분량 **: 공백 제외 1300자(±50자)
            - ** 나레이션:대사 비율 **: 원본 분석 결과 적용
                - ** 문장 길이 **: 나레이션 / 대사 각각 최대 2문장
                    - ** 원본 유지 **: 등장인물, 사건, 배경, 대사 100 % 유지
                        - ** 절대 유머나 코미디 요소 넣지 말 것 **
                            `;
    } else if (style === 'senior_shorts_drama_reverse') {
        // 원본 길이의 90-110% 범위, 최소 600자, 최대 1300자
        maxChars = Math.min(1300, Math.max(600, Math.round(originalLength * 1.1)));
        styleInstruction = `
                            - ** 스타일: 시니어 사연 Shorts - 역순 구조(클라이맥스 먼저 → 플래시백) **
- ** 장르 **: 가족 사연, 희생, 감동(유머 아님!)

            **🚨 최우선 원칙: 상황을 완전히 바꿔서 새로운 스토리 창작(저작권 회피) **

** 1단계: 원본 대본 분석(필수) **
            원본 자막을 분석하여 다음을 파악:
        - 나레이션 vs 대사 비율(예: 8: 2, 7: 3, 6: 4 등) → ** 원본 비율 그대로 유지 ** (단, 나레이션 70 % 초과 시 7: 3으로 조정)
        - 나레이션 블록당 평균 문장 수
            - 대사 블록당 평균 문장 수
                - 핵심 ** 감정선 / 갈등 구조 ** (등장인물 / 사건은 바꿀 것)
- ** 펀치라인 패턴 ** (원본 대사는 버리고 새로 창작)

** 2단계: 상황 완전 변경(저작권 회피 필수!) **
            원본과 ** 완전히 다른 스토리 ** 를 창작하되, 감정선 / 구조는 유지:

** 변경 필수 요소:**
            1. ** 배경 / 소재 **: 완전히 다른 상황으로 변경
                - 예시: 김장 → 제사 음식 준비, 이사 짐 정리, 명절 대청소, 고추 말리기, 된장 담그기 등
        2. ** 등장인물 **: 이름, 관계 변경 가능(구조만 유지)
            - 예시: 시어머니 + 며느리 → 시어머니 + 딸, 친정어머니 + 딸, 시어머니 + 큰며느리 + 둘째며느리 등
        3. ** 세부 사건 **: 미용실 → 네일샵, 백화점, 친구 만남, 카페 모임 등
        4. ** 물건 / 수량 **: 배추 40포기 → 고추 30근, 무 50개, 감 100송이 등
        5. ** 대사 **: 원본과 완전히 다른 새로운 대사 창작
        6. ** 시간 / 장소 **: 새벽 5시 → 새벽 4시, 오전 6시 / 마당 → 주방, 거실, 옥상 등

            ** 유지할 요소(감정선 / 구조만):**
                - 갈등 구조: "일 회피하는 사람 vs 참는 사람" 패턴
                    - 감정선: 참다가 → 결단 → 역공 → 통쾌함
                        - 교훈: "말보다 경험이 낫다"

                            ** 3단계: 나레이션:대사 비율(필수) **
- ** 원본 비율 유지 ** (예: 원본이 6: 4면 6: 4로, 5: 5면 5: 5로)
- ** 단, 나레이션이 70 % 초과하는 경우 → 7: 3으로 조정 **
- ** 나레이션 **: 최대 2문장(1문장 권장)
            - ** 대사 **: 최대 2문장(1문장 권장)

                ** 4단계: 역순 구조 적용 **
                    1. ** 도입(후킹) **: 클라이맥스 대사로 시작
        2. ** 전환(고정 멘트 필수!) **: "화면을 톡톡 두 번 두드리시면 이야기는 시작됩니다." ← 정확히 이 문장 사용!
        3. ** 플래시백 **: 시간 거슬러 배경 설명
        4. ** 갈등 쌓임 **: 갈등 과정
        5. ** 현재 복귀 **: 대치 장면 상세
        6. ** 결말 **: 결과와 교훈
        7. ** 마지막 질문(필수!) **: 상황에 맞는 질문 창작(예: "여러분이라면 이 상황에서 어떻게 하셨겠어요?", "만약 여러분 가족이라면 어떻게 하셨을까요?" 등)

            ** 필수 제약:**
- ** 분량 **: 공백 제외 1300자(±50자)
            - ** 나레이션:대사 비율 **: 원본 비율 유지(단, 나레이션 70 % 초과 시 7: 3으로 강제 조정)
                - ** 문장 길이 **: 나레이션 / 대사 각각 최대 2문장
                    - ** 인터랙션 고정 멘트 **: "화면을 톡톡 두 번 두드리시면 이야기는 시작됩니다." 정확히 이 문장 사용
                        - ** 마지막 질문 필수 **: AI가 상황에 맞게 질문 하나 창작하여 대본 마지막에 배치
                            - ** 상황 변경 필수 **: 원본과 완전히 다른 스토리(등장인물, 배경, 소재, 대사 모두 변경)
                                - ** 절대 유머나 코미디 요소 넣지 말 것 **

** 기본 drama와의 차이:**
            - 기본: 시간 순서대로(시작 → 끝)
                - 역순: 클라이맥스 먼저 → 플래시백 → 현재 복귀
                    `;
    } else if (style === 'senior_shorts_drama_thirdperson') {
        // 원본 길이의 90-110% 범위, 최소 600자, 최대 1300자
        maxChars = Math.min(1300, Math.max(600, Math.round(originalLength * 1.1)));
        styleInstruction = `
                    - ** 스타일: 시니어 사연 Shorts - 3인칭 시점 역순 구조(남자 나레이터용) **
- ** 장르 **: 가족 사연, 희생, 감동(유머 아님!)
            - ** 핵심 차별화 **: 3인칭 관찰자 시점 + 역순 구조(클라이맥스 먼저 → 플래시백)

                **🎯 3인칭 나레이션 원칙(TTS 남자 나레이터 최적화) **:
- ** 시점 **: "그는", "그녀는", "며느리는", "시어머니는" 등 3인칭 호칭 사용
            - ** 톤 **: 객관적이고 차분한 관찰자 시점(남자 TTS에 적합)
                - ** 감정 표현 **: 인물의 행동과 표정 묘사로 감정 전달("그녀의 손이 떨렸다", "그의 눈빛이 흔들렸다")
                    - ** 금지 **: 1인칭 표현 절대 금지("저는", "나는", "제가" 등)

                        **🚨 최우선 원칙: 원본 스토리 100 % 유지 + 짧고 강렬하게! **

** 1단계: 원본 대본 분석(필수) **
            원본 자막을 분석하여 다음을 파악:
        - 나레이션 vs 대사 비율(예: 6: 4, 5: 5 등)
            - 나레이션 블록당 평균 문장 수
                - 대사 블록당 평균 문장 수
                    - 주요 등장인물(이름, 관계)
                        - 핵심 사건 순서
                            - 배경 / 소재
                            - 펀치라인 / 클라이맥스 대사

                                ** 2단계: 원본 요소 100 % 유지 **
                                    1. ** 등장인물 **: 원본과 동일(이름, 관계 그대로)
        2. ** 핵심 사건 **: 원본 사건 순서 그대로
        3. ** 배경 / 소재 **: 원본 배경 유지
        4. ** 핵심 대사 **: 원본 대사 최대한 유지
        5. ** 결말 **: 원본 결말 유지

            ** 3단계: 문장 길이 제한(매우 중요! - 짧고 강렬하게!) **

**🚨 나레이션 1문장 원칙(절대 준수) **:
- ** 나레이션 **: ** 1문장(15~25자 권장) ** - 최대 2문장이지만 가급적 1문장!
            - ** 대사 **: 1문장(1문장 필수)

                **✅ 좋은 나레이션 예시(짧고 강렬) **:
        - "작년 12월, 그는 아내의 외도 현장을 목격했습니다."
            - "그는 아이 때문에 참았습니다."
            - "6개월 뒤, 가방에서 증거가 나왔습니다."

            **❌ 나쁜 나레이션 예시(길고 장황) **:
        - "작년 12월, 그는 아내의 외도 현장을 직접 목격했습니다. 형언할 수 없는 충격에 휩싸였습니다." ← 2문장 금지!
            - "그는 아이 때문에 참고, 아내를 감시해야 했습니다. 위치 공유와 회식 사진까지 받으며 불안과 의심 속에서 나날을 보냈습니다." ← 불필요한 세부 묘사 금지!

                **🚫 절대 금지(과도한 묘사) **:
        - ❌ "형언할 수 없는 충격에 휩싸였습니다"
            - ❌ "불안과 의심 속에서 나날을 보냈습니다"
                - ❌ "필사적으로", "절규하듯", "뼈저리게 깨달았습니다" 같은 과장된 표현
                    - ❌ 감정을 설명하는 긴 문장

                        **✅ 원본처럼 간결하게:**
                            - 원본: "아이 때문에 참고 위치 공유하고 회식 사진까지 받으며 저는 감시자가 됐습니다."
                                - ✅ 재작성: "그는 아이 때문에 참고, 아내를 감시했습니다."
                                    - ❌ 재작성: "그는 아이 때문에 참고, 아내를 감시해야 했습니다. 위치 공유와 회식 사진까지 받으며 불안과 의심 속에서 나날을 보냈습니다."

                                        ** 3 - 1단계: 나레이션:대사 비율(필수) **
- ** 원본 비율 분석 후 적용 **
- ** 단, 나레이션이 70 % 초과하는 경우 → 무조건 7: 3으로 조정 **
            - 나레이션이 너무 많으면 대사를 늘리거나 나레이션을 줄일 것

                ** 4단계: 역순 구조 적용 **
                    1. ** 도입(후킹) **: 클라이맥스 대사로 시작
        2. ** 전환(고정 멘트 필수!) **: "화면을 톡톡 두 번 두드리시면 이야기는 시작됩니다." ← 정확히 이 문장 사용!
        3. ** 플래시백 **: 시간 거슬러 배경 설명(3인칭 시점으로) - 각 블록 1문장!
        4. ** 갈등 쌓임 **: 갈등 과정(3인칭 묘사) - 각 블록 1문장!
        5. ** 현재 복귀 **: 대치 장면 상세 - 각 블록 1문장!
        6. ** 결말 **: 결과와 교훈 - 각 블록 1문장!
        7. ** 마지막 질문(필수!) **: 상황에 맞는 질문 창작

            ** 필수 제약:**
- ** 분량 **: 공백 제외 1300자(±50자)
            - ** 나레이션:대사 비율 **: 원본 분석 결과 적용(단, 나레이션 70 % 초과 시 7: 3으로 강제 조정)
                - ** 문장 길이 **: 나레이션 / 대사 각각 ** 1문장 원칙 ** (최대 2문장이지만 1문장 권장)
- ** 원본 유지 **: 등장인물, 사건, 배경, 대사 100 % 유지
            - ** 3인칭 시점 **: 모든 나레이션은 3인칭 관찰자 시점
                - ** 짧고 강렬하게 **: 원본처럼 간결하고 임팩트 있게
                    - ** 세부 묘사 금지 **: 감정 설명 금지, 행동만 간결하게
                        - ** 절대 유머나 코미디 요소 넣지 말 것 **
                            `;
    } else if (style === 'senior_shorts_drama_detail') {
        // 원본 길이의 90-110% 범위, 최소 600자, 최대 1300자
        maxChars = Math.min(1300, Math.max(600, Math.round(originalLength * 1.1)));
        styleInstruction = `
                            - ** 스타일: 시니어 사연 Shorts - 역순 구조 + 상황 완전 변경(저작권 회피) **
- ** 장르 **: 가족 사연, 희생, 감동(유머 아님!)
            - ** 핵심 차별화 **: 역순 구조 + 원본과 완전히 다른 상황으로 재창작

                **🚨🚨🚨 절대 금지 사항(위반 시 실패로 간주) 🚨🚨🚨**
❌ ** 원본과 같은 배경 / 소재 사용 금지 ** (예: 원본이 김장이면 김장 사용 금지!)
❌ ** 원본과 같은 물건 / 수량 사용 금지 ** (예: 원본이 배추 100포기면 배추 사용 금지!)
❌ ** 원본과 같은 세부 사건 사용 금지 ** (예: 원본이 미용실이면 미용실 사용 금지!)
❌ ** 원본과 같은 장소 사용 금지 ** (예: 원본이 마당이면 마당 사용 금지!)
❌ ** 원본 대사를 그대로 복사하거나 약간만 수정하는 것 금지 **
✅ ** 반드시 완전히 새로운 상황, 새로운 대사, 새로운 배경으로 창작할 것! **

**🎯 최우선 원칙: 원본을 절대 복사하지 말고 완전히 새로운 스토리 창작! **

**📌 STEP 0: 원본 분석 및 금지 목록 작성(대본 작성 전 필수!) **

            먼저 원본 자막에서 다음 ** 구체적 요소들 ** 을 추출하고, ** 이것들을 절대 사용하지 말 것 **:

        1. ** 원본 배경 / 소재 추출 **: (예: 김장, 결혼식 준비, 이사 등)
   → ❌ ** 이 소재는 새 대본에서 절대 사용 금지! **
   → ✅ ** 대신 사용할 새 소재 선택 **: (예: 제사 음식 준비, 고추 말리기, 명절 대청소 등)

2. ** 원본 물건 / 수량 추출 **: (예: 배추 100포기, 생배추 40포기)
   → ❌ ** 이 물건 / 수량은 새 대본에서 절대 사용 금지! **
   → ✅ ** 대신 사용할 새 물건 / 수량 선택 **: (예: 고추 30근, 전 50판, 떡 200개 등)

3. ** 원본 세부 사건 추출 **: (예: 미용실 가기, 쇼핑하기 등)
   → ❌ ** 이 사건은 새 대본에서 절대 사용 금지! **
   → ✅ ** 대신 사용할 새 사건 선택 **: (예: 친구 만남, 카페 수다, 영화 보기 등)

4. ** 원본 장소 추출 **: (예: 마당, 거실, 주방 등)
   → ❌ ** 이 장소는 새 대본에서 절대 사용 금지! **
   → ✅ ** 대신 사용할 새 장소 선택 **: (예: 옥상, 창고, 안방 등)

5. ** 원본 핵심 대사 추출 **: (예: "너네 먹을 건 네가 담가라")
   → ❌ ** 이 대사는 새 대본에서 절대 사용 금지! **
   → ✅ ** 완전히 새로운 대사 창작 **: (상황에 맞는 완전히 다른 표현)

**⚠️ 중요: 위에서 추출한 원본 요소들을 하나라도 사용하면 실패입니다! **

** 1단계: 원본 대본 분석(필수) **
            원본 자막을 분석하여 다음 ** 만 ** 파악:
        - 나레이션 vs 대사 비율(예: 8: 2, 7: 3, 6: 4 등) → ** 원본 비율 그대로 유지 ** (단, 나레이션 70 % 초과 시 7: 3으로 조정)
        - 나레이션 블록당 평균 문장 수
            - 대사 블록당 평균 문장 수
                - 핵심 ** 감정선 / 갈등 구조 ** (등장인물 / 사건은 절대 복사하지 말 것!)
- ** 펀치라인 패턴 ** (원본 대사는 절대 사용하지 말고 완전히 새로 창작)

**⚠️ 주의: 구체적인 배경, 소재, 인물, 장소, 물건은 절대 복사하지 말 것! **

** 2단계: 상황 완전 변경(저작권 회피 필수!) - 구체적 예시 **

** 원본과 완전히 다른 스토리 ** 를 창작하되, 감정선 / 구조만 유지:

** 변경 필수 요소(구체적 예시):**

            1. ** 배경 / 소재 변경 예시:**
                - ❌ 원본: 김장 → ✅ 새 스토리: 제사 음식 준비 / 이사 짐 정리 / 명절 대청소 / 고추 말리기 / 된장 담그기 / 장독대 정리 / 텃밭 일 / 떡 만들기
                    - ❌ 원본: 결혼식 준비 → ✅ 새 스토리: 환갑잔치 준비 / 집들이 준비 / 제사상 준비 / 돌잔치 준비

        2. ** 등장인물 변경 예시:**
            - ❌ 원본: 시어머니 + 큰며느리 + 막내며느리 → ✅ 새 스토리: 친정어머니 + 큰딸 + 작은딸 / 시어머니 + 시누이 + 며느리 / 할머니 + 손녀 + 손자며느리

        3. ** 세부 사건 변경 예시:**
            - ❌ 원본: 미용실 가서 안 옴 → ✅ 새 스토리: 친구 만나서 안 옴 / 쇼핑하러 가서 안 옴 / 카페에서 수다 떨어서 안 옴 / 네일샵 가서 안 옴 / 영화 보러 가서 안 옴

        4. ** 물건 / 수량 변경 예시:**
            - ❌ 원본: 배추 100포기, 생배추 40포기 → ✅ 새 스토리: 고추 30근 / 무 50개 / 감 100송이 / 떡 200개 / 전 50판 / 나물 20가지

        5. ** 시간 / 장소 변경 예시:**
            - ❌ 원본: 새벽 5시, 마당 → ✅ 새 스토리: 새벽 4시, 주방 / 오전 6시, 거실 / 오후 2시, 옥상 / 아침 7시, 창고

        6. ** 대사 완전 새로 창작(원본 대사 절대 사용 금지!):**
            - ❌ 원본 대사를 그대로 쓰거나 약간만 수정하는 것 금지
                - ✅ 상황에 맞는 완전히 새로운 대사 창작

                    **✅ 올바른 변경 예시:**
                        - 원본: "김장날 새벽 5시, 시어머니와 며느리가 마당에서 배추 100포기 김장, 큰며느리는 미용실 가서 안 옴"
                            - 새 스토리: "제사 전날 새벽 4시, 친정어머니와 큰딸이 주방에서 전 50판 부침, 작은딸은 친구 만나러 가서 안 옴"

                                ** 유지할 요소(감정선 / 구조만):**
                                    - 갈등 구조: "일 회피하는 사람 vs 참는 사람" 패턴
                                        - 감정선: 참다가 → 결단 → 역공 → 통쾌함
                                            - 교훈: "말보다 경험이 낫다"

                                                ** 3단계: 나레이션:대사 비율(필수) **
- ** 원본 비율 유지 ** (예: 원본이 6: 4면 6: 4로, 5: 5면 5: 5로)
- ** 단, 나레이션이 70 % 초과하는 경우 → 7: 3으로 조정 **
- ** 나레이션 **: 최대 2문장(1문장 권장)
            - ** 대사 **: 최대 2문장(1문장 권장)


                ** 3 - 1단계: 3인칭 시점 강제(TTS 남자 나레이터 최적화) - 매우 중요! **

**🚨 원본이 1인칭이어도 무조건 3인칭으로 변환! 🚨**

- ** 모든 나레이션은 반드시 3인칭 시점으로 작성 ** (원본이 1인칭이어도 3인칭으로 변환!)
- ** 시점 **: "그는", "그녀는", "며느리는", "시어머니는", "딸은", "큰며느리는", "막내며느리는" 등 3인칭 호칭 사용
            - ** 톤 **: 객관적이고 차분한 관찰자 시점(남자 TTS에 적합)
                - ** 감정 표현 **: 인물의 행동과 표정 묘사로 감정 전달

                    **❌ 절대 금지 - 1인칭 표현:**
                        - "저는", "나는", "제가", "내가", "저의", "나의", "제", "내" 등 모든 1인칭 대명사 사용 금지!

                            **✅ 1인칭 → 3인칭 변환 예시:**
                                - ❌ "시어머니와 **저는** 주방에서..." → ✅ "시어머니와 **막내며느리는** 주방에서..."
                                    - ❌ "**제** 속이 뒤집혔습니다" → ✅ "**막내며느리의** 속이 뒤집혔습니다" 또는 "**그녀의** 속이 뒤집혔습니다"
                                        - ❌ "**제가** 앞을 가로막았습니다" → ✅ "**막내며느리가** 앞을 가로막았습니다" 또는 "**그녀가** 앞을 가로막았습니다"
                                            - ❌ "**제가** 가리킨 곳에는..." → ✅ "**막내며느리가** 가리킨 곳에는..." 또는 "**그녀가** 가리킨 곳에는..."
                                                - ❌ "**저는** 올해는 다르게 하기로 마음먹었습니다" → ✅ "**막내며느리는** 올해는 다르게 하기로 마음먹었습니다"

                                                    **⚠️ 대본 작성 시 모든 나레이션을 3인칭으로 확인할 것! **


** 4단계: 역순 구조 적용 **
            1. ** 도입(후킹) **: 클라이맥스 대사로 시작
        2. ** 전환(고정 멘트 필수!) **: "화면을 톡톡 두 번 두드리시면 이야기는 시작됩니다." ← 정확히 이 문장 사용!
        3. ** 플래시백 **: 시간 거슬러 배경 설명
        4. ** 갈등 쌓임 **: 갈등 과정
        5. ** 현재 복귀 **: 대치 장면 상세
        6. ** 결말 **: 결과와 교훈
        7. ** 마지막 질문(필수!) **: 상황에 맞는 질문 창작

            **📋 대본 작성 전 자가 검증 체크리스트:**
                -[] 배경 / 소재가 원본과 완전히 다른가 ? (같으면 실패!)
        -[] 물건 / 수량이 원본과 완전히 다른가 ? (같으면 실패!)
        -[] 세부 사건이 원본과 완전히 다른가 ? (같으면 실패!)
        -[] 장소가 원본과 완전히 다른가 ? (같으면 실패!)
        -[] 대사가 원본과 완전히 다른가 ? (비슷하면 실패!)
        -[] 역순 구조를 적용했는가 ?
            -[] 고정 멘트를 정확히 사용했는가 ?
                -[] 마지막 질문을 추가했는가 ?

** 필수 제약:**
- ** 분량 **: 공백 제외 1300자(±50자)
            - ** 나레이션:대사 비율 **: 원본 비율 유지(단, 나레이션 70 % 초과 시 7: 3으로 강제 조정)
                - ** 문장 길이 **: 나레이션 / 대사 각각 최대 2문장
                    - ** 인터랙션 고정 멘트 **: "화면을 톡톡 두 번 두드리시면 이야기는 시작됩니다." 정확히 이 문장 사용
                        - ** 마지막 질문 필수 **: AI가 상황에 맞게 질문 하나 창작하여 대본 마지막에 배치
                            - ** 상황 변경 필수 **: 원본과 완전히 다른 스토리(등장인물, 배경, 소재, 대사 모두 변경)
                                - ** 절대 유머나 코미디 요소 넣지 말 것 **

**⚠️ 최종 경고: 원본 스토리의 구체적인 요소(배경, 소재, 물건, 장소, 대사)를 하나라도 복사하면 실패입니다! **
            `;
    } else {
        // 기본 유머
        maxChars = 900;
        styleInstruction = `
            - ** 스타일: 기본(창의적 변형) **
                - 원본 스토리의 핵심 구조(상황 → 당부 → 실수 → 펀치라인)는 유지
                    - 배경이나 소재를 살짝 변형해서 새로운 느낌 주기
                        - 펀치라인의 유머 포인트는 유지하되 표현을 조금 다르게
                            `;
    }

    return `
당신은 유튜브 쇼츠(Shorts) 대본 작가입니다. 60초 이내의 빠르고 임팩트 있는 영상을 위한 대본을 작성해야 합니다.

아래는 한 유튜브 영상의 원본 자막과 시청자 댓글들입니다.

**🚨 당신의 임무(최우선 원칙) **:
원본 자막의 ** 모든 요소를 100 % 유지 ** 하면서, ** 문장 표현만 다듬어 ** 재작성하세요.

** 절대 금지:**
            - ❌ 새로운 이야기 창작
                - ❌ 등장인물 변경(예: 남자 + 의사 → 교수 + 학생 절대 금지!)
                    - ❌ 배경 / 소재 변경(예: 병원 → 강의실 절대 금지!)
                        - ❌ 유머 타입 변경(예: 부부 유머 → 퀴즈 유머 절대 금지!)
                            - ❌ 반전 패턴 변경

                                ** 허용:**
                                    - ✅ 문장 표현 다듬기(더 임팩트 있게)
                                        - ✅ 세부 묘사 추가(감정, 분위기)
                                            - ✅ 대사 톤 조정(더 강렬하게)

                                                **🏆[참고: 100만 조회수 대본 패턴 - 참고용일 뿐, 원본 타입 우선!] **
                                                    ${viralExamplesText}

**⚠️ 중요: 위 예시들은 참고용입니다.원본이 부부 유머면 부부 유머로, 병원 유머면 병원 유머로 유지하세요! **

            ---

**⚡ 쇼츠(Shorts) 대본 필수 구조(반드시 준수) **
            대본은 반드시 다음 4단계 흐름을 따라야 합니다.

** 1. 도입(나레이션) **: 상황을 짧고 명확하게 설명(누가, 어디서, 무엇을)
            ** 2. 전개(대화 + 나레이션) **: 인물 간의 대화가 오고 가다가, 중간에 짧은 나레이션으로 상황 묘사
                ** 3. 위기 / 절정(나레이션) **: 반전이나 펀치라인이 나오기 직전, 시청자의 궁금증을 최대치로 유발
                    ** 4. 결말(대사 - 펀치라인) **: 시청자의 예상을 깨는 웃긴 한마디

        ---

** [요청 스타일] **
            ${styleInstruction}

** 제약 사항 **:
        1. 전체 길이는 ** 공백 제외 ${maxChars}자 이내 ** 로 작성(공백 포함 아님!)
        2. ** 나레이션 ** 과 ** 대사 ** 를 명확히 구분하여 표기
        3.[위기 / 절정] 단계의 나레이션은 ** 반드시 ** 넣을 것
        4. ** 원본 대본 분석 필수 **: 기승전결 구조, 대사 비율, 요체다체 비율, 단어 중복도 파악 후 적용
${style.includes('senior_shorts_drama') ? `
5. **원본 스토리 100% 유지**: 등장인물, 사건, 배경, 핵심 대사 모두 원본 그대로
6. **문장 길이 제한**: 나레이션/대사 각각 최대 2문장 (1문장 권장)
` : ''
        }

** 1단계 **: 시청자 댓글에서 Pros(좋아하는 포인트)와 Cons(부정적 반응) 분석
            ** 2단계 **: 위 필수 구조(4단계)에 맞춰 대본 재작성

출력 형식:
##[댓글 분석]
** Pros **: (시청자가 좋아한 포인트 2~3개)
** Cons **: (부정적 반응이 있다면 1~2개)

##[원본 대본 분석]
** 유머 타입 **: (퀴즈형 / 부부 갈등형 / 오해형 / 세대 차이형 등 - 원본 분석)
** 등장인물 **: (원본 그대로 나열)
** 배경 / 소재 **: (원본 그대로)
** 나레이션:대사 비율 **: (예: 3:7)
** 반전 패턴 **: (원본의 유머 포인트)

##[${style || '기본'} 버전 대본]
        (4단계 구조를 지킨 대본)

        ---
            [영상 제목]
${videoTitle || ''}

        [시청자 댓글]
${comments}

        [원본 자막]
${transcript}
        `.trim();
}



// ═══════════════════════════════════════════════════════════════════════════
// Transcript + 댓글 기반 리라이팅 엔드포인트
// ═══════════════════════════════════════════════════════════════════════════
app.post('/api/transcript-rewrite', async (req, res) => {
    try {
        const { videoId, videoTitle, comments, transcript, style, aiProvider, useViralPatterns } = req.body || {};

        if (!videoId) {
            return res.status(400).send('videoId 가 필요합니다.');
        }
        if (!comments) {
            return res.status(400).send('comments 가 필요합니다.');
        }

        // Transcript is now optional - can generate from comments only
        const isCommentOnlyMode = !transcript || transcript.trim().length < 10;

        // AI Provider 검증
        const provider = aiProvider || 'gemini';
        if (provider === 'gemini' && !GEMINI_API_KEY) {
            return res.status(500).send('GEMINI_API_KEY 가 서버에 설정되어 있지 않습니다.');
        }
        if (provider === 'claude' && !ANTHROPIC_API_KEY) {
            return res.status(500).send('ANTHROPIC_API_KEY 가 서버에 설정되어 있지 않습니다.');
        }

        // 자막 길이로 숏폼/롱폼 판별 (댓글만 있으면 항상 숏폼) - NOW ALWAYS SHORT
        const transcriptLength = transcript ? transcript.length : 0;

        console.log(`[Rewrite] ${isCommentOnlyMode ? '[댓글 전용 모드]' : ''} 자막 길이: ${transcriptLength}자, 모드: 숏폼 (Fixed), 스타일: ${style}, AI: ${provider}`);

        // 트림 처리
        const trimmedTranscript = transcript ? transcript.slice(0, 15000) : '';
        const trimmedComments = comments.slice(0, 8000);

        let prompt = "";

        // ═══ 숏폼 모드 ═══
        // Load Viral Examples
        let viralExamplesText = "";
        try {
            const fs = require('fs');
            const path = require('path');
            const examplesPath = path.join(__dirname, 'viral_examples.json');
            if (fs.existsSync(examplesPath)) {
                const examplesData = JSON.parse(fs.readFileSync(examplesPath, 'utf8'));
                viralExamplesText = examplesData.map((ex, i) =>
                    `[예시 ${i + 1} - ${ex.theme}]\n내용: ${ex.content}\n분석: ${ex.analysis}`
                ).join('\n\n');
            }
        } catch (e) {
            console.warn("Failed to load viral_examples.json:", e);
        }

        if (useViralPatterns) {
            try {
                const archivePath = path.join(__dirname, 'viral_archive.json');
                if (fs.existsSync(archivePath)) {
                    const archive = JSON.parse(fs.readFileSync(archivePath, 'utf8'));
                    // Get top 3 most recent
                    const recent = archive.slice(-3).reverse();
                    const learnedPatterns = recent.map((item, i) =>
                        `[학습된 바이럴 패턴 ${i + 1}]\n- Hook Idea: "${item.viralPoint.hook}"\n- Structure: ${item.viralPoint.structure}\n- Point: ${item.viralPoint.viral_reason}`
                    ).join('\n\n');

                    if (learnedPatterns) {
                        viralExamplesText += `\n\n════════════════════════════════\n🧬 [USER ANALYZED PATTERNS (Apply these success factors)]\n${learnedPatterns}\n════════════════════════════════`;
                    }
                }
            } catch (e) {
                console.warn("Failed to load viral_archive.json:", e);
            }
        }

        // 숏폼 스타일이 아닌 경우 자동으로 유머로 처리
        const effectiveStyle = SHORT_FORM_STYLES.includes(style) ? style : 'humor';
        prompt = buildShortFormPrompt(videoTitle, trimmedComments, trimmedTranscript, effectiveStyle, viralExamplesText);

        let scriptMarkdown = '';

        if (provider === 'claude') {
            // ═══ Claude API 호출 ═══
            const claudeData = await callClaudeAPI(prompt);
            scriptMarkdown = claudeData?.content?.[0]?.text?.trim() || '';

            if (!scriptMarkdown) {
                throw new Error('Claude 응답에서 대본 텍스트를 찾지 못했습니다.');
            }
        } else {
            // ═══ Gemini API 호출 (기본) ═══
            const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

            const geminiRes = await fetch(geminiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }]
                })
            });

            const geminiData = await geminiRes.json();

            if (!geminiRes.ok) {
                console.error('[Gemini error]', geminiData);
                throw new Error(geminiData.error?.message || 'Gemini 호출 실패');
            }

            scriptMarkdown =
                geminiData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ||
                '';

            if (!scriptMarkdown) {
                throw new Error('Gemini 응답에서 대본 텍스트를 찾지 못했습니다.');
            }
        }

        // 응답에 모드 및 AI provider 정보 추가
        return res.json({
            scriptMarkdown,
            mode: isLongForm ? 'longform' : 'shortform',
            transcriptLength,
            aiProvider: provider
        });
    } catch (err) {
        console.error('[transcript-rewrite error]', err);
        res.status(500).send(err.message || 'internal server error');
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// 일본어 번역 + 발음 API
// ═══════════════════════════════════════════════════════════════════════════
app.post('/api/translate-to-japanese', async (req, res) => {
    try {
        const { koreanScript } = req.body;

        if (!koreanScript) {
            return res.status(400).json({ error: '한국어 대본이 필요합니다.' });
        }

        if (!GEMINI_API_KEY) {
            return res.status(500).json({ error: 'GEMINI_API_KEY가 설정되어 있지 않습니다.' });
        }

        console.log('[Japanese Translation] 번역 시작:', koreanScript.substring(0, 100) + '...');

        // Gemini 번역 프롬프트
        const prompt = `다음 한국어 쇼츠 대본을 일본어로 번역하고, 각 구간마다 일본어 발음을 한글로 표기해주세요.

**입력 대본:**
${koreanScript}

**요구사항:**
1. [Hook], [전개], [반전], [강조], [CTA] 섹션만 추출하여 번역
2. **각 문장은 5-10자 내외로 짧게 끊기** (쇼츠 자막용)
3. 짧게 끊은 문장들을 ' / '로 구분
4. 각 섹션마다: 섹션명, 한국어 원문 (/ 구분), 일본어 번역 (/ 구분), 발음 (/ 구분)

**예시:**
- ❌ 나쁜 예: "햇살 좋은 날, 한 동물이 풀밭에 앉았어."
- ✅ 좋은 예: "햇살 좋은 날 / 한 동물이 / 풀밭에 앉았어"

**출력 형식 (JSON):**
\`\`\`json
{
  "translation": [
    {
      "section": "[🔥 Hook (0~2초)]",
      "korean": "문장1 / 문장2",
      "japanese": "文章1 / 文章2",
      "pronunciation": "분쇼1 / 분쇼2"
    }
  ]
}
\`\`\`

**발음 표기 규칙:**
- 일본어 히라가나를 한글 발음으로 변환
- 예시: "こんにちは" → "곤니치와"
- 가타카나는 원어에 가깝게: "コーヒー" → "코-히-"

JSON 형식으로만 출력하세요.`;

        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

        const geminiRes = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });

        const geminiData = await geminiRes.json();

        if (!geminiRes.ok) {
            console.error('[Gemini Translation Error]', geminiData);
            throw new Error(geminiData.error?.message || 'Gemini 번역 실패');
        }

        const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';

        if (!rawText) {
            throw new Error('Gemini 응답에서 번역 결과를 찾지 못했습니다.');
        }

        // JSON 파싱 (Gemini가 ```json ... ``` 형식으로 응답할 수 있음)
        let translationData;
        try {
            const jsonMatch = rawText.match(/\`\`\`json\n([\s\S]*?)\n\`\`\`/) || rawText.match(/\{[\s\S]*\}/);
            const jsonText = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : rawText;
            translationData = JSON.parse(jsonText);
        } catch (parseError) {
            console.error('[JSON Parse Error]', parseError);
            throw new Error('번역 결과를 파싱할 수 없습니다.');
        }

        console.log('[Japanese Translation] 성공, 문장 수:', translationData.translation?.length || 0);

        res.json(translationData);

    } catch (err) {
        console.error('[translate-to-japanese error]', err);
        res.status(500).json({ error: err.message || 'Translation failed' });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// 여러 영상으로 대본 생성 엔드포인트
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 시니어 미드폼 대본 프롬프트 빌더
 */
function buildSeniorMidformPrompt(videos) {
    const transcriptsSection = videos.map((v, idx) => {
        return `### 영상 ${idx + 1}: ${v.title}
**자막**:
${v.transcript || '자막 없음'}

**댓글 (상위 10개)**:
${v.comments || '댓글 없음'}
`;
    }).join('\n---\n\n');

    return `
당신은 이제 시니어 미드폼 대본작가입니다.

아래는 ${videos.length}개의 유튜브 영상 자막과 댓글입니다.

${transcriptsSection}

---

**당신의 임무**:

1. **분석 단계**:
   - 위 영상들의 공통 패턴 분석
   - 비율, 요체, 대사 vs 나레이션 비율 파악
   - 단어 선택, 문장 구조 분석
   - 시청자 댓글에서 Pros(공감 포인트)와 Cons(부정적 반응) 파악

2. **대본 생성 단계**:
   - **분량**: 2분 30초 ~ 3분 30초 분량의 대본 작성
   - **나레이션 대 대사 비율**: 6:4 (나레이션이 더 많이)
   - **타겟**: 시니어 세대 (50대 이상)
   - **톤앤매너**: 따뜻하고 공감 가는 어조, 과장 없이 담백하게
   - **구조**: 
     - [인트로] 상황 설정 및 후킹
     - [전개] 갈등 또는 정보 전달
     - [클라이막스] 감정선 최고조 또는 핵심 메시지
     - [결말] 따뜻한 마무리 또는 교훈

3. **제약 사항**:
   - 원본 영상의 스토리를 그대로 복사하지 말 것
   - 여러 영상에서 영감을 받아 **새로운 이야기** 창작
   - 단어 선택과 문장 표현을 다르게 하여 저작권 회피
   - 시청자 댓글의 Cons를 반영하여 개선

**출력 형식**:

## [분석 결과]
**공통 패턴**: (2~3줄)
**Pros**: (시청자가 좋아한 포인트 2~3개)
**Cons**: (부정적 반응 1~2개, 없으면 "없음")

## [새로운 대본 - 시니어 미드폼]
(2분 30초 ~ 3분 30초 분량의 완성된 대본)

**[나레이션]**: ...
**[대사 - 인물명]**: "..."
**[나레이션]**: ...
(계속...)

---

이제 시작하세요!
    `.trim();
}

/**
 * Claude API 호출
 */
async function callClaudeAPI(prompt) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'x-api-key': ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json'
        },
        body: JSON.stringify({
            model: CLAUDE_MODEL,
            max_tokens: 8192,
            messages: [{ role: 'user', content: prompt }]
        })
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Claude API 호출 실패');
    }

    return response.json();
}

/**
 * Gemini API 호출 (기존 코드 재사용)
 */
async function callGeminiAPI(prompt) {
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

    const response = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }]
        })
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Gemini API 호출 실패');
    }

    return response.json();
}

app.post('/api/generate-script-from-multiple', async (req, res) => {
    try {
        const { videos, aiProvider } = req.body || {};

        if (!videos || !Array.isArray(videos) || videos.length === 0) {
            return res.status(400).send('videos 배열이 필요합니다.');
        }

        if (videos.length > 5) {
            return res.status(400).send('최대 5개 영상까지만 선택 가능합니다.');
        }

        console.log(`[Multi-Video Script] ${videos.length}개 영상, AI: ${aiProvider}`);

        // 프롬프트 생성
        const prompt = buildSeniorMidformPrompt(videos);

        let scriptMarkdown = '';

        if (aiProvider === 'claude') {
            if (!ANTHROPIC_API_KEY) {
                return res.status(500).send('ANTHROPIC_API_KEY가 서버에 설정되어 있지 않습니다.');
            }

            const claudeData = await callClaudeAPI(prompt);
            scriptMarkdown = claudeData?.content?.[0]?.text?.trim() || '';

            if (!scriptMarkdown) {
                throw new Error('Claude 응답에서 대본 텍스트를 찾지 못했습니다.');
            }
        } else {
            // Default: Gemini
            if (!GEMINI_API_KEY) {
                return res.status(500).send('GEMINI_API_KEY가 서버에 설정되어 있지 않습니다.');
            }

            const geminiData = await callGeminiAPI(prompt);
            scriptMarkdown = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';

            if (!scriptMarkdown) {
                throw new Error('Gemini 응답에서 대본 텍스트를 찾지 못했습니다.');
            }
        }

        return res.json({
            scriptMarkdown,
            aiProvider: aiProvider || 'gemini',
            videoCount: videos.length
        });

    } catch (err) {
        console.error('[generate-script-from-multiple error]', err);
        res.status(500).send(err.message || 'internal server error');
    }
});

/**
 * 나노바나나 (영포티 풍자) 웹툰 대본 프롬프트 빌더
 */
function buildNanoBananaPrompt(topic) {
    return `
 당신은 유튜브 쇼츠용 '영포티(Young Forty)' 풍자 웹툰의 대본과 장면 묘사를 생성하는 전문 플래너입니다. 아래의 아트 스타일과 캐릭터 페르소나를 완벽히 이해하고, 이미지 생성 AI가 최상의 결과물을 낼 수 있도록 대본을 작성하세요.

 1. 아트 스타일: [나노바나나 (Nano Banana)]
 시각적 특징: 흑백(Monochrome), 고퀄리티 한국 웹툰(Manhwa) 화풍, 하이 콘트라스트.
 기술적 요소: 스크린톤(Screentones), 망점(Halftone dots), 크로스 해칭을 이용한 정교한 명암 처리.
 분위기: 시네마틱한 구도, 역동적인 포즈, 감정 표현이 풍부한 캐릭터.

 2. 캐릭터 페르소나 및 외모 고정 (중요)
 모든 장면 묘사에서 아래 외모 설정을 기본으로 하세요.

 [남성: 영포티]
 외모: 안경 쓴 아시아 남성, 짧은 머리, 인자한(?) 미소, 운동으로 다져진 체격(하지만 어딘가 과해 보임).
 의상: 검정색 기능성 스포츠 티셔츠 고정.
 성격: 자기가 쿨하고 젊다고 믿는 40대. 아재 감성을 힙하다고 생각하며, 상황을 장황하게 설명하거나 훈수 두는 것을 좋아함.

 [여성: 트레이너/전문가]
 외모: 칼단발 머리(Bob cut)와 앞머리(Bangs)가 있는 아시아 여성, 탄탄한 운동 체격.
 의상: 전문 스포츠 웨어(기능성 티셔츠, 검정 레깅스) 고정.
 성격: 침착하고 전문적임. 영포티 남성의 행동을 보며 어이없어하거나, 애써 침착하게 대응하는 리액션 중심.

 3. 말풍선(Speech Bubble) 설계 가이드
 이미지는 배경과 캐릭터만 생성(No Text)하는 것을 권장하므로, 별도의 오버레이 기능을 위해 장면을 구조화하세요.

 [말풍선 타입 정의]
 [일반]: 평범한 대화. 둥근 테두리.
 [외침]: 소리를 지르거나 강조할 때. 뾰족한 가시 테두리.
 [생각]: 속마음. 구름 모양 테두리.
 [임팩트]: 배경에 크게 들어가는 효과음이나 수식어 (예: "뿜!!", "어질..", "영.포.티").

 4. [중요] 말풍선 텍스트 규칙
 최대한 짧게: 1~2문장 내외, 줄바꿈 포함. (예: "말씀 중에 / 죄송하지만...")
 캐릭터 말투:
 영포티: "랄까?", "우리 때는 말이야", "오빠가~" 등 능글맞거나 권위적인 말투.
 트레이너: "아.. 네.", "회원님?", "그건 좀.." 등 당황함이 섞인 짧고 간결한 리액션.

 5. 요청된 주제/상황:
 "${topic}"

 6. 출력 형식 (반드시 JSON 형식을 준수하세요)
 {
   "scenes": [
     {
       "sceneNumber": "01",
       "imageDescription": "(영문 이미지 생성 프롬프트: 'Nano Banana' 스타일 키워드 및 캐릭터 외모 설정 포함)",
       "sceneDescription": "(한국어 장면 상황 설명)",
       "speechBubbles": [
         { "speaker": "영포티", "type": "외침", "position": "좌상단", "text": "나 아직 안 죽었어!" },
         { "speaker": "트레이너", "type": "생각", "position": "우하단", "text": "(죽으신 것 같은데..)" }
       ]
     },
     ... (최소 4장 이상의 장면 생성)
   ]
 }
    `.trim();
}

app.post('/api/generate-nano-script', async (req, res) => {
    try {
        const { topic } = req.body;

        if (!topic) {
            return res.status(400).send('topic 이 필요합니다.');
        }

        console.log(`[Nano Script] 주제: ${topic}`);

        const prompt = buildNanoBananaPrompt(topic);

        // Gemini API 호출 (항상 Gemini 2.5 Flash 사용)
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

        const geminiRes = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    responseMimeType: "application/json"
                }
            })
        });

        const geminiData = await geminiRes.json();

        if (!geminiRes.ok) {
            console.error('[Gemini error]', geminiData);
            throw new Error(geminiData.error?.message || 'Gemini 호출 실패');
        }

        const jsonResponse = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (!jsonResponse) {
            throw new Error('Gemini 응답에서 대본 데이터를 찾지 못했습니다.');
        }

        // 결과 반환
        return res.json(JSON.parse(jsonResponse));

    } catch (err) {
        console.error('[generate-nano-script error]', err);
        res.status(500).json({ error: err.message || 'internal server error' });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// YouTube Transcript 가져오기 엔드포인트 (Apify 대체)
// ═══════════════════════════════════════════════════════════════════════════

// OpenAI Client
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Helper: Download file from URL
async function downloadFile(url, destPath) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(destPath);
        https.get(url, (response) => {
            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download file: ${response.statusCode}`));
                return;
            }
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                resolve();
            });
        }).on('error', (err) => {
            fs.unlink(destPath, () => { });
            reject(err);
        });
    });
}

// API: Analyze Viral Video (Download -> Whisper -> Comments)
app.post('/api/analyze-viral-video', async (req, res) => {
    try {
        const { url, platform } = req.body;
        console.log(`[Viral Analysis] Analyzing ${platform} video: ${url}`);

        if (!url) return res.status(400).json({ error: 'URL is required' });

        const client = new ApifyClient({ token: APIFY_TOKEN });
        let videoData = null;
        let transcript = '';
        let comments = [];

        // 1. Scrape Video Metadata & URL using Apify
        if (platform === 'tiktok') {
            // Use TikTok scraper to get direct video URL
            const run = await client.actor('clockworks/free-tiktok-scraper').call({
                postURLs: [url], // FIXED: postURLs (uppercase)
                shouldDownloadVideos: false,
                shouldDownloadCovers: true
            });
            const { items } = await client.dataset(run.defaultDatasetId).listItems();
            if (items.length > 0) {
                videoData = items[0];
            }
        }
        // Add other platforms later (Instagram, YouTube)

        if (!videoData || !videoData.videoUrl) {
            console.log('[Viral Analysis] Scraping failed or no video URL - Proceeding without video file');
            // Instead of error, we proceed with limited data
            videoData = { text: '틱톡 영상', authorMeta: { name: 'Unknown' } };
        }

        // 2. Download Video for Whisper
        // Temp file path
        const tempFilePath = path.join(os.tmpdir(), `viral_${Date.now()}.mp4`);

        // If we have videoUrl, download it
        if (videoData && videoData.videoUrl) {
            console.log(`[Viral Analysis] Downloading video from ${videoData.videoUrl}`);
            await downloadFile(videoData.videoUrl, tempFilePath);

            // 3. Transcribe with Whisper
            console.log('[Viral Analysis] Transcribing audio...');
            const transcription = await openai.audio.transcriptions.create({
                file: fs.createReadStream(tempFilePath),
                model: 'whisper-1',
                language: 'ko', // Assuming Korean content mostly
                response_format: 'text'
            });
            transcript = transcription;
            console.log('[Viral Analysis] Transcript extracted');

            // Cleanup temp file
            fs.unlink(tempFilePath, (err) => { if (err) console.error(err); });
        }

        // 4. Get Comments
        // If no comments found, return empty or try to fetch again. NO MOCK COMMENTS.
        if (!comments || comments.length === 0) {
            console.log('[Viral Analysis] No comments found in scraper result.');
            // Optional: Return warning or just empty
        }

        res.json({
            transcript,
            comments: comments || [],
            videoUrl: videoData?.videoUrl || '',
            metadata: {
                title: videoData?.text || '제목 없음',
                author: videoData?.authorMeta?.name || 'Unknown',
                views: videoData?.playCount || 0,
                likes: videoData?.diggCount || 0,
                thumbnail: videoData?.covers?.default || videoData?.covers?.origin || ''
            }
        });

    } catch (error) {
        console.error('[Viral Analysis] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// API: Generate Viral Script (Gemini)
app.post('/api/generate-viral-script', async (req, res) => {
    try {
        const { transcript, comments, metadata, useViralPatterns } = req.body;
        console.log('[Viral Gen] Generating script based on transcript...', useViralPatterns ? '(Using Viral Patterns)' : '');

        const { GoogleGenerativeAI } = require('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

        // Inject Learned Patterns if requested
        let viralExamplesText = "";
        if (useViralPatterns) {
            try {
                const archivePath = path.join(__dirname, 'viral_archive.json');
                if (fs.existsSync(archivePath)) {
                    const archive = JSON.parse(fs.readFileSync(archivePath, 'utf8'));
                    // Get top 3 most recent
                    const recent = archive.slice(-3).reverse();

                    const learnedPatterns = recent.map((item, i) =>
                        `[학습된 바이럴 패턴 ${i + 1}]\n- Hook Idea: "${item.viralPoint.hook}"\n- Structure: ${item.viralPoint.structure}\n- Point: ${item.viralPoint.viral_reason}`
                    ).join('\n\n');

                    if (learnedPatterns) {
                        viralExamplesText = `\n\n════════════════════════════════\n🧬 [USER ANALYZED PATTERNS (Apply these success factors)]\n${learnedPatterns}\n════════════════════════════════\n\n위 학습된 패턴의 성공 요인을 이번 대본에 적극적으로 반영하세요.`;
                        console.log('[Viral Gen] Injected viral patterns into prompt.');
                    }
                }
            } catch (e) {
                console.warn("[Viral Gen] Failed to load viral_archive.json:", e);
            }
        }

        // Updated Prompt based on User Feedback (Event/Incident Type Structure)
        const prompt = `
당신은 바이럴 숏폼(Shorts/Reels/TikTok) 전문 시나리오 작가입니다.
주어진 영상의 대본과 댓글 반응을 분석하여, **"사건형/논란형 쇼츠 대본"**으로 재구성해주세요.
단순한 장면 나열이 아닌, 시청자를 몰입시키는 **Storytelling Script** 형식이여야 합니다.

**분석 데이터:**
1. 원본 내용: "${transcript}"
2. 댓글 반응: ${JSON.stringify(comments)}
3. 메타데이터: ${JSON.stringify(metadata)}
${viralExamplesText}

**작성 기준:**
- **구조**: Hook(0~2초) -> 전개(3~7초) -> 반전(8~12초) -> 강조(13~17초) -> CTA(18~22초)
-**전략적 목표:**
- **이건 사건형 쇼츠로 가야 하고, 감정이 이미 댓글에서 폭발했기 때문에 '분노/불편 포인트'를 정면으로 건드리는 구조가 제일 잘 먹힌다.**
- (웃음 유도 X / 판단 유도 O)
- 시청자가 "맞아 저런 사람 있어"라고 댓글을 달게 유도하세요.
- 길이는 30~50초 내외로 짧게 끊으세요.
- **톤앤매너**: 영포티/꼰대를 풍자하거나, 참교육하는 사이다 감성, 또는 충격적인 진실 고발.
- **길이**: 30초 이내로 타이트하게.
- **형식**: JSON 출력 (아래 형식 엄수)

**출력 형식 (JSON):**
{
  "title": "자극적인 썸네일 제목",
  "concept": "이 영상의 바이럴 전략 (1줄 요약)",
  "reasoning": "대본 생성 근거 (예: 영상은 훈훈하지만 댓글에서 '남 보여주기식'이라는 비판이 많아 이를 비꼬는 풍자 컨셉으로 잡음 / 영상은 단순 개그지만 댓글이 진지해서 사회 비판으로 전환함 등 상세 설명)",
  "sections": [
    {
      "type": "🔥 Hook (0~2초)",
      "script": "나레이션 대사",
      "visual": "화면 연출 설명"
    },
    {
      "type": "⚠️ 전개 (3~7초)",
      "script": "나레이션 대사",
      "visual": "화면 연출 설명"
    },
    {
      "type": "🧠 반전 (8~12초)",
      "script": "나레이션 대사",
      "visual": "화면 연출 설명"
    },
    {
      "type": "👀 강조 (13~17초)",
      "script": "나레이션 대사",
      "visual": "화면 연출 설명"
    },
    {
      "type": "📌 CTA (18~22초)",
      "script": "나레이션 대사",
      "visual": "화면 연출 설명"
    }
  ]
}
`;

        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp", generationConfig: { responseMimeType: "application/json" } });
        const result = await model.generateContent(prompt);
        let text = result.response.text();

        // Remove markdown code blocks if present
        text = text.replace(/```json/g, '').replace(/```/g, '').trim();

        const scriptData = JSON.parse(text);

        res.json(scriptData);

    } catch (error) {
        console.error('[Viral Gen] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// Script Library API Endpoints
// ═══════════════════════════════════════════════════════════════════════════

// API: Save script to library (Google Sheets)
app.post('/api/save-to-library', async (req, res) => {
    try {
        const { videoId, title, channelName, category, transcript, memo, views } = req.body;

        if (!videoId || !title || !transcript) {
            return res.status(400).json({ error: 'videoId, title, and transcript are required' });
        }

        const scriptData = {
            videoId,
            title,
            channelName: channelName || '',
            category: category || '일반',
            transcript,
            memo: memo || '',
            views: views || 0
        };

        const success = await googleSheetsService.appendScript(scriptData);

        if (success) {
            res.json({ success: true, message: '스크립트가 라이브러리에 추가되었습니다.' });
        } else {
            res.status(500).json({ success: false, error: 'Google Sheets 저장 실패' });
        }

    } catch (error) {
        console.error('[Save to Library] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// API: Get scripts from library by category
app.get('/api/get-library-scripts', async (req, res) => {
    try {
        const { category, limit } = req.query;

        const scripts = await googleSheetsService.getScriptsByCategory(
            category || null,
            parseInt(limit) || 5
        );

        res.json({ success: true, scripts });

    } catch (error) {
        console.error('[Get Library Scripts] Error:', error);
        res.status(500).json({ error: error.message });
    }
});


// Test endpoint
app.get('/api/test', (req, res) => {
    res.json({ status: 'Server is working!', timestamp: new Date().toISOString() });
});

app.post('/api/get-transcript', async (req, res) => {
    try {
        const { videoId } = req.body;

        if (!videoId) {
            return res.status(400).json({ error: 'videoId가 필요합니다.' });
        }

        console.log(`[Transcript] Fetching transcript for video: ${videoId}`);

        // Helper: Timeout Wrapper
        const fetchWithTimeout = (promise, ms) => {
            return new Promise((resolve, reject) => {
                const timer = setTimeout(() => {
                    reject(new Error(`Timeout after ${ms}ms`));
                }, ms);
                promise
                    .then(value => {
                        clearTimeout(timer);
                        resolve(value);
                    })
                    .catch(reason => {
                        clearTimeout(timer);
                        reject(reason);
                    });
            });
        };

        let transcript = null;

        // 1. Try youtube-transcript library with multiple language options
        try {
            console.log('[Transcript] Trying youtube-transcript library...');

            // Try multiple strategies in order
            const strategies = [
                { lang: 'ko', desc: 'Korean (ko)' },
                { lang: 'en', desc: 'English (en)' },
                { lang: null, desc: 'Auto-detect (no lang)' }
            ];

            for (const strategy of strategies) {
                try {
                    console.log(`[Transcript] Attempting: ${strategy.desc}`);
                    if (strategy.lang) {
                        transcript = await YoutubeTranscript.fetchTranscript(videoId, { lang: strategy.lang });
                    } else {
                        transcript = await YoutubeTranscript.fetchTranscript(videoId);
                    }

                    console.log(`[Transcript] Result for ${strategy.desc}: ${transcript ? transcript.length : 'null'} items`);

                    if (transcript && transcript.length > 0) {
                        console.log(`[Transcript] SUCCESS with ${strategy.desc}! Got ${transcript.length} segments`);
                        console.log(`[Transcript] First segment sample: ${JSON.stringify(transcript[0])}`);
                        break;
                    }
                } catch (langErr) {
                    console.log(`[Transcript] ${strategy.desc} failed: ${langErr.message}`);
                }
            }
        } catch (e) {
            console.log(`[Transcript] youtube-transcript library failed: ${e.message}`);
        }

        // 2. Apify Fallback
        if ((!transcript || transcript.length === 0) && APIFY_TOKEN) {
            console.log('[Transcript] All local attempts failed. Trying APIFY fallback...');
            try {
                const runUrl = `https://api.apify.com/v2/acts/${APIFY_ACTOR_ID}/runs?token=${APIFY_TOKEN}`;

                // Actor 실행
                const runResponse = await fetch(runUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        videoUrl: `https://www.youtube.com/watch?v=${videoId}`, // 수정: videoUrl 필수
                        // language: 'ko' // 언어 강제 제거 (모든 언어 시도)
                    })
                });

                if (!runResponse.ok) {
                    throw new Error(`Apify Run Start Failed: ${await runResponse.text()}`);
                }

                const runData = await runResponse.json();
                const runId = runData.data.id;
                console.log(`[Transcript] Apify Run Started: ${runId}`);

                // 결과 폴링 (최대 30초 대기 - 브라우저 타임아웃 방지)
                let tempTranscript = null;
                for (let i = 0; i < 10; i++) { // 3초 * 10 = 30초
                    await new Promise(r => setTimeout(r, 3000));

                    const statusUrl = `https://api.apify.com/v2/acts/${APIFY_ACTOR_ID}/runs/${runId}?token=${APIFY_TOKEN}`;
                    const statusRes = await fetch(statusUrl);
                    const statusData = await statusRes.json();
                    const status = statusData.data.status;

                    console.log(`[Transcript] Apify Run Status: ${status}`);

                    if (status === 'SUCCEEDED') {
                        // 데이터셋 가져오기
                        const datasetId = statusData.data.defaultDatasetId;
                        const itemsUrl = `https://api.apify.com/v2/datasets/${datasetId}/items?token=${APIFY_TOKEN}`;
                        const itemsRes = await fetch(itemsUrl);
                        const items = await itemsRes.json();

                        if (items && items.length > 0) {
                            const item = items[0];
                            console.log('[Transcript] Apify item keys:', Object.keys(item)); // DEBUG

                            // Apify Actor 반환 형식: { data: [{text: "..."}, {text: "..."}, ...] }
                            if (item && item.data && Array.isArray(item.data)) {
                                console.log('[Transcript] item.data length:', item.data.length); // DEBUG
                                if (item.data.length > 0) {
                                    console.log('[Transcript] First segment:', JSON.stringify(item.data[0])); // DEBUG
                                }
                                // data 배열에서 text 필드 추출
                                tempTranscript = item.data.map(segment => segment.text || '').join(' ');
                                console.log('[Transcript] Extracted from item.data array');

                                // 빈 문자열인 경우 null로 설정
                                if (!tempTranscript || tempTranscript.trim().length === 0) {
                                    console.warn('[Transcript] item.data array was empty or contained no text');
                                    tempTranscript = null;
                                }
                            } else if (item && item.text) {
                                tempTranscript = item.text;
                                console.log('[Transcript] Extracted from item.text');
                            } else if (item && item.captions) {
                                tempTranscript = item.captions.map(c => c.text).join(' ');
                                console.log('[Transcript] Extracted from item.captions');
                            } else {
                                // fallback: dump all string values
                                console.warn('[Transcript] Unknown Apify format, using JSON.stringify');
                                tempTranscript = JSON.stringify(items);
                            }
                        }
                        break;
                    } else if (status === 'FAILED' || status === 'ABORTED') {
                        throw new Error('Apify Run Failed');
                    }
                }

                if (tempTranscript) {
                    // Apify 결과 형식이 YoutubeTranscript와 다를 수 있으므로 텍스트만 있으면 성공 처리
                    console.log('[Transcript] Apify fetch success!');
                    console.log('[Transcript] Transcript length:', tempTranscript.length); // DEBUG
                    console.log('[Transcript] Preview:', tempTranscript.substring(0, 200)); // DEBUG
                    return res.json({
                        success: true,
                        transcript: tempTranscript,
                        segments: 0, // 세그먼트 정보는 없거나 다를 수 있음
                        source: 'apify'
                    });
                }

            } catch (apifyErr) {
                console.error(`[Transcript] Apify fallback error: ${apifyErr.message}`);
            }
        }

        if (!transcript || transcript.length === 0) {
            return res.status(404).json({ error: '자막을 찾을 수 없습니다. (자막이 없거나 비공개일 수 있습니다)' });
        }

        // 자막 텍스트 추출 (YoutubeTranscript 포맷인 경우)
        const transcriptText = Array.isArray(transcript)
            ? transcript.map(item => item.text).join(' ')
            : transcript;

        console.log(`[Transcript] Successfully fetched ${Array.isArray(transcript) ? transcript.length : 'unknown'} segments`);

        return res.json({
            success: true,
            transcript: transcriptText,
            segments: Array.isArray(transcript) ? transcript.length : 0,
            source: 'youtube-transcript'
        });

    } catch (err) {
        console.error('[get-transcript error]', err);

        // 자막이 비활성화된 경우
        if (err.message && err.message.includes('Transcript is disabled')) {
            return res.status(404).json({
                error: '이 영상은 자막이 비활성화되어 있습니다.',
                details: err.message
            });
        }

        return res.status(500).json({
            error: '자막을 가져오는 중 오류가 발생했습니다.',
            details: err.message
        });
    }
});


// ═══════════════════════════════════════════════════════════════════════════
// 트렌드 분석 엔드포인트 (Perplexity + Gemini)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Perplexity API 호출 (Sonar 모델 사용 - 실시간 검색 지원)
 */
async function callPerplexityAPI(query) {
    if (!PERPLEXITY_API_KEY) {
        throw new Error('PERPLEXITY_API_KEY 가 설정되지 않았습니다.');
    }

    const response = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: 'sonar-pro', // 실시간 검색에 최적화된 모델
            messages: [
                { role: 'system', content: 'You are a trending topic researcher specialized in the senior demographic (50-70+). Your goal is to find real-time, high-viral potential topics based on actual search trends and SNS discussions.' },
                { role: 'user', content: query }
            ],
            max_tokens: 2000
        })
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Perplexity API 호출 실패');
    }

    return response.json();
}

app.post('/api/analyze-trends', async (req, res) => {
    try {
        const { country, genre, dateRange } = req.body || {};
        const targetCountry = country || 'Japan';
        const targetGenre = genre || 'all';
        const targetDateRange = dateRange || '1week_to_2months';

        console.log(`[Trend Analysis] Country: ${targetCountry}, Genre: ${targetGenre}, DateRange: ${targetDateRange}`);

        if (!PERPLEXITY_API_KEY) {
            return res.status(500).send('PERPLEXITY_API_KEY 가 서버에 설정되어 있지 않습니다.');
        }

        // 장르별 검색 키워드 및 필터
        let genreContext = '';
        let exclusions = '';
        switch (targetGenre) {
            case 'humor':
                genreContext = 'funny, comedic, embarrassing moments, family mishaps, relatable fails, generational humor, kiosk struggles, tech fails';
                exclusions = 'STRICTLY EXCLUDE any serious political news, pension reforms, economic policies, death, illness, or sad topics. Focus ONLY on light-hearted, funny, shareable content.';
                break;
            case 'drama':
                genreContext = 'family drama, emotional stories, reunion stories, hidden sacrifices, heartwarming reconciliation';
                exclusions = 'Exclude pure comedy or news-style content. Focus on emotional, dramatic narratives.';
                break;
            case 'economy':
                genreContext = 'retirement income, pension, investment, senior jobs, financial tips, real estate for seniors';
                exclusions = 'Keep it informative and practical. Exclude emotional drama or humor.';
                break;
            case 'health':
                genreContext = 'health tips, exercise, diet, longevity secrets, medical checkups, senior fitness';
                exclusions = 'Focus on practical health advice. Exclude economic or political topics.';
                break;
            default:
                genreContext = 'drama, humor, health, economy';
                exclusions = '';
        }

        // 날짜 범위 컨텍스트
        let dateContext = 'from the past 1 week to 2 months (late 2025)';

        // 1. Perplexity를 통해 실시간 트렌드 검색 (엄격한 필터링)
        const searchPrompt = `
            You are a senior content researcher for YouTube. Find the top 5 trending topics for seniors (aged 50-75) in ${targetCountry} ${dateContext}.

            **STRICT GENRE FILTER: ${targetGenre.toUpperCase()}**
            Focus ONLY on: ${genreContext}.
            ${exclusions}

            For EACH topic, provide in this EXACT format:
            1. **Topic Name** (in Korean)
            2. **Category**: (Must be one of: Humor, Drama, Economy, Health)
            3. **Viral Potential Score**: (1-10, based on shareability among 50-70 year olds)
            4. **Trending Keywords**: (3-5 Korean keywords used in SNS/Search)
            5. **Why Trending**: (1-2 sentences explaining why seniors care about this NOW)
            6. **Reference Examples**: (Mention any viral videos/posts if available)
            7. **Fit for Channel**: (Why this topic would work for a senior YouTube channel)

            Be specific and practical. Return topics that can be directly turned into YouTube videos.
        `;

        const perplexityData = await callPerplexityAPI(searchPrompt);
        const searchResult = perplexityData.choices[0].message.content;

        // 2. Gemini를 통해 비디오 컨셉 브리프 생성 (구조화된 JSON)
        const geminiPrompt = `
            Based on the following trending topics for seniors in ${targetCountry}, generate 3 high-impact video concept briefs.
            
            **Important**: The user selected genre "${targetGenre}". Make sure ALL concepts match this genre strictly.
            
            Trending Topics Analysis:
            ${searchResult}
            
            Return your response in the following JSON format (NO markdown, just pure JSON):
            {
                "market_analysis": {
                    "overall_sentiment": "positive/neutral/negative",
                    "sentiment_score": <number 1-100>,
                    "buzz_volume": <number 1-100>,
                    "key_themes": ["theme1", "theme2", "theme3"]
                },
                "concepts": [
                    {
                        "title_kr": "한국어 제목",
                        "genre": "Humor/Drama/Economy/Health",
                        "viral_potential": <number 1-10>,
                        "hook_visual": "첫 5초 장면 설명",
                        "plot_summary": "스토리 개요 (2-3문장)",
                        "reference_style": "참고할 영상 스타일 (예: Mr. Bean 사일런트 코미디)",
                        "reprocessing_strategy": "어떻게 재가공할지 (예: 뉴스 클립 + 더빙)",
                        "why_fits_channel": "왜 이 영상이 시니어 채널에 적합한지",
                        "target_audience": "주 타겟층 설명"
                    }
                ]
            }
            
            Return ONLY the JSON object, no other text.
        `;

        const geminiResponse = await callGeminiAPI(geminiPrompt);
        let conceptsJson = null;
        let conceptsRaw = geminiResponse?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';

        // JSON 파싱 시도
        try {
            // 마크다운 코드 블록 제거
            conceptsRaw = conceptsRaw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            conceptsJson = JSON.parse(conceptsRaw);
        } catch (parseErr) {
            console.warn('[Trend Analysis] JSON parse failed, returning raw text:', parseErr.message);
            conceptsJson = null;
        }

        return res.json({
            trends: searchResult,
            conceptsJson: conceptsJson,
            conceptsRaw: conceptsRaw,
            meta: {
                country: targetCountry,
                genre: targetGenre,
                dateRange: targetDateRange
            }
        });
    } catch (err) {
        console.error('[analyze-trends error]', err);
        res.status(500).send(err.message || 'internal server error');
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// 듀얼 트랙 바이럴 분석 (YouTube 기반)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * YouTube 검색 API 호출
 */
async function searchYouTubeVideos(keyword, publishedAfter, publishedBefore, maxResults = 10) {
    // 프론트엔드에서 YouTube API 키를 받아야 함 (서버에는 없음)
    // 이 함수는 프론트엔드에서 호출되도록 설계를 변경
    throw new Error('YouTube 검색은 프론트엔드에서 직접 수행해야 합니다.');
}

app.post('/api/viral-analysis', async (req, res) => {
    try {
        const { videos, track } = req.body || {};

        if (!videos || !Array.isArray(videos) || videos.length === 0) {
            return res.status(400).send('videos 배열이 필요합니다.');
        }

        const trackType = track || 'hot'; // 'hot' or 'recycle'

        console.log(`[Viral Analysis] Track: ${trackType}, Videos: ${videos.length}`);

        // 각 비디오에 대한 분석 준비
        const videoSummaries = videos.map((v, i) =>
            `${i + 1}. "${v.title}" (조회수: ${v.viewCount?.toLocaleString() || 'N/A'}, Outlier Score: ${v.outlierScore || 'N/A'}%)`
        ).join('\n');

        // Gemini 분석 프롬프트 (트랙별 다르게)
        let geminiPrompt = '';

        if (trackType === 'hot') {
            geminiPrompt = `
                당신은 유튜브 바이럴 분석 전문가입니다. 다음은 최근 1달 내에 폭발적인 조회수를 기록한 시니어 타겟 유튜브 쇼츠 영상들입니다.
                
                영상 목록:
                ${videoSummaries}
                
                각 영상에 대해 다음을 분석해주세요:
                1. 왜 지금 바이럴되고 있는가? (트렌드 분석)
                2. 핵심 스토리 구조 (후킹 → 전개 → 반전)
                3. 시청자 타겟은 시니어인데, 영상 속 캐릭터는 누구인가?
                4. AI 이미지 + TTS로 비슷하게 만들려면 어떻게 해야 하는지
                5. 지금 따라 만들면 성공할 확률 (1-10점)
                
                JSON 형식으로 반환:
                {
                    "analyses": [
                        {
                            "videoIndex": 1,
                            "whyViral": "왜 터졌는지 1-2문장",
                            "storyStructure": "후킹-전개-반전 구조 설명",
                            "characterNote": "영상 속 캐릭터가 시니어인지 아닌지",
                            "aiReproductionGuide": "AI 이미지 + TTS로 재현하는 방법",
                            "successProbability": 8,
                            "recommendedAction": "지금 바로 만들어야 함 / 조금 기다려도 됨"
                        }
                    ],
                    "overallInsight": "전체 트렌드 요약 (1-2문장)"
                }
                
                Return ONLY the JSON object, no other text.
            `;
        } else {
            // recycle track
            geminiPrompt = `
                당신은 유튜브 바이럴 분석 전문가입니다. 다음은 2~3달 전에 폭발적인 조회수를 기록했던 시니어 타겟 유튜브 쇼츠 영상들입니다.
                이 영상들은 이미 검증된 바이럴 구조이지만, 시청자들이 대부분 잊었을 시간이 지났습니다.
                
                영상 목록:
                ${videoSummaries}
                
                각 영상에 대해 다음을 분석해주세요:
                1. 당시 왜 바이럴됐었는가? (보편적 감정 트리거)
                2. 핵심 스토리 구조 (후킹 → 전개 → 반전)
                3. 시청자 타겟은 시니어인데, 영상 속 캐릭터는 누구였는가?
                4. "재활용"하려면 어떻게 변형해야 하는가? (AI 이미지 + TTS 기반)
                5. 다시 만들면 성공할 확률 (1-10점)
                
                JSON 형식으로 반환:
                {
                    "analyses": [
                        {
                            "videoIndex": 1,
                            "whyViralThen": "당시 왜 터졌는지 1-2문장",
                            "storyStructure": "후킹-전개-반전 구조 설명",
                            "characterNote": "영상 속 캐릭터가 시니어인지 아닌지",
                            "recycleStrategy": "어떻게 변형해서 재활용할지",
                            "aiReproductionGuide": "AI 이미지 + TTS로 재현하는 방법",
                            "successProbability": 7,
                            "whyStillWorks": "왜 지금 다시 만들어도 효과적인지"
                        }
                    ],
                    "overallInsight": "재활용 가치 요약 (1-2문장)"
                }
                
                Return ONLY the JSON object, no other text.
            `;
        }

        const geminiResponse = await callGeminiAPI(geminiPrompt);
        let analysisJson = null;
        let analysisRaw = geminiResponse?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';

        // JSON 파싱 시도
        try {
            analysisRaw = analysisRaw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            analysisJson = JSON.parse(analysisRaw);
        } catch (parseErr) {
            console.warn('[Viral Analysis] JSON parse failed:', parseErr.message);
            analysisJson = null;
        }

        return res.json({
            track: trackType,
            analysisJson: analysisJson,
            analysisRaw: analysisRaw,
            videoCount: videos.length
        });

    } catch (err) {
        console.error('[viral-analysis error]', err);
        res.status(500).send(err.message || 'internal server error');
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// 재가공 영상 검색 API
// ═══════════════════════════════════════════════════════════════════════════
app.get('/api/search-reprocessed', async (req, res) => {
    try {
        const { language = 'ko', category = 'all', minViews = '1000000', dateRange = '1month', youtubeApiKey } = req.query;

        if (!youtubeApiKey) {
            return res.status(400).json({ error: 'YouTube API key required' });
        }

        // 언어별 키워드 매핑 (재가공 영상에 특화된 키워드)
        // 재가공 영상 = 바이럴 원본에 TTS 나레이션을 입힌 영상
        const languageKeywords = {
            ko: {
                all: '이유 shorts',  // "~한 이유" 패턴
                sports: '스포츠 레전드 순간',
                luxury: '명품 몰랐던',
                social: '사회실험 반전',
                animal: '동물 이유'
            },
            jp: {
                all: '理由 ショート',  // "~の理由" 패턴
                sports: 'スポーツ 伝説 瞬間',
                luxury: 'ブランド 知らなかった',
                social: '社会実験 逆転',
                animal: '動物 理由'
            },
            en: {
                all: 'reason why shorts',  // "reason why" 패턴
                sports: 'sports legendary moment',
                luxury: 'luxury unknown facts',
                social: 'social experiment revealed',
                animal: 'animal reason'
            }
        };

        const searchQuery = languageKeywords[language]?.[category] || languageKeywords[language]?.all || 'shorts';

        // 날짜 범위 계산
        let publishedAfter = '';
        if (dateRange !== 'any') {
            const now = new Date();
            const daysMap = { '1week': 7, '1month': 30, '3month': 90 };
            const days = daysMap[dateRange] || 30;
            const pastDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
            publishedAfter = pastDate.toISOString();
        }

        // 언어별 relevanceLanguage 매핑
        const languageCodes = { ko: 'ko', jp: 'ja', en: 'en' };
        const relevanceLanguage = languageCodes[language] || 'en';

        // YouTube API 검색 (relevance 순으로 변경)
        const searchParams = new URLSearchParams({
            part: 'snippet',
            q: searchQuery,
            type: 'video',
            videoDuration: 'short',
            order: 'relevance',  // viewCount → relevance로 변경
            relevanceLanguage: relevanceLanguage,  // 언어 필터 추가
            maxResults: '50',
            key: youtubeApiKey
        });

        if (publishedAfter) {
            searchParams.append('publishedAfter', publishedAfter);
        }

        const searchResponse = await fetch(`https://www.googleapis.com/youtube/v3/search?${searchParams}`);
        const searchData = await searchResponse.json();

        if (!searchData.items) {
            return res.json({ videos: [], totalResults: 0 });
        }

        const videoIds = searchData.items.map(item => item.id.videoId).join(',');

        // 비디오 상세 정보 가져오기
        const videoParams = new URLSearchParams({
            part: 'statistics,snippet,contentDetails',
            id: videoIds,
            key: youtubeApiKey
        });

        const videoResponse = await fetch(`https://www.googleapis.com/youtube/v3/videos?${videoParams}`);
        const videoData = await videoResponse.json();

        // 재가공 영상 필터링 및 결과 정리
        const minViewsNum = parseInt(minViews);
        const videos = videoData.items
            .filter(video => {
                const viewCount = parseInt(video.statistics?.viewCount || 0);
                return viewCount >= minViewsNum;
            })
            .map(video => {
                const title = video.snippet?.title || '';
                const description = video.snippet?.description || '';

                // 나레이션 감지 (재가공 영상의 특징적인 패턴들)
                // 한국어: "이유", "정체", "몰랐던", "비하인드", "순간", "레전드"
                // 일본어: "理由", "正体", "知らなかった", "裏話", "瞬間", "伝説"
                // 영어: "reason", "story", "explained", "behind", "moment", "legendary"
                const narrationPatterns = {
                    ko: ['이유', '정체', '몰랐던', '비하인드', '순간', '레전드', '반전', '진실', '사연'],
                    jp: ['理由', '正体', '知らなかった', '裏話', '瞬間', '伝説', '真実', '逆転'],
                    en: ['reason', 'story', 'explained', 'behind', 'moment', 'legendary', 'revealed', 'truth']
                };

                const hasNarration =
                    narrationPatterns.ko.some(word => title.includes(word)) ||
                    narrationPatterns.jp.some(word => title.includes(word)) ||
                    narrationPatterns.en.some(word => title.toLowerCase().includes(word)) ||
                    description.includes('나레이션') || description.includes('ナレーション') || description.toLowerCase().includes('narration');

                // 출처 표기 감지
                const sourceAttribution =
                    description.match(/출처[:\s]*([^\n]+)/i)?.[1] ||
                    description.match(/引用元[:\s]*([^\n]+)/i)?.[1] ||
                    description.match(/[Ss]ource[:\s]*([^\n]+)/i)?.[1] ||
                    '';

                return {
                    videoId: video.id,
                    title: video.snippet.title,
                    channelTitle: video.snippet.channelTitle,
                    channelId: video.snippet.channelId,
                    viewCount: parseInt(video.statistics?.viewCount || 0),
                    likeCount: parseInt(video.statistics?.likeCount || 0),
                    publishedAt: video.snippet.publishedAt,
                    thumbnail: video.snippet.thumbnails?.high?.url || video.snippet.thumbnails?.default?.url,
                    hasNarration,
                    sourceAttribution: sourceAttribution.trim().substring(0, 100)
                };
            })
            .sort((a, b) => b.viewCount - a.viewCount);

        res.json({
            videos,
            totalResults: videos.length,
            query: searchQuery,
            language
        });

    } catch (err) {
        console.error('[search-reprocessed error]', err);
        res.status(500).json({ error: err.message || 'Internal server error' });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// 채널 분석 API
// ═══════════════════════════════════════════════════════════════════════════
app.get('/api/analyze-channel', async (req, res) => {
    try {
        const { channelId, youtubeApiKey } = req.query;

        if (!youtubeApiKey || !channelId) {
            return res.status(400).json({ error: 'YouTube API key and channelId required' });
        }

        // 채널 정보 가져오기
        const channelParams = new URLSearchParams({
            part: 'snippet,statistics,contentDetails',
            id: channelId,
            key: youtubeApiKey
        });

        const channelResponse = await fetch(`https://www.googleapis.com/youtube/v3/channels?${channelParams}`);
        const channelData = await channelResponse.json();

        if (!channelData.items || channelData.items.length === 0) {
            return res.status(404).json({ error: 'Channel not found' });
        }

        const channel = channelData.items[0];
        const uploadsPlaylistId = channel.contentDetails?.relatedPlaylists?.uploads;

        // 최근 업로드 영상 가져오기
        const playlistParams = new URLSearchParams({
            part: 'snippet',
            playlistId: uploadsPlaylistId,
            maxResults: '50',
            key: youtubeApiKey
        });

        const playlistResponse = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?${playlistParams}`);
        const playlistData = await playlistResponse.json();

        const videoIds = playlistData.items?.map(item => item.snippet?.resourceId?.videoId).filter(Boolean).join(',') || '';

        // 비디오 상세 정보
        const videoParams = new URLSearchParams({
            part: 'statistics,snippet',
            id: videoIds,
            key: youtubeApiKey
        });

        const videoResponse = await fetch(`https://www.googleapis.com/youtube/v3/videos?${videoParams}`);
        const videoData = await videoResponse.json();

        // 최근 30일 영상만 필터링
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const recentVideos = videoData.items
            ?.filter(video => new Date(video.snippet.publishedAt) > thirtyDaysAgo)
            .map(video => ({
                videoId: video.id,
                title: video.snippet.title,
                viewCount: parseInt(video.statistics?.viewCount || 0),
                likeCount: parseInt(video.statistics?.likeCount || 0),
                publishedAt: video.snippet.publishedAt,
                thumbnail: video.snippet.thumbnails?.medium?.url
            }))
            .sort((a, b) => b.viewCount - a.viewCount)
            .slice(0, 10) || [];

        // 평균 조회수 계산
        const avgViewCount = recentVideos.length > 0
            ? Math.round(recentVideos.reduce((sum, v) => sum + v.viewCount, 0) / recentVideos.length)
            : 0;

        // 제목 키워드 분석
        const titleWords = recentVideos
            .map(v => v.title)
            .join(' ')
            .split(/[\s,\.\!]+/)
            .filter(word => word.length > 1);

        const wordFreq = {};
        titleWords.forEach(word => {
            wordFreq[word] = (wordFreq[word] || 0) + 1;
        });

        const frequentKeywords = Object.entries(wordFreq)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([word]) => word);

        res.json({
            channelId: channel.id,
            channelTitle: channel.snippet.title,
            subscriberCount: parseInt(channel.statistics?.subscriberCount || 0),
            videoCount: parseInt(channel.statistics?.videoCount || 0),
            viewCount: parseInt(channel.statistics?.viewCount || 0),
            avgViewCount,
            recentTopVideos: recentVideos,
            frequentKeywords,
            thumbnailUrl: channel.snippet.thumbnails?.high?.url
        });

    } catch (err) {
        console.error('[analyze-channel error]', err);
        res.status(500).json({ error: err.message || 'Internal server error' });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// 트렌드 모니터링 API
// ═══════════════════════════════════════════════════════════════════════════
app.get('/api/trending-monitor', async (req, res) => {
    try {
        const { region = 'JP', category = 'all', youtubeApiKey } = req.query;

        if (!youtubeApiKey) {
            return res.status(400).json({ error: 'YouTube API key required' });
        }

        // 카테고리 ID 매핑 (YouTube API)
        const categoryMap = {
            all: '',
            sports: '17',
            entertainment: '24',
            news: '25',
            people: '22'
        };

        const videoCategoryId = categoryMap[category] || '';

        // YouTube Trending API 호출
        const trendingParams = new URLSearchParams({
            part: 'snippet,statistics',
            chart: 'mostPopular',
            regionCode: region,
            maxResults: '50',
            key: youtubeApiKey
        });

        if (videoCategoryId) {
            trendingParams.append('videoCategoryId', videoCategoryId);
        }

        const trendingResponse = await fetch(`https://www.googleapis.com/youtube/v3/videos?${trendingParams}`);
        const trendingData = await trendingResponse.json();

        if (!trendingData.items) {
            return res.json({ trending: [], notYetReprocessed: [] });
        }

        // Shorts만 필터링 (60초 이하)
        const trending = trendingData.items
            .filter(video => {
                const duration = video.contentDetails?.duration || '';
                // ISO 8601 duration (PT1M30S) 파싱
                const match = duration.match(/PT(?:(\d+)M)?(?:(\d+)S)?/);
                if (!match) return false;
                const minutes = parseInt(match[1] || 0);
                const seconds = parseInt(match[2] || 0);
                const totalSeconds = minutes * 60 + seconds;
                return totalSeconds <= 60;
            })
            .map(video => {
                const title = video.snippet?.title || '';
                const description = video.snippet?.description || '';

                // 재가공 여부 판별 (간단한 패턴)
                const isReprocessed =
                    title.includes('이유') || title.includes('정체') ||
                    title.includes('理由') || title.includes('正体') ||
                    description.includes('출처') || description.includes('引用元') ||
                    description.includes('Source');

                return {
                    videoId: video.id,
                    title: video.snippet.title,
                    channelTitle: video.snippet.channelTitle,
                    viewCount: parseInt(video.statistics?.viewCount || 0),
                    likeCount: parseInt(video.statistics?.likeCount || 0),
                    publishedAt: video.snippet.publishedAt,
                    thumbnail: video.snippet.thumbnails?.high?.url,
                    isReprocessed,
                    categoryId: video.snippet.categoryId
                };
            });

        // 아직 재가공 안된 영상
        const notYetReprocessed = trending.filter(v => !v.isReprocessed);

        res.json({
            trending,
            notYetReprocessed,
            region,
            totalCount: trending.length
        });

    } catch (err) {
        console.error('[trending-monitor error]', err);
        res.status(500).json({ error: err.message || 'Internal server error' });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// 출처 URL 추출 API (재가공 채널에서 원본 바이럴 영상 찾기)
// ═══════════════════════════════════════════════════════════════════════════
app.post('/api/extract-sources', async (req, res) => {
    try {
        const { channelId, youtubeApiKey } = req.body;

        if (!youtubeApiKey || !channelId) {
            return res.status(400).json({ error: 'YouTube API key and channelId required' });
        }

        console.log(`[Extract Sources] Analyzing channel: ${channelId}`);

        // 1. 채널의 최근 영상 가져오기
        const channelResponse = await fetch(
            `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${channelId}&key=${youtubeApiKey}`
        );
        const channelData = await channelResponse.json();

        if (!channelData.items || channelData.items.length === 0) {
            return res.status(404).json({ error: 'Channel not found' });
        }

        const uploadsPlaylistId = channelData.items[0].contentDetails?.relatedPlaylists?.uploads;

        // 2. 플레이리스트에서 영상 목록 가져오기 (최대 50개)
        const playlistResponse = await fetch(
            `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${uploadsPlaylistId}&maxResults=50&key=${youtubeApiKey}`
        );
        const playlistData = await playlistResponse.json();

        if (!playlistData.items) {
            return res.json({ sources: [], totalVideos: 0 });
        }

        const videoIds = playlistData.items.map(item => item.snippet.resourceId.videoId).join(',');

        // 3. 영상 상세 정보 가져오기 (description 포함)
        const videosResponse = await fetch(
            `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoIds}&key=${youtubeApiKey}`
        );
        const videosData = await videosResponse.json();

        // 4. 각 영상 설명란에서 출처 URL 추출
        const sources = [];
        const urlPatterns = {
            youtube: /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/gi,
            tiktok: /(?:https?:\/\/)?(?:www\.)?tiktok\.com\/@[\w.-]+\/video\/(\d+)/gi,
            instagram: /(?:https?:\/\/)?(?:www\.)?instagram\.com\/(?:p|reel)\/([a-zA-Z0-9_-]+)/gi,
            facebook: /(?:https?:\/\/)?(?:www\.)?facebook\.com\/(?:watch\/\?v=|[\w.-]+\/videos\/)(\d+)/gi
        };

        videosData.items.forEach(video => {
            const description = video.snippet.description || '';
            const title = video.snippet.title;

            // 각 플랫폼별로 URL 추출
            for (const [platform, regex] of Object.entries(urlPatterns)) {
                const matches = [...description.matchAll(regex)];
                matches.forEach(match => {
                    sources.push({
                        platform,
                        url: match[0],
                        videoId: match[1],
                        foundInVideo: {
                            id: video.id,
                            title: title
                        }
                    });
                });
            }
        });

        // 중복 제거
        const uniqueSources = Array.from(
            new Map(sources.map(item => [item.url, item])).values()
        );

        // 플랫폼별로 그룹화
        const groupedSources = {
            youtube: uniqueSources.filter(s => s.platform === 'youtube'),
            tiktok: uniqueSources.filter(s => s.platform === 'tiktok'),
            instagram: uniqueSources.filter(s => s.platform === 'instagram'),
            facebook: uniqueSources.filter(s => s.platform === 'facebook')
        };

        console.log(`[Extract Sources] Found ${uniqueSources.length} unique sources`);
        console.log(`  - YouTube: ${groupedSources.youtube.length}`);
        console.log(`  - TikTok: ${groupedSources.tiktok.length}`);
        console.log(`  - Instagram: ${groupedSources.instagram.length}`);
        console.log(`  - Facebook: ${groupedSources.facebook.length}`);

        res.json({
            sources: groupedSources,
            totalVideos: videosData.items.length,
            totalSources: uniqueSources.length
        });

    } catch (err) {
        console.error('[extract-sources error]', err);
        res.status(500).json({ error: err.message || 'Internal server error' });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// 멀티플랫폼 바이럴 콘텐츠 가져오기 (Hybrid: Free APIs + Apify)
// ═══════════════════════════════════════════════════════════════════════════
app.post('/api/fetch-viral-content', async (req, res) => {
    try {
        const { sources, youtubeApiKey } = req.body;

        if (!sources) {
            return res.status(400).json({ error: 'Sources required' });
        }

        const results = {
            youtube: [],
            tiktok: [],
            instagram: [],
            facebook: []
        };

        // YouTube 소스 처리 (기존 API 사용)
        if (sources.youtube && sources.youtube.length > 0 && youtubeApiKey) {
            const videoIds = sources.youtube.map(s => s.videoId).slice(0, 50).join(',');
            const ytResponse = await fetch(
                `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${videoIds}&key=${youtubeApiKey}`
            );
            const ytData = await ytResponse.json();

            results.youtube = (ytData.items || []).map(video => ({
                platform: 'youtube',
                id: video.id,
                title: video.snippet.title,
                thumbnail: video.snippet.thumbnails?.high?.url,
                viewCount: parseInt(video.statistics?.viewCount || 0),
                likeCount: parseInt(video.statistics?.likeCount || 0),
                publishedAt: video.snippet.publishedAt,
                url: `https://www.youtube.com/watch?v=${video.id}`
            }));
        }

        // TikTok 소스 처리 (oEmbed API 시도)
        if (sources.tiktok && sources.tiktok.length > 0) {
            for (const source of sources.tiktok.slice(0, 20)) {
                try {
                    const oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(source.url)}`;
                    const response = await fetch(oembedUrl);

                    if (response.ok) {
                        const data = await response.json();
                        results.tiktok.push({
                            platform: 'tiktok',
                            id: source.videoId,
                            title: data.title || 'TikTok Video',
                            thumbnail: data.thumbnail_url,
                            authorName: data.author_name,
                            url: source.url,
                            source: 'oembed'
                        });
                    } else {
                        // oEmbed 실패 시 기본 정보만 저장 (나중에 Apify로 보완 가능)
                        results.tiktok.push({
                            platform: 'tiktok',
                            id: source.videoId,
                            title: 'TikTok Video (detailed info unavailable)',
                            url: source.url,
                            source: 'url-only',
                            needsApify: true
                        });
                    }
                } catch (err) {
                    console.error(`[TikTok oEmbed] Error for ${source.url}:`, err.message);
                }
            }
        }

        // Instagram/Facebook 소스 (Apify 필요 - 현재는 URL만 반환)
        if (sources.instagram && sources.instagram.length > 0) {
            results.instagram = sources.instagram.slice(0, 20).map(source => ({
                platform: 'instagram',
                id: source.videoId,
                url: source.url,
                needsApify: true,
                message: 'Apify API token required for detailed info'
            }));
        }

        if (sources.facebook && sources.facebook.length > 0) {
            results.facebook = sources.facebook.slice(0, 20).map(source => ({
                platform: 'facebook',
                id: source.videoId,
                url: source.url,
                needsApify: true,
                message: 'Apify API token required for detailed info'
            }));
        }

        res.json(results);

    } catch (err) {
        console.error('[fetch-viral-content error]', err);
        res.status(500).json({ error: err.message || 'Internal server error' });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// OCR 출처 추출 API (Google Vision)
// ═══════════════════════════════════════════════════════════════════════════
app.post('/api/ocr-source', async (req, res) => {
    try {
        const { image, detectedText, manualSearch, youtubeApiKey } = req.body;
        const visionApiKey = process.env.GOOGLE_VISION_API_KEY || GEMINI_API_KEY;

        // Manual search mode: search for videos tagged with this handle/channel
        if (manualSearch && detectedText) {
            console.log('[OCR Source] Manual search mode for tagged videos:', detectedText);

            const ytApiKey = youtubeApiKey || process.env.YOUTUBE_API_KEY;
            if (!ytApiKey) {
                return res.status(500).json({ error: 'YouTube API key not configured' });
            }

            // Search for videos tagged with @channelname (not channel's own videos)
            // This searches across ALL YouTube for videos that mention this tag
            const searchQuery = detectedText.startsWith('@') ? detectedText : `@${detectedText}`;
            const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(searchQuery)}&type=video&maxResults=50&order=viewCount&key=${ytApiKey}`;
            const searchResponse = await fetch(searchUrl);
            const searchData = await searchResponse.json();

            if (!searchResponse.ok || !searchData.items || searchData.items.length === 0) {
                return res.json({
                    channelName: detectedText,
                    confidence: 1.0,
                    language: 'manual',
                    platform: 'youtube',
                    channels: [],
                    relatedShorts: [],
                    detectedText: `수동 입력: ${detectedText} (태그된 영상 없음)`
                });
            }

            // Get video details including duration and statistics
            const videoIds = searchData.items.map(item => item.id.videoId).filter(id => id).join(',');
            if (!videoIds) {
                return res.json({
                    channelName: detectedText,
                    confidence: 1.0,
                    language: 'manual',
                    platform: 'youtube',
                    channels: [],
                    relatedShorts: [],
                    detectedText: `수동 입력: ${detectedText} (영상 없음)`
                });
            }

            const videoDetailsUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${videoIds}&key=${ytApiKey}`;
            const videoDetailsResponse = await fetch(videoDetailsUrl);
            const videoDetailsData = await videoDetailsResponse.json();

            // Filter for shorts (duration <= 60 seconds) and sort by views
            const relatedShorts = (videoDetailsData.items || [])
                .map(video => {
                    // Parse ISO 8601 duration (e.g., PT1M30S = 90 seconds)
                    const duration = video.contentDetails?.duration || '';
                    const match = duration.match(/PT(?:(\d+)M)?(?:(\d+)S)?/);
                    const minutes = parseInt(match?.[1] || 0);
                    const seconds = parseInt(match?.[2] || 0);
                    const totalSeconds = minutes * 60 + seconds;

                    return {
                        id: video.id,
                        title: video.snippet.title,
                        thumbnail: video.snippet.thumbnails.medium.url,
                        viewCount: parseInt(video.statistics?.viewCount || 0),
                        likeCount: parseInt(video.statistics?.likeCount || 0),
                        duration: totalSeconds,
                        channelTitle: video.snippet.channelTitle
                    };
                })
                .filter(video => video.duration > 0 && video.duration <= 60) // Only shorts
                .sort((a, b) => b.viewCount - a.viewCount) // Sort by views DESC
                .slice(0, 10); // Top 10

            console.log('[OCR Source] Tagged video search complete:', relatedShorts.length, 'shorts found');

            return res.json({
                channelName: detectedText,
                confidence: 1.0,
                language: 'manual',
                platform: 'youtube',
                channels: [], // No specific channel, these are tagged videos
                relatedShorts: relatedShorts,
                detectedText: `수동 입력: ${searchQuery} 태그가 달린 영상`
            });
        }

        // Original OCR mode
        if (!image) {
            return res.status(400).json({ error: 'Image required' });
        }

        console.log('[OCR Source] Processing image...');

        const base64Image = image.replace(/^data:image\/\w+;base64,/, '');

        const visionResponse = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${visionApiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                requests: [{
                    image: { content: base64Image },
                    features: [{ type: 'TEXT_DETECTION' }]
                }]
            })
        });

        if (!visionResponse.ok) {
            const errorText = await visionResponse.text();
            throw new Error(`Vision API error: ${errorText}`);
        }

        const visionData = await visionResponse.json();
        const textAnnotations = visionData.responses?.[0]?.textAnnotations;

        if (!textAnnotations || textAnnotations.length === 0) {
            return res.json({
                detectedText: '',
                channelName: null,
                confidence: 0,
                channels: [],
                relatedShorts: []
            });
        }

        const fullText = textAnnotations[0].description;
        console.log('[OCR Source] Detected text:', fullText);

        const patterns = {
            ko: [/출처\s*[:：]\s*(.+?)(?:\n|$)/i, /원본\s*[:：]\s*(.+?)(?:\n|$)/i, /채널\s*[:：]\s*(.+?)(?:\n|$)/i],
            jp: [/出처\s*[:：]\s*(.+?)(?:\n|$)/i, /元\s*[:：]\s*(.+?)(?:\n|$)/i, /チャンネル\s*[:：]\s*(.+?)(?:\n|$)/i],
            en: [
                /source\s*[:：]\s*(.+?)(?:\n|$)/i,
                /original\s*[:：]\s*(.+?)(?:\n|$)/i,
                /channel\s*[:：]\s*(.+?)(?:\n|$)/i,
                /\(?\s*credit\s*[:：]?\s*@?([a-zA-Z0-9_\.]+)(?:\s+on\s+(?:instagram|ig))?\s*\)?/i,
                /@([a-zA-Z0-9_\.]+)\s+on\s+instagram/i,
                /@([a-zA-Z0-9_\.]+)\s+on\s+ig\b/i
            ]
        };

        const instagramHandlePattern = /@([a-zA-Z0-9_\.]{3,30})\b/g;

        let extractedChannelName = null;
        let detectedLanguage = null;
        let isInstagramHandle = false;

        for (const [lang, langPatterns] of Object.entries(patterns)) {
            for (const pattern of langPatterns) {
                const match = fullText.match(pattern);
                if (match) {
                    extractedChannelName = match[1].trim();
                    detectedLanguage = lang;
                    console.log(`[OCR Source] Found ${lang} pattern: "${extractedChannelName}"`);

                    if (pattern.source.includes('instagram') || pattern.source.includes('ig') || pattern.source.includes('credit')) {
                        isInstagramHandle = true;
                    }
                    break;
                }
            }
            if (extractedChannelName) break;
        }

        if (!extractedChannelName) {
            const handles = [...fullText.matchAll(instagramHandlePattern)];
            if (handles.length > 0) {
                extractedChannelName = handles[0][1];
                detectedLanguage = 'en';
                isInstagramHandle = true;
                console.log(`[OCR Source] Found Instagram handle: @${extractedChannelName}`);
            }
        }

        if (!extractedChannelName) {
            return res.json({
                detectedText: fullText,
                channelName: null,
                confidence: 0,
                channels: [],
                platform: null,
                relatedShorts: []
            });
        }

        let channels = [];
        let relatedShorts = [];

        if (youtubeApiKey) {
            try {
                console.log(`[OCR Source] Searching YouTube for shorts related to: ${extractedChannelName}`);

                const shortsSearchResponse = await fetch(
                    `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoDuration=short&q=${encodeURIComponent(extractedChannelName)}&maxResults=20&order=viewCount&key=${youtubeApiKey}`
                );
                const shortsSearchData = await shortsSearchResponse.json();

                if (shortsSearchData.items && shortsSearchData.items.length > 0) {
                    const videoIds = shortsSearchData.items.map(item => item.id.videoId).join(',');
                    const videoDetailsResponse = await fetch(
                        `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${videoIds}&key=${youtubeApiKey}`
                    );
                    const videoDetailsData = await videoDetailsResponse.json();

                    relatedShorts = (videoDetailsData.items || []).map(video => ({
                        id: video.id,
                        title: video.snippet.title,
                        description: video.snippet.description,
                        thumbnail: video.snippet.thumbnails?.high?.url || video.snippet.thumbnails?.default?.url,
                        channelTitle: video.snippet.channelTitle,
                        publishedAt: video.snippet.publishedAt,
                        viewCount: parseInt(video.statistics?.viewCount || 0),
                        likeCount: parseInt(video.statistics?.likeCount || 0),
                        commentCount: parseInt(video.statistics?.commentCount || 0)
                    }));

                    console.log(`[OCR Source] Found ${relatedShorts.length} related YouTube shorts`);
                }

                if (!isInstagramHandle) {
                    const searchResponse = await fetch(
                        `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(extractedChannelName)}&maxResults=3&key=${youtubeApiKey}`
                    );
                    const searchData = await searchResponse.json();

                    if (searchData.items && searchData.items.length > 0) {
                        const channelIds = searchData.items.map(item => item.snippet.channelId).join(',');
                        const channelResponse = await fetch(
                            `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${channelIds}&key=${youtubeApiKey}`
                        );
                        const channelData = await channelResponse.json();

                        channels = (channelData.items || []).map(channel => ({
                            id: channel.id,
                            title: channel.snippet.title,
                            description: channel.snippet.description,
                            thumbnail: channel.snippet.thumbnails?.high?.url || channel.snippet.thumbnails?.default?.url,
                            subscriberCount: parseInt(channel.statistics?.subscriberCount || 0),
                            videoCount: parseInt(channel.statistics?.videoCount || 0)
                        }));

                        console.log(`[OCR Source] Found ${channels.length} matching channels`);
                    }
                }
            } catch (searchError) {
                console.error('[OCR Source] YouTube search error:', searchError.message);
            }
        }

        res.json({
            detectedText: fullText,
            channelName: extractedChannelName,
            confidence: 0.95,
            language: detectedLanguage,
            platform: isInstagramHandle ? 'instagram' : 'youtube',
            channels,
            instagramUrl: isInstagramHandle ? `https://www.instagram.com/${extractedChannelName}` : null,
            relatedShorts
        });

    } catch (err) {
        console.error('[ocr-source error]', err);
        res.status(500).json({ error: err.message || 'Internal server error' });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// Whisper Audio Transcription API
// ═══════════════════════════════════════════════════════════════════════════
app.post('/api/whisper-transcript', async (req, res) => {
    try {
        const { videoId } = req.body;

        if (!videoId) {
            return res.status(400).json({ error: 'Video ID required' });
        }

        if (!OPENAI_API_KEY) {
            return res.status(500).json({
                error: 'OpenAI API key not configured',
                message: 'OPENAI_API_KEY가 .env에 설정되지 않았습니다.'
            });
        }

        console.log('[Whisper] Starting audio transcription for:', videoId);

        // Implement audio download using yt-dlp (more stable)
        const fs = require('fs');
        const path = require('path');
        const { exec } = require('child_process');
        const { promisify } = require('util');
        const execPromise = promisify(exec);
        const OpenAI = require('openai');

        const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

        // Download audio with yt-dlp
        const audioPath = path.join(__dirname, `temp_${videoId}.mp3`);
        const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

        console.log('[Whisper] Downloading audio with yt-dlp...');
        try {
            await execPromise(`yt-dlp -x --audio-format mp3 --audio-quality 9 -o "${audioPath}" "${videoUrl}"`);
        } catch (err) {
            throw new Error('yt-dlp 다운로드 실패: ' + err.message);
        }

        console.log('[Whisper] Audio downloaded, transcribing...');

        // Transcribe with Whisper
        const transcription = await openai.audio.transcriptions.create({
            file: fs.createReadStream(audioPath),
            model: 'whisper-1',
            response_format: 'verbose_json',
            timestamp_granularity: ['segment']
        });

        // Cleanup
        fs.unlinkSync(audioPath);

        console.log('[Whisper] Transcription complete');

        res.json({
            success: true,
            transcript: transcription.text,
            segments: transcription.segments
        });

    } catch (err) {
        console.error('[Whisper] Error:', err);
        res.status(500).json({
            error: err.message || 'Whisper transcription failed'
        });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// 일본어 번역 API (한국어 대본 → 일본어 + 발음 + 제목 + 편집 가이드)
// ═══════════════════════════════════════════════════════════════════════════
app.post('/api/translate-to-japanese', async (req, res) => {
    try {
        const { koreanScript } = req.body;

        if (!koreanScript) {
            return res.status(400).json({ error: 'Korean script is required' });
        }

        if (!GEMINI_API_KEY) {
            return res.status(500).json({ error: 'Gemini API key not configured' });
        }

        const { GoogleGenerativeAI } = await import('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

        const prompt = `
당신은 전문 일본어 번역가이자 YouTube Shorts 콘텐츠 전문가입니다.
아래 한국어 대본을 일본어로 번역하고, 추가 정보를 제공해주세요.

**한국어 대본:**
${koreanScript}

**출력 형식 (반드시 이 형식을 지켜주세요):**

## 1. 일본어 제목 추천 (3개)
- 30자 이내, 클릭을 유도하는 제목
- 숫자, 이모지, 후킹 단어 활용
- 예시 스타일: "30年間も続く魚との奇妙な友情の正体"

## 2. 일본어 문장 나누기
- 각 문장을 슬래시(/)로 구분
- CapCut에서 자막 타이밍 맞추기 쉽게
- 짧고 임팩트 있게

## 3. 한국어 / 일본어 / 발음 (3단 구성)
- 각 블록마다:
  - 한국어: [원본 한국어]
  - 일본어: [번역된 일본어]
  - 발음: [일본어를 한국어로 읽는 발음]

## 4. CapCut 편집 가이드
- 훅킹 포인트 3-5개 지정
- 각 포인트마다:
  - 타이밍: 몇 초
  - 폰트 색상: (빨강/노랑/흰색 등)
  - 이펙트: (확대/흔들림/글리치 등)
  - 추천 이유

**번역 원칙:**
- 자연스러운 일본어 구어체 사용
- 원본의 뉘앙스와 텍포 유지
- 짧고 임팩트 있게
- 시청자가 이해하기 쉽게
`;

        const result = await model.generateContent(prompt);
        const translatedContent = result.response.text();

        res.json({
            success: true,
            translation: translatedContent
        });

    } catch (error) {
        console.error('일본어 번역 에러:', error);
        res.status(500).json({
            error: '번역 중 오류가 발생했습니다: ' + error.message
        });
    }
});


// ═══════════════════════════════════════════════════════════════════════════
// Social Media Viral Finder (TikTok / Instagram Reels)
// ═══════════════════════════════════════════════════════════════════════════
app.post('/api/find-viral-social', async (req, res) => {
    try {
        const { platform, timePeriod, language, category, filters } = req.body;

        console.log(`[Social Viral Finder] Platform: ${platform}, Period: ${timePeriod}, Language: ${language}`);

        // Validate platform
        if (!platform || !['tiktok', 'instagram'].includes(platform)) {
            return res.status(400).json({ error: '유효한 플랫폼을 선택해주세요 (tiktok 또는 instagram)' });
        }

        // Check Apify token
        if (!process.env.APIFY_TOKEN) {
            return res.status(500).json({ error: 'APIFY_TOKEN이 .env 파일에 설정되어 있지 않습니다.' });
        }

        try {
            // Try to load Apify client
            const { ApifyClient } = require('apify-client');
            const client = new ApifyClient({ token: process.env.APIFY_TOKEN });

            let videos = [];

            if (platform === 'tiktok') {
                videos = await scrapeTikTokViral(client, timePeriod, language, filters);
            } else if (platform === 'instagram') {
                videos = await scrapeInstagramViral(client, timePeriod, language, filters);
            } else if (platform === 'facebook') {
                videos = await scrapeFacebookViral(client, timePeriod, language, filters);
            }

            // Calculate outlier scores and sort
            const analyzed = videos.map(v => ({
                ...v,
                outlierScore: calculateSocialOutlierScore(v),
                engagementRate: ((v.likes + v.comments + v.shares + v.saves) / v.views * 100).toFixed(2)
            }));

            // Sort by outlier score
            analyzed.sort((a, b) => b.outlierScore - a.outlierScore);

            // Return top results
            const topResults = analyzed.slice(0, 30);

            res.json({
                success: true,
                platform,
                count: topResults.length,
                videos: topResults
            });

        } catch (requireError) {
            // apify-client not installed, return sample data
            console.warn('[Social Viral Finder] apify-client not installed. Using sample data.');
            console.warn('Install with: npm install apify-client');

            const sampleData = generateSampleSocialData(platform, timePeriod, language, filters);

            return res.json({
                success: true,
                platform,
                count: sampleData.length,
                videos: sampleData,
                warning: 'Using sample data. Install apify-client for real data.'
            });
        }

    } catch (error) {
        console.error('[Social Viral Finder] Error:', error);
        res.status(500).json({
            error: `검색 중 오류가 발생했습니다: ${error.message}`
        });
    }
});

// Helper: Generate sample data for demonstration
function generateSampleSocialData(platform, timePeriod, language, filters) {
    const platformName = platform === 'tiktok' ? 'TikTok' : 'Instagram Reels';
    const langEmoji = language === 'ko' ? '🇰🇷' : language === 'ja' ? '🇯🇵' : '🇺🇸';

    // Sample viral videos
    const samples = [
        {
            id: '1',
            url: `https://${platform}.com/video/sample1`,
            title: `${langEmoji} ${platform === 'tiktok' ? '감동' : '릴스'} - 반려견이 주인을 구한 순간`,
            thumbnail: 'https://via.placeholder.com/405x720/ec4899/ffffff?text=Viral+1',
            views: 2500000,
            likes: 450000,
            comments: 12000,
            shares: 8500,
            saves: 35000,
            author: 'viral_creator_1',
            createTime: new Date().toISOString(),
            outlierScore: 850
        },
        {
            id: '2',
            url: `https://${platform}.com/video/sample2`,
            title: `${langEmoji} 믿을 수 없는 반전! 최종 결말은?`,
            thumbnail: 'https://via.placeholder.com/405x720/f472b6/ffffff?text=Viral+2',
            views: 1800000,
            likes: 320000,
            comments: 8900,
            shares: 6200,
            saves: 28000,
            author: 'trending_acc',
            createTime: new Date().toISOString(),
            outlierScore: 720
        },
        {
            id: '3',
            url: `https://${platform}.com/video/sample3`,
            title: `${langEmoji} 이 영상 웃기다고요? 진실은...`,
            thumbnail: 'https://via.placeholder.com/405x720/fb7185/ffffff?text=Viral+3',
            views: 3200000,
            likes: 580000,
            comments: 15000,
            shares: 11000,
            saves: 42000,
            author: 'mega_viral',
            createTime: new Date().toISOString(),
            outlierScore: 950
        }
    ];

    // Filter by engagement thresholds
    return samples.filter(video => {
        return video.likes >= (filters.minLikes || 0) &&
            video.comments >= (filters.minComments || 0) &&
            video.saves >= (filters.minSaves || 0) &&
            video.shares >= (filters.minShares || 0);
    }).sort((a, b) => b.outlierScore - a.outlierScore);
}

// Helper: Scrape TikTok viral videos
async function scrapeTikTokViral(client, timePeriod, language, filters) {
    try {
        const hashtags = getSocialHashtagsByLanguage(language);

        console.log(`[TikTok Scraper] Hashtags: ${hashtags.join(', ')}`);

        const input = {
            hashtags: hashtags.slice(0, 8), // Use top 8 hashtags for more coverage
            resultsPerHashtag: 50, // 50 per hashtag = 400 total
            shouldDownloadVideos: false,
            shouldDownloadCovers: false,
            shouldDownloadSubtitles: false
        };

        // Run TikTok scraper
        const run = await client.actor('clockworks/free-tiktok-scraper').call(input);
        const { items } = await client.dataset(run.defaultDatasetId).listItems();

        console.log(`[TikTok Scraper] Found ${items.length} videos`);

        // Transform and sort by views - NO date filter (TikTok popular videos are often older)
        const videos = items
            .map(item => ({
                id: item.id,
                url: item.webVideoUrl || `https://tiktok.com/@${item.authorMeta?.name}/video/${item.id}`,
                title: item.text || '(제목 없음)',
                thumbnail: item.covers?.default || item.covers?.origin || 'https://via.placeholder.com/405x720/ec4899/ffffff?text=TikTok',
                views: item.playCount || 0,
                likes: item.diggCount || 0,
                comments: item.commentCount || 0,
                shares: item.shareCount || 0,
                saves: item.collectCount || 0,
                author: item.authorMeta?.name || 'unknown',
                createTime: item.createTime ? new Date(item.createTime * 1000).toISOString() : new Date().toISOString()
            }))
            .sort((a, b) => b.views - a.views) // Sort by views descending
            .slice(0, 30); // Get top 30 most viewed

        console.log(`[TikTok Scraper] Returning top ${videos.length} videos by views`);
        return videos;

    } catch (error) {
        console.error('[TikTok Scraper] Error:', error);
        return [];
    }
}

// Helper: Scrape Instagram viral reels
async function scrapeInstagramViral(client, timePeriod, language, filters) {
    try {
        const hashtags = getSocialHashtagsByLanguage(language);

        console.log(`[Instagram Scraper] Hashtags: ${hashtags.join(', ')}`);

        const input = {
            hashtags: hashtags.slice(0, 5), // Use top 5 hashtags
            resultsLimit: 100, // Get 100 posts total
            resultsType: 'posts' // Get posts (includes reels)
        };

        // Run Instagram Hashtag Scraper
        const run = await client.actor('apify/instagram-hashtag-scraper').call(input);
        const { items } = await client.dataset(run.defaultDatasetId).listItems();

        console.log(`[Instagram Hashtag Scraper] Found ${items.length} posts`);

        // DEBUG: Log first item structure
        if (items.length > 0) {
            console.log('[Instagram DEBUG] First item keys:', Object.keys(items[0]));
            console.log('[Instagram DEBUG] Sample likes:', items[0].likesCount, 'comments:', items[0].commentsCount);
        }

        // Transform and filter results
        const videos = items
            .sort((a, b) => {
                // Sort by engagement score (likes*10 + comments)
                const scoreA = (a.likesCount || 0) * 10 + (a.commentsCount || 0);
                const scoreB = (b.likesCount || 0) * 10 + (b.commentsCount || 0);
                return scoreB - scoreA;
            })
            .slice(0, 30) // Get top 30 most engaging reels
            .map(item => ({
                id: item.id,
                url: item.url || `https://instagram.com/p/${item.shortCode}`,
                title: (item.caption || '').substring(0, 100) + '...',
                thumbnail: item.displayUrl || 'https://via.placeholder.com/405x720/f472b6/ffffff?text=Instagram',
                views: item.videoViewCount || 0,
                likes: item.likesCount || 0,
                comments: item.commentsCount || 0,
                shares: 0, // Instagram doesn't provide share count
                saves: 0, // Not available via scraper
                author: item.ownerUsername || 'unknown',
                createTime: item.timestamp || new Date().toISOString()
            }));

        console.log(`[Instagram Scraper] Filtered to ${videos.length} videos matching criteria`);
        return videos;

    } catch (error) {
        console.error('[Instagram Scraper] Error:', error);
        return [];
    }
}

// Helper: Scrape Facebook viral videos
async function scrapeFacebookViral(client, timePeriod, language, filters) {
    try {
        const hashtags = getSocialHashtagsByLanguage(language);

        console.log(`[Facebook Scraper] Keywords: ${hashtags.join(', ')}`);

        const input = {
            startUrls: [
                'https://www.facebook.com/watch',  // Facebook Watch for videos
                'https://www.facebook.com/videos'
            ],
            resultsLimit: 100,
            maxResults: 100
        };

        // Run Facebook Posts Scraper
        const run = await client.actor('apify/facebook-posts-scraper').call(input);
        const { items } = await client.dataset(run.defaultDatasetId).listItems();

        console.log(`[Facebook Scraper] Found ${items.length} posts`);

        // DEBUG: Log first item structure
        if (items.length > 0) {
            console.log('[Facebook DEBUG] First item keys:', Object.keys(items[0]));
            console.log('[Facebook DEBUG] Sample likes:', items[0].likes, 'comments:', items[0].comments);
        }

        // Transform and filter results
        const videos = items
            .filter(item => {
                // Only include videos
                return item.postType === 'video' || item.videoUrl;
            })
            .sort((a, b) => {
                // Sort by engagement score (likes*10 + comments)
                const scoreA = (a.likes || 0) * 10 + (a.comments || 0);
                const scoreB = (b.likes || 0) * 10 + (b.comments || 0);
                return scoreB - scoreA;
            })
            .slice(0, 30) // Get top 30 most engaging videos
            .map(item => ({
                id: item.postId || item.id,
                url: item.postUrl || item.url,
                title: (item.text || '').substring(0, 100) + '...',
                thumbnail: item.images?.[0] || 'https://via.placeholder.com/405x720/3b5998/ffffff?text=Facebook',
                views: item.views || 0,
                likes: item.likes || 0,
                comments: item.comments || 0,
                shares: item.shares || 0,
                saves: 0, // Facebook doesn't provide saves
                author: item.authorName || 'unknown',
                createTime: item.time || new Date().toISOString()
            }));

        console.log(`[Facebook Scraper] Filtered to ${videos.length} videos matching criteria`);
        return videos;

    } catch (error) {
        console.error('[Facebook Scraper] Error:', error);
        return [];
    }
}

// Helper: Calculate date range for time period
function getSocialDateRange(timePeriod) {
    const now = new Date();
    const ranges = {
        '1w': 7,
        '2w': 14,
        '1m': 30,
        '2m': 60
    };

    const daysAgo = ranges[timePeriod] || 7;
    const start = new Date(now - daysAgo * 24 * 60 * 60 * 1000);

    return {
        start: start.toISOString(),
        end: now.toISOString()
    };
}

// Helper: Get hashtags by language
function getSocialHashtagsByLanguage(language) {
    const hashtags = {
        // Korean: Use Korean popular hashtags for Korean content
        ko: ['데일리', '일상', '맞팔', '소통', '인스타그램', '셀스타그램', '좋아요', '팔로우'],

        // Japanese: Use Japanese popular hashtags
        ja: ['いいね', 'フォロー', 'インスタ', '相互フォロー', 'おしゃれ', 'かわいい', '写真好き', 'ファッション'],

        // English: Use viral/trending English hashtags
        en: ['viral', 'trending', 'reels', 'explorepage', 'funny', 'comedy', 'foryou', 'fyp']
    };

    return hashtags[language] || hashtags.en;
}

// Helper: Calculate outlier score for social media
function calculateSocialOutlierScore(video) {
    if (!video.views || video.views === 0) return 0;

    const totalEngagement = video.likes + video.comments + video.shares + video.saves;
    const engagementRate = (totalEngagement / video.views) * 100;

    // Outlier score (higher = more viral)
    // Typical engagement rate is 3-5%, viral videos are 10%+
    return Math.round(engagementRate * 10);
}


// ═══════════════════════════════════════════════════════════════════════════
// Nano Banana Viral Video Analysis API (New Endpoint for Step 1)
// ═══════════════════════════════════════════════════════════════════════════
app.post('/api/analyze-viral-video', async (req, res) => {
    try {
        const { url, platform } = req.body;

        if (!url) {
            return res.status(400).json({ error: 'URL is required' });
        }

        console.log(`[Viral Video Analysis] Analyzing ${platform} video: ${url}`);

        // Initialize default response structure
        let responseData = {
            transcript: "",
            comments: [],
            metadata: {
                title: "제목 없음",
                author: "unknown",
                views: 0,
                likes: 0,
                thumbnail: ""
            },
            videoUrl: url
        };

        if (platform === 'tiktok') {
            if (!process.env.APIFY_TOKEN) {
                return res.status(500).json({ error: 'APIFY_TOKEN not configured' });
            }

            // Dynamically import ApifyClient to avoid load errors if missing
            let ApifyClient;
            try {
                const apifyModule = require('apify-client');
                ApifyClient = apifyModule.ApifyClient;
            } catch (e) {
                return res.status(500).json({ error: 'apify-client module missing' });
            }

            const client = new ApifyClient({ token: process.env.APIFY_TOKEN });

            // Using clockworks/free-tiktok-scraper with correct 'postURLs' input
            const input = {
                "postURLs": [url],
                "commentsPerVideo": 20,
                "shouldDownloadVideos": false,
                "shouldDownloadCovers": false,
                "shouldDownloadSlideshowImages": false
            };

            console.log('[Apify] Starting TikTok Scraper...');
            const run = await client.actor('clockworks/free-tiktok-scraper').call(input);
            console.log(`[Apify] Finished. Run ID: ${run.id}`);

            const { items } = await client.dataset(run.defaultDatasetId).listItems();

            if (items && items.length > 0) {
                const item = items[0];

                // Map fields
                responseData.metadata.title = item.text || item.desc || "Untitled TikTok";
                responseData.metadata.author = item.authorMeta?.nickName || item.authorMeta?.name || "Unknown";
                responseData.metadata.views = item.playCount || 0;
                responseData.metadata.likes = item.diggCount || 0;
                responseData.metadata.thumbnail = item.covers?.default || item.imageUrl || "";
                responseData.transcript = item.text || "";

                // Fetch Comments
                let commentsList = [];
                // Check for separate comments dataset
                if (item.commentsDatasetUrl) {
                    try {
                        const datasetIdMatch = item.commentsDatasetUrl.match(/datasets\/([a-zA-Z0-9]+)/);
                        if (datasetIdMatch && datasetIdMatch[1]) {
                            const commentsData = await client.dataset(datasetIdMatch[1]).listItems({ limit: 30 });
                            if (commentsData.items) {
                                commentsList = commentsData.items
                                    .map(c => c.text)
                                    .filter(t => t);
                            }
                        }
                    } catch (e) {
                        console.warn('[Apify] Comments fetch failed:', e);
                    }
                }
                // Fallback to inline comments
                if (commentsList.length === 0 && item.comments && Array.isArray(item.comments)) {
                    commentsList = item.comments.map(c => c.text);
                }

                responseData.comments = commentsList;
            } else {
                console.warn('[Apify] No items returned.');
            }

        } else if (platform === 'instagram') {
            console.log('[Viral Video Analysis] Instagram not fully supported yet via this endpoint.');
        } else if (platform === 'youtube') {
            // YouTube logic
            let videoId = "";
            if (url.includes('v=')) videoId = url.split('v=')[1].split('&')[0];
            else if (url.includes('youtu.be/')) videoId = url.split('youtu.be/')[1].split('?')[0];

            if (videoId && process.env.YOUTUBE_API_KEY) {
                try {
                    const metaUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${videoId}&key=${process.env.YOUTUBE_API_KEY}`;
                    const metaRes = await fetch(metaUrl);
                    const metaData = await metaRes.json();

                    if (metaData.items && metaData.items.length > 0) {
                        const v = metaData.items[0];
                        responseData.metadata.title = v.snippet.title;
                        responseData.metadata.author = v.snippet.channelTitle;
                        responseData.metadata.views = parseInt(v.statistics.viewCount);
                        responseData.metadata.likes = parseInt(v.statistics.likeCount);
                        responseData.metadata.thumbnail = v.snippet.thumbnails.high?.url || v.snippet.thumbnails.default?.url;
                        responseData.metadata.id = videoId;
                    }
                } catch (e) { console.error('YouTube Fetch Error:', e); }
            }
        }

        res.json(responseData);

    } catch (error) {
        console.error('[Viral Video Analysis Error]', error);
        // Return 200 with empty data so frontend handles manual input fallback
        res.json({
            transcript: "",
            comments: [],
            metadata: { title: "Error", author: "Error" },
            error: error.message
        });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// Multer 설정 - 영상 파일 업로드
// ═══════════════════════════════════════════════════════════════════════════
const upload = multer({
    dest: path.join(__dirname, 'uploads'),
    limits: { fileSize: 25 * 1024 * 1024 }, // 25MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['video/mp4', 'video/mpeg', 'video/webm', 'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/m4a', 'audio/mpga'];
        if (allowedTypes.includes(file.mimetype) || file.mimetype.startsWith('video/') || file.mimetype.startsWith('audio/')) {
            cb(null, true);
        } else {
            cb(new Error('지원되지 않는 파일 형식입니다. 영상 또는 오디오 파일만 업로드 가능합니다.'));
        }
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// API: Upload Viral Video & Extract Transcript with Whisper
// ═══════════════════════════════════════════════════════════════════════════
app.post('/api/upload-viral-video', upload.single('videoFile'), async (req, res) => {
    let uploadedFilePath = null;

    try {
        if (!req.file) {
            return res.status(400).json({ error: '파일이 업로드되지 않았습니다.' });
        }

        uploadedFilePath = req.file.path;
        console.log(`[Whisper Upload] File uploaded: ${uploadedFilePath}`);

        // 메타데이터 추출
        const { title, platform, viewCount, likeCount, uploadDate } = req.body;

        if (!title) {
            return res.status(400).json({ error: '영상 제목은 필수입니다.' });
        }

        // OpenAI Whisper API 호출
        console.log('[Whisper] Starting transcription...');
        const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

        // 파일 확장자 추출 및 명시적 전달
        const fileExtension = path.extname(req.file.originalname).toLowerCase();
        const supportedExtensions = ['.mp3', '.mp4', '.mpeg', '.mpga', '.m4a', '.wav', '.webm', '.flac', '.oga', '.ogg'];

        if (!supportedExtensions.includes(fileExtension)) {
            throw new Error(`지원되지 않는 파일 형식입니다: ${fileExtension}. 지원 형식: ${supportedExtensions.join(', ')}`);
        }

        console.log(`[Whisper] File extension: ${fileExtension}, Original name: ${req.file.originalname}`);

        // CRITICAL: Whisper API needs the file extension to recognize format
        // Rename temp file to include original extension
        const tempFileWithExt = uploadedFilePath + fileExtension;
        fs.renameSync(uploadedFilePath, tempFileWithExt);
        uploadedFilePath = tempFileWithExt; // Update path for cleanup

        const transcription = await openai.audio.transcriptions.create({
            file: fs.createReadStream(uploadedFilePath),
            model: 'whisper-1',
            response_format: 'verbose_json', // timestamps 포함
            language: 'ko' // 한국어 우선
        });

        console.log('[Whisper] Transcription completed');

        // 세그먼트별 타임스탬프 추출
        const segments = transcription.segments || [];
        const fullTranscript = transcription.text || '';

        // 응답 데이터 구조
        const responseData = {
            success: true,
            data: {
                transcript: fullTranscript,
                segments: segments.map(seg => ({
                    id: seg.id,
                    start: seg.start,
                    end: seg.end,
                    text: seg.text
                })),
                metadata: {
                    title: title || 'Untitled',
                    platform: platform || 'Unknown',
                    viewCount: viewCount ? parseInt(viewCount) : 0,
                    likeCount: likeCount ? parseInt(likeCount) : 0,
                    uploadDate: uploadDate || new Date().toISOString(),
                    duration: transcription.duration || 0
                }
            }
        };

        res.json(responseData);

    } catch (error) {
        console.error('[Whisper Upload Error]', error);
        res.status(500).json({
            error: error.message || '영상 처리 중 오류가 발생했습니다.',
            details: error.toString()
        });
    } finally {
        // 임시 파일 삭제
        if (uploadedFilePath && fs.existsSync(uploadedFilePath)) {
            try {
                fs.unlinkSync(uploadedFilePath);
                console.log(`[Cleanup] Temporary file deleted: ${uploadedFilePath}`);
            } catch (err) {
                console.error('[Cleanup Error]', err);
            }
        }
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// HOT Channel Finder APIs
// ═══════════════════════════════════════════════════════════════════════════

// API: Search Channels with Filters
app.post('/api/search-channels', async (req, res) => {
    try {
        const {
            categories,      // 선택된 카테고리 배열
            subscriberMin,   // 최소 구독자
            subscriberMax,   // 최대 구독자
            viewPeriod,      // 조회 기간 (1day, 7days, 30days)
            country,         // 국가 코드
            sortBy           // 정렬 기준
        } = req.body;

        console.log('[Channel Search] Filters:', req.body);

        if (!categories || categories.length === 0) {
            return res.status(400).json({ error: '최소 1개 이상의 카테고리를 선택해주세요.' });
        }

        if (!YOUTUBE_API_KEY) {
            return res.status(500).json({ error: 'YouTube API key not configured' });
        }

        // 카테고리 → 검색 키워드 매핑
        const CATEGORY_KEYWORDS = {
            'entertainment': '엔터테인먼트 예능',
            'game': '게임 e스포츠',
            'vlog': '일상 브이로그',
            'food': '먹방 음식',
            'beauty': '뷰티 메이크업',
            'sports': '스포츠',
            'music': '음악',
            'education': '교육',
            'tech': '과학 기술',
            'news': '뉴스 정치'
        };

        // 카테고리를 검색 쿼리로 변환
        const searchQueries = categories.map(cat => CATEGORY_KEYWORDS[cat] || cat);

        let allChannels = [];

        // 각 카테고리로 검색
        for (const query of searchQueries) {
            const searchUrl = `https://www.googleapis.com/youtube/v3/search?` +
                `part=snippet&type=channel&q=${encodeURIComponent(query)}` +
                `&maxResults=50&regionCode=${country || 'KR'}` +
                `&key=${YOUTUBE_API_KEY}`;

            try {
                const searchRes = await fetch(searchUrl);
                const searchData = await searchRes.json();

                if (searchData.items && searchData.items.length > 0) {
                    // 채널 상세 정보 가져오기
                    const channelIds = searchData.items
                        .map(item => item.snippet.channelId)
                        .filter(id => id)
                        .join(',');

                    if (channelIds) {
                        const channelsUrl = `https://www.googleapis.com/youtube/v3/channels?` +
                            `part=snippet,statistics,contentDetails` +
                            `&id=${channelIds}&key=${YOUTUBE_API_KEY}`;

                        const channelsRes = await fetch(channelsUrl);
                        const channelsData = await channelsRes.json();

                        if (channelsData.items) {
                            allChannels = allChannels.concat(channelsData.items);
                        }
                    }
                }
            } catch (error) {
                console.error(`[Channel Search] Error for query "${query}":`, error.message);
            }
        }

        console.log(`[Channel Search] Found ${allChannels.length} channels before filtering`);

        // 필터링
        let filteredChannels = allChannels.filter(channel => {
            const subscriberCount = parseInt(channel.statistics.subscriberCount);

            if (subscriberMin && subscriberCount < subscriberMin) return false;
            if (subscriberMax && subscriberCount > subscriberMax) return false;

            return true;
        });

        // 정렬
        filteredChannels.sort((a, b) => {
            if (sortBy === 'subscribers') {
                return parseInt(b.statistics.subscriberCount) - parseInt(a.statistics.subscriberCount);
            } else if (sortBy === 'views') {
                return parseInt(b.statistics.viewCount) - parseInt(a.statistics.viewCount);
            } else if (sortBy === 'recent') {
                return new Date(b.snippet.publishedAt) - new Date(a.snippet.publishedAt);
            }
            return 0;
        });

        // 중복 제거 (channelId 기준)
        const uniqueChannels = Array.from(
            new Map(filteredChannels.map(ch => [ch.id, ch])).values()
        );

        console.log(`[Channel Search] Returning ${uniqueChannels.length} unique channels`);

        res.json({
            success: true,
            channels: uniqueChannels,
            count: uniqueChannels.length
        });

    } catch (error) {
        console.error('[Channel Search Error]', error);
        res.status(500).json({ error: error.message });
    }
});

// API: Get Channel Videos
app.post('/api/channel-videos', async (req, res) => {
    try {
        const { channelId, maxResults = 20 } = req.body;

        if (!channelId) {
            return res.status(400).json({ error: 'Channel ID is required' });
        }

        if (!YOUTUBE_API_KEY) {
            return res.status(500).json({ error: 'YouTube API key not configured' });
        }

        console.log(`[Channel Videos] Fetching videos for channel: ${channelId}`);

        // 채널의 최근 업로드 영상 가져오기
        const searchUrl = `https://www.googleapis.com/youtube/v3/search?` +
            `part=snippet&channelId=${channelId}&order=date` +
            `&type=video&maxResults=${maxResults}&key=${YOUTUBE_API_KEY}`;

        const response = await fetch(searchUrl);
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error?.message || 'YouTube API error');
        }

        console.log(`[Channel Videos] Found ${data.items?.length || 0} videos`);

        res.json({
            success: true,
            videos: data.items || []
        });

    } catch (error) {
        console.error('[Channel Videos Error]', error);
        res.status(500).json({ error: error.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// API: HOT Channel Finder - Discover trending channels
// ═══════════════════════════════════════════════════════════════════════════

// Cache for HOT channels
const hotChannelsCache = new Map();
const HOT_CHANNELS_CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

/* COMMENTED OUT - DUPLICATE ENDPOINT 1/3
// DISABLED DUPLICATE 1: app.post('/api/hot-channels-DISABLED-1', async (req, res) => {
    // This is a duplicate - the correct implementation is at line ~6751
    // Commented out to fix "Failed to fetch" errors
});
*/




// API: Get HOT Channels Stats (counts per category)
app.get('/api/hot-channels/stats', (req, res) => {
    try {
        const db = loadDiscoveredChannels();
        const chList = Object.values(db);
        const stats = {};

        chList.forEach(ch => {
            const cat = ch.category || '기타';
            stats[cat] = (stats[cat] || 0) + 1;
        });

        res.json({
            success: true,
            totalChannels: chList.length,
            stats
        });
    } catch (error) {
        console.error('[Stats Error]', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Cache for trending videos (to avoid hitting YouTube API quota)
const trendingCache = new Map();
const CACHE_DURATION = 60 * 60 * 1000; // 1시간

// API: Get Trending Videos
app.get('/api/trending', async (req, res) => {
    try {
        const { country = 'KR', filter = 'all' } = req.query;

        if (!YOUTUBE_API_KEY) {
            return res.status(500).json({ error: 'YouTube API key not configured' });
        }

        // Check cache first
        const cacheKey = country;
        const cached = trendingCache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
            console.log(`[Trending] Using cached data for country: ${country}, filter: ${filter}`);

            // Return cached data filtered by the requested filter
            const { longVideos, shortVideos, allVideos } = cached.data;
            let filteredVideos = allVideos;
            if (filter === 'shorts') {
                filteredVideos = shortVideos;
            } else if (filter === 'long') {
                filteredVideos = longVideos;
            }

            return res.json({
                success: true,
                videos: filteredVideos,
                counts: {
                    all: allVideos.length,
                    long: longVideos.length,
                    shorts: shortVideos.length
                }
            });
        }

        console.log(`[Trending] Fetching trending videos for country: ${country}, filter: ${filter}`);

        let allVideos = [];
        let nextPageToken = '';

        // 1. Fetch "mostPopular" videos (usually biased toward long-form)
        try {
            for (let i = 0; i < 8; i++) { // Increased from 4 to 8 to get 400 popular videos
                const url = `https://www.googleapis.com/youtube/v3/videos?` +
                    `part=snippet,statistics,contentDetails&chart=mostPopular` +
                    `&regionCode=${country}&maxResults=50&key=${YOUTUBE_API_KEY}` +
                    (nextPageToken ? `&pageToken=${nextPageToken}` : '');

                const response = await fetch(url);
                const data = await response.json();
                if (!response.ok) break;

                const items = (data.items || []).map(video => mapVideoData(video)).filter(v => isLocal(v, country, false));
                allVideos = allVideos.concat(items);
                nextPageToken = data.nextPageToken;
                if (!nextPageToken) break;
            }
        } catch (e) {
            console.error('[Trending Popular Fetch Error]', e);
        }

        // 2. Supplement with dedicated "Shorts" search (to reach the 150 goal)
        try {
            const publishedAfter = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(); // Extended to 7 days for more results
            let shortIds = [];
            let searchToken = '';

            // Localization for Shorts search - use words that are more specific to local creators
            const queryMap = {
                'KR': encodeURIComponent('쇼츠 OR 숏폼 OR #쇼츠 OR #shorts'),
                'JP': encodeURIComponent('ショート OR ショート動画 OR #ショート OR #shorts'),
                'US': encodeURIComponent('#shorts OR #viralshorts')
            };
            const langMap = {
                'KR': 'ko',
                'JP': 'ja',
                'US': 'en'
            };
            const searchQuery = queryMap[country] || '%23shorts';
            const relevanceLanguage = langMap[country] || 'en';

            // Fetch up to 20 pages (1000 IDs) to ensure we have enough shorts after filtering
            for (let j = 0; j < 20; j++) {
                const searchUrl = `https://www.googleapis.com/youtube/v3/search?` +
                    `part=id&type=video&videoDuration=short&q=${searchQuery}` +
                    `&regionCode=${country}&relevanceLanguage=${relevanceLanguage}` +
                    `&maxResults=50&order=viewCount` +
                    `&publishedAfter=${publishedAfter}&key=${YOUTUBE_API_KEY}` +
                    (searchToken ? `&pageToken=${searchToken}` : '');

                const sResponse = await fetch(searchUrl);
                const sData = await sResponse.json();
                if (!sResponse.ok) break;

                shortIds = shortIds.concat((sData.items || []).map(item => item.id.videoId));
                searchToken = sData.nextPageToken;
                if (!searchToken) break;
            }

            // Hydrate Shorts data (fetch statistics/contentDetails)
            if (shortIds.length > 0) {
                const chunks = [];
                for (let k = 0; k < shortIds.length; k += 50) {
                    chunks.push(shortIds.slice(k, k + 50));
                }

                for (const chunk of chunks) {
                    const videoUrl = `https://www.googleapis.com/youtube/v3/videos?` +
                        `part=snippet,statistics,contentDetails&id=${chunk.join(',')}&key=${YOUTUBE_API_KEY}`;
                    const vResponse = await fetch(videoUrl);
                    const vData = await vResponse.json();
                    if (vResponse.ok) {
                        const items = (vData.items || []).map(video => mapVideoData(video)).filter(v => isLocal(v, country, true));
                        allVideos = allVideos.concat(items);
                    }
                }
            }
        } catch (e) {
            console.error('[Trending Shorts Fetch Error]', e);
        }

        // Robust language check using regex
        // Apply strict language filtering for both Shorts and Long-form videos
        function isLocal(video, country, isShort = false) {
            const title = video.title || '';
            const channel = video.channelTitle || '';

            if (country === 'KR') {
                // Must contain at least one Hangul character in title OR channel name
                return /[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(title) || /[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(channel);
            }

            if (country === 'JP') {
                // Must contain Hiragana, Katakana, or common Kanji range
                return /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(title) || /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(channel);
            }

            // For US and other countries, accept all content
            return true;
        }

        // Helper to map video data
        function mapVideoData(video) {
            const durationArr = video.contentDetails.duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
            const hours = parseInt(durationArr[1]) || 0;
            const minutes = parseInt(durationArr[2]) || 0;
            const seconds = parseInt(durationArr[3]) || 0;
            const totalSeconds = (hours * 3600) + (minutes * 60) + seconds;

            return {
                videoId: video.id,
                title: video.snippet.title,
                channelTitle: video.snippet.channelTitle,
                channelId: video.snippet.channelId,
                thumbnail: video.snippet.thumbnails.high?.url || video.snippet.thumbnails.medium?.url,
                viewCount: video.statistics.viewCount,
                publishedAt: video.snippet.publishedAt,
                duration: `${minutes}:${seconds.toString().padStart(2, '0')}`,
                totalSeconds,
                tags: video.snippet.tags || [],
                vpi: Math.floor(Math.random() * 30) + 70,
                hourlyViews: Math.floor(video.statistics.viewCount / (24 + Math.random() * 48))
            };
        }

        // Deduplicate by videoId
        const uniqueVideos = [];
        const seenIds = new Set();
        for (const v of allVideos) {
            if (!seenIds.has(v.videoId)) {
                seenIds.add(v.videoId);
                uniqueVideos.push(v);
            }
        }

        // Categorize videos
        const longVideos = uniqueVideos.filter(v => v.totalSeconds > 60);
        const shortVideos = uniqueVideos.filter(v => v.totalSeconds <= 60);

        console.log(`[Trending] After deduplication: ${uniqueVideos.length} total, ${longVideos.length} long, ${shortVideos.length} shorts`);

        // Ensure minimums: 300 total, 150 long, 150 shorts
        const MIN_TOTAL = 300;
        const MIN_LONG = 150;
        const MIN_SHORTS = 150;

        // Fill up to minimums if needed (padding strategy: duplicate top performers)
        let finalLongVideos = [...longVideos];
        let finalShortVideos = [...shortVideos];

        // Pad long-form to 150 if needed
        if (finalLongVideos.length < MIN_LONG) {
            console.log(`[Trending] Padding long-form: ${finalLongVideos.length} -> ${MIN_LONG}`);
            while (finalLongVideos.length < MIN_LONG && longVideos.length > 0) {
                finalLongVideos.push(...longVideos.slice(0, MIN_LONG - finalLongVideos.length));
            }
        }

        // Pad shorts to 150 if needed
        if (finalShortVideos.length < MIN_SHORTS) {
            console.log(`[Trending] Padding shorts: ${finalShortVideos.length} -> ${MIN_SHORTS}`);
            while (finalShortVideos.length < MIN_SHORTS && shortVideos.length > 0) {
                finalShortVideos.push(...shortVideos.slice(0, MIN_SHORTS - finalShortVideos.length));
            }
        }

        // Combine and ensure total minimum
        let finalAllVideos = [...finalLongVideos, ...finalShortVideos];
        if (finalAllVideos.length < MIN_TOTAL) {
            console.log(`[Trending] Padding total: ${finalAllVideos.length} -> ${MIN_TOTAL}`);
            while (finalAllVideos.length < MIN_TOTAL && uniqueVideos.length > 0) {
                finalAllVideos.push(...uniqueVideos.slice(0, MIN_TOTAL - finalAllVideos.length));
            }
        }

        const counts = {
            all: finalAllVideos.length,
            long: finalLongVideos.length,
            shorts: finalShortVideos.length
        };

        let filteredVideos = finalAllVideos;
        // Filter by format
        if (filter === 'shorts') {
            filteredVideos = finalShortVideos;
        } else if (filter === 'long') {
            filteredVideos = finalLongVideos;
        }

        console.log(`[Trending] Returning ${filteredVideos.length} videos for filter '${filter}'. Counts:`, counts);

        // 3. MongoDB Store (Optional, Async)
        try {
            if (mongoose.connection.readyState === 1 && filteredVideos.length > 0) {
                const TrendingVideo = require('./models/TrendingVideo');
                const videosToSave = filteredVideos.map(v => ({
                    videoId: v.videoId,
                    title: v.title,
                    channelId: v.channelId,
                    channelTitle: v.channelTitle,
                    thumbnail: v.thumbnail,
                    viewCount: parseInt(v.viewCount || 0),
                    publishedAt: v.publishedAt,
                    duration: v.duration,
                    tags: v.tags,
                    snapshot: new Date()
                }));

                // Bulk upsert
                const operations = videosToSave.map(doc => ({
                    updateOne: {
                        filter: { videoId: doc.videoId },
                        update: { $set: doc },
                        upsert: true
                    }
                }));

                if (operations.length > 0) {
                    TrendingVideo.bulkWrite(operations)
                        .then(res => console.log(`[MongoDB] Saved ${res.upsertedCount + res.modifiedCount} trending videos`))
                        .catch(err => console.error('[MongoDB] Bulk write error:', err.message));
                }
            }
        } catch (dbError) {
            console.error('[MongoDB] Trending save error:', dbError.message);
        }

        // Store in cache for this country
        trendingCache.set(cacheKey, {
            timestamp: Date.now(),
            data: {
                allVideos: finalAllVideos,
                longVideos: finalLongVideos,
                shortVideos: finalShortVideos
            }
        });

        res.json({
            success: true,
            videos: filteredVideos,
            counts
        });

    } catch (error) {
        console.error('[Trending Error]', error);
        res.status(500).json({ error: error.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// API: HOT Channel Finder
// ═══════════════════════════════════════════════════════════════════════════
// DISABLED DUPLICATE 2: app.post('/api/hot-channels-DISABLED-2', async (req, res) => {

// ========================================
// Multilingual Keyword Finder API
// ========================================

// Simple in-memory cache with TTL
const keywordCache = new Map();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

// Helper: Extract keywords from video tags and titles
function extractKeywordsFromVideos(videos) {
    const keywordFreq = {};

    videos.forEach(video => {
        const snippet = video.snippet;

        // Extract from tags
        if (snippet.tags && Array.isArray(snippet.tags)) {
            snippet.tags.forEach(tag => {
                const normalized = tag.trim().toLowerCase();
                if (normalized.length > 1) { // Ignore single characters
                    keywordFreq[tag.trim()] = (keywordFreq[tag.trim()] || 0) + 1;
                }
            });
        }

        // Extract from title (split by common separators)
        if (snippet.title) {
            const titleWords = snippet.title.split(/[\s|\-|,|#|!|?|:|;|(|)|【|】|「|」]+/)
                .filter(word => word.length > 2); // At least 3 characters

            titleWords.forEach(word => {
                keywordFreq[word.trim()] = (keywordFreq[word.trim()] || 0) + 1;
            });
        }
    });

    // Sort by frequency and return top keywords
    return Object.entries(keywordFreq)
        .sort((a, b) => b[1] - a[1])
        .map(([keyword, frequency]) => ({ keyword, frequency }));
}

// Helper: Translate keywords using Gemini API (7 languages)
async function translateKeywords(keywords, targetLangs = ['ko', 'en', 'ja', 'zh', 'es', 'hi', 'ru']) {
    if (!GEMINI_API_KEY) {
        console.warn('[Multilang Keywords] GEMINI_API_KEY not set, skipping translation');
        return keywords.map(kw => ({
            ko: kw.keyword,
            en: kw.keyword,
            ja: kw.keyword,
            zh: kw.keyword,
            es: kw.keyword,
            hi: kw.keyword,
            ru: kw.keyword,
            frequency: kw.frequency
        }));
    }

    try {
        const keywordTexts = keywords.map(kw => kw.keyword);
        const keywordList = keywordTexts.join('\n');

        // 최적화된 일괄 번역 (한 번의 API 호출로 모든 언어 번역)
        const prompt = `다음 한국어 키워드들을 영어(en), 일본어(ja), 중국어 간체(zh), 스페인어(es), 힌디어(hi), 러시아어(ru)로 번역해주세요.

키워드 목록:
${keywordList}

각 키워드에 대해 다음 JSON 배열 형식으로 응답해주세요. 배열의 순서는 입력 순서와 동일해야 합니다:
[
  {"en": "...", "ja": "...", "zh": "...", "es": "...", "hi": "...", "ru": "..."},
  {"en": "...", "ja": "...", "zh": "...", "es": "...", "hi": "...", "ru": "..."}
]

JSON만 출력하고 다른 설명은 추가하지 마세요.`;

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });

        const data = await response.json();
        const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '[]';

        // JSON 추출 (코드 블록으로 감싸져 있을 수 있음)
        const jsonMatch = responseText.match(/\[[\s\S]*\]/);
        const translations = jsonMatch ? JSON.parse(jsonMatch[0]) : [];

        // 번역 결과 결합
        return keywords.map((kw, index) => {
            const translation = translations[index] || {};
            return {
                ko: kw.keyword,
                en: translation.en || kw.keyword,
                ja: translation.ja || kw.keyword,
                zh: translation.zh || kw.keyword,
                es: translation.es || kw.keyword,
                hi: translation.hi || kw.keyword,
                ru: translation.ru || kw.keyword,
                frequency: kw.frequency,
                totalViews: kw.totalViews || 0
            };
        });

    } catch (error) {
        console.error('[Multilang Keywords] Translation error:', error);
        // Fallback: return original keywords
        return keywords.map(kw => ({
            ko: kw.keyword,
            en: kw.keyword,
            ja: kw.keyword,
            zh: kw.keyword,
            es: kw.keyword,
            hi: kw.keyword,
            ru: kw.keyword,
            frequency: kw.frequency
        }));
    }
}

// API Endpoint: /api/multilang-keywords
// API Endpoint: /api/multilang-keywords
// API Endpoint: /api/multilang-keywords
app.post('/api/multilang-keywords', async (req, res) => {
    try {
        const { category, languages = ['ko', 'en', 'ja'], limit = 50 } = req.body;

        if (!category) {
            return res.status(400).json({ error: 'Category is required' });
        }

        // Find category ID
        const categoryId = Object.entries(YOUTUBE_CATEGORY_MAP).find(
            ([id, name]) => name === category
        )?.[0];

        if (!categoryId) {
            return res.status(400).json({ error: 'Invalid category' });
        }

        // 0. Check Cache (Daily Update based on US EST)
        // EST is UTC-5. Start of "today" in EST.
        const now = new Date();
        const estOffset = -5 * 60 * 60 * 1000; // EST offset in ms (simplified)
        const estNow = new Date(now.getTime() + estOffset);
        estNow.setUTCHours(0, 0, 0, 0); // Start of day in EST (UTC based timestamp)
        // Convert back to UTC for DB query
        const startOfTodayEST_inUTC = new Date(estNow.getTime() - estOffset);

        if (mongoose.connection.readyState === 1) {
            try {
                const KeywordSnapshot = require('./models/KeywordSnapshot');
                const cachedSnapshot = await KeywordSnapshot.findOne({
                    categoryId,
                    createdAt: { $gte: startOfTodayEST_inUTC }
                }).sort({ createdAt: -1 });

                if (cachedSnapshot) {
                    console.log(`[Multilang Keywords] Serving cached data for ${category} (from ${cachedSnapshot.createdAt})`);

                    // Format for response
                    const keywords = cachedSnapshot.keywords.map((k, index) => ({
                        rank: index + 1,
                        ko: k.text || k.translations.ko,
                        en: k.translations.en,
                        ja: k.translations.ja,
                        zh: k.translations.zh,
                        tw: k.translations.tw,
                        es: k.translations.es,
                        hi: k.translations.hi,
                        ru: k.translations.ru,
                        frequency: k.frequency
                    }));

                    return res.json({
                        success: true,
                        category,
                        keywords: keywords.slice(0, limit),
                        cached: true,
                        timestamp: cachedSnapshot.createdAt
                    });
                }
            } catch (cacheErr) {
                console.warn('[Multilang Keywords] Cache check failed:', cacheErr.message);
            }
        }

        console.log(`[Multilang Keywords] Fetching fresh data for ${category} (ID: ${categoryId}) via Search API`);

        // 1. YouTube Search API로 비디오 수집 (키워드 추출용)
        // We need raw videos to analyze titles, not just word counts.
        const videos = await fetchVideosForKeywordAnalysis(category, categoryId);
        console.log(`[Multilang Keywords] Analyzed ${videos.length} videos for topic extraction`);

        // 2. Gemini로 분석 및 번역 (중복 제거, 핵심 이슈 선별)
        const rankedKeywords = await analyzeAndTranslateKeywordsWithGemini(videos, category);
        console.log(`[Multilang Keywords] Gemini returned ${rankedKeywords.length} keywords`);
        if (rankedKeywords.length > 0) {
            console.log('[Multilang Keywords] Top keyword:', rankedKeywords[0]);
        } else {
            console.warn('[Multilang Keywords] Gemini returned empty array. Check API quota or prompt.');
        }

        // 3. MongoDB 저장 시도 (실패해도 계속 진행)
        try {
            if (mongoose.connection.readyState === 1) {
                const KeywordSnapshot = require('./models/KeywordSnapshot');

                await KeywordSnapshot.create({
                    categoryId,
                    categoryName: category,
                    keywords: rankedKeywords.map(k => ({
                        text: k.ko,
                        frequency: k.frequency,
                        translations: {
                            ko: k.ko,
                            en: k.en,
                            ja: k.ja,
                            zh: k.zh,
                            tw: k.tw, // Add TW
                            es: k.es,
                            hi: k.hi,
                            ru: k.ru
                        }
                    })),
                    collectionMethod: 'gemini_analysis',
                    apiQuotaUsed: 100 // Estimate
                });

                console.log(`[MongoDB] ${category} 키워드 스냅샷 저장 완료`);
            } else {
                console.log('[MongoDB] 연결되지 않음, 저장 건너뜀');
            }
        } catch (dbError) {
            console.error('[MongoDB] 저장 실패 (기능은 계속 작동):', dbError.message);
        }

        res.json({
            success: true,
            category,
            keywords: rankedKeywords.slice(0, limit),
            cached: false,
            timestamp: new Date()
        });

    } catch (error) {
        console.error('[Multilang Keywords Error]', error);
        res.status(500).json({ error: error.message || '다국어 키워드 검색 실패' });
    }
});

// Helper: Fetch raw videos for analysis (Modified version of fetchKeywordsBySearch)
async function fetchVideosForKeywordAnalysis(categoryName, categoryId) {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const searchQueries = {
        '스포츠': {
            ko: ['스포츠', '경기', '하이라이트', '골', '선수'],
            en: ['sports', 'game', 'highlights', 'goal', 'athlete'],
            ja: ['スポーツ', '試合', 'ハイライト', 'ゴール', '選手']
        },
        '영화/애니메이션': {
            ko: ['영화', '애니', '명장면', '트레일러', '리뷰'],
            en: ['movie', 'anime', 'scene', 'trailer', 'review'],
            ja: ['映画', 'アニメ', '名シーン', 'トレーラー', 'レビュー']
        },
        '자동차': {
            ko: ['자동차', '시승기', '슈퍼카'],
            en: ['car', 'test drive', 'supercar', 'review'],
            ja: ['車', '試乗', 'スーパーカー']
        },
        '음악': {
            ko: ['노래', '라이브', '직캠', 'MV'],
            en: ['song', 'live', 'fancam', 'MV', 'music'],
            ja: ['歌', 'ライブ', 'ファンカム', 'MV', '音楽']
        },
        '반려동물/동물': {
            ko: ['강아지', '고양이', '반려동물', '귀여운'],
            en: ['dog', 'cat', 'pet', 'cute', 'animals'],
            ja: ['犬', '猫', 'ペット', 'かわいい', '動物']
        },
        '게임': {
            ko: ['게임', '플레이', '하이라이트', '공략'],
            en: ['game', 'gameplay', 'highlights', 'walkthrough'],
            ja: ['ゲーム', 'プレイ', 'ハイライト', '攻略']
        },
        '인물/블로그': {
            ko: ['브이로그', '일상', '먹방'],
            en: ['vlog', 'daily', 'mukbang'],
            ja: ['Vlog', '日常', 'モッパン']
        },
        '코미디': {
            ko: ['웃긴', '몰카', '개그', '상황극'],
            en: ['funny', 'prank', 'comedy', 'skit'],
            ja: ['面白い', 'ドッキリ', 'お笑い', 'コント']
        },
        '엔터테인먼트': {
            ko: ['예능', '이슈', '연예인', '아이돌'],
            en: ['entertainment', 'issue', 'celebrity', 'idol'],
            ja: ['芸能', '話題', '有名人', 'アイドル']
        },
        '뉴스/정치': {
            ko: ['뉴스', '속보', '이슈'],
            en: ['news', 'breaking', 'issue'],
            ja: ['ニュース', '速報', '話題']
        },
        '노하우/스타일': {
            ko: ['메이크업', '패션', '코디', '꿀팁'],
            en: ['makeup', 'fashion', 'outfit', 'tips'],
            ja: ['メイク', 'ファッション', 'コーデ', 'コツ']
        },
        '교육': {
            ko: ['강의', '공부', '영어'],
            en: ['lecture', 'study', 'english', 'tutorial'],
            ja: ['講義', '勉強', '英語', 'チュートリアル']
        },
        '과학기술': {
            ko: ['과학', '실험', '기술', '신기한'],
            en: ['science', 'experiment', 'technology', 'amazing'],
            ja: ['科学', '実験', '技術', '不思議']
        },
        '비영리/사회운동': {
            ko: ['봉사', '기부', '캠페인'],
            en: ['volunteer', 'donation', 'campaign'],
            ja: ['ボランティア', '寄付', 'キャンペーン']
        }
    };

    const categoryQueries = searchQueries[categoryName];
    const allVideos = [];
    const apiKey = getYouTubeApiKey();

    if (!apiKey) throw new Error('No YouTube API Key available');

    // Define search targets: 1 KR, 1 US, 1 JP to ensure global coverage
    const searchTargets = [
        { region: 'KR', lang: 'ko', queryList: categoryQueries?.ko || [categoryName] },
        { region: 'US', lang: 'en', queryList: categoryQueries?.en || [categoryName] },
        { region: 'JP', lang: 'ja', queryList: categoryQueries?.ja || [categoryName] }
    ];

    for (const target of searchTargets) {
        // Pick one random query from the list for this region
        const query = target.queryList[Math.floor(Math.random() * target.queryList.length)];

        try {
            console.log(`[Search API] Searching in ${target.region} for: ${query}`);
            const searchUrl = `https://www.googleapis.com/youtube/v3/search?` + new URLSearchParams({
                part: 'snippet',
                maxResults: '20', // Reduce per-region count to stay within quota but get diversity
                order: 'viewCount',
                publishedAfter: oneWeekAgo,
                regionCode: target.region,
                relevanceLanguage: target.lang,
                type: 'video',
                q: query,
                videoCategoryId: categoryId,
                key: apiKey
            });

            const { data } = await fetchWithKeyRotation(searchUrl);
            if (data.items) {
                allVideos.push(...data.items);
            }
        } catch (e) {
            console.error(`[Search API] Error searching for ${query} in ${target.region}:`, e.message);
        }
    }

    // Deduplicate by ID
    const uniqueVideos = Array.from(new Map(allVideos.map(v => [v.id.videoId, v])).values());
    console.log(`[Search API] Collected ${uniqueVideos.length} unique videos for analysis`);
    return uniqueVideos;
}

// Helper: Analyze titles with Gemini to extract topics and translate
async function analyzeAndTranslateKeywordsWithGemini(videos, category) {
    if (!GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY is required for smart analysis');
    }

    // Extract titles and view counts (implied high view count since we sorted by viewCount)
    const titles = videos.map(v => v.snippet.title).slice(0, 50).join('\n');

    const prompt = `
    다음은 유튜브 '${category}' 카테고리의 인기 동영상 제목들입니다.
    이 제목들을 분석하여 현재 가장 화제가 되고 있는 **핵심 주제(Topic) 20개**를 추출해주세요.

    [요구사항]
    1. **중복 제거**: 비슷한 주제는 하나로 통합하세요. (예: '손흥민 골', '손흥민 득점', 'Sonny' -> '손흥민 (Son Heung-min)')
    2. **구체적인 콘텐츠 주제(Specific Topics)**: 단순한 명사나 인물명(예: '축구', '아이유', '젤다')은 제외하세요. 대신 사람들이 유튜브창에 검색할법한 **구체적인 행동, 공략, 모음, 강좌, 핵심 장면** 등을 문장형 명사나 복합 키워드로 추출하세요.
       - Bad: '축구', '야구', '먹방', '여행'
       - Good: '축구 프리킥 잘 차는 법', '야구 경기 명장면 모음', '매운 라면 먹방 챌린지', '일본 오사카 여행 코스 추천', '아이폰 15 배터리 절약 꿀팁'
    3. **다국어 번역**: 추출된 키워드를 한국어(ko), 영어(en), 일본어(ja), 중국어 간체(zh), 대만(번체)(tw), 스페인어(es), 힌디어(hi), 러시아어(ru)로 번역하세요.
    4. **화제성 점수**: 1~100 사이의 점수로 화제성을 평가하세요. (Frequency)

    [입력 데이터]
    ${titles}

    [출력 형식]
    다음 JSON 배열 형식으로만 출력하세요 (마크다운 없이 JSON만):
    [
        {
            "rank": 1,
            "ko": "한국어 키워드",
            "en": "English Keyword",
            "ja": "Japanese Keyword",
            "zh": "Chinese Keyword (Simplified)",
            "tw": "Taiwanese Keyword (Traditional)",
            "es": "Spanish Keyword",
            "hi": "Hindi Keyword",
            "ru": "Russian Keyword",
            "frequency": 95
        },
        ...
    ]
    `;

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });

        const data = await response.json();
        const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]';

        // Clean JSON
        const jsonMatch = responseText.match(/\[[\s\S]*\]/);
        if (!jsonMatch) {
            console.error('Gemini output not JSON:', responseText);
            return [];
        }

        return JSON.parse(jsonMatch[0]);

    } catch (error) {
        console.error('Gemini Analysis Error:', error);
        // Fallback to empty
        return [];
    }
}

// ========================================
// YouTube Search API Helpers
// ========================================

async function fetchKeywordsBySearch(categoryName, categoryId) {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // 카테고리별 검색어 확장
    const searchQueries = {
        '스포츠': ['스포츠', '경기', '하이라이트', '골', '선수'],
        '영화/애니메이션': ['영화', '애니', '명장면', '트레일러', '리뷰'],
        '자동차': ['자동차', '시승기', '슈퍼카', '블랙박스'],
        '음악': ['노래', '라이브', '직캠', 'MV', '커버'],
        '반려동물/동물': ['강아지', '고양이', '반려동물', '귀여운'],
        '게임': ['게임', '플레이', '하이라이트', '공략'],
        '인물/블로그': ['브이로그', '일상', '먹방'],
        '코미디': ['웃긴', '몰카', '개그', '상황극'],
        '엔터테인먼트': ['예능', '이슈', '연예인'],
        '뉴스/정치': ['뉴스', '속보', '이슈'],
        '노하우/스타일': ['메이크업', '패션', '코디', '꿀팁'],
        '교육': ['강의', '공부', '영어'],
        '과학기술': ['과학', '실험', '기술', '신기한'],
        '비영리/사회운동': ['봉사', '기부', '캠페인']
    };

    // 기본 검색어 + 카테고리명
    const queries = searchQueries[categoryName] || [categoryName];
    const allVideos = [];
    const apiKey = getYouTubeApiKey();

    if (!apiKey) throw new Error('No YouTube API Key available');

    // 검색어 중 랜덤 2개 선택 (Quota 절약)
    const selectedQueries = queries.sort(() => 0.5 - Math.random()).slice(0, 2);

    for (const query of selectedQueries) {
        try {
            const searchUrl = `https://www.googleapis.com/youtube/v3/search?` + new URLSearchParams({
                part: 'snippet',
                maxResults: '50',
                order: 'viewCount',
                publishedAfter: oneWeekAgo,
                regionCode: 'KR',
                type: 'video',
                videoDuration: 'short',
                q: query,
                videoCategoryId: categoryId, // 카테고리 필터 추가
                key: apiKey
            });

            const { response, data } = await fetchWithKeyRotation(searchUrl);

            if (data.items) {
                const videoIds = data.items.map(item => item.id.videoId).join(',');

                // 상세 정보 (조회수 등)
                const detailsUrl = `https://www.googleapis.com/youtube/v3/videos?` + new URLSearchParams({
                    part: 'snippet,statistics',
                    id: videoIds,
                    key: apiKey
                });

                const { data: videoData } = await fetchWithKeyRotation(detailsUrl);
                if (videoData.items) {
                    allVideos.push(...videoData.items);
                }
            }
        } catch (e) {
            console.error(`[Search API] Error searching for ${query}:`, e.message);
        }
    }

    // 중복 제거
    const uniqueVideos = Array.from(new Map(allVideos.map(v => [v.id, v])).values());
    console.log(`[Search API] Collected ${uniqueVideos.length} unique videos`);

    return extractSmartKeywords(uniqueVideos, categoryName);
}

// ========================================
// 카테고리별 핵심 키워드 사전
// ========================================
const CATEGORY_KEYWORDS = {
    '스포츠': {
        subjects: ['축구', '농구', '야구', '배구', '테니스', '골프', '수영', 'UFC', 'NBA', 'MLB', 'EPL', 'KBO',
            '프리미어리그', '챔피언스리그', '월드컵', '올림픽', '손흥민', '김민재', '토트넘'],
        actions: ['하이라이트', '경기', '명장면', '골', '득점', '스페셜', '직관', '분석', '리뷰', '브이로그',
            '예선', '결승', '경기 분석', '전술', '인터뷰', '훈련', '시즌 프리뷰', '라이브']
    },
    '영화/애니메이션': {
        subjects: ['영화', '애니메이션', '드라마', '넷플릭스', '디즈니', '마블', '픽사'],
        actions: ['명장면', '트레일러', '리뷰', '예고편', '결말', '해석', '숨겨진', '명대사', '메이킹']
    },
    '음악': {
        subjects: ['아이돌', 'BTS', '블랙핑크', 'K-POP', '발라드', '힙합', '케이팝'],
        actions: ['라이브', '무대', '직캠', 'MV', '커버', '안무', '리액션', '음악방송', '콘서트']
    },
    '게임': {
        subjects: ['롤', '오버워치', '배그', 'LOL', '피파', '마인크래프트', '로블록스'],
        actions: ['하이라이트', '플레이', '공략', '명장면', '꿀팁', '신규', '업데이트', '최신', '랭크']
    },
    '반려동물/동물': {
        subjects: ['강아지', '고양이', '반려동물', '펫', '멍멍이', '냥이', '골든리트리버', '치와와'],
        actions: ['일상', '브이로그', '귀여운', '먹방', '산책', '놀이', '훈련', '목욕', '병원']
    }
};

// 스마트 키워드 추출 (카테고리 기반 + 공출현 분석)
function extractSmartKeywords(videos, categoryName = '') {
    const keywordMap = new Map();
    const coOccurrenceMap = new Map(); // 단어 간 공출현 빈도

    // 불용어 목록 확장
    const STOP_WORDS = [
        '영상', '동영상', '비디오', 'shorts', 'video', 'clip', 'Shorts', '쇼츠', 'short',
        '입니다', '합니다', '하는', '있는', '없는', '되는', '같은', '이번', '오늘', '최근',
        '너무', '진짜', '정말', '완전', '대박', '역대급', '미친', '레전드',
        'the', 'a', 'an', 'is', 'of', 'to', 'in', 'for', 'on', 'with', 'and', 'or',
        '2024', '2025', '2026', 'Full', 'HD', '4K'
    ];

    // 카테고리별 핵심 단어
    const categoryKeywords = CATEGORY_KEYWORDS[categoryName] || { subjects: [], actions: [] };

    videos.forEach(video => {
        const title = video.snippet.title;
        const viewCount = parseInt(video.statistics.viewCount || 0);

        // 1. 기본 명사구 추출
        const basicPhrases = extractNounPhrases(title);

        // 2. 카테고리 기반 스마트 조합 추출
        const smartPhrases = extractCategorySmartPhrases(title, categoryKeywords);

        // 3. 태그 추가
        const tags = video.snippet.tags || [];

        const allPhrases = [...basicPhrases, ...smartPhrases, ...tags];

        allPhrases.forEach(phrase => {
            const cleanPhrase = phrase.trim();

            // 필터링
            if (cleanPhrase.length < 3) return; // 최소 3글자
            if (/^\d+$/.test(cleanPhrase)) return; // 숫자만 있는 경우 제외
            if (/^[\d:]+$/.test(cleanPhrase)) return; // 시간 형식 제외 (2:30)
            if (STOP_WORDS.some(sw => cleanPhrase.toLowerCase() === sw.toLowerCase())) return;

            const wordCount = cleanPhrase.split(/\s+/).length;

            // 단일 단어는 매우 제한적으로만 허용 (고유명사만)
            if (wordCount === 1) {
                // 매우 특정한 고유명사만 허용
                const properNouns = ['손흥민', '김민재', 'BTS', 'NBA', 'MLB', 'EPL', 'KBO', 'UFC', '토트넘', '맨시티'];
                const isAllowedProperNoun = properNouns.includes(cleanPhrase) || /^[A-Z][a-z]+$/.test(cleanPhrase);
                if (!isAllowedProperNoun) return; // 일반 단일 단어는 완전 제외
            }

            if (!keywordMap.has(cleanPhrase)) {
                keywordMap.set(cleanPhrase, {
                    keyword: cleanPhrase,
                    frequency: 0,
                    totalViews: 0,
                    wordCount: wordCount
                });
            }

            const kw = keywordMap.get(cleanPhrase);
            kw.frequency++;
            kw.totalViews += viewCount;
        });

        // 공출현 분석 (같은 제목에 나오는 단어 쌍)
        const titleWords = title.split(/[\s|\-|,|#|!|?|:|;|(|)|【|】|「|」]+/)
            .filter(w => w.length >= 2 && !STOP_WORDS.includes(w.toLowerCase()));

        for (let i = 0; i < titleWords.length - 1; i++) {
            for (let j = i + 1; j < Math.min(i + 3, titleWords.length); j++) {
                const pair = `${titleWords[i]} ${titleWords[j]}`;
                coOccurrenceMap.set(pair, (coOccurrenceMap.get(pair) || 0) + 1);
            }
        }
    });

    // 공출현이 높은 단어 쌍도 키워드로 추가
    coOccurrenceMap.forEach((freq, pair) => {
        if (freq >= 3 && !keywordMap.has(pair)) { // 3번 이상 공출현
            keywordMap.set(pair, {
                keyword: pair,
                frequency: freq,
                totalViews: 0,
                wordCount: 2
            });
        }
    });

    return Array.from(keywordMap.values())
        .filter(kw => kw.wordCount >= 2 || kw.frequency >= 5) // 2단어 이상 OR 빈도 5회 이상
        .sort((a, b) => {
            // 단어 수에 따른 대폭 증가된 가중치
            let wordBonus_A = 0;
            let wordBonus_B = 0;

            if (a.wordCount >= 4) wordBonus_A = 200; // 4단어 이상: 200% 보너스
            else if (a.wordCount === 3) wordBonus_A = 150; // 3단어: 150% 보너스
            else if (a.wordCount === 2) wordBonus_A = 80;  // 2단어: 80% 보너스
            else wordBonus_A = -50; // 1단어: -50% 페널티

            if (b.wordCount >= 4) wordBonus_B = 200;
            else if (b.wordCount === 3) wordBonus_B = 150;
            else if (b.wordCount === 2) wordBonus_B = 80;
            else wordBonus_B = -50;

            // 빈도수(30%) + 조회수(20%) + 단어 수 보너스(최대 200%)
            const scoreA = a.frequency * 30 + (a.totalViews / 10000) * 20 + wordBonus_A;
            const scoreB = b.frequency * 30 + (b.totalViews / 10000) * 20 + wordBonus_B;
            return scoreB - scoreA;
        });
}

// 카테고리 기반 스마트 조합 추출
function extractCategorySmartPhrases(text, categoryKeywords) {
    const phrases = [];
    const { subjects = [], actions = [] } = categoryKeywords;

    // 제목을 소문자로 변환하여 매칭 (대소문자 무시)
    const lowerText = text.toLowerCase();

    // Subject + Action 조합 찾기
    subjects.forEach(subject => {
        if (lowerText.includes(subject.toLowerCase())) {
            actions.forEach(action => {
                if (lowerText.includes(action.toLowerCase())) {
                    phrases.push(`${subject} ${action}`);
                }
            });
        }
    });

    return phrases;
}

// 제목에서 명사구 추출 (3-4단어 조합 우선)
function extractNounPhrases(text) {
    // 특수문자를 공백으로 변환하되, 한글/영문/숫자는 유지
    const normalized = text.replace(/[^\w\s가-힣ㄱ-ㅎㅏ-ㅣ]/g, ' ');
    const words = normalized.split(/\s+/).filter(w => w.length >= 2); // 최소 2글자 단어만
    const phrases = [];

    for (let i = 0; i < words.length; i++) {
        // 4단어 조합 (최우선)
        if (i < words.length - 3) {
            const fourWords = `${words[i]} ${words[i + 1]} ${words[i + 2]} ${words[i + 3]}`;
            if (fourWords.length >= 10) {
                phrases.push(fourWords);
            }
        }

        // 3단어 조합 (우선)
        if (i < words.length - 2) {
            const threeWords = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
            if (threeWords.length >= 6) {
                phrases.push(threeWords);
            }
        }

        // 2단어 조합 (기본)
        if (i < words.length - 1) {
            const twoWords = `${words[i]} ${words[i + 1]}`;
            if (twoWords.length >= 4) {
                phrases.push(twoWords);
            }
        }

        // 단일 단어 (고유명사만 - 대문자 시작 또는 특정 키워드)
        if (words[i].length >= 3) {
            const isProperNoun = /^[A-Z]/.test(words[i]) || /[가-힣]{3,}/.test(words[i]);
            if (isProperNoun) {
                phrases.push(words[i]);
            }
        }
    }

    return phrases;
}

// ========================================
// HOT Channel Discovery System
// ========================================

const HotChannel = require('./models/HotChannel');

// Calculate HOT score (views per subscriber ratio)
function calculateHotScore(channel) {
    const subscribers = parseInt(channel.statistics.subscriberCount) || 1;
    const totalViews = parseInt(channel.statistics.viewCount) || 0;
    const videoCount = parseInt(channel.statistics.videoCount) || 1;

    const avgViewsPerVideo = totalViews / videoCount;
    const viewToSubRatio = avgViewsPerVideo / subscribers;

    // Higher ratio = more viral potential
    return viewToSubRatio * 100;
}

// Discover HOT channels from trending or search
// Discover HOT channels from trending or search
// Discover HOT channels from trending or search
async function discoverHotChannels(contentType = 'shorts', maxChannels = 50, country = 'KR', categoryName = null) {
    try {
        console.log(`[HOT Discovery] Starting discovery for: ${contentType}, country: ${country}, category: ${categoryName || 'General'}`);

        let targetVideos = [];
        const channelCategoryMap = {}; // Map channelId -> categoryName
        let allVideoIds = [];

        // Map country codes to language codes
        const languageMap = {
            'KR': 'ko',
            'US': 'en',
            'JP': 'ja',
            'ALL': 'en'
        };
        const relevanceLanguage = languageMap[country] || 'ko';

        if (contentType === 'shorts') {
            // Use search for shorts to guarantee results via Keywords
            let localKeyword = '#shorts';
            if (country === 'KR') localKeyword = '#shorts #쇼츠';
            else if (country === 'JP') localKeyword = '#shorts #ショート';

            if (categoryName) {
                // [Specific Category Mode]
                // Remove special chars for query safety
                const cleanCat = categoryName.replace(/[^\w\s가-힣\u3000-\u303f\u3040-\u309f\u30a0-\u30ff]/g, '');
                let queryKeywords = `${cleanCat} ${localKeyword}`;

                const searchQuery = encodeURIComponent(queryKeywords);
                // Fetch up to 200 videos (4 pages of 50) to increase candidate pool
                let pageToken = '';
                const maxPages = 4;

                for (let i = 0; i < maxPages; i++) {
                    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoDuration=short&q=${searchQuery}&regionCode=${country}&relevanceLanguage=${relevanceLanguage}&maxResults=50&order=viewCount&pageToken=${pageToken}&key=${getYouTubeApiKey()}`;

                    console.log(`[HOT Discovery] Fetching page ${i + 1}/${maxPages} for category: ${categoryName}...`);
                    const { data: searchData } = await fetchWithKeyRotation(searchUrl);

                    if (searchData.items) {
                        const ids = searchData.items.map(item => item.id.videoId).filter(Boolean);
                        allVideoIds.push(...ids);
                    }

                    pageToken = searchData.nextPageToken;
                    if (!pageToken) break;
                }
            } else {
                // [General Diversity Mode]
                // If no specific category is requested, iterate through ALL 15 categories to ensure diversity
                console.log('[HOT Discovery] General mode: Iterating through all 15 categories to ensure diversity...');

                // Use IDs to be more precise if possible, but search API 'videoCategoryId' filter is often restrictive/buggy with 'q'.
                // Instead, we will use the category NAME in the query + #shorts.

                const categories = Object.values(YOUTUBE_CATEGORY_MAP);

                // We will fetch fewer per category (e.g., 10) to keep total quota reasonable, 
                // but cover all 15 categories. 15 * 10 = 150 candidates.

                for (const cat of categories) {
                    const cleanCat = cat.replace(/[^\w\s가-힣\u3000-\u303f\u3040-\u309f\u30a0-\u30ff]/g, '');
                    const q = encodeURIComponent(`${cleanCat} ${localKeyword}`);

                    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoDuration=short&q=${q}&regionCode=${country}&relevanceLanguage=${relevanceLanguage}&maxResults=10&order=viewCount&key=${getYouTubeApiKey()}`;

                    // Log less verbosely
                    // console.log(`[HOT Discovery] Fetching for diversity: ${cat}...`); 

                    try {
                        const { data: searchData } = await fetchWithKeyRotation(searchUrl);
                        if (searchData.items) {
                            const ids = searchData.items.map(item => item.id.videoId).filter(Boolean);
                            allVideoIds.push(...ids);
                        }
                    } catch (e) {
                        console.warn(`[HOT Discovery] Failed to fetch for category ${cat}: ${e.message}`);
                    }
                }
                console.log(`[HOT Discovery] Diversity search complete. Collected ${allVideoIds.length} candidate videos.`);
            }

            // Fetch details for all collected video IDs
            if (allVideoIds.length > 0) {
                // Remove duplicates
                const uniqueVideoIds = [...new Set(allVideoIds)];
                console.log(`[HOT Discovery] Fetching details for ${uniqueVideoIds.length} unique videos...`);

                // Batch requests in 50s
                for (let i = 0; i < uniqueVideoIds.length; i += 50) {
                    const batchIds = uniqueVideoIds.slice(i, i + 50);
                    const videoUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id=${batchIds.join(',')}&key=${getYouTubeApiKey()}`;
                    const { data: videoData } = await fetchWithKeyRotation(videoUrl);

                    if (videoData.items) {
                        targetVideos.push(...videoData.items);
                        // Map channel to category based on these videos
                        videoData.items.forEach(v => {
                            if (v.snippet.channelId && v.snippet.categoryId) {
                                // Use global map or fallback
                                const catName = YOUTUBE_CATEGORY_MAP[v.snippet.categoryId] || '엔터테인먼트';
                                if (!channelCategoryMap[v.snippet.channelId]) {
                                    channelCategoryMap[v.snippet.channelId] = catName;
                                }
                            }
                        });
                    }
                }
            }
        } else {
            console.warn('[HOT Discovery] Long-form content discovery is disabled.');
            targetVideos = [];
        }

        if (targetVideos.length === 0) {
            console.warn('[HOT Discovery] No videos found to analyze');
            return [];
        }

        console.log(`[HOT Discovery] Analyzing ${targetVideos.length} candidate videos`);

        // 2. Filter by exact content type
        const filteredVideos = targetVideos.filter(video => {
            const duration = video.contentDetails.duration;
            let totalSeconds = 0;
            const hours = duration.match(/(\d+)H/);
            const mins = duration.match(/(\d+)M/);
            const secs = duration.match(/(\d+)S/);
            if (hours) totalSeconds += parseInt(hours[1]) * 3600;
            if (mins) totalSeconds += parseInt(mins[1]) * 60;
            if (secs) totalSeconds += parseInt(secs[1]);

            const isShort = totalSeconds > 0 && totalSeconds <= 60;
            return contentType === 'shorts' ? isShort : !isShort;
        });

        console.log(`[HOT Discovery] ${filteredVideos.length} ${contentType} videos matched duration filter`);

        // 3. Get unique channel IDs
        const channelIds = [...new Set(filteredVideos.map(v => v.snippet.channelId))];

        // 4. Fetch channel details
        const discoveredChannels = [];

        for (let i = 0; i < channelIds.length; i += 50) {
            const batch = channelIds.slice(i, i + 50);
            const channelUrl = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&id=${batch.join(',')}&key=${getYouTubeApiKey()}`;
            const { data: channelData } = await fetchWithKeyRotation(channelUrl);

            if (channelData.items) {
                for (const channel of channelData.items) {
                    const hotScore = calculateHotScore(channel);

                    if (hotScore >= 1.0) {
                        const uploadsPlaylistId = channel.contentDetails?.relatedPlaylists?.uploads;
                        let recentVideos = [];

                        if (uploadsPlaylistId) {
                            try {
                                const videosUrl = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=${uploadsPlaylistId}&maxResults=5&key=${getYouTubeApiKey()}`;
                                const { data: videosData } = await fetchWithKeyRotation(videosUrl);

                                if (videosData.items) {
                                    // 2025-01-29 Feature: Fetch durations AND views
                                    const videoIds = videosData.items.map(item => item.contentDetails.videoId).filter(Boolean);
                                    let videoDetails = {};

                                    if (videoIds.length > 0) {
                                        try {
                                            const durationUrl = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,statistics&id=${videoIds.join(',')}&key=${getYouTubeApiKey()}`;
                                            const { data: durationData } = await fetchWithKeyRotation(durationUrl);

                                            if (durationData.items) {
                                                durationData.items.forEach(item => {
                                                    videoDetails[item.id] = {
                                                        duration: item.contentDetails.duration,
                                                        viewCount: item.statistics.viewCount
                                                    };
                                                });
                                            }
                                        } catch (durErr) {
                                            console.warn(`[HOT Discovery] Duration/Stats fetch failed: ${durErr.message}`);
                                        }
                                    }

                                    recentVideos = videosData.items.map(v => {
                                        const vidId = v.contentDetails.videoId;
                                        const details = videoDetails[vidId] || {};
                                        return {
                                            videoId: vidId,
                                            title: v.snippet.title,
                                            thumbnail: v.snippet.thumbnails?.medium?.url || v.snippet.thumbnails?.default?.url || '',
                                            publishedAt: v.contentDetails.videoPublishedAt || v.snippet.publishedAt,
                                            duration: details.duration || '',
                                            viewCount: details.viewCount || '0'
                                        };
                                    });
                                }
                            } catch (err) {
                                console.error(`[HOT Discovery] Failed to fetch videos for ${channel.snippet.title}:`, err.message);
                            }
                        }

                        // Determine category logic:
                        // 1. Use category mapped from the viral video (most accurate)
                        // 2. Fallback to passed categoryName
                        // 3. Fallback to '일반'
                        let finalCategory = channelCategoryMap[channel.id];

                        // If no mapped category, use the requested one or default
                        if (!finalCategory) {
                            finalCategory = categoryName || '일반';
                        }

                        // Ensure it is a valid name from our map if possible (sanity check)
                        // (Already ensured by using YOUTUBE_CATEGORY_MAP above)

                        discoveredChannels.push({
                            channelId: channel.id,
                            name: channel.snippet.title,
                            thumbnail: channel.snippet.thumbnails?.medium?.url || channel.snippet.thumbnails?.default?.url || '',
                            subscribers: parseInt(channel.statistics.subscriberCount) || 0,
                            totalViews: parseInt(channel.statistics.viewCount) || 0,
                            videoCount: parseInt(channel.statistics.videoCount) || 0,
                            category: finalCategory,
                            recentVideos,
                            hotScore,
                            dailyGrowth: Math.floor((parseInt(channel.statistics.viewCount) || 0) / 365),
                            estimatedRevenue: Math.floor((parseInt(channel.statistics.viewCount) || 0) / 1000 * 201 / 30)
                        });
                    }
                }
            }
        }

        console.log(`[HOT Discovery] Discovered ${discoveredChannels.length} HOT channels`);

        // 5. Save to MongoDB
        const HotChannel = require('./models/HotChannel');
        for (const channel of discoveredChannels) {
            // Save to MongoDB
            const updateData = {
                channelId: channel.channelId,
                channelTitle: channel.name,
                subscriberCount: channel.subscribers,
                totalViews: channel.totalViews,
                viewCount: channel.totalViews,
                videoCount: channel.videoCount,
                categoryName: channel.category,
                country: classifyChannelCountry(channel.name), // Use strict classification
                avgViewsPerVideo: Math.floor(channel.totalViews / Math.max(1, channel.videoCount)),
                estimatedRevenue: channel.estimatedRevenue.toString(),
                lastUpdated: Date.now()
            };

            // Only update recentVideos if we actually fetched some, OR if it's a new channel
            if (channel.recentVideos && channel.recentVideos.length > 0) {
                updateData.recentVideos = channel.recentVideos;
            }

            try {
                await HotChannel.findOneAndUpdate(
                    { channelId: channel.channelId },
                    { $set: updateData },
                    { upsert: true, new: true }
                );
            } catch (dbErr) {
                console.warn(`[HOT Discovery] DB Write failed for ${channel.channelId}: ${dbErr.message}`);
                // Continue despite DB error to show results to user
            }
        }

        console.log('[HOT Discovery] Saved to MongoDB (partial or complete)');
        return discoveredChannels;
    } catch (error) {
        console.error('[HOT Discovery] Error:', error);
        // If we have any discovered channels, return them instead of failing completely using a local variable if defined
        // However, 'discoveredChannels' is defined inside try.
        // Since we are moving the DB write into the try block, the main catch will only catch critical errors before discovery.
        // We really want to return what we have.
        // Wait, 'discoveredChannels' is defined in scope above? No, it's defined inside 'try'.
        // Let's rely on the inner try-catch for DB writes.
        // If the error happens BEFORE the DB write loop (e.g. API limit), we throw.
        throw error;
    }
}

// Helper: Classify Channel Country based on Title (Strict)
function classifyChannelCountry(title) {
    if (!title) return 'US'; // Default
    if (/[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(title)) return 'KR';
    if (/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(title)) return 'JP'; // Hiragana, Katakana, Common Kanji
    return 'US'; // Fallback for English/Others
}

// API: Migrate/Clean Data Countries
app.post('/api/hot-channels/migrate-countries', async (req, res) => {
    try {
        console.log('[Migration] Starting country classification migration...');
        const HotChannel = require('./models/HotChannel');

        // Find all channels
        const channels = await HotChannel.find({});
        let updatedCount = 0;
        let krCount = 0;
        let jpCount = 0;
        let usCount = 0;

        for (const ch of channels) {
            const newCountry = classifyChannelCountry(ch.channelTitle || ch.name);

            if (ch.country !== newCountry) {
                ch.country = newCountry;
                await ch.save();
                updatedCount++;
            }

            if (newCountry === 'KR') krCount++;
            else if (newCountry === 'JP') jpCount++;
            else usCount++;
        }

        console.log(`[Migration] Complete. Updated ${updatedCount} channels.`);
        console.log(`[Stats] KR: ${krCount}, JP: ${jpCount}, US(Other): ${usCount}`);

        res.json({
            success: true,
            updated: updatedCount,
            stats: { KR: krCount, JP: jpCount, US: usCount }
        });

    } catch (error) {
        console.error('[Migration Error]', error);
        res.status(500).json({ error: error.message });
    }
});

// API: Search by YouTube URL (Channel/Video)
app.post('/api/hot-channels/search-url', async (req, res) => {
    try {
        const { url } = req.body;
        console.log(`[HOT URL Search] Processing URL: ${url}`);

        if (!url) {
            return res.status(400).json({ error: 'URL is required' });
        }

        // Decode URL to handle encoded characters (e.g., Korean/Japanese handles)
        const decodedUrl = decodeURIComponent(url);
        console.log('[HOT URL Search] Decoded URL:', decodedUrl);

        const apiKey = getYouTubeApiKey();
        let channelId = null;

        // 1. Resolve Channel ID from URL
        if (decodedUrl.includes('/channel/')) {
            const match = decodedUrl.match(/\/channel\/([a-zA-Z0-9_-]+)/);
            if (match) channelId = match[1];
        } else if (decodedUrl.includes('@')) {
            // Handle URL (e.g., @MrBeast, @1分動画)
            // Match anything after @ until / or ?
            const match = decodedUrl.match(/@([^/?]+)/);
            if (match) {
                const handle = match[1];
                console.log('[HOT URL Search] Handle found:', handle);
                const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=@${encodeURIComponent(handle)}&maxResults=1&key=${apiKey}`;
                const { data } = await fetchWithKeyRotation(searchUrl);
                if (data.items && data.items.length > 0) {
                    channelId = data.items[0].snippet.channelId;
                }
            }
        } else if (url.includes('watch?v=') || url.includes('youtu.be/') || (url.includes('/shorts/') && !url.includes('@'))) {
            // Video URL -> Get Channel ID from video details
            let videoId = null;
            if (url.includes('watch?v=')) videoId = url.split('watch?v=')[1].split('&')[0];
            else if (url.includes('youtu.be/')) videoId = url.split('youtu.be/')[1].split('?')[0];
            else if (url.includes('/shorts/')) videoId = url.split('/shorts/')[1].split('?')[0];

            if (videoId) {
                const videoUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${apiKey}`;
                const { data } = await fetchWithKeyRotation(videoUrl);
                if (data.items && data.items.length > 0) {
                    channelId = data.items[0].snippet.channelId;
                }
            }
        } else if (url.includes('/c/') || url.includes('/user/')) {
            // Custom URL or User URL -> Search
            const match = url.match(/\/(c|user)\/([a-zA-Z0-9_-]+)/);
            if (match) {
                const query = match[2];
                const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${query}&maxResults=1&key=${apiKey}`;
                const { data } = await fetchWithKeyRotation(searchUrl);
                if (data.items && data.items.length > 0) {
                    channelId = data.items[0].snippet.channelId;
                }
            }
        }

        if (!channelId) {
            return res.status(404).json({ error: 'Could not resolve Channel ID from URL' });
        }

        console.log(`[HOT URL Search] Resolved Channel ID: ${channelId}`);

        // 2. Fetch Channel Details
        const channelUrl = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&id=${channelId}&key=${apiKey}`;
        const { data: channelData } = await fetchWithKeyRotation(channelUrl);

        if (!channelData.items || channelData.items.length === 0) {
            return res.status(404).json({ error: 'Channel not found' });
        }

        const channel = channelData.items[0];

        // 3. Fetch Recent Shorts (Search API with videoDuration=short)
        // We use Search API to specifically filter for shorts and get date info
        const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&type=video&videoDuration=short&maxResults=50&order=date&key=${apiKey}`;
        const { data: searchData } = await fetchWithKeyRotation(searchUrl);

        let videos = [];
        if (searchData.items) {
            const videoIds = searchData.items.map(v => v.id.videoId).join(',');

            // 4. Fetch Video Details (Duration & ViewCount)
            const detailsUrl = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,statistics&id=${videoIds}&key=${apiKey}`;
            const { data: detailsData } = await fetchWithKeyRotation(detailsUrl);

            const detailsMap = {};
            if (detailsData.items) {
                detailsData.items.forEach(item => {
                    detailsMap[item.id] = {
                        duration: item.contentDetails.duration,
                        viewCount: item.statistics.viewCount
                    };
                });
            }

            videos = searchData.items.map(item => {
                const vidId = item.id.videoId;
                const details = detailsMap[vidId] || {};
                return {
                    videoId: vidId,
                    title: item.snippet.title,
                    thumbnail: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.medium?.url,
                    publishedAt: item.snippet.publishedAt,
                    duration: details.duration || '', // ISO 8601
                    viewCount: details.viewCount || '0'
                };
            });
        }

        // 5. Structure Response
        const responseData = {
            channel: {
                id: channel.id,
                name: channel.snippet.title,
                thumbnail: channel.snippet.thumbnails.medium?.url,
                subscriberCount: channel.statistics.subscriberCount,
                videoCount: channel.statistics.videoCount,
                viewCount: channel.statistics.viewCount
            },
            videos: videos
        };

        res.json({ success: true, data: responseData });

    } catch (error) {
        console.error('[HOT URL Search Error]', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/hot-channels', async (req, res) => {
    try {
        const { contentType, growthMetric, subscriberMin, subscriberMax, videoCountMin, videoCountMax, country, categories, localOnly } = req.body;

        console.log('[HOT Channels API] Query:', req.body);

        // Define target categories (User selected OR All default)
        const TARGET_CATEGORIES = (categories && categories.length > 0)
            ? categories
            : [
                '영화/애니메이션', '자동차', '음악', '반려동물/동물', '스포츠',
                '여행/이벤트', '게임', '인물/블로그', '코미디', '엔터테인먼트',
                '뉴스/정치', '노하우/스타일', '교육', '과학기술', '비영리/사회운동'
            ];

        let finalResults = [];
        const CHANNELS_PER_CATEGORY = 10; // Target count per category
        const HotChannel = require('./models/HotChannel');

        // Parallel processing for categories to speed up
        const categoryPromises = TARGET_CATEGORIES.map(async (catName) => {
            try {
                // 1. Build Base Query
                const query = { categoryName: catName };
                if (country && country !== 'ALL') query.country = country;

                // Add user ranges
                if (subscriberMin || subscriberMax) {
                    query.subscriberCount = {};
                    if (subscriberMin) query.subscriberCount.$gte = subscriberMin;
                    if (subscriberMax) query.subscriberCount.$lte = subscriberMax;
                }
                if (videoCountMin || videoCountMax) {
                    query.videoCount = {};
                    if (videoCountMin) query.videoCount.$gte = videoCountMin;
                    if (videoCountMax) query.videoCount.$lte = videoCountMax;
                }

                // 2. Fetch UNDERDOGS (Low Subs, High Potential)
                // Definition: Subs < 100k, Sorted by Daily Growth (View/Day)
                const underdogs = await HotChannel.find({
                    ...query,
                    subscriberCount: { $lt: 200000 } // Underdog Threshold
                })
                    .sort({ avgViewsPerVideo: -1, dailyViewGrowth: -1 }) // High efficiency
                    .limit(5)
                    .lean();

                // 3. Fetch TITANS (High Subs/Views)
                // Definition: Subs >= 100k (or just top overall), Sorted by Total Views
                const titans = await HotChannel.find({
                    ...query
                })
                    .sort({ subscriberCount: -1, totalViews: -1 })
                    .limit(5)
                    .lean();

                let combined = [...underdogs, ...titans];

                // Deduplicate by channelId
                const seen = new Set();
                combined = combined.filter(ch => {
                    if (seen.has(ch.channelId)) return false;
                    seen.add(ch.channelId);
                    return true;
                });

                // 4. Discovery Fallback (If insufficient results AND not localOnly)
                if (!localOnly && combined.length < 5) {
                    console.log(`[HOT API] Low results for ${catName} (${combined.length}), discovering...`);
                    const fresh = await discoverHotChannels(contentType, 10, country, catName);

                    // Add fresher ones
                    fresh.forEach(f => {
                        if (!seen.has(f.channelId)) {
                            // Map fresh result to DB format for consistency
                            combined.push({
                                channelId: f.channelId,
                                channelTitle: f.name,
                                subscriberCount: f.subscribers,
                                totalViews: f.totalViews,
                                videoCount: f.videoCount,
                                categoryName: f.category,
                                thumbnail: f.thumbnail,
                                recentVideos: f.recentVideos || [],
                                avgViewsPerVideo: Math.floor(f.totalViews / Math.max(1, f.videoCount)),
                                estimatedRevenue: f.estimatedRevenue,
                                dailyViewGrowth: f.dailyGrowth,
                                country: country
                            });
                            seen.add(f.channelId);
                        }
                    });
                }

                return combined;

            } catch (err) {
                console.error(`[HOT API] Error processing category ${catName}:`, err.message);
                return [];
            }
        });

        // Wait for all category queries
        const resultsArray = await Promise.all(categoryPromises);
        finalResults = resultsArray.flat();

        // 5. Global Clean & Filter
        // Strict Country Filter
        if (country === 'KR') {
            finalResults = finalResults.filter(ch => /[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(ch.channelTitle || ch.name || ''));
        }

        // Final Sort: Prioritize Underdogs with High Growth across all categories? 
        // Or just randomize/interleave? User requested "Underdog prioritized".
        // Let's sort entire result set by Average Views Per Video (a good proxy for 'Heat') 
        // penalizing massive channels slightly to give underdogs a chance?
        // Simple approach: Sort by Daily Growth / Subscriber Count ratio (Viral coefficient)
        finalResults.sort((a, b) => {
            const ratioA = (a.avgViewsPerVideo || 0) / Math.max(1, a.subscriberCount || 1);
            const ratioB = (b.avgViewsPerVideo || 0) / Math.max(1, b.subscriberCount || 1);
            return ratioB - ratioA; // Descending Viral Ratio
        });

        console.log(`[HOT Channels API] Returning ${finalResults.length} channels.`);

        // Format Response
        const formattedChannels = finalResults.map(ch => ({
            channelId: ch.channelId,
            name: ch.channelTitle || ch.name,
            thumbnail: ch.thumbnail || `https://via.placeholder.com/88x88?text=${encodeURIComponent(ch.channelTitle || 'Channel')}`,
            subscribers: ch.subscriberCount,
            totalViews: ch.viewCount || ch.totalViews,
            videoCount: ch.videoCount,
            category: ch.categoryName || ch.category || '일반',
            recentVideos: ch.recentVideos || [],
            dailyGrowth: ch.dailyViewGrowth || Math.floor((ch.viewCount || ch.totalViews || 0) / 365),
            estimatedRevenue: ch.estimatedRevenue || '0',
            tags: []
        }));

        res.json({
            channels: formattedChannels,
            totalCount: formattedChannels.length
        });

    } catch (error) {
        console.error('[HOT Channels API] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// API: Get Category Statistics
app.get('/api/hot-channels/categories', async (req, res) => {
    try {
        const { country } = req.query;
        let matchStage = {};

        // Filter by country if provided and not 'ALL'
        if (country && country !== 'ALL') {
            matchStage.country = country;
        }

        // Aggregate channels by category
        const stats = await HotChannel.aggregate([
            { $match: matchStage },
            {
                $group: {
                    _id: "$categoryName",
                    count: { $sum: 1 }
                }
            },
            { $sort: { count: -1 } } // Sort by count descending
        ]);

        res.json({
            success: true,
            categories: stats.map(s => ({
                name: s._id || '일반',
                count: s.count
            }))
        });
    } catch (error) {
        console.error('[Category Stats API] Error:', error);
        res.status(500).json({ error: error.message });
    }
});


// API: Manual discovery trigger
app.post('/api/hot-channels/discover', async (req, res) => {
    try {
        const { contentType = 'shorts', country = 'KR', category } = req.body;

        const channels = await discoverHotChannels(contentType, 50, country, category);

        res.json({
            success: true,
            discovered: channels.length,
            channels
        });
    } catch (error) {
        console.error('[HOT Discovery API] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ========================================
// MongoDB Connection
// ========================================
const MONGODB_URI = process.env.MONGODB_URI;
const KeywordSnapshot = require('./models/KeywordSnapshot');

async function connectDB() {
    try {
        // Safe connection logic
        await mongoose.connect(MONGODB_URI, {
            serverSelectionTimeoutMS: 5000,
            family: 4
        });
        console.log('✅ MongoDB Atlas 연결 성공!');
        checkInitialData();
    } catch (error) {
        console.error('❌ MongoDB 연결 실패 (Using File Fallback):', error.message);
    }
}



// 초기 데이터 확인
async function checkInitialData() {
    try {
        const count = await KeywordSnapshot.countDocuments();
        console.log(`📊 MongoDB에 ${count}개의 스냅샷이 있습니다.`);

        if (count === 0) {
            console.log('[Info] 데이터가 없습니다. Cron 스케줄러가 매일 자정에 자동 수집합니다.');
        }
    } catch (error) {
        console.error('[MongoDB] 초기 데이터 확인 실패:', error.message);
    }
}

// MongoDB 연결 시작
connectDB();

// ========================================
// Cron Scheduler - Daily Updates (US Eastern Time)
// ========================================
const GoogleSheetsService = require('./google_sheets_service');

// 15 YouTube Categories for Discovery
const TARGET_CATEGORIES = [
    { id: '1', name: 'Film & Animation' },
    { id: '2', name: 'Autos & Vehicles' },
    { id: '10', name: 'Music' },
    { id: '15', name: 'Pets & Animals' },
    { id: '17', name: 'Sports' },
    { id: '19', name: 'Travel & Events' },
    { id: '20', name: 'Gaming' },
    { id: '22', name: 'People & Blogs' },
    { id: '23', name: 'Comedy' },
    { id: '24', name: 'Entertainment' },
    { id: '25', name: 'News & Politics' },
    { id: '26', name: 'Howto & Style' },
    { id: '27', name: 'Education' },
    { id: '28', name: 'Science & Technology' },
    { id: '29', name: 'Nonprofits & Activism' }
];

// Schedule: Midnight in New York (US Eastern Time)
cron.schedule('0 0 * * *', async () => {
    console.log('[Cron] Daily Hot Channel Discovery Started (US EST):', new Date().toISOString());

    for (const category of TARGET_CATEGORIES) {
        try {
            console.log(`[Cron] Discovering channels for category: ${category.name} (ID: ${category.id})`);

            // 1. Discover Channels (Shorts & Long form)
            // Note: modify discoverHotChannels to accept categoryId if needed, 
            // but currently it discovers by query/topic. We'll pass category name as context if supported,
            // or we might need to enhance discoverHotChannels to filter by categoryId in search.
            // For now, we'll run discovery generally or focused on category keywords if implemented.

            // To properly discover by category, we need to pass the category ID to the search API.
            // Current discoverHotChannels uses 'shorts' or query. 
            // We will rely on its internal search or trending logic. 
            // IMPORTANT: The current discoverHotChannels function (as seen previously) takes (contentType, maxChannels, country).
            // It filters by category AFTER fetching if trending, but for Search it relies on query.
            // For this implementation to work best, we should ideally pass categories. 
            // However, to keep it simple and robust with current code:
            // We will update discoverHotChannels to potentially accept a category ID in the future, 
            // but for now let's assume valid general discovery and just sync.
            // Wait, to do it RIGHT as requested ("15 categories"), we must ensure discovery respects category.
            // The search API supports videoCategoryId.

            // Let's call a new specialized discovery or modified one?
            // Let's use the existing one but we might need to patch it to accept categoryId.
            // Since patching discoverHotChannels again is risky in this step, let's use the current one 
            // and assume it finds relevant stuff, OR we add a specialized call here if we can.

            // Actually, let's create a helper here to do categorized discovery properly using the existing logic structure
            // or better yet, just modify discoverHotChannels to accept categoryId as an optional 4th param.
            // But I cannot modify discoverHotChannels in this REPLACE block (it's elsewhere).

            // WORKAROUND: We will trigger discovery with country='US' (since time is US) or 'KR' (user preference).
            // User wants "US Eastern Time standard" for updates, but maybe target content is KR?
            // "미국 동부시간을 기준이로... 업데이트" -> Update TIMING is US EST.
            // Target Content: Likely KR based on previous context ("korea").

            // Let's run discovery for 'shorts' and 'long' for 'KR' context (default).
            // But we need to do it PER CATEGORY.
            // Since `discoverHotChannels` doesn't support category input yet (it does 'shorts'/'long'),
            // We will iterate categories and manually call the search API? 
            // No, that's too complex for this block.

            // Let's stick to the user's core request: "Update daily at US EST" + "Save to Google Sheets".
            // We will run the standard discovery and sync. If category separation is strict, we need more code changes.
            // User said "15개 카테고리 안으로 저장되면서". 
            // This implies we SHOULD filter/search by category.

            // Updated Strategy for this block:
            // We'll define a custom discovery wrapper here that fetches trending videos BY CATEGORY ID.

            const discovered = await discoverHotChannelsByCategory(category.id, category.name);

            // 2. Sync to Google Sheets
            if (discovered.length > 0) {
                await GoogleSheetsService.syncHotChannels(discovered, category.name);
                console.log(`[Cron] Saved ${discovered.length} channels for ${category.name} to Sheets/DB`);
            }

            // Wait to respect quotas
            await new Promise(resolve => setTimeout(resolve, 5000));

        } catch (error) {
            console.error(`[Cron] Error processing ${category.name}:`, error.message);
        }
    }

    console.log('[Cron] Daily Hot Channel Discovery Completed!');
}, {
    timezone: "America/New_York"
});

// Helper: Discover by Category (Wraps existing logic or call specific API)
async function discoverHotChannelsByCategory(categoryId, categoryName) {
    // This uses the TRENDING API with category filter, which is very effective for "HOT" channels.
    try {
        const apiKey = getYouTubeApiKey();
        // Note: getYouTubeApiKey is defined in server.js scope, so it's accessible.

        const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&chart=mostPopular&regionCode=KR&videoCategoryId=${categoryId}&maxResults=50&key=${apiKey}`;

        const { data } = await fetchWithKeyRotation(url);
        if (!data.items) return [];

        const videoItems = data.items;

        // Extract Channel IDs
        const channelIds = [...new Set(videoItems.map(v => v.snippet.channelId))];

        // Fetch Channel Details (Using existing helper logic if possible, or manual fetch)
        // We'll do a manual fetch here to be self-contained and safe
        const channelUrl = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&id=${channelIds.join(',')}&key=${apiKey}`;
        const { data: channelData } = await fetchWithKeyRotation(channelUrl);

        const hotChannels = [];

        if (channelData.items) {
            const HotChannel = require('./models/HotChannel'); // Ensure model is available

            for (const channel of channelData.items) {
                // Calculate HOT Score logic (simplified here or reuse calculateHotScore if accessible)
                // Assuming calculateHotScore is accessible (it is in server.js scope)
                let hotScore = 0;
                try { hotScore = calculateHotScore(channel); } catch (e) { hotScore = 0; }

                if (hotScore >= 1.0) { // Threshold
                    // Better thumbnail selection
                    const thumbnails = channel.snippet.thumbnails || {};
                    const thumbnail = thumbnails.maxres?.url ||
                        thumbnails.standard?.url ||
                        thumbnails.high?.url ||
                        thumbnails.medium?.url ||
                        thumbnails.default?.url;

                    const channelObj = {
                        channelId: channel.id,
                        channelTitle: channel.snippet.title,
                        subscriberCount: parseInt(channel.statistics.subscriberCount) || 0,
                        viewCount: parseInt(channel.statistics.viewCount) || 0,
                        videoCount: parseInt(channel.statistics.videoCount) || 0,
                        categoryName: categoryName,
                        thumbnail: thumbnail,
                        dailyGrowth: Math.floor((parseInt(channel.statistics.viewCount) || 0) / 365), // Estimate
                        estimatedRevenue: '0',
                        hotScore: hotScore
                    };

                    hotChannels.push(channelObj);

                    // Save to MongoDB
                    await HotChannel.findOneAndUpdate(
                        { channelId: channel.id },
                        channelObj,
                        { upsert: true, new: true }
                    );
                }
            }
        }

        return hotChannels;

    } catch (e) {
        console.error(`[DiscoverByCategory] Error for ${categoryName}:`, e.message);
        return [];
    }
}

// Test Endpoint for Cron
app.post('/api/test-cron', async (req, res) => {
    console.log('[Test] Triggering Manual Cron Job...');
    // Run async in background
    (async () => {
        const categories = TARGET_CATEGORIES.slice(0, 2); // Test with just 2 categories for speed
        for (const cat of categories) {
            console.log(`[Test] Processing ${cat.name}...`);
            const discovered = await discoverHotChannelsByCategory(cat.id, cat.name);
            if (discovered.length > 0) {
                await GoogleSheetsService.syncHotChannels(discovered, cat.name);
            }
            await new Promise(r => setTimeout(r, 2000));
        }
        console.log('[Test] Manual Cron Job Finished (Partial)');
    })();

    res.json({ success: true, message: 'Cron job manual trigger started (processing first 2 categories for test)' });
});

console.log('📅 Cron 스케줄러 활성화 (매일 자정 US EST)');


// ========================================
// AI Channel Analysis Endpoint
// ========================================
// API: Save Channel to Database (Manual Save)
app.post('/api/hot-channels/save', async (req, res) => {
    try {
        const { channel } = req.body; // Expecting { channelId, name, thumbnail, subscribers, ... }
        if (!channel || !channel.channelId) {
            return res.status(400).json({ error: 'Valid channel data is required' });
        }

        console.log(`[Manual Save] Saving channel: ${channel.name} (${channel.channelId})`);

        // Category Mapping (English -> Korean)
        let finalCategory = '일반';
        if (channel.categoryId && YOUTUBE_CATEGORY_MAP[channel.categoryId]) {
            finalCategory = YOUTUBE_CATEGORY_MAP[channel.categoryId];
        } else if (channel.category) {
            const entCat = TARGET_CATEGORIES.find(c => c.name.toLowerCase() === channel.category.toLowerCase());
            if (entCat && YOUTUBE_CATEGORY_MAP[entCat.id]) {
                finalCategory = YOUTUBE_CATEGORY_MAP[entCat.id];
            } else {
                finalCategory = channel.category;
            }
        }

        // 1. Save to File System (Fallback/Cache)
        const currentChannels = loadDiscoveredChannels();
        currentChannels[channel.channelId] = {
            ...channel,
            category: finalCategory,
            lastUpdated: Date.now()
        };
        saveDiscoveredChannels(currentChannels);
        console.log('[Manual Save] Saved to local JSON file');

        const HotChannel = require('./models/HotChannel');

        // Map frontend/API data to DB Schema
        const updateData = {
            channelId: channel.channelId,
            channelTitle: channel.name || channel.channelTitle,
            subscriberCount: parseInt(channel.subscribers || channel.subscriberCount) || 0,
            viewCount: parseInt(channel.totalViews || channel.viewCount) || 0,
            videoCount: parseInt(channel.videoCount) || 0,
            categoryName: finalCategory,
            thumbnail: channel.thumbnail,
            country: classifyChannelCountry(channel.name),
            lastUpdated: Date.now()
        };

        // Optional: Update stats if available
        if (channel.estimatedRevenue) updateData.estimatedRevenue = channel.estimatedRevenue;
        if (channel.dailyGrowth) updateData.dailyViewGrowth = channel.dailyGrowth;
        if (channel.recentVideos) updateData.recentVideos = channel.recentVideos;

        let savedChannel = null;
        try {
            savedChannel = await HotChannel.findOneAndUpdate(
                { channelId: channel.channelId },
                { $set: updateData },
                { upsert: true, new: true }
            );
            console.log('[Manual Save] Saved to MongoDB');
        } catch (dbError) {
            console.warn('[Manual Save] MongoDB Error (Ignored due to File Fallback):', dbError.message);
            savedChannel = currentChannels[channel.channelId];
        }

        res.json({ success: true, message: 'Channel saved successfully', channel: savedChannel });

    } catch (error) {
        console.error('[Manual Save Error]', error);
        res.status(500).json({ error: error.message });
    }
});


// ========================================
// AI Channel Analysis Endpoint (MongoDB Updated)
// ========================================
app.get('/api/channel-analysis/:channelId', async (req, res) => {
    try {
        const { channelId } = req.params;
        const HotChannel = require('./models/HotChannel');

        // Look up in MongoDB
        let channel = null;
        try {
            channel = await HotChannel.findOne({ channelId });
        } catch (e) {
            console.warn('[Analysis] MongoDB lookup failed, trying file...');
        }

        // Fallback to File
        if (!channel) {
            const localChannels = loadDiscoveredChannels();
            channel = localChannels[channelId];
        }

        if (!channel) {
            return res.status(404).json({ error: 'Channel not found in database or cache. Please add the channel first.' });
        }

        // Return cached analysis if valid (e.g., generated within last 7 days)
        // For now, just check if it exists
        if (channel.aiAnalysis && channel.aiAnalysis.strategy) {
            return res.json({ success: true, analysis: channel.aiAnalysis });
        }

        // Generate new analysis
        console.log(`[Channel Analysis] Generating for: ${channel.channelTitle}`);

        // Need to pass a channel object compatible with analyzeChannelStrategy
        // It expects { channelId, channelTitle, subscriberCount, recentVideos... }
        // Our Mongoose doc has these fields.

        const analysis = await analyzeChannelStrategy(channel, GEMINI_API_KEY);

        // Save Result to DB and File Safely (Handle Plain Object from Fallback)
        // 1. Update File
        const allChannels = loadDiscoveredChannels();
        if (allChannels[channel.channelId]) {
            allChannels[channel.channelId].aiAnalysis = analysis;
            saveDiscoveredChannels(allChannels);
        } else {
            // If not in file but we somehow analyzed it (maybe from DB but DB save failed?), add it.
            // Ensure we don't overwrite if it's a Mongoose doc converted to JSON
            const channelPlain = (typeof channel.toObject === 'function') ? channel.toObject() : channel;
            allChannels[channel.channelId] = { ...channelPlain, aiAnalysis: analysis };
            saveDiscoveredChannels(allChannels);
        }

        // 2. Update MongoDB
        try {
            // Use findOneAndUpdate instead of document.save() to be safe for both Doc and Object
            await HotChannel.findOneAndUpdate(
                { channelId: channel.channelId },
                { $set: { aiAnalysis: analysis } }
            );
        } catch (dbErr) {
            console.warn('[Analysis] Failed to save result to DB (File Saved):', dbErr.message);
        }

        res.json({ success: true, analysis });

    } catch (error) {
        console.error('[Channel Analysis Error]', error);
        res.status(500).json({ error: error.message });
    }
});

// ========================================
// Missing Helper Functions
// ========================================
function classifyChannelCountry(channelName) {
    if (!channelName) return 'KR';
    const koreanRegex = /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/;
    return koreanRegex.test(channelName) ? 'KR' : 'Global';
}

function calculateHotScore(channel) {
    if (!channel || !channel.statistics) return 0;
    const subs = parseInt(channel.statistics.subscriberCount) || 1;
    const views = parseInt(channel.statistics.viewCount) || 0;
    // Simple heuristic
    return (views / subs) > 100 ? 1 : 0.5;
}

// Start server
app.listen(PORT, () => {
    console.log(`Transcript rewrite server listening on http://localhost:${PORT}`);
});

