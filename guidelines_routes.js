// ========================================
// YouTube Guidelines Monitoring System APIs
// ========================================

const Guideline = require('./models/Guideline');
const ViolationCheck = require('./models/ViolationCheck');
const multer = require('multer');
const fs = require('fs');
const { geminiGenerateJSON } = require('./server/utils/gemini.util');

// Configure video upload
const videoUpload = multer({
    dest: 'uploads/temp/',
    limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
    fileFilter: (req, file, cb) => {
        const allowed = ['video/mp4', 'video/mov', 'video/avi', 'video/quicktime'];
        if (allowed.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only MP4, MOV, AVI allowed.'));
        }
    }
});

module.exports = function (app, GEMINI_API_KEY, PERPLEXITY_API_KEY) {

    // API: Get all guidelines
    app.get('/api/guidelines', async (req, res) => {
        try {
            const { category } = req.query;

            const query = category ? { category, isActive: true } : { isActive: true };
            const guidelines = await Guideline.find(query).sort({ category: 1, title: 1 });

            res.json({
                guidelines,
                totalCount: guidelines.length
            });
        } catch (error) {
            console.error('[Guidelines API] Error:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // API: Check uploaded video file with Gemini Vision
    app.post('/api/guidelines/check-video', videoUpload.single('video'), async (req, res) => {
        let videoPath = null;

        try {
            const { title, description } = req.body;

            if (!req.file) {
                return res.status(400).json({ error: 'No video file uploaded' });
            }

            videoPath = req.file.path;
            console.log('[Guidelines] Analyzing uploaded video:', title);
            console.log('[Guidelines] File:', videoPath, req.file.mimetype);

            // Read video file
            console.log('[Guidelines] Reading video file...');
            const videoData = fs.readFileSync(videoPath);
            const videoBase64 = videoData.toString('base64');

            // Analyze with Gemini Vision
            console.log('[Guidelines] Starting Gemini Vision analysis...');
            const analysis = await analyzeVideoWithGemini({
                inlineData: {
                    data: videoBase64,
                    mimeType: req.file.mimetype
                }
            }, {
                title: title || 'Untitled',
                description: description || ''
            }, GEMINI_API_KEY);

            console.log('[Guidelines] Analysis complete');

            // Save to database (Optional - don't fail properly if DB is down)
            let checkId = null;
            try {
                const check = await ViolationCheck.create({
                    videoFile: req.file.filename,
                    title: title || 'Uploaded Video',
                    description,
                    analysis
                });
                checkId = check._id;
            } catch (dbError) {
                console.warn('[Guidelines] Warning: Failed to save to DB (Not Primary/Error), but returning analysis.', dbError.message);
            }

            // Clean up local file
            if (fs.existsSync(videoPath)) {
                fs.unlinkSync(videoPath);
                console.log('[Guidelines] Temp file cleaned up');
            }

            res.json({
                checkId: checkId, // Might be null
                title,
                analysis
            });

        } catch (error) {
            console.error('[Guidelines Check Video] Error:', error);

            // Clean up on error
            if (videoPath && fs.existsSync(videoPath)) {
                fs.unlinkSync(videoPath);
            }

            res.status(500).json({ error: error.message });
        }
    });

    // API: Generate Shorts titles (Korean, Japanese, Japanese pronunciation)
    app.post('/api/guidelines/generate-titles', videoUpload.single('video'), async (req, res) => {
        let videoPath = null;

        try {
            const { title, description } = req.body;

            if (!req.file) {
                return res.status(400).json({ error: 'No video file uploaded' });
            }

            videoPath = req.file.path;
            console.log('[Title Generation] Analyzing video:', title);

            // Read video file
            console.log('[Title Generation] Reading video file...');
            const videoData = fs.readFileSync(videoPath);
            const videoBase64 = videoData.toString('base64');

            console.log('[Title Generation] Generating titles...');
            const titles = await generateShortsTitle({
                inlineData: {
                    data: videoBase64,
                    mimeType: req.file.mimetype
                }
            }, {
                title: title || '',
                description: description || ''
            }, GEMINI_API_KEY);

            // Clean up local file
            if (fs.existsSync(videoPath)) {
                fs.unlinkSync(videoPath);
            }

            res.json({
                success: true,
                titles
            });

        } catch (error) {
            console.error('[Title Generation] Error:', error);

            // Clean up on error
            if (videoPath && fs.existsSync(videoPath)) {
                fs.unlinkSync(videoPath);
            }

            res.status(500).json({ error: error.message });
        }
    });

    // API: Get guideline updates (Perplexity)
    app.get('/api/guidelines/updates', async (req, res) => {
        try {
            const query = `YouTube에서 최근 30일 내 업데이트된 커뮤니티 가이드라인, 수익 창출 정책, Shorts 정책 변경사항을 알려주세요. 날짜와 출처를 포함해주세요.`;

            const response = await fetch('https://api.perplexity.ai/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: 'llama-3.1-sonar-large-128k-online',
                    messages: [{ role: 'user', content: query }]
                })
            });

            const data = await response.json();
            const updates = data.choices[0].message.content;

            res.json({
                updates,
                queriedAt: new Date()
            });

        } catch (error) {
            console.error('[Guidelines Updates] Error:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // API: Extract Transcript with Translation (Step 1 of progressive workflow)
    app.post('/api/guidelines/extract-transcript', videoUpload.single('video'), async (req, res) => {
        let videoPath = null;

        try {
            if (!req.file) {
                return res.status(400).json({ error: 'No video file uploaded' });
            }

            videoPath = req.file.path;
            console.log('[Transcript Extract] 📝 Starting bilingual transcript extraction...');

            // Read video file
            const videoData = fs.readFileSync(videoPath);

            // ═══════════════════════════════════════════════════════════
            // STEP 1: Extract original transcript with Whisper ASR
            // ═══════════════════════════════════════════════════════════
            console.log('[Transcript Extract] 🎙️ Extracting with Whisper ASR...');

            const { extractTranscriptWithTimestamps } = require('./server/utils/phi3_asr.util');

            const originalTranscript = await extractTranscriptWithTimestamps(videoData, {
                language: 'auto',
                model: 'whisper'
            });

            console.log(`[Transcript Extract] ✅ Extracted ${originalTranscript.segments.length} segments in ${originalTranscript.language}`);

            // ═══════════════════════════════════════════════════════════
            // STEP 2: Translate to Korean if not Korean
            // ═══════════════════════════════════════════════════════════
            let translatedSegments = null;

            if (originalTranscript.language !== 'ko' && originalTranscript.language !== 'korean') {
                console.log('[Transcript Extract] 🌐 Translating to Korean with Gemini...');

                try {
                    translatedSegments = await translateSegmentsToKorean(
                        originalTranscript.segments,
                        originalTranscript.language,
                        GEMINI_API_KEY
                    );
                    console.log('[Transcript Extract] ✅ Translation complete');
                } catch (transError) {
                    console.warn('[Transcript Extract] ⚠️ Translation failed, continuing without:', transError.message);
                }
            } else {
                console.log('[Transcript Extract] ℹ️ Already in Korean, skipping translation');
            }

            // Clean up local file
            if (fs.existsSync(videoPath)) {
                fs.unlinkSync(videoPath);
            }

            // Build bilingual segments
            const bilingualSegments = originalTranscript.segments.map((seg, i) => ({
                start: seg.start,
                end: seg.end,
                text: seg.text,
                textKo: (translatedSegments && translatedSegments[i]) ? translatedSegments[i] : seg.text,
                emotion: seg.emotion,
                confidence: seg.confidence || 0.9
            }));

            res.json({
                success: true,
                transcript: {
                    language: originalTranscript.language,
                    languageName: getLanguageName(originalTranscript.language),
                    duration: originalTranscript.duration,
                    fullText: originalTranscript.fullText,
                    segments: bilingualSegments,
                    hasTranslation: translatedSegments !== null
                }
            });

        } catch (error) {
            console.error('[Transcript Extract] Error:', error);

            // Clean up on error
            if (videoPath && fs.existsSync(videoPath)) {
                fs.unlinkSync(videoPath);
            }

            res.status(500).json({ error: error.message });
        }
    });

    // API: Extract Viral Highlights (Step 2)
    app.post('/api/guidelines/extract-highlights', async (req, res) => {
        try {
            const { transcript, narrationStyle } = req.body;

            if (!transcript || !transcript.segments) {
                return res.status(400).json({ error: 'Valid transcript data is required' });
            }

            console.log('[Highlights] 🔍 Analyzing transcript for viral moments...');

            // Prepare prompt for Gemini
            const segmentsText = transcript.segments.map((s, i) =>
                `[${formatTimestamp(s.start)}-${formatTimestamp(s.end)}] ${s.textKo || s.text} (${s.emotion || 'neutral'})`
            ).join('\n');

            const prompt = `
당신은 100만 구독자를 보유한 유튜브 쇼츠 전문 PD입니다.
아래 영상 대본을 분석하여, **조회수가 폭발할만한 바이럴 하이라이트 구간 3개**를 추천해주세요.

**분석 기준:**
1. **Hook (초반 3초):** 시청자의 주의를 즉시 끌 수 있는 강렬한 시작인가?
2. **Emotional Peak:** 놀라움, 긴장감, 귀여움 등 감정이 고조되는 순간인가?
3. **Completeness:** 15초~50초 사이로 기승전결이 있는가?

**영상 대본:**
${segmentsText}

**응답 형식 (JSON):**
{
  "highlights": [
    {
      "start": 12.5,
      "end": 45.0,
      "title": "강렬한 제목",
      "reason": "선정 이유 (이 구간이 왜 바이럴 될 것인지)",
      "viralScore": 95,
      "emotion": "shcok/cute/tension"
    }
  ]
}
`;

            const response = await geminiGenerateJSON(GEMINI_API_KEY, 'gemini-2.5-flash', [
                { text: prompt }
            ]);

            console.log(`[Highlights] ✅ Found ${response.highlights.length} highlights`);
            res.json({ success: true, highlights: response.highlights });

        } catch (error) {
            console.error('[Highlights] Error:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // API: Generate Japanese Animal Channel Script (For viral content adaptation)
    // ENHANCED: 2-step process with ASR transcript extraction
    app.post('/api/guidelines/generate-animal-script', videoUpload.single('video'), async (req, res) => {
        let videoPath = null;

        try {
            const { sourceTitle, targetChannel, narrationStyle } = req.body;

            if (!req.file) {
                return res.status(400).json({ error: 'No video file uploaded' });
            }

            videoPath = req.file.path;
            console.log('[Animal Script] 🎬 Starting 2-step process for:', targetChannel);

            // Read video file
            const videoData = fs.readFileSync(videoPath);
            const videoBase64 = videoData.toString('base64');

            // ═══════════════════════════════════════════════════════════
            // STEP 1: Extract original transcript with timestamps (ASR)
            // ═══════════════════════════════════════════════════════════
            console.log('[Animal Script] 🎙️ Step 1/2: Extracting original transcript with ASR...');

            const { extractTranscriptWithTimestamps } = require('./server/utils/phi3_asr.util');

            let originalTranscript = null;
            try {
                originalTranscript = await extractTranscriptWithTimestamps(videoData, {
                    language: 'auto',
                    model: 'whisper'
                });
                console.log('[Animal Script] ✅ Transcript extracted:', {
                    duration: originalTranscript.duration,
                    segments: originalTranscript.segments?.length,
                    hasTimestamps: originalTranscript.hasTimestamps
                });
            } catch (asrError) {
                console.warn('[Animal Script] ⚠️ ASR failed, continuing without transcript:', asrError.message);
            }

            // ═══════════════════════════════════════════════════════════
            // STEP 2: Generate Japanese script with transcript context
            // ═══════════════════════════════════════════════════════════
            console.log('[Animal Script] 🤖 Step 2/2: Generating Japanese script with Gemini...');

            const script = await generateAnimalChannelScript({
                inlineData: {
                    data: videoBase64,
                    mimeType: req.file.mimetype
                }
            }, {
                sourceTitle: sourceTitle || '',
                targetChannel: targetChannel || 'japanese-animal-channel',
                narrationStyle: narrationStyle || 'educational-exciting',
                originalTranscript: originalTranscript // 🔥 KEY: Pass transcript context
            }, GEMINI_API_KEY);

            // Clean up local file
            if (fs.existsSync(videoPath)) {
                fs.unlinkSync(videoPath);
            }

            res.json({
                success: true,
                script,
                originalTranscript: originalTranscript // Include for debugging/reference
            });

        } catch (error) {
            console.error('[Animal Script] Error:', error);

            // Clean up on error
            if (videoPath && fs.existsSync(videoPath)) {
                fs.unlinkSync(videoPath);
            }

            res.status(500).json({ error: error.message });
        }
    });

};

// Analyze video with Gemini Vision API
async function analyzeVideoWithGemini(file, metadata, GEMINI_API_KEY) {
    const prompt = `당신은 YouTube 가이드라인 전문가입니다.
이 비디오가 YouTube 정책을 위반하는지 분석해주세요.

제목: ${metadata.title}
설명: ${metadata.description}

비디오를 보면서 다음을 분석해주세요:
1. 영상 내용 (폭력성, 선정성, 위험한 행위, 혐오 표현)
2. 음성 내용 (욕설, 혐오 발언, 거짓 정보, 스팸)
3. 시각적 요소 (부적절한 이미지, 타인 저작물 도용)
4. Shorts 정책 준수 (60초 이하, 세로 영상 등)
5. 배경음악(BGM) 분석
   - 저작권이 있을 가능성 (유명 음원, 상업적 음악 감지 여부)
   - 음악의 분위기가 영상 내용과 조화를 이루는지
   - 음량과 품질이 적절한지

타임스탬프와 함께 구체적인 문제점을 지적해주세요.

JSON 형식으로만 응답:
{
  "overallStatus": "safe" | "warning" | "danger",
  "score": 85,
  "violations": [
    {
      "timestamp": "00:15",
      "category": "community_guidelines",
      "severity": "medium",
      "issue": "부적절한 언어 사용",
      "recommendation": "해당 표현을 순화"
    }
  ],
  "summary": "전반적인 평가",
  "bgmAnalysis": {
    "hasCopyrightRisk": true,
    "copyrightRiskLevel": "low",
    "atmosphereMatch": "잘 어울림",
    "volumeQuality": "적절함",
    "recommendation": "BGM 관련 권장사항"
  }
}`;

    try {
        const analysis = await geminiGenerateJSON(GEMINI_API_KEY, 'gemini-2.5-flash', [
            file,
            { text: prompt }
        ]);

        console.log('[Gemini Vision] Analysis complete');
        return analysis;

    } catch (error) {
        console.error('[Analyze Video] Error:', error);
        throw error;
    }
}

// Generate Shorts titles with Gemini Vision API
async function generateShortsTitle(file, metadata, GEMINI_API_KEY) {
    const prompt = `당신은 YouTube Shorts 전문 콘텐츠 크리에이터입니다.
이 영상을 분석하여 Shorts에 최적화된 임팩트 있는 제목을 만들어주세요.

${metadata.title ? `참고 제목: ${metadata.title}` : ''}
${metadata.description ? `참고 설명: ${metadata.description}` : ''}

영상의 핵심 내용, 감정, 분위기를 파악하여 다음 조건에 맞는 제목을 생성해주세요:

**제목 생성 규칙:**
- 짧고 임팩트 있게 (10-20자 권장)
- 호기심을 유발하는 표현 사용
- 감정을 자극하는 단어 포함
- Shorts 특성에 맞는 직관적 표현

**출력 형식 (JSON):**
{
  "korean": [
    "한국어 제목 1",
    "한국어 제목 2",
    "한국어 제목 3"
  ],
  "japanese": [
    "日本語タイトル1",
    "日本語タイトル2",
    "日本語タイトル3"
  ],
  "japanesePronunciation": [
    "니혼고 타이토루 1 (한글 발음)",
    "니혼고 타이토루 2 (한글 발음)",
    "니혼고 타이토루 3 (한글 발음)"
  ],
  "videoInterpretation": "영상을 어떻게 해석했는지 간단히 설명 (핵심 내용, 분위기, 메시지 등)"
}`;

    try {
        const titles = await geminiGenerateJSON(GEMINI_API_KEY, 'gemini-2.5-flash', [
            file,
            { text: prompt }
        ]);

        console.log('[Title Generation] Titles generated');
        return titles;

    } catch (error) {
        console.error('[Generate Titles] Error:', error);
        throw error;
    }
}

// Generate Japanese Animal Channel Script with Gemini Vision API
// ENHANCED: Now uses original transcript for context and timing
async function generateAnimalChannelScript(file, metadata, GEMINI_API_KEY) {
    // Build transcript context string
    let transcriptContext = '';
    if (metadata.originalTranscript && metadata.originalTranscript.segments) {
        transcriptContext = `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📝 **原音声の文字起こし (タイムスタンプ付き):**

このデータは元の動画の音声から抽出されました。
重要: ナレーターが話している時間帯 = 注目すべき瞬間！
      感嘆詞や強調表現 = 緊張感やクライマックス！

言語: ${metadata.originalTranscript.language}
総時間: ${metadata.originalTranscript.duration}秒
${metadata.originalTranscript.isSimulated ? '⚠️ シミュレーション データ' : '✅ 実際の抽出データ'}

【タイムスタンプ付き原文】
${metadata.originalTranscript.segments.map((seg, i) =>
            `[${formatTimestamp(seg.start)} → ${formatTimestamp(seg.end)}] ${seg.text}${seg.emotion ? ` (感情: ${seg.emotion})` : ''}`
        ).join('\n')}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**この情報の活用方法:**
1. 原文で話されているタイミングを参考に、日本語ナレーションのタイミングを調整
2. 感嘆詞 ("Look!", "Oh!", "Wow!") がある時間 = 驚きの瞬間
3. 質問形式 ("Who will win?") = 緊張感を煽る場面
4. 長い間隔 = 視覚的に重要な瞬間（ナレーション不要の可能性）
5. 感情マーカーを活用して適切な tonality を設定
`;
    } else {
        transcriptContext = '\n※ 原音声の文字起こしは利用できません。映像のみから分析します。\n';
    }

    const prompt = `あなたは日本の人気動物チャンネルのナレーションライターです。
この動画を分析して、日本のYouTube Shortsに最適化された魅力的なナレーションスクリプトを作成してください。

元のタイトル: ${metadata.sourceTitle}
ターゲットチャンネル: ${metadata.targetChannel}
ナレーションスタイル: ${metadata.narrationStyle}
${transcriptContext}

**スクリプト作成ルール:**
1. **トーン**: 好奇心をそそり、教育的でありながらエキサイティング
2. **長さ**: 30-60秒のShorts向け (150-250文字)
3. **構成**:
   - 冒頭: 注目を引くフック (驚き、疑問、衝撃)
   - 中盤: 状況説明と動物行動の解説
   - 終盤: 感情を揺さぶる結末または教訓
4. **スタイル**:
   - シンプルで聞き取りやすい日本語
   - 擬音語・擬態語を効果的に使用 (ドキドキ、ザワザワ等)
   - 視聴者に語りかける親しみやすい口調
   - 緊張感や驚きを表現する間の取り方を指示
5. **タイミング最適化** (🔥 重要):
   - 上記の原文タイムスタンプを参考に、日本語ナレーションのタイミングを調整
   - 原文で話されている瞬間 = 重要な場面を示唆
   - 感情表現 (excitement, tension, surprise) がある箇所は特に強調
   - 沈黙の間を効果的に活用

**出力形式 (JSON):**
{
  "title": {
    "japanese": "日本語タイトル (衝撃的で短い)",
    "english": "English Translation"
  },
  "description": {
    "japanese": "動画説明文 (100-150文字、SEO最適化)",
    "english": "English Translation"
  },
  "narrationScript": {
    "scenes": [
      {
        "timestamp": "00:00-00:05",
        "visual": "映像の説明",
        "narration": "ナレーション音声テキスト",
        "narrationKoreanPronunciation": "한글 발음 (일본어 음성 확인용)",
        "emotion": "驚き/緊張/安心 等",
        "pause": "間の長さ (秒)",
        "originalContext": "この時間帯の原音声で何が言われていたか（参考情報）"
      }
    ],
    "totalDuration": "00:45",
    "wordCount": 180
  },
  "hashtags": {
    "japanese": ["#動物", "#野生動物", "#衝撃映像"],
    "english": ["#animals", "#wildlife", "#shocking"]
  },
  "targetAudience": "動物好きな日本の視聴者層 (10-40代)",
  "viralPotential": {
    "score": 8.5,
    "reason": "バイラル可能性の理由",
    "improvementTips": ["改善提案1", "改善提案2"]
  },
  "voicevoxSettings": {
    "speaker": 2,
    "speakerName": "四国めたん (ノーマル)",
    "speedScale": 1.0,
    "pitchScale": 0.0,
    "intonationScale": 1.0,
    "volumeScale": 1.0,
    "reason": "このキャラクターを選んだ理由"
  }
}

**重要**: 
- 実際の動画内容を正確に分析してください
- 動物の種類、行動、感情を具体的に描写
- 自然環境や状況を詳しく説明
- 日本の視聴者が共感できる表現を使用
- 教育的価値とエンターテインメント性のバランス
- 🔥 原音声のタイムスタンプを活用して、感情のピークを逃さない！`;

    try {
        const script = await geminiGenerateJSON(GEMINI_API_KEY, 'gemini-2.5-flash', [
            file,
            { text: prompt }
        ]);

        console.log('[Animal Script] Script generated successfully');
        return script;

    } catch (error) {
        console.error('[Generate Animal Script] Error:', error);
        throw error;
    }
}

// Helper: Format seconds to MM:SS
function formatTimestamp(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

// Helper: Translate transcript segments to Korean using Gemini
async function translateSegmentsToKorean(segments, sourceLanguage, GEMINI_API_KEY) {
    const textsToTranslate = segments.map(s => s.text).join('\n');

    const prompt = `다음은 ${sourceLanguage} 언어로 된 영상 대본입니다. 각 줄을 자연스러운 한국어로 번역해주세요.
타임스탬프와 감정을 고려해서 맥락에 맞게 번역하되, 영상 대본 특성에 맞게 구어체로 번역해주세요.

원문:
${textsToTranslate}

JSON 형식으로 응답해주세요:
{
  "translations": [
    "번역문1",
    "번역문2",
    ...
  ]
}

중요: 
1. 원문의 줄 수(${segments.length}줄)와 **정확히 동일한 개수**의 번역문을 배열에 담아주세요. 하나라도 빠지면 안 됩니다.
2. 번역이 불필요하거나 어려운 경우에도 원문 그대로라도 넣어주세요. 절대 개수를 줄이지 마세요.`;

    try {
        const response = await geminiGenerateJSON(GEMINI_API_KEY, 'gemini-2.5-flash', [
            { text: prompt }
        ]);

        if (response.translations && Array.isArray(response.translations)) {
            return response.translations;
        } else {
            throw new Error('Invalid translation response format');
        }
    } catch (error) {
        console.error('[Translation] Error:', error);
        throw error;
    }
}

// Helper: Get language display name
function getLanguageName(languageCode) {
    const languageMap = {
        'en': 'English',
        'english': 'English',
        'ko': '한국어',
        'korean': '한국어',
        'ja': '日本語',
        'japanese': '日本語',
        'zh': '中文',
        'chinese': '中文',
        'es': 'Español',
        'spanish': 'Español',
        'fr': 'Français',
        'french': 'Français',
        'de': 'Deutsch',
        'german': 'Deutsch'
    };

    return languageMap[languageCode.toLowerCase()] || languageCode;
}
