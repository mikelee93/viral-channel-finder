const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const OpenAI = require('openai'); // Added for Whisper

// Define directory for storing transcripts
const TRANSCRIPTS_DIR = path.join(__dirname, '../../transcripts');
if (!fs.existsSync(TRANSCRIPTS_DIR)) {
    fs.mkdirSync(TRANSCRIPTS_DIR, { recursive: true });
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const ytDlp = require('yt-dlp-exec'); // For audio download

// Helper: Sanitize filename
function sanitizeFilename(name) {
    return name.replace(/[^a-z0-9가-힣ㄱ-ㅎㅏ-ㅣ\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\s\-_]/gi, '').replace(/\s+/g, '_').substring(0, 50);
}

// Helper: Save Transcript and Sync to Git with Country Separation
function saveTranscript(category, channelName, videoTitle, content, countryCode = 'KR') {
    try {
        // 1. Define paths with Country Code
        // Structure: transcripts/{Country}/{Category}/{ChannelName}/...
        const baseDir = path.join(__dirname, '../../transcripts');
        const countryDir = path.join(baseDir, countryCode);
        const catDir = path.join(countryDir, sanitizeFilename(category || 'General'));
        const chanDir = path.join(catDir, sanitizeFilename(channelName || 'Unknown'));

        // 2. Create directories recursively
        if (!fs.existsSync(chanDir)) {
            fs.mkdirSync(chanDir, { recursive: true });
        }

        // 3. Write file
        const filename = `${sanitizeFilename(videoTitle)}.txt`;
        const filePath = path.join(chanDir, filename);

        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`[Archive] Saved to ${countryCode}: ${filePath}`);

        // 4. Git Sync (Queued)
        const relativePath = `transcripts/${countryCode}/${sanitizeFilename(category || 'General')}/${sanitizeFilename(channelName || 'Unknown')}/${filename}`;

        // Command: git add -> commit -> push
        // Updated commit message to include Country/Category info
        const gitCmd = `git add "${relativePath}" && git commit -m "[${countryCode}/${sanitizeFilename(category || 'General')}] Add transcript: ${videoTitle}" && git push origin master`;

        // Push to queue
        queueGitCommand(gitCmd);

    } catch (e) {
        console.error('[Archive Error]', e.message);
    }
}
const util = require('util');
const execPromise = util.promisify(exec);
const { geminiGenerateJSON } = require('../utils/gemini.util');
const os = require('os');

// Database File Path
const DB_PATH = path.join(__dirname, '../../channel_personas.json');

// Global Git Queue to prevent lock errors (Sequential Execution)
let gitQueue = Promise.resolve();

function queueGitCommand(cmd) {
    // Chain the command to the existing queue
    gitQueue = gitQueue.then(async () => {
        try {
            const { stdout, stderr } = await execPromise(cmd);
            console.log('[Git Sync Success]', stdout.trim());
        } catch (err) {
            // Log but don't stop the queue
            console.error('[Git Sync Error]', err.message);
        }
    });
}

// Ensure DB file exists
if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify([], null, 2));
}

// Helper: Read DB
function getPersonas() {
    try {
        const data = fs.readFileSync(DB_PATH, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        return [];
    }
}

// Helper: Write DB
function savePersonas(personas) {
    fs.writeFileSync(DB_PATH, JSON.stringify(personas, null, 2));

    // Git Sync (Automatic)
    const gitCmd = `git add "channel_personas.json" && git commit -m "[Persona Lab] Sync style personas" && git push origin master`;
    queueGitCommand(gitCmd);
}

// 1. GET /list - Get all personas
router.get('/list', (req, res) => {
    const personas = getPersonas();
    res.json({ success: true, data: personas });
});

// 2. POST /info - Get Basic Channel Info (Quick Check)
router.post('/info', async (req, res) => {
    const { url } = req.body;
    const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

    if (!url) return res.status(400).json({ error: 'URL required' });
    if (!YOUTUBE_API_KEY) return res.status(500).json({ error: 'YOUTUBE_API_KEY missing' });

    try {
        console.log(`[Channel Info] Fetching: ${url}`);
        let channelId = '';

        // 1. Resolve Channel ID
        if (url.includes('youtube.com/@')) {
            const handlePart = url.split('@')[1];
            const handle = handlePart.split('/')[0]; // Clean handle
            // Search for channel by handle
            const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=@${handle}&type=channel&maxResults=1&key=${YOUTUBE_API_KEY}`;
            const searchRes = await fetch(searchUrl);
            const searchData = await searchRes.json();

            if (!searchData.items || searchData.items.length === 0) {
                return res.status(404).json({ error: 'Channel not found via handle search' });
            }
            channelId = searchData.items[0].id.channelId;
        } else if (url.includes('/channel/')) {
            const parts = url.split('/channel/');
            channelId = parts[1].split('/')[0];
        } else {
            // Try searching directly with the URL query if format is unknown
            const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(url)}&type=channel&maxResults=1&key=${YOUTUBE_API_KEY}`;
            const searchRes = await fetch(searchUrl);
            const searchData = await searchRes.json();

            if (!searchData.items || searchData.items.length === 0) {
                return res.status(400).json({ error: 'Could not resolve Channel ID from URL' });
            }
            channelId = searchData.items[0].id.channelId;
        }

        // 2. Fetch Channel Details (Snippet + Statistics)
        const chanUrl = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${channelId}&key=${YOUTUBE_API_KEY}`;
        const chanRes = await fetch(chanUrl);
        const chanData = await chanRes.json();

        if (!chanData.items || chanData.items.length === 0) {
            return res.status(404).json({ error: 'Channel details not found' });
        }

        const info = chanData.items[0];

        res.json({
            success: true,
            data: {
                name: info.snippet.title,
                subscribers: info.statistics.subscriberCount,
                handle: info.snippet.customUrl || '',
                url: `https://www.youtube.com/channel/${channelId}`,
                originalCategory: 'Unknown', // API doesn't easily give channel category, usually strictly video based. defaults fine.
                thumbnail: info.snippet.thumbnails?.default?.url
            }
        });

    } catch (error) {
        console.error('[Channel Info Error]', error);
        res.status(500).json({ error: 'Failed to fetch channel info via API: ' + error.message });
    }
});

// 3. POST /analyze - Deep Analysis (Transcript -> Persona)
router.post('/analyze', async (req, res) => {
    // Added country parameter for manual override
    const { url, category, country } = req.body;
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    const APIFY_TOKEN = process.env.APIFY_TOKEN;
    const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

    if (!url) return res.status(400).json({ error: 'URL required' });
    if (!GEMINI_API_KEY) return res.status(500).json({ error: 'GEMINI_API_KEY missing' });
    if (!APIFY_TOKEN) return res.status(500).json({ error: 'APIFY_TOKEN missing' });

    // Helper: Extract Channel ID from URL (Robust)
    async function extractChannelId(url) {
        if (!url) return null;

        // 1. Direct Channel ID
        if (url.includes('/channel/')) {
            const parts = url.split('/channel/');
            console.log(`[Channel Analyze] Direct Channel ID found: ${parts[1].split('/')[0].split('?')[0]}`);
            return parts[1].split('/')[0].split('?')[0];
        }

        // 2. Handle /@username/shorts or /@username
        if (url.includes('/@')) {
            const handle = url.split('/@')[1].split('/')[0].split('?')[0];
            console.log(`[Channel Analyze] Resolving handle: @${handle}`);
            // Need to call API to resolve handle to ID
            try {
                const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=@${handle}&type=channel&key=${YOUTUBE_API_KEY}`;
                const res = await fetch(searchUrl);
                const data = await res.json();
                if (data.items && data.items.length > 0) {
                    console.log(`[Channel Analyze] Handle @${handle} resolved to ID: ${data.items[0].id.channelId}`);
                    return data.items[0].id.channelId;
                }
            } catch (e) {
                console.error('[Channel Analyze] Handle resolution failed:', e);
            }
        }

        // 3. Fallback: Search by channel name extracted from URL (e.g. youtube.com/c/Name)
        // Simplified regex for user/c/custom
        const match = url.match(/youtube\.com\/(?:c\/|user\/|@)([^\/\?]+)/);
        if (match && match[1]) {
            const name = match[1];
            console.log(`[Channel Analyze] Resolving name: ${name}`);
            try {
                const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${name}&type=channel&key=${YOUTUBE_API_KEY}`;
                const res = await fetch(searchUrl);
                const data = await res.json();
                if (data.items && data.items.length > 0) {
                    console.log(`[Channel Analyze] Name ${name} resolved to ID: ${data.items[0].id.channelId}`);
                    return data.items[0].id.channelId;
                }
            } catch (e) {
                console.error('[Channel Analyze] Name resolution failed:', e);
            }
        }

        console.log(`[Channel Analyze] Could not extract channel ID from URL: ${url}`);
        return null;
    }

    try {
        console.log(`[Channel Analyze] Starting deep analysis for: ${url}`);

        // Helper: Ensure channelInfo is defined in scope
        let channelId = await extractChannelId(url);
        let channelName = 'Unknown Channel';
        let customUrl = '';
        let channelInfo = {
            title: 'Unknown Channel',
            description: '',
            customUrl: '',
            thumbnail: '',
            country: 'KR',
            category: category,
            url: url
        };

        if (channelId) {
            console.log(`[Channel Analyze] Resolved Channel ID: ${channelId}`);

            try {
                const chanUrl = `https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${channelId}&key=${YOUTUBE_API_KEY}`;
                const chanRes = await fetch(chanUrl);
                const chanData = await chanRes.json();

                if (chanData.items && chanData.items.length > 0) {
                    const snippet = chanData.items[0].snippet;
                    channelName = snippet.title;
                    customUrl = snippet.customUrl || '';

                    channelInfo = {
                        title: snippet.title,
                        description: snippet.description,
                        customUrl: snippet.customUrl || '',
                        thumbnail: snippet.thumbnails?.default?.url || '',
                        country: snippet.country || 'KR', // Fallback to KR if missing
                        category: category,
                        url: url
                    };
                }
            } catch (err) {
                console.warn('[Channel Analyze] Channel details fetch failed:', err);
            }
        } else {
            console.error('[Channel Analyze] FAILED to extract Channel ID from URL:', url);
            return res.status(400).json({ error: 'Could not resolve Channel ID from URL.' });
        }
        console.log(`[Channel Analyze] Target Channel: ${channelName} (${channelId})`);

        // B. Fetch Top Videos using YouTube API (Reliable)
        // We use 'search' endpoint with order=viewCount to get popular videos
        // If channelId is found, use it. If not, fallback to yt-dlp (but user asked to remove it if possible, however search needs channelId)

        let videos = [];
        const limitStr = req.body.limit;
        let limit = 5;
        let useAllLocalFiles = false;

        if (limitStr === 'all') {
            useAllLocalFiles = true;
            limit = 1000; // Set high limit for safety
            console.log(`[Channel Analyze] Mode: ALL LOCAL FILES (Using saved transcripts)`);
        } else {
            limit = parseInt(limitStr) || 5;
            console.log(`[Channel Analyze] Requested Limit: ${limitStr}, Parsed Limit: ${limit}`);
        }

        // SPECIAL LOGIC: If 'all', try to load from local transcripts first
        if (useAllLocalFiles) {
            console.log(`[Channel Analyze] Searching for local transcripts for: ${channelInfo.title}`);

            const baseDir = path.join(__dirname, '../../transcripts');
            let targetDir = null;

            // 0. Use Custom Path if provided (User Override)
            const { customFolderPath } = req.body;
            if (customFolderPath && customFolderPath.trim() !== '') {
                console.log(`[Channel Analyze] User provided custom folder: ${customFolderPath}`);
                if (fs.existsSync(customFolderPath)) {
                    targetDir = customFolderPath;
                } else {
                    console.warn(`[Channel Analyze] Custom folder does not exist: ${customFolderPath}`);
                }
            }

            // 1. Try rigid path first (Optimization) if no custom path or custom path failed
            if (!targetDir) {
                const rigidPath = path.join(baseDir, channelInfo.country || 'KR', sanitizeFilename(channelInfo.category || 'entertainment'), sanitizeFilename(channelInfo.title));
                if (fs.existsSync(rigidPath)) {
                    targetDir = rigidPath;
                } else {
                    // 2. Search recursively in baseDir (Depth 2: Country -> Category -> Channel)
                    console.log('[Channel Analyze] Rigid path not found. Scanning directories...');
                    try {
                        const countries = ['KR', 'JP']; // Prioritize main countries
                        for (const country of countries) {
                            const countryPath = path.join(baseDir, country);
                            if (fs.existsSync(countryPath)) {
                                const categories = fs.readdirSync(countryPath);
                                for (const cat of categories) {
                                    const catPath = path.join(countryPath, cat);
                                    // Check if it is a directory
                                    if (fs.statSync(catPath).isDirectory()) {
                                        // Check if channel exists here (Exact match or specialized match)
                                        // We check for sanitizeFilename(channelInfo.title)
                                        const targetName = sanitizeFilename(channelInfo.title);
                                        const channelPath = path.join(catPath, targetName);

                                        if (fs.existsSync(channelPath)) {
                                            targetDir = channelPath;
                                            break;
                                        }
                                    }
                                }
                            }
                            if (targetDir) break;
                        }
                    } catch (e) {
                        console.error('[Channel Analyze] Error scanning directories:', e);
                    }
                }

            } // Close if (!targetDir)

            if (targetDir && fs.existsSync(targetDir)) {
                console.log(`[Channel Analyze] Found local dir: ${targetDir}`);
                const files = fs.readdirSync(targetDir).filter(f => f.endsWith('.txt'));

                if (files.length > 0) {
                    console.log(`[Channel Analyze] Found ${files.length} local transcripts.`);
                    const fs = require('fs');
                    const localResults = files.map(file => {
                        const content = fs.readFileSync(path.join(targetDir, file), 'utf8');
                        return {
                            success: true,
                            video: {
                                id: 'local_file',
                                title: file.replace('.txt', ''),
                                url: 'local_file'
                            },
                            text: content,
                            fragments: []
                        };
                    });
                    req.localResults = localResults;
                } else {
                    console.warn('[Channel Analyze] Directory exists but no .txt files found.');
                    useAllLocalFiles = false;
                }
            } else {
                console.warn(`[Channel Analyze] Local directory for '${channelInfo.title}' NOT FOUND in KR or JP.`);
                useAllLocalFiles = false;
                limit = 50;
            }
        }

        if (!useAllLocalFiles) {
            if (channelId) {
                // SUPER SAFETY & DIVERSITY: Fetch more videos (e.g., 3x limit) then randomize selection
                const fetchLimit = Math.min(limit * 3, 50); // Get more candidates
                // Updated to 'viewCount' for most popular viral videos
                const videosUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&maxResults=${fetchLimit}&order=viewCount&type=video&key=${YOUTUBE_API_KEY}`;
                console.log(`[Channel Analyze] API Call (ORDER=VIEWCOUNT for viral dna): ${videosUrl.replace(YOUTUBE_API_KEY, 'API_KEY_HIDDEN')}`);

                const videosRes = await fetch(videosUrl);
                const videosData = await videosRes.json();

                if (videosData.items) {
                    // Shuffle array to get random diverse set
                    const shuffled = videosData.items.sort(() => 0.5 - Math.random());

                    // Take requested limit
                    videos = shuffled.slice(0, limit).map(item => ({
                        id: item.id.videoId,
                        title: item.snippet.title,
                        url: `https://www.youtube.com/watch?v=${item.id.videoId}`
                    }));
                }
            } else {
                console.warn('[Channel Analyze] Could not resolve Channel ID via API. Falling back to simple yt-dlp for list (if available)...');
                // Fallback (User said yt-dlp is bad, but if we can't find channel ID, we have no choice for YouTube API)
                // But let's assume API works if key is valid.
                throw new Error('Could not resolve Channel ID from URL. Please ensure the URL is valid.');
            }

            if (videos.length === 0) throw new Error('No videos found for this channel.');
            console.log(`[Channel Analyze] Found ${videos.length} videos to analyze.`);
        }



        // C. Fetch Transcripts
        let results = [];
        if (req.localResults) {
            console.log('[Channel Analyze] Using LOCALLY LOADED transcripts (Skip Download/Transcribe)');
            results = req.localResults;
        }

        // Only fetch if no local results
        if (results.length === 0) {
            const transcripts = []; // Definition restored
            const transcriptSource = req.body.transcriptSource || 'apify';
            console.log(`[Channel Analyze] Transcript Source: ${transcriptSource}`);


            if (transcriptSource === 'whisper') {
                console.log('[Channel Analyze] Using Whisper API (high quality, paid)...');
                const tempDir = path.join(__dirname, '../../temp_audio');
                if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

                for (const video of videos) {
                    try {
                        console.log(`[Whisper] Processing: ${video.title}`);
                        const audioPath = path.join(tempDir, `${video.id}.mp3`);

                        // 1. Download Audio if not exists
                        if (!fs.existsSync(audioPath)) {
                            console.log(`[Whisper] Downloading audio...`);
                            await ytDlp(video.url, {
                                extractAudio: true,
                                audioFormat: 'mp3',
                                output: audioPath,
                                noPlaylist: true,
                                // quiet: true
                            });
                        }

                        // 2. Transcribe with multilingual hint (Strengthened Prompt)
                        console.log(`[Whisper] Transcribing with ENHDANCED multilingual detection...`);
                        const transcription = await openai.audio.transcriptions.create({
                            file: fs.createReadStream(audioPath),
                            model: "whisper-1",
                            response_format: "verbose_json",
                            timestamp_granularities: ["segment"],
                            prompt: "This audio is a viral video containing a mix of fast Korean narration and short English exclamations (e.g., 'Oh my god', 'No way', 'Yeah', 'What?'). Please transcribe EVERYTHING exactly as spoken, including these short English phrases and reactions. Do not filter them out."
                        });

                        const fullText = transcription.text;
                        const segments = transcription.segments || [];

                        // Preserve full timeline data (start, end, text) for better AI analysis
                        results.push({
                            success: true,
                            video: video,
                            text: fullText,
                            fragments: segments.map(s => ({
                                start: s.start,
                                end: s.end,
                                dur: s.end - s.start,
                                text: s.text
                            }))
                        });

                        console.log(`[Whisper] ✅ Success: ${segments.length} segments extracted`);

                        // Cleanup audio to save space? (Optional, maybe keep for cache if needed later)
                        // fs.unlinkSync(audioPath); 

                    } catch (e) {
                        console.error(`[Whisper Error] Failed for ${video.title}:`, e.message);
                        results.push({ success: false, video: video });
                    }
                }

            } else {
                // APIFY Logic (Default)
                console.log('[Channel Analyze] Fetching transcripts via Apify (Parallel)...');

                const { ApifyClient } = require('apify-client');
                const client = new ApifyClient({ token: APIFY_TOKEN });

                // Function to fetch a single transcript
                const fetchTranscript = async (video) => {
                    try {
                        const runInput = {
                            videoUrl: video.url,
                            preferredLanguage: "ko"
                        };

                        const run = await client.actor("pintostudio/youtube-transcript-scraper").call(runInput);
                        const { items } = await client.dataset(run.defaultDatasetId).listItems();

                        if (items && items.length > 0) {
                            const item = items[0];
                            let fullText = "";
                            let fragments = [];

                            if (item.text) {
                                fullText = item.text;
                            } else if (Array.isArray(item.data)) {
                                fragments = item.data;
                                fullText = fragments.map(c => c.text).join(" ");
                            } else if (Array.isArray(item.captions)) {
                                fragments = item.captions;
                                fullText = fragments.map(c => c.text).join(" ");
                            }

                            if (fullText) {
                                return {
                                    success: true,
                                    video: video,
                                    text: fullText,
                                    fragments: fragments
                                };
                            }
                        }
                        return { success: false, video: video };
                    } catch (e) {
                        console.error(`[Apify Error] Failed for ${video.title}:`, e.message);
                        return { success: false, video: video };
                    }
                };

                // Run in batches
                const BATCH_SIZE = 1;
                for (let i = 0; i < videos.length; i += BATCH_SIZE) {
                    const batch = videos.slice(i, i + BATCH_SIZE);
                    console.log(`[Channel Analyze] Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(videos.length / BATCH_SIZE)} (${batch.length} videos)...`);

                    const batchResults = await Promise.all(batch.map(v => fetchTranscript(v)));
                    results.push(...batchResults);
                }
            }

            // Process results and Save to Git
            // Helper to format seconds to MM:SS
            const formatTime = (seconds) => {
                const m = Math.floor(seconds / 60);
                const s = Math.floor(seconds % 60);
                return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
            };

            for (const result of results) {
                if (result.success && result.video && result.fragments) {
                    const safeTitle = sanitizeFilename(result.video.title);
                    const subDir = path.join(TRANSCRIPTS_DIR, channelInfo.country, channelInfo.category, sanitizeFilename(channelInfo.title));

                    if (!fs.existsSync(subDir)) {
                        fs.mkdirSync(subDir, { recursive: true });
                    }

                    const filePath = path.join(subDir, `${safeTitle}.txt`);

                    // --- Timeline-based Formatting with Gap Detection ---
                    let formattedText = "";
                    let lastEnd = 0;

                    // Sort fragments just in case
                    const sortedFragments = result.fragments.sort((a, b) => a.start - b.start);

                    for (const frag of sortedFragments) {
                        // Check for significant gap (> 1.5 sec)
                        if (frag.start - lastEnd > 1.5) {
                            formattedText += `[${formatTime(lastEnd)} - ${formatTime(frag.start)}] (Audio Gap / Potential Dialogue or SFX)\n`;
                        }

                        // Add segment text
                        // Use end time if available (Whisper usually provides it), otherwise estimate or omit
                        const endTime = frag.end ? formatTime(frag.end) : formatTime(frag.start + (frag.dur || 3));
                        formattedText += `[${formatTime(frag.start)} - ${endTime}] ${frag.text}\n`;

                        lastEnd = frag.end || (frag.start + (frag.dur || 0));
                    }

                    // Append full text summary at the bottom for quick reading
                    formattedText += `\n--- Full Text Summary ---\n${result.text}`;

                    fs.writeFileSync(filePath, formattedText, 'utf8');
                    console.log(`[Channel Analyze] Saved transcript: ${filePath}`);
                }
            }
        } // Close 'if (results.length === 0)' block

        // Initialize transcripts array
        let transcripts = [];

        // Process results
        for (const res of results) {
            if (res.success) {
                const transcriptText = res.text;

                // Detect Language/Country from text content if not provided
                let detectedCountry = 'KR'; // Default
                const jpRegex = /[\u3040-\u309F\u30A0-\u30FF]/;
                if (jpRegex.test(transcriptText)) {
                    detectedCountry = 'JP';
                }

                const finalCountry = country || detectedCountry;

                // saveTranscript(category, channelName, res.video.title, transcriptText, finalCountry); // DISABLED: Overwrites detailed transcript

                // Format Transcript with Timestamps for Analysis (Viral Director Mode)
                let analyzedText = transcriptText;
                if (res.fragments && res.fragments.length > 0) {
                    analyzedText = res.fragments.map(f => `[${parseFloat(f.start).toFixed(1)}s] ${f.text}`).join("\n");
                }

                transcripts.push(`Title: ${res.video.title}\nTranscript (Timestamped):\n${analyzedText.substring(0, 5000)}...`);
            } else {
                console.warn(`[Apify] No transcript found for ${res.video.title}`);
                transcripts.push(`Title: ${res.video.title}\n(No Transcript Found)`);
            }
        }

        const combinedData = transcripts.join('\n\n---\n\n');

        // Use detected country from first successful transcript if not provided
        let overallCountry = country || 'KR';
        const firstSuccess = results.find(r => r.success && r.text);
        if (!country && firstSuccess) {
            const jpRegex = /[\u3040-\u309F\u30A0-\u30FF]/;
            if (jpRegex.test(firstSuccess.text)) {
                overallCountry = 'JP';
            }
        }

        const analysisCountry = overallCountry;

        // D. Generate Viral Persona (Gemini)
        // Removed Audio Analysis as requested
        const promptText = `
        Analyze these video transcripts from the YouTube channel "${channelName}" to create a "Viral Persona Profile".
        
        Target Category: ${category || 'General'}
        Target Country: ${analysisCountry} 
        
        Input Data (Top ${videos.length} Popular Videos):
        ${combinedData}
        
        Task: Extract the creator's specific style, tone, viral patterns, AND vocabulary/linguistic patterns.
        Since we skipped audio analysis, focus heavily on the text content, pacing, structure, and LANGUAGE PATTERNS.
        
        CRITICAL: Pay special attention to:
        1. **Vocabulary Patterns**: What specific words, adjectives, verbs do they use repeatedly?
        2. **Sentence Structure**: Are sentences short and punchy? Long and flowing? Mix of both?
        3. **Transition Phrases**: How do they connect ideas? (e.g., "그런데", "하지만", "여기서")
        4. **Catchphrases**: Exact recurring phrases that define their voice
        5. **Ending Patterns**: How do they typically conclude videos? (Questions, CTAs, cliffhangers)
        
        Output JSON Format:
        {
            "tone": "Keywords like High-Tension, Calm, Sarcastic, etc. (with Korean translation)",
            "hook_style": "How they usually start videos (e.g., Starts with a scream) (with Korean translation)",
            "catchphrases": ["Exact recurring phrases they use", "Another signature phrase", "etc."],
            "vocabulary_patterns": {
                "adjectives": ["specific adjectives they favor"],
                "verbs": ["common action verbs"],
                "signature_expressions": ["unique phrases or idioms"]
            },
            "sentence_structure": "Short punchy sentences / Long flowing narration / Dynamic mix (Provide detailed description)",
            "transition_phrases": ["그런데", "하지만", "여기서", "etc."],
            "pacing": "Fast/Slow/Dynamic (Inferred from text density)",
            "structure_template": [
                { "time": "0-5s", "type": "Hook", "description": "Description of content in English (Korean translation)" },
                { "time": "5-15s", "type": "Body", "description": "..." }
            ],
            "director_rules": [
                "Rule 1 in English (Rule 1 in Korean)",
                "Rule 2 in English (Rule 2 in Korean)"
            ],
            "humor_code": "Description of their humor (e.g., Puns, Slapstick, Dry wit)",
            "audio_style": {
               "bgm": "Not Analyzed (Inferred: Energetic/Calm based on text)",
               "sfx": "Not Analyzed",
               "density": "Not Analyzed"
            },
            "summary": "A 1-sentence summary of this persona in English, followed by a Korean translation.",
            "prompt_instruction": "A specific instruction to give an AI to mimic this person."
        }
        `;

        const analysis = await geminiGenerateJSON(GEMINI_API_KEY, 'gemini-2.0-flash', [{ text: promptText }]);

        res.json({ success: true, analysis });

    } catch (error) {
        console.error('[Channel Analyze Error]', error);
        res.status(500).json({ error: error.message });
    }
});

// 4. POST /save - Save Persona (Upsert)
router.post('/save', (req, res) => {
    const { name, url, category, analysis, sourceCount } = req.body;

    if (!name || !analysis) return res.status(400).json({ error: 'Missing data' });

    let personas = getPersonas();

    // Check if exists (by URL)
    const existingIndex = personas.findIndex(p => p.url === url);

    let savedPersona;

    if (existingIndex !== -1) {
        // Update existing
        const existing = personas[existingIndex];
        savedPersona = {
            ...existing,
            name: name, // Update name just in case
            category: category,
            analysis: Array.isArray(analysis) ? analysis[0] : analysis,
            sourceCount: sourceCount || existing.sourceCount || 5, // Default to 5 if missing
            updatedAt: new Date().toISOString()
        };
        personas[existingIndex] = savedPersona;
        console.log(`[Persona Save] Updated existing persona: ${name}`);
    } else {
        // Create new
        savedPersona = {
            id: Date.now().toString(),
            name,
            url,
            category,
            analysis: Array.isArray(analysis) ? analysis[0] : analysis,
            sourceCount: sourceCount || 5, // Default to 5
            createdAt: new Date().toISOString()
        };
        personas.push(savedPersona);
        console.log(`[Persona Save] Created new persona: ${name}`);
    }

    savePersonas(personas);

    res.json({ success: true, data: savedPersona });
});

// 5. POST /delete - Delete Persona
router.post('/delete', (req, res) => {
    const { id } = req.body;
    let personas = getPersonas();
    const initialLen = personas.length;
    personas = personas.filter(p => p.id !== id);

    if (personas.length === initialLen) return res.status(404).json({ error: 'Not found' });

    savePersonas(personas);
    res.json({ success: true });
});

// 6. POST /director/generate - Generate Script using DNA
router.post('/director/generate', async (req, res) => {
    try {
        const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
        const { topic, structure_template, director_rules, tone } = req.body;

        if (!topic || !structure_template) {
            return res.status(400).json({ error: 'Missing topic or structure template' });
        }

        const promptText = `
        You are a "Viral Director" AI. Your goal is to write a script for a new video that perfectly mimics the pacing and structure of a specific viral channel.
        
        Topic: "${topic}"
        Tone: ${tone || 'Engaging'}
        
        You must follow this EXACT Structural Template (DNA):
        ${JSON.stringify(structure_template, null, 2)}
        
        Apply these Director Rules:
        ${(Array.isArray(director_rules) && director_rules.length > 0) ? director_rules.join('\n') : 'No specific rules'}
        
        Task:
        1. Write the script content for each time block.
        2. Ensure the text length fits the time duration (approx 4 chars/sec for fast, 2 for slow).
        3. Insert [Visual Guide] and [Audio/SFX Guide] for the editor.
        4. IMPORTANT: Write the 'content' (spoken script) in KOREAN (unless the topic implies English).
        5. Write 'visual_cue' and 'audio_cue' in KOREAN for the Korean editor.
        
        Output JSON Format:
        {
            "script": [
                {
                    "time": "0-5s",
                    "type": "Hook",
                    "content": "Actual spoken text (Korean)...",
                    "visual_cue": "Description of visuals (Korean) (e.g. 얼굴 줌인)",
                    "audio_cue": "SFX/BGM (Korean) (e.g. 쾅 소리, 빠른 드럼)"
                }
            ]
        }
        `;

        const result = await geminiGenerateJSON(GEMINI_API_KEY, 'gemini-2.0-flash', [{ text: promptText }]);
        res.json({ success: true, script: result.script || result }); // Handle simple array return if Gemini simplifies

    } catch (error) {
        console.error('[Director Generate Error]', error);
        res.status(500).json({ error: error.message });
    }
});

// 7. POST /director/recommend - Recommend Topics
router.post('/director/recommend', async (req, res) => {
    try {
        const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
        const { channelName, summary, category, tone, rules } = req.body;

        const promptText = `
        You are a "Viral Strategy Consultant".
        Based on the DNA of the YouTube channel "${channelName}", suggest 3 "Killer Topics" that would go viral.

        Channel DNA:
        - Category: ${category}
        - Summary: ${summary}
        - Tone: ${tone}
        - Rules: ${rules ? rules.join(', ') : 'None'}

        Task:
        Suggest 3 topics that fit this style perfectly.
        1. "Perfect Fit": A topic safely within their usual niche.
        2. "Twist / Variant": A common topic but applied with their unique twist.
        3. "Trend Jacking": A currently trending topic applied to their style.

        Output JSON Format (Korean):
        {
            "recommendations": [
                {
                    "type": "스타일 맞춤형 (Perfect Fit)",
                    "topic": "Suggested Topic Title (Korean)",
                    "reason": "Why this fits (Korean)",
                    "tone": "Suggested Tone"
                },
                ...
            ]
        }
        `;

        const result = await geminiGenerateJSON(GEMINI_API_KEY, 'gemini-2.0-flash', [{ text: promptText }]);
        res.json({ success: true, recommendations: result.recommendations });

    } catch (error) {
        console.error('[Director Recommend Error]', error);
        res.status(500).json({ error: error.message });
    }
});

// 8. POST /util/pick-folder - Open Windows Folder Picker
router.post('/util/pick-folder', async (req, res) => {
    const { exec } = require('child_process');
    // Set PowerShell output encoding to UTF8 to support Korean characters
    const psCommand = `powershell -Command "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.FolderBrowserDialog; $f.ShowDialog() | Out-Null; $f.SelectedPath"`;

    exec(psCommand, { encoding: 'utf8' }, (error, stdout, stderr) => {
        if (error) {
            console.error('[Folder Picker Error]', error);
            return res.status(500).json({ error: 'Failed to open folder picker' });
        }
        const path = stdout.trim();
        if (path) {
            res.json({ success: true, path: path });
        } else {
            res.json({ success: false, path: null }); // Cancelled
        }
    });
});

module.exports = router;
