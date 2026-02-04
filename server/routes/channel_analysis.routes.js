const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

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

    try {
        console.log(`[Channel Analyze] Starting deep analysis for: ${url}`);

        // A. Resolve Channel ID & Name using YouTube API (More Reliable)
        let channelId = '';
        let channelName = 'Unknown_Channel';
        let customUrl = '';

        // Extract handle or channel ID from URL
        if (url.includes('youtube.com/@')) {
            const handle = url.split('@')[1].split('/')[0];
            const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=@${handle}&type=channel&maxResults=1&key=${YOUTUBE_API_KEY}`;
            const searchRes = await fetch(searchUrl);
            const searchData = await searchRes.json();
            if (searchData.items && searchData.items.length > 0) {
                channelId = searchData.items[0].id.channelId;
                channelName = searchData.items[0].snippet.title;
            }
        } else if (url.includes('/channel/')) {
            channelId = url.split('/channel/')[1].split('/')[0];
        }

        // If we have an ID, fetch details to confirm name
        if (channelId) {
            const chanUrl = `https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${channelId}&key=${YOUTUBE_API_KEY}`;
            const chanRes = await fetch(chanUrl);
            const chanData = await chanRes.json();
            if (chanData.items && chanData.items.length > 0) {
                channelName = chanData.items[0].snippet.title;
                customUrl = chanData.items[0].snippet.customUrl;
            }
        }

        console.log(`[Channel Analyze] Target Channel: ${channelName} (${channelId})`);

        // B. Fetch Top Videos using YouTube API (Reliable)
        // We use 'search' endpoint with order=viewCount to get popular videos
        // If channelId is found, use it. If not, fallback to yt-dlp (but user asked to remove it if possible, however search needs channelId)

        let videos = [];
        const limitStr = req.body.limit;
        const limit = parseInt(limitStr) || 5;
        console.log(`[Channel Analyze] Requested Limit: ${limitStr}, Parsed Limit: ${limit}`);

        if (channelId) {
            // Hard Cap: Ensure limit never exceeds 15 to prevent accidental credit usage
            const safeLimit = Math.min(limit, 15);
            console.log(`[Channel Analyze] Final Safe Limit: ${safeLimit} (Requested: ${limit})`);

            const videosUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&maxResults=${safeLimit}&order=viewCount&type=video&key=${YOUTUBE_API_KEY}`;
            console.log(`[Channel Analyze] API Call: ${videosUrl.replace(YOUTUBE_API_KEY, 'API_KEY_HIDDEN')}`);

            const videosRes = await fetch(videosUrl);
            const videosData = await videosRes.json();

            if (videosData.items) {
                videos = videosData.items.map(item => ({
                    id: item.id.videoId,
                    title: item.snippet.title,
                    url: `https://www.youtube.com/watch?v=${item.id.videoId}`
                }));
            }

            // SUPER SAFETY: Explicitly slice the video list to the safe limit
            // YouTube API might be ignoring maxResults or returning more items for some reason
            if (videos.length > safeLimit) {
                console.warn(`[Channel Analyze] API returned ${videos.length} videos, but safety limit is ${safeLimit}. Truncating...`);
                videos = videos.slice(0, safeLimit);
            }
        } else {
            console.warn('[Channel Analyze] Could not resolve Channel ID via API. Falling back to simple yt-dlp for list (if available)...');
            // Fallback (User said yt-dlp is bad, but if we can't find channel ID, we have no choice for YouTube API)
            // But let's assume API works if key is valid.
            throw new Error('Could not resolve Channel ID from URL. Please ensure the URL is valid.');
        }

        if (videos.length === 0) throw new Error('No videos found for this channel.');
        console.log(`[Channel Analyze] Found ${videos.length} videos to analyze.`);


        // C. Fetch Transcripts using Apify (pintostudio/youtube-transcript-scraper)
        // Note: The actor 'pintostudio/youtube-transcript-scraper' seems to require 'videoUrl' (singular) based on error logs.
        // We will run in parallel for the requested videos.
        console.log('[Channel Analyze] Fetching transcripts via Apify (Parallel)...');

        const { ApifyClient } = require('apify-client');
        const client = new ApifyClient({ token: APIFY_TOKEN });

        const transcripts = [];

        // Function to fetch a single transcript
        const fetchTranscript = async (video) => {
            try {
                const runInput = {
                    videoUrl: video.url, // Correct field name based on error: 'Field input.videoUrl is required'
                    preferredLanguage: "ko"
                };

                const run = await client.actor("pintostudio/youtube-transcript-scraper").call(runInput);
                const { items } = await client.dataset(run.defaultDatasetId).listItems();

                if (items && items.length > 0) {
                    const item = items[0];
                    let fullText = "";
                    let fragments = [];

                    // Case 1: Direct 'text' field
                    if (item.text) {
                        fullText = item.text;
                    }
                    // Case 2: 'data' array of captions (start, dur, text)
                    else if (Array.isArray(item.data)) {
                        fragments = item.data;
                        fullText = fragments.map(c => c.text).join(" ");
                    }
                    // Case 3: 'captions' array or similar (fallback check)
                    else if (Array.isArray(item.captions)) {
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
                    } else {
                        console.warn(`[Apify Warning] Item found but no text extracted. Keys: ${Object.keys(item).join(', ')}`);
                    }
                }
                return { success: false, video: video };
            } catch (e) {
                console.error(`[Apify Error] Failed for ${video.title}:`, e.message);
                return { success: false, video: video };
            }
        };

        // Run in batches to avoid Apify memory limits (Limit to 1 concurrent request due to heavy actor usage 4GB/run)
        const BATCH_SIZE = 1;
        const results = [];

        for (let i = 0; i < videos.length; i += BATCH_SIZE) {
            const batch = videos.slice(i, i + BATCH_SIZE);
            console.log(`[Channel Analyze] Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(videos.length / BATCH_SIZE)} (${batch.length} videos)...`);

            const batchResults = await Promise.all(batch.map(v => fetchTranscript(v)));
            results.push(...batchResults);
        }

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

                saveTranscript(category, channelName, res.video.title, transcriptText, finalCountry);

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
        
        Task: Extract the creator's specific style, tone, viral patterns.
        Since we skipped audio analysis, focus heavily on the text content, pacing, and structure inferred from the transcript.
        
        Output JSON Format:
        {
            "tone": "Keywords like High-Tension, Calm, Sarcastic, etc. (with Korean translation)",
            "hook_style": "How they usually start videos (e.g., Starts with a scream) (with Korean translation)",
            "catchphrases": ["List", "of", "recurring", "phrases"],
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

module.exports = router;
