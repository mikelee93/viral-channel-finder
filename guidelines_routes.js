// ========================================
// YouTube Guidelines Monitoring System APIs
// ========================================

const Guideline = require('./models/Guideline');
const ViolationCheck = require('./models/ViolationCheck');
const multer = require('multer');
const fs = require('fs');
const { geminiGenerateJSON, uploadFileToGemini, deleteFileFromGemini } = require('./server/utils/gemini.util');

// Configure video upload
const videoUpload = multer({
    dest: 'uploads/temp/',
    limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
    fileFilter: (req, file, cb) => {
        const allowed = ['video/mp4', 'video/mov', 'video/avi', 'video/quicktime'];
        if (allowed.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only MP4, MOV, AVI allowed.'));
        }
    }
});

const { ApifyClient } = require('apify-client');

module.exports = function (app, GEMINI_API_KEY, PERPLEXITY_API_KEY, YOUTUBE_API_KEY, APIFY_TOKEN) {

    // API: Scrape comments from URL (YouTube, TikTok, Instagram)
    app.post('/api/guidelines/scrape-comments', async (req, res) => {
        try {
            const { url } = req.body;
            if (!url) return res.status(400).json({ error: 'URL is required' });

            console.log(`[Comment Scraper] Processing URL: ${url}`);
            let comments = [];

            // 1. YouTube
            if (url.includes('youtube.com') || url.includes('youtu.be')) {
                const videoIdMatch = url.match(/(?:v=|youtu\.be\/)([^?&]+)/);
                if (!videoIdMatch) throw new Error('Invalid YouTube URL');
                const videoId = videoIdMatch[1];

                if (!YOUTUBE_API_KEY) throw new Error('YouTube API Key is missing on server');

                console.log(`[Comment Scraper] Fetching YouTube comments for ID: ${videoId}`);
                const response = await fetch(`https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=${videoId}&key=${YOUTUBE_API_KEY}&maxResults=20&order=relevance`);

                if (!response.ok) {
                    const err = await response.json();
                    throw new Error(err.error?.message || 'Failed to fetch YouTube comments');
                }

                const data = await response.json();
                comments = data.items.map(item => item.snippet.topLevelComment.snippet.textDisplay);
            }

            // 2. TikTok
            else if (url.includes('tiktok.com')) {
                if (!APIFY_TOKEN) throw new Error('Apify Token is missing on server');
                const client = new ApifyClient({ token: APIFY_TOKEN });

                console.log(`[Comment Scraper] Fetching TikTok comments via Apify...`);
                // Using clockworks/free-tiktok-scraper
                const run = await client.actor('clockworks/free-tiktok-scraper').call({
                    postURLs: [url],
                    commentsPerVideo: 20,
                    shouldDownloadVideos: false
                });

                const { items } = await client.dataset(run.defaultDatasetId).listItems();
                if (items.length > 0 && items[0].comments) {
                    comments = items[0].comments.map(c => c.text);
                } else if (items.length > 0 && items[0].commentsDatasetUrl) {
                    // Handle separate dataset if needed (simplified for now as usually inline for small batches)
                    // Try fetching comments dataset
                    const datasetId = items[0].commentsDatasetUrl.split('/').pop();
                    const commentItems = await client.dataset(datasetId).listItems();
                    comments = commentItems.items.map(c => c.text);
                }
            }

            // 3. Instagram
            else if (url.includes('instagram.com')) {
                if (!APIFY_TOKEN) throw new Error('Apify Token is missing on server');
                const client = new ApifyClient({ token: APIFY_TOKEN });

                console.log(`[Comment Scraper] Fetching Instagram comments via Apify...`);
                // Using apify/instagram-comment-scraper
                const run = await client.actor('apify/instagram-comment-scraper').call({
                    directUrls: [url],
                    resultsLimit: 20
                });

                const { items } = await client.dataset(run.defaultDatasetId).listItems();
                comments = items.map(item => item.text);
            } else {
                return res.status(400).json({ error: 'Unsupported platform. Only YouTube, TikTok, Instagram allowed.' });
            }

            console.log(`[Comment Scraper] Found ${comments.length} comments`);
            res.json({ success: true, comments: comments.slice(0, 30) }); // Limit to 30

        } catch (error) {
            console.error('[Comment Scraper Error]', error);
            res.status(500).json({ error: error.message });
        }
    });

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

    app.post('/api/guidelines/check-video', videoUpload.single('video'), async (req, res) => {
        let videoPath = null;
        let uploadedFile = null;

        try {
            const { title, description } = req.body;

            if (!req.file) {
                return res.status(400).json({ error: 'No video file uploaded' });
            }

            videoPath = req.file.path;
            console.log('[Guidelines] Analyzing uploaded video:', title);
            console.log('[Guidelines] File:', videoPath, req.file.mimetype);

            // Upload to Gemini File API (Handles large files > 20MB)
            // 10-minute videos are well supported here
            console.log('[Guidelines] Uploading to Gemini File API...');
            uploadedFile = await uploadFileToGemini(videoPath, req.file.mimetype, GEMINI_API_KEY);

            // Analyze with Gemini Vision
            console.log('[Guidelines] Starting Gemini Vision analysis...');
            const analysis = await analyzeVideoWithGemini({
                fileData: {
                    fileUri: uploadedFile.uri,
                    mimeType: uploadedFile.mimeType
                }
            }, {
                title: title || 'Untitled',
                description: description || ''
            }, GEMINI_API_KEY);

            console.log('[Guidelines] Analysis complete');

            // Save to database
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
                console.warn('[Guidelines] Warning: Failed to save to DB, but returning analysis.', dbError.message);
            }

            res.json({
                checkId: checkId,
                title,
                analysis
            });

        } catch (error) {
            console.error('[Guidelines Check Video] Error:', error);
            res.status(500).json({ error: error.message });
        } finally {
            // Clean up local file
            if (videoPath && fs.existsSync(videoPath)) {
                fs.unlinkSync(videoPath);
                console.log('[Guidelines] Local temp file cleaned up');
            }
            // Clean up Gemini file
            if (uploadedFile) {
                console.log('[Guidelines] Cleaning up Gemini file...');
                // Run in background to not block response if it takes time
                deleteFileFromGemini(GEMINI_API_KEY, uploadedFile.name).catch(e => console.error(e));
            }
        }
    });

    // API: Generate Shorts titles (Korean, Japanese, Japanese pronunciation)
    app.post('/api/guidelines/generate-titles', videoUpload.single('video'), async (req, res) => {
        let videoPath = null;
        let uploadedFile = null;

        try {
            const { title, description } = req.body;

            if (!req.file) {
                return res.status(400).json({ error: 'No video file uploaded' });
            }

            videoPath = req.file.path;
            console.log('[Title Generation] Analyzing video:', title);

            // Upload to Gemini File API
            console.log('[Title Generation] Uploading to Gemini File API...');
            uploadedFile = await uploadFileToGemini(videoPath, req.file.mimetype, GEMINI_API_KEY);

            console.log('[Title Generation] Generating titles...');
            const titles = await generateShortsTitle({
                fileData: {
                    fileUri: uploadedFile.uri,
                    mimeType: uploadedFile.mimeType
                }
            }, {
                title: title || '',
                description: description || ''
            }, GEMINI_API_KEY);

            res.json({
                success: true,
                titles
            });

        } catch (error) {
            console.error('[Title Generation] Error:', error);
            res.status(500).json({ error: error.message });
        } finally {
            if (videoPath && fs.existsSync(videoPath)) {
                fs.unlinkSync(videoPath);
            }
            if (uploadedFile) {
                deleteFileFromGemini(GEMINI_API_KEY, uploadedFile.name).catch(e => console.error(e));
            }
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

    // API: Extract Bilingual Transcript (Step 1)
    app.post('/api/guidelines/extract-transcript', videoUpload.single('video'), async (req, res) => {
        let videoPath = null;

        try {
            if (!req.file) {
                return res.status(400).json({ error: 'No video file uploaded' });
            }

            const { provider } = req.body; // 'openai' or 'huggingface'
            videoPath = req.file.path;
            console.log('[Transcript Extract] 📝 Starting transcript extraction...');
            console.log('[Transcript Extract] 🔧 Provider:', provider || 'openai (default)');

            // Read video file
            const videoData = fs.readFileSync(videoPath);

            // ═══════════════════════════════════════════════════════════
            // STEP 1: Extract original transcript with Whisper ASR
            // ═══════════════════════════════════════════════════════════
            const providerName = provider === 'huggingface' ? 'HuggingFace (FREE)' : 'OpenAI (PAID)';
            console.log(`[Transcript Extract] 🎙️ Extracting with ${providerName} Whisper ASR...`);

            const { extractTranscriptWithTimestamps } = require('./server/utils/phi3_asr.util');

            const originalTranscript = await extractTranscriptWithTimestamps(videoData, {
                language: 'auto',
                model: 'whisper',
                provider: provider || 'openai'
            });

            console.log(`[Transcript Extract] ✅ Extracted ${originalTranscript.segments.length} segments in ${originalTranscript.language}`);

            // ═══════════════════════════════════════════════════════════
            // STEP 2: Translate to Korean (if not already done)
            // ═══════════════════════════════════════════════════════════
            let translatedSegments = null;

            // Check if ASR already provided translation (Our new prompt does!)
            if (originalTranscript.hasTranslation) {
                console.log('[Transcript Extract] ℹ️ Transcript already has translation (Bilingual Mode)');
                // We don't need to call translateSegmentsToKorean
                // Just ensure we map it correctly below
            } else if (originalTranscript.language !== 'ko' && originalTranscript.language !== 'korean') {
                console.log('[Transcript Extract] 🌐 Skipping Translation (Optimization Mode)...');

                // DISABLED: We want Original Only for Step 1 efficiency
                /*
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
                */
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
                textKo: (translatedSegments && translatedSegments[i]) ? translatedSegments[i] : (seg.textKo || seg.text),
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
                    hasTranslation: originalTranscript.hasTranslation || (translatedSegments !== null)
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
            const { transcript, narrationStyle, comments, title } = req.body;

            if (!transcript || !transcript.segments) {
                return res.status(400).json({ error: 'Valid transcript data is required' });
            }

            console.log('[Highlights] 🔍 Analyzing transcript for viral moments...');
            if (comments) console.log(`[Highlights] 💬 Applying User Comments for analysis context (${comments.length} chars)`);

            // Prepare prompt for Gemini
            // Provide both MM:SS for context and Seconds for precision
            const segmentsText = transcript.segments.map((s, i) =>
                `[${formatTimestamp(s.start)} | ${s.start.toFixed(2)}s - ${formatTimestamp(s.end)} | ${s.end.toFixed(2)}s] ${s.textKo || s.text} (${s.emotion || 'neutral'})`
            ).join('\n');

            const prompt = `
당신은 유튜브 Shorts 전문 편집자입니다.
제공된 영상 대본과 댓글을 분석하여, **30초~1분 10초 분량의 최적화된 하이라이트**를 추출해주세요.

**📺 영상 정보:**
- 제목: ${title || '미정'}
- **💬 시청자 주요 반응 (댓글):**
${comments ? `"${comments}"` : '(제공된 댓글 없음)'}

**🎯 핵심 목표:**
- **저작권 회피**: 각 원본 클립은 최대 **5초 이하**로만 사용
- **타이트한 구성**: 전체 30초~1분 10초 (틱톡X, 쇼츠용)
- **나레이션-대사 교차**: 나레이션과 원본 대사를 번갈아 배치
- **자연스러운 흐름**: 친근하고 편한 말투의 나레이션

**📌 CRITICAL RULES (절대 규칙 - 반드시 준수):**
1. ✅ **전체 영상 길이는 65-70초 (틱톡 수익화 조건: 1분 1초 이상)**
   - 모든 scene의 duration 합계가 65-70초 범위여야 함
   - Outro는 2-3초로 제한 (짧은 CTA만)
   
2. ✅ **연속된 대화 블록으로 구성 (티키타카 살리기)**
   - 각 씬은 최소 10초 이상의 연속된 대화여야 함
   - 2-4초짜리 짧은 씬은 절대 금지
   - 대화의 자연스러운 흐름이 끊기지 않도록
   - 질문-답변, 주장-반박 등 완결된 대화 교환 포함
   
3. ✅ **모든 scene에 text_kr, text_jp, text_pron을 반드시 포함 (자막용 "/" 구분)**
   - text_kr: 원문의 한국어 번역 (description 아님!)
   - text_jp: YouTube Shorts 최적화 일본어 구어체, **긴 문장은 "/"로 나눠서 표시**
     * 예: "警察: 窓開けてもらえます？/ できないの？レンタカー？"
     * 말의 흐름대로 자연스럽게 끊기 (호흡, 문장 단위)
     * 사람 A/B 대화 교환 시 "/"로 구분
   - text_pron: 일본어의 한글 발음, **일본어와 동일하게 "/"로 나눔**
     * 예: "케이사츠: 마도 아케테 모라에마스？/ 데키나이노？ 렌타카-？"
   
4. ✅ **original_transcript는 해당 구간의 실제 대사만 포함**
   - 타임라인 범위 내의 대사만 정확히 추출
   - 연속된 대화를 모두 포함할 것
   - 전체 대본을 뭉쳐서 넣지 말 것

5. ✅ **Narration 최소화 (대화가 메인!)**
   - **Intro (1개 필수)**: 4초 내 시청자를 사로잡는 강력한 후킹 멘트
   - **Body (0-1개만)**: 중간 환기용, 대화 흐름을 끊지 않는 위치에만
   - **Outro (1개 필수)**: 댓글 유도 CTA (구독 요청 금지)
   - 각 narration은 narration_kr, narration_jp, narration_pron 세트로 제공
   - 나레이션은 대화 사이의 자연스러운 갭(침묵)에만 삽입

**⚠️ CRITICAL: 타임스탬프는 반드시 원본 영상의 실제 위치를 사용하세요!**
- start/end 값은 위에 제공된 "영상 대본"의 실제 타임스탬프를 그대로 사용
- 절대로 0초부터 시작하는 연속된 값을 만들지 마세요
- 예: start: 322.5 (5분 22.5초), end: 326.0 (5분 26초)

**🚨 추가 제약사항 (AI 품질 보장):**

1. **총 씬 개수: 8-12개 이내**
   - 5초 × 12씬 = 60초 (최적 길이)
   - 씬이 너무 많으면 산만함, 너무 적으면 단조로움

2. **나레이션-대사 교차 빈도**:
   - **대사 씬 1-2개마다 나레이션 1개 삽입** (리듬 유지)
   - **대사만 3개 이상 연속 금지** (시청자가 지루해함)
   - 예시 패턴: 나레이션 → 대사 → 대사 → 나레이션 → 대사 → 나레이션

3. **나레이션 톤 체크** (격식체 절대 금지):
   
   **한국어:**
   - ❌ 나쁜 예: "시작합니다", "시작됩니다", "펼쳐집니다"
   - ❌ 나쁜 예: "~기 시작합니다", "~하게 됩니다"
   - ✅ 좋은 예: "~는데", "~였죠", "~하네요", "~버리는데"
   - ✅ 좋은 예: "이게 뭐야", "진짜 대박", "완전 황당한데"
   
   **일본어 (매우 중요!):**
   - ❌ 나쁜 예: "始まります", "展開されます" (격식체)
   - ❌ 나쁜 예: "〜いたします", "〜でございます" (너무 딱딱함)
   - ✅ 좋은 예: "〜んです", "〜んだけど", "〜ちゃう", "〜てる"
   - ✅ 좋은 예: "びっくりする", "すごい", "やばい", "〜そうです"
   - ✅ 좋은 예: "〜なんだ", "〜のに", "〜ちゃって"
   
   **일본어 예시:**
   - ✅ "突入するやいなや、ドアを開けた警察官がびっくりして閉めちゃうんだけど"
   - ✅ "犯人は人じゃなくて鹿だったんです。警察も呆れて笑いを堪えられないんだけど"
   - ❌ "警察官が驚いて扉を閉めます" (뉴스 톤)

4. **Intro/Outro는 반드시 나레이션**:
   - 원본 대사로 시작/끝내지 말 것
   - 나레이션으로 후킹 & 여운 만들기

**편집 구조 가이드 & 필수 요소:**
1. **Intro (총 4초 분량):** 시청자의 시선을 사로잡는 강력한 후킹.
   - **필수**: narration_kr, narration_jp, narration_pron
   - 가장 충격적이거나 호기심을 유발하는 한 문장
   - 원본 영상에서 가장 임팩트 있는 구간 선택
   
2. **Body (5~8개 씬, 총 25~55초):** 나레이션과 원본 대사를 번갈아 배치
   - 나레이션과 원본 대사를 번갈아 배치 (**최소 2회 교차**)
   - **나레이션 씬**: 상황 설명, 전환 (narration_kr/jp/pron 제공, text는 null)
   - **대사 씬**: 원본 핵심 대사 (original_transcript + text_kr/jp/pron 제공, narration은 null)
   - **🚨 각 씬은 최대 5초!** (copyright safety)
   - 원본 영상의 실제 타임스탬프 사용   

3. **Climax (~5초):** 가장 재미있거나 충격적인 순간
   - 대사 또는 나레이션 (상황에 따라 선택)
   - 반전, 감정 폭발, 핵심 포인트
   - **🚨 최대 5초 준수**
   
4. **Outro (2~5초):**
   - **옵션 1: CTA** - narration_kr/jp/pron으로 "과연 결말은? 댓글로 여러분의 생각을 남겨주세요!"
   - **옵션 2: 여운** - 원본 대사의 마지막 부분으로 끝맺음, 반전 남기기
   - narration 사용 시 3개 국어 필수

**🎤 나레이션 스타일 가이드 (매우 중요!):**
절대 딱딱하게 설명하지 마세요! 친구에게 말하듯 자연스럽게:

**좋은 예시 ✅ (성공한 실제 쇼츠 나레이션):**
- "진입하자마자 문을 열어본 경찰관이 개깜놀해서 문을 닫아버리는데"
- "범인은 사람이 아니라 사슴이었죠. 경찰도 너무 황당한지 헛웃음을 참지 못하는데"
- "사슴은 안방 침대까지 점령하고 난동을 부리는데"
- "배테랑 경찰도 뇌정지가 와버리니다"
- "결국 총 대신 의자를 방패 삼아 사슴을 몰아내기 시작하고"
- "놀란 사슴이 탈출하면서 사건은 끝이 났다고 하네요"

**나쁜 예시 ❌:**
- "이 영상은 경찰이 사슴을 발견한 장면입니다" (뉴스 톤)
- "다음 장면에서 놀라운 반전이 펼쳐집니다" (설명투)
- "경찰관이 당황하는 모습을 확인할 수 있습니다" (관찰자 톤)

**핵심 특징:**
- **연결어미 "~는데"**: 이야기가 계속 이어지는 느낌 (끊지 않고 흐름 유지)
- **자연스러운 종결**: "~였죠", "~하네요", "~와버리니다"
- **생생한 표현**: "개깜놀", "뇌정지가 와버리니다", "참지 못하는데"
- **짧은 문장**: 한 호흡에 하나의 장면만
- **감정 전달**: 단순 설명이 아닌 감정과 반응 중심

**📸 썸네일 문구 전략 (3개 대안 필수)**
   - **대안 1 (숫자 후킹)**: 반드시 숫자를 포함하여 클릭률 극대화
     * 예: "ハンマーで釘を打てば800万円" (800만엔)
     * 예: "ラスト2分" (마지막 2분)
     * 예: "158kmのストレートを背中に受けたら" (158km)
     * 숫자는 시간, 금액, 속도, 순위, 거리 등 무엇이든 가능
   - **대안 2 (엔딩 스포일러)**: 영상 마지막 장면의 결과를 암시
     * 끝까지 보지 않으면 궁금한 문구
     * 예: "彼が絶対に後悔しない理由" (그가 절대 후회하지 않는 이유)
     * 예: "最下位でも自国に帰られていた理由" (최하위여도 자국에 돌아갈 수 있었던 이유)
   - **대안 3 (숫자 또는 충격)**: 숫자나 충격적인 사실 중 선택
     * 대안 1과 다른 숫자 사용 또는
     * 시청자가 믿기 어려운 충격적인 사실
   - **모든 대안**: 한국어(line1_kr, line2_kr) + 일본어(line1_jp, line2_jp) + 발음(line1_pron, line2_pron)

**💡 씬 배치 최적화:**
- 각 scene은 5초 이하로 제한
- 나레이션 → 대사 → 나레이션 → 대사 (리듬 만들기)
- 나레이션은 대화 사이의 자연스러운 갭에 삽입
- 원본 대사는 가장 임팩트 있는 순간만 선택 (5초 단위로 끊기)

**영상 대본:**
${segmentsText}

**응답 형식 (JSON):**
{
  "directorPlan": [
    {
      "stage": "Intro",
      "start": 12.52,
      "end": 16.50,
      "description": "충격적인 후킹으로 시청자 이목 집중",
      "reason": "가장 임팩트 있는 순간으로 호기심 유발",
      "original_transcript": null,
      "text_kr": null,
      "text_jp": null,
      "text_pron": null,
      "narration_kr": "진입하자마자 문을 열어본 경찰관이 개깜놀해서 문을 닫아버리는데",
      "narration_jp": "突入するやいなや、ドアを開けた警察官がビックリして閉めちゃうんだけど",
      "narration_pron": "톳뉴-스루야이나야, 도아오 아케타 케이사츠칸가 빗쿠리시테 시메챠운다케도",
      "sfx_suggestion": "긴장감 있는 배경음"
    },
    {
      "stage": "Body 1",
      "start": 61.15,
      "end": 64.80,
      "description": "경찰과 운전자 첫 대화",
      "reason": "면허 없음 폭탄 발언으로 상황 심각성 전달",
      "original_transcript": "Sir, can I see your license? I don't have a license.",
      "text_kr": "면허증 보여주시겠어요? 면허가 없어요.",
      "text_jp": "免許証見せてもらえます？/免許持ってないです。",
      "text_pron": "멘쿄쇼- 미세테 모라에마스？/멘쿄 못테나인데스。",
      "narration_kr": null,
      "narration_jp": null,
      "narration_pron": null,
      "sfx_suggestion": null
    },
    {
      "stage": "Body 2",
      "start": 68.20,
      "end": 71.50,
      "description": "상황 전환 및 긴장감 고조",
      "reason": "나레이션으로 분위기 전환 및 다음 장면 예고",
      "original_transcript": null,
      "text_kr": null,
      "text_jp": null,
      "text_pron": null,
      "narration_kr": "범인은 사람이 아니라 사슴이었죠. 경찰도 너무 황당한지 헛웃음을 참지 못하는데",
      "narration_jp": "犯人は人じゃなくて鹿だったんです。警察も呆れて笑いを堪えられないんだけど",
      "narration_pron": "한닌와 히토쟈나쿠테 시카닷탄데스。케이사츠모 아키레테 와라이오 코라에라레나인다케도",
      "sfx_suggestion": null
    },
    {
      "stage": "Climax",
      "start": 145.30,
      "end": 149.80,
      "description": "클라이맥스 - 가장 재미있는 순간",
      "reason": "사슴 탈출 장면으로 반전과 해결 제시",
      "original_transcript": "It jumped out the window!",
      "text_kr": "창문으로 뛰어내렸어요!",
      "text_jp": "窓から飛び降りた！",
      "text_pron": "마도카라 토비오리타！",
      "narration_kr": null,
      "narration_jp": null,
      "narration_pron": null,
      "sfx_suggestion": "충격음"
    },
    {
      "stage": "Outro",
      "start": 152.10,
      "end": 155.50,
      "description": "마무리 CTA",
      "reason": "여운과 댓글 유도",
      "original_transcript": null,
      "text_kr": null,
      "text_jp": null,
      "text_pron": null,
      "narration_kr": "놀란 사슴이 탈출하면서 사건은 끝이 났다고 하네요. 과연 여러분이라면 어땠을까요?",
      "narration_jp": "驚いた鹿が逃げ出して事件は終わったそうです。皆さんならどうしますか？",
      "narration_pron": "오도로이타 시카가 니게다시테 지켄와 오왓타소-데스。미나산나라 도-시마스카？",
      "sfx_suggestion": null
    }
  ],
  "viralTitle_kr": "집에 침입한 범인의 정체는?! (경찰도 당황)",
  "viralTitle_jp": "家に侵入した犯人の正体は？！（警察も困惑）",
  "viralTitle_pron": "이에니 신뉴-시타 한닌노 쇼-타이와？！（케이사츠모 콘와쿠）",
  "thumbnailText": [
    {
      "line1_kr": "집에 침입한",
      "line1_jp": "家に侵入した",
      "line1_pron": "이에니 신뉴-시타",
      "line2_kr": "범인의 정체는?!",
      "line2_jp": "犯人の正体は？！",
      "line2_pron": "한닌노 쇼-타이와？！",
      "strategy": "호기심 유발 + 엔딩 스포일러"
    },
    {
      "line1_kr": "경찰도 당황한",
      "line1_jp": "警察も困惑した",
      "line1_pron": "케이사츠모 콘와쿠시타",
      "line2_kr": "충격의 범인",
      "line2_jp": "衝撃の犯人",
      "line2_pron": "쇼-게키노 한닌",
      "strategy": "감정 강조"
    },
    {
      "line1_kr": "3분간의",
      "line1_jp": "3分間の",
      "line1_pron": "산분칸노",
      "line2_kr": "경찰 VS 사슴",
      "line2_jp": "警察VS鹿",
      "line2_pron": "케이사츠 VS 시카",
      "strategy": "숫자 후킹 (3분)"
    }
  ],
  "sourceInfo": "Unknown",
  "loopStrategy": "마지막 장면에서 다시 Intro의 충격적인 순간으로 자연스럽게 연결",
  "estimatedDuration": 45
}

**⚠️ 최종 체크리스트:**
- [ ] **타임스탬프가 원본 영상의 실제 위치인가? (0초부터 시작 ❌)**
- [ ] 전체 duration 합계가 **30-70초**인가?
- [ ] **각 씬이 최대 5초 이하**인가?
- [ ] Outro가 2-5초인가?
- [ ] 모든 scene에 text_kr, text_jp, text_pron 있는가? (또는 narration)
- [ ] **text_jp와 text_pron이 "/"로 적절히 나뉘어 있는가?**
- [ ] Intro에 narration이 있는가? (3개 국어)
- [ ] **나레이션-대사가 최소 2회 교차**하는가?
- [ ] Outro에 narration 또는 여운 대사가 있는가?
- [ ] **viralTitle이 3개 국어(kr, jp, pron)로 생성되었는가?**
- [ ] **thumbnailText가 3개 대안으로 생성되었는가? (각각 2줄, 일본어+발음)**
- [ ] **나레이션이 자연스러운 구어체 톤**인가? ("~는데", "~였죠", "~하네요")
- [ ] Intro/Outro가 대사가 아닌 **나레이션**인가?
`;

            const response = await geminiGenerateJSON(GEMINI_API_KEY, 'gemini-2.5-flash', [
                { text: prompt }
            ]);

            console.log(`[Director Mode] ✅ Plan created with ${response.directorPlan?.length || 0} scenes`);

            // ═══════════════════════════════════════════════════════════
            // Backend Validation: Enforce 5-second max segment length
            // ═══════════════════════════════════════════════════════════
            const MAX_SEGMENT_DURATION = 5.0; // Copyright safety limit
            const MIN_TOTAL_DURATION = 30;
            const MAX_TOTAL_DURATION = 70;

            let validatedPlan = [];
            let warnings = [];

            if (response.directorPlan && Array.isArray(response.directorPlan)) {
                for (const scene of response.directorPlan) {
                    const duration = scene.end - scene.start;

                    if (duration > MAX_SEGMENT_DURATION) {
                        warnings.push({
                            stage: scene.stage,
                            duration: duration.toFixed(2),
                            reason: `Scene exceeds 5-second limit (${duration.toFixed(2)}s). This may trigger copyright detection.`
                        });
                        console.warn(`[Validation] ⚠️ Scene "${scene.stage}" (${duration.toFixed(2)}s) exceeds 5s limit`);
                    }

                    // Include all scenes but flag warnings
                    validatedPlan.push(scene);
                }

                // Calculate total duration
                const totalDuration = validatedPlan.reduce((sum, scene) => sum + (scene.end - scene.start), 0);

                if (totalDuration < MIN_TOTAL_DURATION || totalDuration > MAX_TOTAL_DURATION) {
                    warnings.push({
                        type: 'total_duration',
                        duration: totalDuration.toFixed(2),
                        reason: `Total duration (${totalDuration.toFixed(2)}s) is outside recommended range (30-70s)`
                    });
                    console.warn(`[Validation] ⚠️ Total duration ${totalDuration.toFixed(2)}s outside 30-70s range`);
                }

                console.log(`[Validation] Total scenes: ${validatedPlan.length}, Total duration: ${totalDuration.toFixed(2)}s, Warnings: ${warnings.length}`);
            }

            res.json({
                success: true,
                directorPlan: validatedPlan,
                warnings: warnings.length > 0 ? warnings : undefined,

                // Titles
                viralTitle: response.viralTitle, // Legacy
                viralTitle_kr: response.viralTitle_kr,
                viralTitle_jp: response.viralTitle_jp,
                viralTitle_pron: response.viralTitle_pron,

                // Metadata
                thumbnailText: response.thumbnailText,
                loopStrategy: response.loopStrategy,
                sourceInfo: response.sourceInfo,

                estimatedDuration: response.estimatedDuration
            });

        } catch (error) {
            console.error('[Highlights] Error:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // API: Generate Japanese Animal Channel Script (For viral content adaptation)
    // ENHANCED: 2-step process with ASR transcript extraction
    app.post('/api/guidelines/generate-animal-script', videoUpload.single('video'), async (req, res) => {
        let videoPath = null;
        let uploadedFile = null;

        try {
            const { sourceTitle, targetChannel, narrationStyle } = req.body;

            if (!req.file) {
                return res.status(400).json({ error: 'No video file uploaded' });
            }

            videoPath = req.file.path;
            console.log('[Animal Script] 🎬 Starting 2-step process for:', targetChannel);

            // ═══════════════════════════════════════════════════════════
            // STEP 1: Extract original transcript with timestamps (ASR)
            // ═══════════════════════════════════════════════════════════
            console.log('[Animal Script] 🎙️ Step 1/2: Extracting original transcript with ASR...');

            const { extractTranscriptWithTimestamps } = require('./server/utils/phi3_asr.util');

            let originalTranscript = null;
            try {
                // For ASR we still need to read the file locally (or stream it)
                const videoData = fs.readFileSync(videoPath);

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

            // Upload to Gemini File API for the vision analysis
            console.log('[Animal Script] Uploading to Gemini File API...');
            uploadedFile = await uploadFileToGemini(videoPath, req.file.mimetype, GEMINI_API_KEY);

            const script = await generateAnimalChannelScript({
                fileData: {
                    fileUri: uploadedFile.uri,
                    mimeType: uploadedFile.mimeType
                }
            }, {
                sourceTitle: sourceTitle || '',
                targetChannel: targetChannel || 'japanese-animal-channel',
                narrationStyle: narrationStyle || 'educational-exciting',
                originalTranscript: originalTranscript // 🔥 KEY: Pass transcript context
            }, GEMINI_API_KEY);

            res.json({
                success: true,
                script,
                originalTranscript: originalTranscript
            });

        } catch (error) {
            console.error('[Animal Script] Error:', error);
            res.status(500).json({ error: error.message });
        } finally {
            if (videoPath && fs.existsSync(videoPath)) {
                fs.unlinkSync(videoPath);
            }
            if (uploadedFile) {
                deleteFileFromGemini(GEMINI_API_KEY, uploadedFile.name).catch(e => console.error(e));
            }
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

    const prompt = `다음은 ${sourceLanguage} 언어로 된 영상 대본입니다. 각 줄을 **한국어 원어민이 말하는 것처럼 자연스러운 구어체(더빙 톤)**로 번역해주세요.
    
**번역 가이드라인 (중요):**
1. **직역 금지**: "좋은 하루 보내시게 해드릴게요" (X) -> "오늘 하루 망치기 싫으면..." 또는 "좋게 말할 때 가시죠" (O) 상황에 맞게 의역하세요.
2. **구어체 사용**: 문어체나 딱딱한 말투를 피하고, 실제 대화처럼 생생하게 번역하세요.
3. **감정 반영**: 타임스탬프와 감정 태그를 참고하여, 화자의 기분(화남, 비꼼, 차분함)이 묻어나게 하세요.

원문:
${textsToTranslate}

JSON 형식으로 응답해주세요:
{
  "translations": [
    "자연스러운 번역문1",
    "자연스러운 번역문2",
    ...
  ]
}

중요: 
1. 원문의 줄 수(${segments.length}줄)와 **정확히 동일한 개수**의 번역문을 배열에 담아주세요.
2. 번역이 불필요하면 원문 그대로 두세요. 절대 개수를 줄이지 마세요.`;

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
