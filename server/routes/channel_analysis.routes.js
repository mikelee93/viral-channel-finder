const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

// Helper: Sanitize filename
function sanitizeFilename(name) {
    // Allow Korean, Japanese (Hiragana, Katakana, Kanji), English, Numbers, Spaces, -, _
    return name.replace(/[^a-z0-9가-힣ㄱ-ㅎㅏ-ㅣ\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\s\-_]/gi, '').replace(/\s+/g, '_').substring(0, 50);
}

// Helper: Save Transcript and Sync to Git
function saveTranscript(category, channelName, videoTitle, content) {
    try {
        // 1. Define paths
        const baseDir = path.join(__dirname, '../../transcripts'); // root/transcripts
        const catDir = path.join(baseDir, sanitizeFilename(category || 'General'));
        const chanDir = path.join(catDir, sanitizeFilename(channelName || 'Unknown'));

        // 2. Create directories recursively
        if (!fs.existsSync(chanDir)) {
            fs.mkdirSync(chanDir, { recursive: true });
        }

        // 3. Write file
        const filename = `${sanitizeFilename(videoTitle)}.txt`;
        const filePath = path.join(chanDir, filename);

        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`[Archive] Saved: ${filePath}`);

        // 4. Git Sync (Async - non-blocking)
        const relativePath = `transcripts/${sanitizeFilename(category || 'General')}/${sanitizeFilename(channelName || 'Unknown')}/${filename}`;

        // Command: git add -> commit -> push
        // Note: Using relative path from root (cwd is usually root in npm run dev)
        // Adjust cwd if needed. Assuming process.cwd() is project root.
        const gitCmd = `git add "${relativePath}" && git commit -m "Add transcript: ${videoTitle}" && git push origin master`;

        exec(gitCmd, (err, stdout, stderr) => {
            if (err) {
                console.error('[Git Sync Error]', err.message);
                // Don't crash server for git error
            } else {
                console.log('[Git Sync Success]', stdout.trim());
            }
        });

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
    if (!url) return res.status(400).json({ error: 'URL required' });

    try {
        console.log(`[Channel Info] Fetching: ${url}`);

        // Fix: Use dump-json without flat-playlist to get full metadata (including subs)
        const cmd = `yt-dlp --dump-json --playlist-end 1 "${url}"`;

        const { stdout } = await execPromise(cmd);
        // Take first line if multiple (sometimes playlist dump outputs multiple lines)
        const videoData = JSON.parse(stdout.trim().split('\n')[0]);

        res.json({
            success: true,
            data: {
                name: videoData.uploader || videoData.channel || 'Unknown Channel',
                // Fallback for subscribers
                subscribers: videoData.channel_follower_count || videoData.subscriber_count || 0,
                handle: videoData.uploader_id || '',
                url: videoData.channel_url || url,
                originalCategory: videoData.categories?.[0] // Extract first category e.g. "Entertainment"
            }
        });
    } catch (error) {
        console.error('[Channel Info Error]', error);
        res.status(500).json({ error: 'Failed to fetch channel info. Check URL or yt-dlp.' });
    }
});

// 3. POST /analyze - Deep Analysis (Transcript -> Persona)
router.post('/analyze', async (req, res) => {
    const { url, category } = req.body;
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

    if (!url) return res.status(400).json({ error: 'URL required' });
    if (!GEMINI_API_KEY) return res.status(500).json({ error: 'GEMINI_API_KEY missing' });

    try {
        console.log(`[Channel Analyze] Starting deep analysis for: ${url}`);

        // A. Fetch popular 10 videos transcripts
        // We use --dump-json here too for consistency, but flat-playlist is faster for finding URLs
        // Step 1: Get URLs
        // Note: yt-dlp doesn't have a direct "sort by popular" for channel URL without loading all videos.
        // But for /videos tab, we can try to guess or use specific API.
        // HOWEVER, yt-dlp supports picking video formats, but not sorting by views easily on the CHANNEL url directly without downloading metadata first.
        // Wait, for Shorts/Videos tabs, youtube stores them in timeline.
        // BEST APPROACH: Fetch 50, sort by view_count manually, take top 10.
        // OR try to access the /videos?view=0&sort=p (Popular) URL.

        // Attempt 1: Append /videos?sort=p (Popular) to URL if it's a channel URL
        let targetUrl = url;
        if (!url.includes('/videos') && !url.includes('/shorts')) {
            targetUrl = url.replace(/\/$/, '') + '/videos?view=0&sort=p';
            // Note: ?sort=p might work for /videos tab. For /shorts tab it is "p" too?
            // Let's rely on yt-dlp fetching from the popular tab if we give that URL.
            // Actually, just fetching metadata for 30 videos and sorting is safer.
        }

        // Optimization: Fetch 30 latest, sort by views, take top 10.
        // Why? fetching ALL popular might require browsing "Popular" tab specifically.
        // Let's try appending /popluar or similar? No.

        // BETTER: Just ask yt-dlp to get 20 items and we sort them.
        // But user wants "Popular".
        // If sorting is critical, we should try to navigate to the "Popular" tab via URL.
        // YouTube Interface: /videos?sort=p, /shorts?sort=p

        // A. Fetch Channel Name Explicitly (Fix for Unknown_Channel with flat-playlist)
        // flat-playlist returns "NA" for uploader, so we must fetch it separately first.
        let channelName = 'Unknown_Channel';
        try {
            console.log(`[Channel Info] Fetching channel name directly...`);
            const nameCmd = `yt-dlp --print "%(channel)s" --playlist-end 1 --skip-download --no-warnings "${url}"`;
            const { stdout: nameOut } = await execPromise(nameCmd);
            const fetchedName = nameOut.trim();
            if (fetchedName && fetchedName !== 'NA') {
                channelName = fetchedName;
            }
        } catch (e) {
            console.warn('[Channel Name Fetch] Failed, falling back to Unknown:', e.message);
        }

        console.log(`[Channel Analyze] Target Channel: ${channelName}`);

        const listCmd = `yt-dlp --dump-json --flat-playlist --playlist-end 30 "${url}"`;
        const { stdout: listOut } = await execPromise(listCmd);

        let allVideos = listOut.trim().split('\n').map(line => {
            try {
                return JSON.parse(line);
            } catch (e) { return null; }
        }).filter(v => v);

        // Sort by views descending
        allVideos.sort((a, b) => (b.view_count || 0) - (a.view_count || 0));

        // Take top 10
        const videos = allVideos.slice(0, 10).map(v => ({
            url: v.url || v.webpage_url,
            title: v.title
        }));

        if (allVideos.length > 0) {
            console.log('[Debug] First Video Object:', JSON.stringify(allVideos[0], null, 2));
        }

        // Use the explicitly fetched name
        const name = channelName;

        console.log(`[Channel Analyze] Found ${videos.length} videos for channel: ${name}`);

        if (videos.length === 0) throw new Error('No videos found');

        // B. Extract Transcripts (Robust yt-dlp method)
        // Ensure temp dir exists
        const tempDir = path.join(__dirname, '../../temp_subs');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

        const transcripts = [];

        // Helper delay function
        const wait = (ms) => new Promise(r => setTimeout(r, ms));

        // Sequential processing to avoid 429/403 errors
        for (const video of videos) {
            const videoId = video.url.split('v=')[1] || video.url.split('/').pop();
            const outputFile = path.join(tempDir, `${videoId}`);

            try {
                // Add random delay (5-10 seconds) for maximum reliability
                const delay = Math.floor(Math.random() * 5000) + 5000;
                console.log(`[Transcript] Processing ${videoId} (${videos.indexOf(video) + 1}/${videos.length}) - Waiting ${delay}ms...`);
                await wait(delay);

                // Command to download auto-subs or subs, in vtt format, skip video download
                // Added --sleep-requests 1 for extra safety
                const subCmd = `yt-dlp --write-auto-sub --write-sub --sub-lang "ko,en" --skip-download --output "${outputFile}" --convert-subs vtt --no-warnings --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36" "${video.url}"`;

                await execPromise(subCmd);

                // Check for files
                let targetFile = null;
                const files = fs.readdirSync(tempDir);
                const candidates = files.filter(f => f.startsWith(videoId) && f.endsWith('.vtt'));

                targetFile = candidates.find(f => f.includes('.ko.'));
                if (!targetFile) targetFile = candidates.find(f => f.includes('.en.'));
                if (!targetFile && candidates.length > 0) targetFile = candidates[0];

                if (targetFile) {
                    const vttContent = fs.readFileSync(path.join(tempDir, targetFile), 'utf8');
                    const lines = vttContent.split('\n');
                    const textLines = lines.filter(line => {
                        return !line.includes('-->') && line.trim().length > 0 && !line.match(/^(WEBVTT|Kind:|Language:)/);
                    });
                    const uniqueText = [...new Set(textLines)].join(' ');

                    // Cleanup
                    candidates.forEach(f => fs.unlinkSync(path.join(tempDir, f)));

                    const finalTranscript = `Title: ${video.title}\nTranscript: ${uniqueText.substring(0, 1500)}...`;
                    transcripts.push(finalTranscript);

                    // Archive to GitHub
                    saveTranscript(category, name, video.title, uniqueText);

                } else {
                    transcripts.push(`Title: ${video.title}\n(No Transcript Found)`);
                }

            } catch (e) {
                console.error(`[Transcript Error ${video.url}]`, e.message);

                // Fallback: Use Apify if yt-dlp fails (e.g. 429 Rate Limit)
                if (process.env.APIFY_TOKEN) {
                    try {
                        console.log(`[Apify Fallback] Trying Apify for ${videoId}...`);
                        const { ApifyClient } = require('apify-client');
                        const client = new ApifyClient({ token: process.env.APIFY_TOKEN });

                        // Use the actor ID from env or default
                        const actorId = process.env.APIFY_ACTOR_ID || 'pintostudio~youtube-transcript-scraper';

                        // Fix: Error said "input.videoUrl is required".
                        // Some actors use 'videoUrl', others 'startUrls', others 'videoUrls'.
                        // We will provide multiple common fields to be safe, or just the specific one requested.
                        const apifyInput = {
                            videoUrl: video.url,  // Requested by error
                            url: video.url,       // Common alias
                            startUrls: [{ url: video.url }], // Common alias
                            settings: { preferredLanguage: 'ko' },
                            preferredLanguage: 'ko'
                        };

                        const run = await client.actor(actorId).call(apifyInput);

                        // Fetch results from dataset
                        const { items } = await client.dataset(run.defaultDatasetId).listItems();

                        if (items && items.length > 0) {
                            // Inspecting the screenshot: each item seems to have a "data" property which is an array of objects with "text"
                            // Or sometimes the root item typically has "text".
                            // Based on screenshot: object structure is { data: [ { text: "...", ... } ] }

                            const firstItem = items[0];
                            let apifyText = '';

                            if (firstItem.data && Array.isArray(firstItem.data)) {
                                // Combined all segments
                                apifyText = firstItem.data.map(segment => segment.text).join(' ');
                            } else {
                                // Fallback to standard schema
                                apifyText = firstItem.text || firstItem.fullText || firstItem.caption || '';
                            }

                            if (apifyText) {
                                const finalTranscript = `Title: ${video.title}\nTranscript (Apify): ${apifyText.substring(0, 1500)}...`;
                                transcripts.push(finalTranscript);

                                // Archive to GitHub
                                saveTranscript(category, name, video.title, apifyText);
                                continue; // Success
                            }
                        }
                    } catch (apifyError) {
                        console.error(`[Apify Error]`, apifyError.message);
                    }
                }

                transcripts.push(`Title: ${video.title}\n(Transcript Error: ${e.message.split('\n')[0]})`);
            }

            // Success case for yt-dlp (Wait, I need to hook into the SUCCESS path of yt-dlp too)
            // The logic above is inside catch(e). 
        }

        const combinedData = transcripts.join('\n\n---\n\n');

        // Clean prompt a bit
        const prompt = `
        Analyze these video transcripts from a YouTube channel to create a "Viral Persona Profile".
        
        Target Category: ${category || 'General'}
        
        Input Data (Recent 5 Videos):
        ${combinedData}
        
        Task: Extract the creator's specific style, tone, and viral patterns.
        
        Output JSON Format:
        {
            "tone": "Keywords like High-Tension, Calm, Sarcastic, etc.",
            "hook_style": "How they usually start videos (e.g., Starts with a scream, Starts with a question)",
            "catchphrases": ["List", "of", "recurring", "phrases"],
            "pacing": "Fast/Slow/Dynamic",
            "humor_code": "Description of their humor (e.g., Puns, Slapstick, Dry wit)",
            "summary": "A 1-sentence summary of this persona in English, followed by a Korean translation (e.g. 'English Text...\\n(한국어 번역...')",
            "prompt_instruction": "A specific instruction to give an AI to mimic this person (e.g., 'Speak like a excited teenager using slang')"
        }
        `;

        const analysis = await geminiGenerateJSON(GEMINI_API_KEY, 'gemini-2.0-flash', [{ text: prompt }]);

        res.json({ success: true, analysis });

    } catch (error) {
        console.error('[Channel Analyze Error]', error);
        res.status(500).json({ error: error.message });
    }
});

// 4. POST /save - Save Persona
router.post('/save', (req, res) => {
    const { name, url, category, analysis } = req.body;

    if (!name || !analysis) return res.status(400).json({ error: 'Missing data' });

    const newPersona = {
        id: Date.now().toString(),
        name,
        url,
        category,
        analysis: Array.isArray(analysis) ? analysis[0] : analysis,
        createdAt: new Date().toISOString()
    };

    const personas = getPersonas();
    personas.push(newPersona);
    savePersonas(personas);

    res.json({ success: true, data: newPersona });
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

module.exports = router;
