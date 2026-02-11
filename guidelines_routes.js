// ========================================
// YouTube Guidelines Monitoring System APIs
// ========================================

const Guideline = require('./models/Guideline');
const ViolationCheck = require('./models/ViolationCheck');
const { refineTimestampsUsingTranscript } = require('./server/utils/timestamp_refiner.util');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const ytDlp = require('yt-dlp-exec'); // Added for URL processing
const { geminiGenerateJSON, uploadFileToGemini, deleteFileFromGemini, analyzeVideoWithGemini, generateShortsTitle } = require('./server/utils/gemini.util');

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
            }

            // 4. Reddit
            else if (url.includes('reddit.com') || url.includes('v.redd.it')) {
                console.log(`[Comment Scraper] Fetching Reddit comments...`);

                // Use our new Reddit comments API
                const redditResponse = await fetch(`http://localhost:4000/api/reddit/comments?url=${encodeURIComponent(url)}`);

                if (!redditResponse.ok) {
                    const error = await redditResponse.json();
                    throw new Error(error.error || 'Failed to fetch Reddit comments');
                }

                const redditData = await redditResponse.json();

                if (redditData.success && redditData.comments) {
                    // Format Reddit comments with score and author
                    comments = redditData.comments.map(c =>
                        `[${c.score}↑] ${c.author}: ${c.text}`
                    );
                    console.log(`[Comment Scraper] Fetched ${comments.length} Reddit comments`);
                } else {
                    throw new Error('Invalid Reddit comments response');
                }
            } else {
                return res.status(400).json({ error: 'Unsupported platform. Only YouTube, TikTok, Instagram, Reddit allowed.' });
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

    // API: Check Video from URL (New)
    app.post('/api/guidelines/check-video-url', async (req, res) => {
        let videoPath = null;
        let uploadedFile = null;

        try {
            let { url, title: providedTitle, description: providedDesc } = req.body;
            if (!url) return res.status(400).json({ error: 'URL is required' });

            console.log('[Guidelines URL] Processing URL:', url);

            // 0. Resolve v.redd.it to Permalink (Server-side Fail-safe)
            if (url.includes('v.redd.it')) {
                console.log('[Guidelines URL] Detected v.redd.it link. Resolving to permalink...');
                try {
                    const response = await fetch(url, {
                        redirect: 'follow',
                        method: 'HEAD', // Use HEAD to just get headers/url
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                            'Referer': 'https://www.reddit.com/'
                        }
                    });

                    // v.redd.it usually redirects to the post page or a CDN link. 
                    // If it redirects to reddit.com/r/..., use that.
                    // If it's a direct file link (CDN), yt-dlp might still fail if blocked.
                    // But typically browsing v.redd.it redirects to the comments page.
                    if (response.url && response.url.includes('reddit.com/r/')) {
                        console.log('[Guidelines URL] Resolved to:', response.url);
                        url = response.url;
                    } else {
                        console.log('[Guidelines URL] Could not resolve to reddit.com post. Using original:', response.url);
                        // Fallback: If we can't find the post, maybe we shouldn't continue? 
                        // But let's try original just in case.
                    }
                } catch (e) {
                    console.warn('[Guidelines URL] Failed to resolve v.redd.it:', e.message);
                }
            }

            // 1. Download Video using yt-dlp
            const timestamp = Date.now();
            const outputTemplate = path.join(__dirname, 'uploads/temp', `download_${timestamp}.%(ext)s`);

            console.log('[Guidelines URL] Downloading video... (max 1080p)');

            // Execute download
            // We expect yt-dlp to handle the file extension automatically
            await ytDlp(url, {
                output: outputTemplate,
                format: 'bestvideo[height<=1080]+bestaudio/best[height<=1080]', // Limit to 1080p
                mergeOutputFormat: 'mp4',
                noPlaylist: true,
                maxFilesize: '500m', // Limit size,
                addHeader: [
                    'User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                    'Referer:https://www.reddit.com/'
                ]
            });

            // Find the downloaded file (since extension might vary, though we asked for mp4)
            // We constructed filename pattern `download_${timestamp}.mp4` effectively
            const expectedPath = path.join(__dirname, 'uploads/temp', `download_${timestamp}.mp4`);

            if (!fs.existsSync(expectedPath)) {
                // Try finding any file starting with that prefix if mp4 merge failed or differs
                const dir = path.join(__dirname, 'uploads/temp');
                const files = fs.readdirSync(dir);
                const found = files.find(f => f.startsWith(`download_${timestamp}`));
                if (found) {
                    videoPath = path.join(dir, found);
                    console.log('[Guidelines URL] Found downloaded file:', found);
                } else {
                    throw new Error('Download failed: Output file not found');
                }
            } else {
                videoPath = expectedPath;
            }

            console.log('[Guidelines URL] Video downloaded:', videoPath);

            // 2. Metadata (Use provided or fetch?)
            // For now use provided title from Finder, fallback to filename
            const title = providedTitle || `Imported Video ${timestamp}`;
            const description = providedDesc || `Imported from ${url}`;


            // Check file size to ensure valid download
            const stats = fs.statSync(videoPath);
            const fileSizeInBytes = stats.size;
            console.log(`[Guidelines URL] Downloaded file size: ${(fileSizeInBytes / 1024 / 1024).toFixed(2)} MB`);

            if (fileSizeInBytes < 10240) { // Less than 10KB is likely an error page
                throw new Error('Download failed: File is too small (likely an error page). URL might be blocked.');
            }

            // 3. Upload to Gemini File API
            console.log('[Guidelines URL] Uploading to Gemini File API...');
            uploadedFile = await uploadFileToGemini(videoPath, 'video/mp4', GEMINI_API_KEY);

            // 1.5 Fetch Reddit Comments (if applicable)
            let redditComments = [];
            if (url.includes('reddit.com')) {
                try {
                    console.log('[Guidelines URL] Fetching Reddit comments...');
                    let jsonUrl = url;
                    if (!jsonUrl.endsWith('.json')) {
                        jsonUrl = jsonUrl.replace(/\/$/, '') + '.json';
                    }

                    const commentResp = await fetch(jsonUrl, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                        }
                    });

                    if (commentResp.ok) {
                        const data = await commentResp.json();
                        if (Array.isArray(data) && data.length > 1) {
                            // Extract comments similar to server.js logic
                            const commentsData = data[1].data.children;
                            const flattenComments = (nodes) => {
                                let results = [];
                                nodes.forEach(node => {
                                    if (node.kind === 't1') {
                                        results.push({
                                            author: node.data.author,
                                            body: node.data.body,
                                            score: node.data.score
                                        });
                                        if (node.data.replies && node.data.replies.data) {
                                            results.push(...flattenComments(node.data.replies.data.children));
                                        }
                                    }
                                });
                                return results;
                            };

                            // Get top 20 comments by score
                            redditComments = flattenComments(commentsData)
                                .sort((a, b) => b.score - a.score)
                                .slice(0, 20)
                                .map(c => `${c.author}: ${c.body} (Score: ${c.score})`);

                            console.log(`[Guidelines URL] Fetched ${redditComments.length} comments.`);
                        }
                    }
                } catch (e) {
                    console.warn('[Guidelines URL] Failed to fetch comments:', e.message);
                }
            }

            // 4. Analyze with Gemini Vision
            console.log('[Guidelines URL] Starting Gemini Vision analysis...');

            // Execute Guidelines Analysis
            const analysis = await analyzeVideoWithGemini({
                fileUri: uploadedFile.uri,
                mimeType: uploadedFile.mimeType
            }, {
                title: title,
                description: description,
                comments: redditComments
            }, GEMINI_API_KEY);

            console.log('[Guidelines URL] Analysis complete');

            // 5. Save to database
            let checkId = null;
            try {
                const check = await ViolationCheck.create({
                    videoFile: path.basename(videoPath), // Store filename
                    title: title,
                    description: description,
                    analysis
                });
                checkId = check._id;
            } catch (dbError) {
                console.warn('[Guidelines URL] Warning: Failed to save to DB:', dbError.message);
            }

            res.json({
                checkId: checkId,
                title,
                analysis
            });

        } catch (error) {
            console.error('[Guidelines URL] Error:', error);
            res.status(500).json({ error: error.message });
        } finally {
            // Clean up
            if (videoPath && fs.existsSync(videoPath)) {
                try {
                    fs.unlinkSync(videoPath);
                    console.log('[Guidelines URL] Local temp file cleaned up');
                } catch (e) { console.error('Failed to delete temp file', e); }
            }
            if (uploadedFile) {
                console.log('[Guidelines URL] Cleaning up Gemini file...');
                deleteFileFromGemini(GEMINI_API_KEY, uploadedFile.name).catch(e => console.error(e));
            }
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
                fileUri: uploadedFile.uri,
                mimeType: uploadedFile.mimeType
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
                fileUri: uploadedFile.uri,
                mimeType: uploadedFile.mimeType
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
        let isTempDownload = false;

        try {
            const { provider, url } = req.body; // 'openai' or 'huggingface', and optional 'url'

            if (url) {
                console.log('[Transcript Extract] 📥 Downloading video from URL:', url);
                const timestamp = Date.now();
                const outputTemplate = path.join(__dirname, 'uploads/temp', `transcript_dl_${timestamp}.%(ext)s`);

                await ytDlp(url, {
                    output: outputTemplate,
                    format: 'bestaudio/best', // Audio is enough for transcript
                    noPlaylist: true,
                    maxFilesize: '100m',
                    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36'
                });

                // Find downloaded file
                const dir = path.join(__dirname, 'uploads/temp');
                const files = fs.readdirSync(dir);
                const found = files.find(f => f.startsWith(`transcript_dl_${timestamp}`));

                if (found) {
                    videoPath = path.join(dir, found);
                    isTempDownload = true;
                    console.log('[Transcript Extract] ✅ Downloaded:', videoPath);
                } else {
                    throw new Error('Download for transcript failed');
                }

            } else if (req.file) {
                videoPath = req.file.path;
            } else {
                return res.status(400).json({ error: 'No video file uploaded or URL provided' });
            }

            console.log('[Transcript Extract] 📝 Starting transcript extraction from:', videoPath);
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

            // ═══════════════════════════════════════════════════════════
            // STEP 3: Generate Korean Video Explanation (Gemini)
            // ═══════════════════════════════════════════════════════════
            let videoExplanation = "";
            try {
                console.log('[Transcript Extract] 🤖 Generating Korean video explanation with Gemini...');
                const summaryPrompt = `다음 대본을 바탕으로 이 영상이 어떤 내용인지 3-4문장 정도의 상세한 한국어 설명(영상 요약)을 작성해주세요.
                
                대본:
                ${originalTranscript.fullText.substring(0, 5000)}
                
                JSON 형식으로 응답:
                {
                  "videoExplanation": "상세한 한국어 설명..."
                }`;

                const summaryResponse = await geminiGenerateJSON(GEMINI_API_KEY, 'gemini-2.5-flash', [{ text: summaryPrompt }]);
                videoExplanation = summaryResponse.videoExplanation;
            } catch (sumError) {
                console.warn('[Transcript Extract] ⚠️ Video explanation generation failed:', sumError.message);
            }

            res.json({
                success: true,
                transcript: {
                    language: originalTranscript.language,
                    languageName: getLanguageName(originalTranscript.language),
                    duration: originalTranscript.duration,
                    fullText: originalTranscript.fullText,
                    segments: bilingualSegments,
                    hasTranslation: originalTranscript.hasTranslation || (translatedSegments !== null),
                    videoExplanation: videoExplanation
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

1. ✅ **전체 영상 길이는 65-70초 (수익화 조건: 1분 이상)**
   - 모든 scene의 duration 합계가 65-70초 범위여야 함
   - 씬 개수를 조절하여 총 길이를 맞출 것
   
2. ✅ **각 씬은 3-7초로 구성 (빠른 호흡 유지)**
   - **🚨 CRITICAL: 모든 씬(나레이션 포함)은 반드시 원본 영상의 \`start\`, \`end\` 타임스탬프를 가져야 함!**
   - **start와 end는 반드시 숫자(number)여야 하며, null, undefined, 문자열 절대 금지!**
   - **나레이션 씬도 반드시 배경 영상이 필요하므로 원본 영상의 타임스탬프를 지정해야 함**
   - 타임스탬프가 없는 씬은 영상 편집이 불가능하므로 절대 금지
   - 10초 이상의 긴 씬은 시청자가 지루해하므로 지양
   - 대화가 긴 경우 여러 개의 3-5초 씬으로 나누어 구성 (나레이션과 교차)
   - 대화의 자연스러운 흐름이 끊기지 않도록 순서대로 배치
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
   - **🚨 CRITICAL: 씬들의 타임스탬프는 절대 겹치면 안 됨!**
     * 각 씬은 원본 영상의 **서로 다른 구간**을 사용해야 함
     * 예: Scene 1 (0-5초), Scene 2 (5-10초), Scene 3 (10-15초) ✅
     * 잘못된 예: Scene 1 (0-5초), Scene 2 (0-7초) ❌ (겹침!)
     * 나레이션 씬도 배경 영상이 필요하므로 고유한 타임스탬프 필요
   - 원본 영상의 실제 타임스탬프 사용   

3. **Climax (~5초):** 가장 재미있거나 충격적인 순간
   - 대사 또는 나레이션 (상황에 따라 선택)

4. **Outro (총 3초 분량):** 여운을 남기고 댓글 유도.
   - **필수**: narration_kr, narration_jp, narration_pron
   - 절대 "구독해주세요" 하지 말 것
   - "여러분의 생각은?", "진짜 어이없네 ㅋㅋ" 등 친구처럼 마무리

**🚨🚨🚨 CRITICAL VALIDATION RULES (MUST FOLLOW!) 🚨🚨🚨**

**EVERY scene MUST have valid numeric timestamps:**
- ✅ CORRECT: "start": 12.5, "end": 16.5
- ❌ WRONG: "start": null, "end": null
- ❌ WRONG: "start": "12.5", "end": "16.5" (strings not allowed)
- ❌ WRONG: Missing start or end fields

**This applies to ALL scene types:**
- Narration scenes (narration_intro, narration_bridge, narration_outro) → MUST have start/end
- Original clip scenes (original_clip) → MUST have start/end
- NO EXCEPTIONS! Every scene needs background video from the original footage!

**🚨 TIMESTAMPS MUST NOT OVERLAP:**
- ✅ CORRECT: Scene 1 (0-5s), Scene 2 (5-10s), Scene 3 (10-15s)
- ❌ WRONG: Scene 1 (0-7s), Scene 2 (0-7s) ← Same timestamps!
- ❌ WRONG: Scene 1 (0-7s), Scene 2 (5-12s) ← Overlapping!
- Each scene must use a UNIQUE, NON-OVERLAPPING time range from the original video

**Response JSON Format:**
\`\`\`json
{
  "viralTitle_kr": "한국어 바이럴 제목 (호기심 유발)",
  "viralTitle_jp": "일본어 바이럴 제목 (구어체)",
  "viralTitle_pron": "일본어 제목 발음 (한글)",
  "viralReason": "왜 이 부분이 바이럴 될 것 같은지 1줄 설명",
  "targetAudience": "주 타겟층 (예: 20대 남성, 운전자 등)",
  "editorial_strategy": "1줄 편집 의도 (예: 긴장감 고조 후 반전 유머)",
  "loopStrategy": "영상이 무한 반복되는 것처럼 느껴지게 하는 루프 전략 (마지막 대사가 처음과 이어지는 법 등)",
  "thumbnailText": [
    {
      "strategy": "호기심 자극형",
      "line1_kr": "한국어 문구 1",
      "line1_jp": "일본어 문구 1",
      "line1_pron": "발음 1",
      "line2_kr": "한국어 문구 2",
      "line2_jp": "일본어 문구 2",
      "line2_pron": "발음 2"
    },
    {
      "strategy": "공포/충격 강조형",
      "line1_kr": "한국어 문구 1",
      "line1_jp": "일본어 문구 1",
      "line1_pron": "발음 1",
      "line2_kr": "한국어 문구 2",
      "line2_jp": "일본어 문구 2",
      "line2_pron": "발음 2"
    },
    {
      "strategy": "반전/결말 궁금증형",
      "line1_kr": "한국어 문구 1",
      "line1_jp": "일본어 문구 1",
      "line1_pron": "발음 1",
      "line2_kr": "한국어 문구 2",
      "line2_jp": "일본어 문구 2",
      "line2_pron": "발음 2"
    }
  ],
  "scenes": [
    {
      "order\": 1,
      "stage": "Intro (Hook)", // "Intro (Hook)", "Body (Story)", "Climax", "Outro"
      "type": "narration_intro", // narration_intro, narration_bridge, narration_outro, original_clip
      "start": 12.5, // 🚨 MUST be a valid number from original video! NEVER null!
      "end": 16.5,   // 🚨 MUST be a valid number! NEVER null! end > start!
      "duration": 4.0,
      "narration_kr": "경찰이 문을 열라는데 도대체 왜 이러는 걸까요?", // required for narration type
      "narration_jp": "警察がドアを開けろって言ってるのに、一体どうしたんでしょう？", // required for narration type
      "narration_pron": "케이사츠가 도아오 아케로떼 잇떼루노니, 잇따이 도-시탄데쇼-?", // required for narration type
      "original_transcript": "",
      "description": "Intro hook narration",
      "reason": "영상의 첫 부분에 시청자의 관심을 끌기 위한 강력한 훅 나레이션"
    },
    {
      "order": 2,
      "stage": "Body (Context)",
      "type": "original_clip",
      "start": 16.5,  // 🚨 Starts where Scene 1 ended! NO OVERLAP!
      "end": 21.4,    // 🚨 Different time range from Scene 1!
      "duration": 4.9,
      "text_kr": "창문 좀 열어주시겠습니까? 면허증 보여주세요.", // required for clip type
      "text_jp": "窓開けてもらえます？／免許証見せてください", // required for clip type (Use / for split)
      "text_pron": "마도 아케테 모라에마스? / 멘쿄쇼 미세테 쿠다사이", // required for clip type (Use / for split)
      "narration_kr": null,
      "narration_jp": null,
      "narration_pron": null,
      "original_transcript": "Can you roll down your window? License please.",
      "description": "Police asks driver",
      "reason": "실제 대화 장면을 삽입하여 현장감과 긴장감을 부여"
    }
    // ... more scenes (alternating narration/clip) ...
  ]
}
\`\`\`

**중요 지침:**
- 모든 장면(\`scenes\`)에는 반드시 \`"reason"\` 필드를 포함하여 이 장면이 왜 선택되었는지 한국어로 1문장 설명하세요.

**Transcript Data:**
${segmentsText.substring(0, 25000)} // Limit to fit context
`;

            const highlights = await geminiGenerateJSON(GEMINI_API_KEY, 'gemini-2.5-flash', [{ text: prompt }]);

            // Optimize timestamps (find silent split points)
            // Ideally we would do this, but for now we trust Gemini's timestamps or use specific helper
            // We can add refinement step here later

            res.json({
                success: true,
                directorPlan: highlights.scenes,
                viralTitle: highlights.viralTitle_kr,
                viralTitle_kr: highlights.viralTitle_kr,
                viralTitle_jp: highlights.viralTitle_jp,
                viralTitle_pron: highlights.viralTitle_pron,
                loopStrategy: highlights.loopStrategy,
                thumbnailText: highlights.thumbnailText,
                viralReason: highlights.viralReason,
                targetAudience: highlights.targetAudience,
                editorial_strategy: highlights.editorial_strategy,
                sourceInfo: 'YouTube Transcript',
                highlights
            });

        } catch (error) {
            console.error('[Highlights Error]', error);
            res.status(500).json({ error: error.message });
        }
    });

};

// Helper: Get Language Name
function getLanguageName(code) {
    const map = {
        'en': 'English',
        'ko': 'Korean',
        'ja': 'Japanese',
        'es': 'Spanish',
        'fr': 'French',
        'de': 'German',
        'zh': 'Chinese'
    };
    return map[code] || code;
}

// Helper: Format Timestamp
function formatTimestamp(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}
