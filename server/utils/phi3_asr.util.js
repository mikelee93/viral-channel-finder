const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');

/**
 * Enhanced ASR Utility with Timestamp Support
 * Uses OpenAI Whisper for industry-standard transcription with precise timestamps
 */

/**
 * Extract transcript with timestamps from audio/video buffer
 * @param {Buffer} audioBuffer - Audio or video file buffer
 * @param {Object} options - Configuration options
 * @param {string} options.provider - 'openai' (paid, fast) or 'huggingface' (free, slower)
 * @returns {Object} - Structured transcript with timestamps
 */
async function extractTranscriptWithTimestamps(audioBuffer, options = {}) {
    const provider = options.provider || 'openai'; // Default to OpenAI

    if (provider === 'huggingface') {
        const apiKey = options.apiKey || process.env.HF_API_TOKEN;
        if (!apiKey) {
            console.error('[ASR] ❌ HF_API_TOKEN is missing!');
            return getSimulatedTranscript();
        }
        return await extractWithHuggingFace(audioBuffer, apiKey);
    } else {
        const apiKey = options.apiKey || process.env.OPENAI_API_KEY;
        if (!apiKey) {
            console.error('[ASR] ❌ OPENAI_API_KEY is missing!');
            return getSimulatedTranscript();
        }
        return await extractWithWhisper(audioBuffer, apiKey);
    }
}

/**
 * Use OpenAI Whisper for transcription with precise timestamps
 */
async function extractWithWhisper(audioBuffer, apiKey) {
    const OpenAI = require('openai');
    const openai = new OpenAI({ apiKey });

    const tempAudioPath = path.join(os.tmpdir(), `whisper_${Date.now()}.mp3`);

    try {
        console.log('[Whisper ASR] 🎙️ Starting transcription with OpenAI Whisper...');

        // 1. Convert to audio if needed (using FFmpeg)
        const tempVideoPath = path.join(os.tmpdir(), `upload_${Date.now()}.mp4`);
        fs.writeFileSync(tempVideoPath, audioBuffer);

        console.log('[Whisper ASR] 🎵 Extracting Audio with FFmpeg...');
        const ffmpegPath = `C:\\Users\\gogoh\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.0.1-full_build\\bin\\ffmpeg.exe`;

        await new Promise((resolve, reject) => {
            exec(`"${ffmpegPath}" -y -i "${tempVideoPath}" -vn -acodec libmp3lame -q:a 4 "${tempAudioPath}"`, (error, stdout, stderr) => {
                if (error) {
                    console.warn('[Whisper ASR] ⚠️ FFmpeg conversion failed, using original buffer');
                    fs.writeFileSync(tempAudioPath, audioBuffer);
                    resolve();
                } else {
                    console.log('[Whisper ASR] ✅ Audio extracted successfully.');
                    resolve();
                }
            });
        });

        // Clean up temp video
        if (fs.existsSync(tempVideoPath)) {
            fs.unlinkSync(tempVideoPath);
        }

        // 2. Call Whisper API with verbose JSON for timestamps
        console.log('[Whisper ASR] 📡 Sending to OpenAI Whisper API...');

        const transcription = await openai.audio.transcriptions.create({
            file: fs.createReadStream(tempAudioPath),
            model: 'whisper-1',
            response_format: 'verbose_json',
            timestamp_granularities: ['segment']
        });

        console.log('[Whisper ASR] ✅ Transcription received');
        console.log('[Whisper ASR] 📊 Detected language:', transcription.language);
        console.log('[Whisper ASR] 📊 Segments:', transcription.segments?.length || 0);

        // 3. Parse Whisper response into our format
        const segments = (transcription.segments || []).map(seg => ({
            start: seg.start || 0,
            end: seg.end || 0,
            text: seg.text.trim(),
            emotion: 'neutral' // Whisper doesn't provide emotion
        }));

        let transcriptData = {
            language: transcription.language || "en",
            languageName: getLanguageName(transcription.language || "en"),
            segments: segments,
            hasTranslation: false,
            duration: transcription.duration || 0
        };

        console.log(`[Whisper ASR] 🧾 Parsed ${segments.length} segments from Whisper.`);

        // 4. Post-processing: Filter out Hallucination Loops & Garbage
        if (transcriptData && transcriptData.segments) {
            const cleanSegments = transcriptData.segments.filter(seg => {
                const text = (seg.text || '').trim();
                if (!text) return false;

                // Remove [Silence], [Music], etc.
                if (/^\[(silence|music|applause|foreign|noise|sound|background|no audio)\]$/i.test(text)) return false;
                if (/^[.,\s]+$/.test(text)) return false;
                if (/^(thank you|thanks|subtitle|copyright|caption)[.!?, \n]*$/i.test(text)) return false;
                if (/^(thank you[.!?\s]*)+$/i.test(text)) return false;

                return true;
            });

            // Deduplication
            const uniqueSegments = [];
            const recentTexts = [];

            cleanSegments.forEach(seg => {
                const currentText = seg.text.trim().toLowerCase().replace(/[.,!?]/g, '');

                // Immediate Repetition
                if (uniqueSegments.length > 0) {
                    const lastText = uniqueSegments[uniqueSegments.length - 1].text.trim().toLowerCase().replace(/[.,!?]/g, '');
                    if (currentText === lastText) return;
                }

                // Loop Breaker
                if (currentText.length < 20 && recentTexts.includes(currentText)) {
                    const count = recentTexts.filter(t => t === currentText).length;
                    if (count >= 2) return;
                }

                // Cycle Detection
                if (uniqueSegments.length > 2) {
                    const twoStepsBack = uniqueSegments[uniqueSegments.length - 2].text.trim().toLowerCase().replace(/[.,!?]/g, '');
                    if (currentText === twoStepsBack && currentText.length < 30) return;
                }

                recentTexts.push(currentText);
                if (recentTexts.length > 5) recentTexts.shift();

                seg.textKo = "";
                uniqueSegments.push(seg);
            });

            transcriptData.segments = uniqueSegments;
        }

        transcriptData.hasTranslation = false;

        // Update duration from last segment
        if (transcriptData.segments.length > 0) {
            const lastSeg = transcriptData.segments[transcriptData.segments.length - 1];
            transcriptData.duration = Math.max(transcriptData.duration, lastSeg.end);
        }

        return transcriptData;

    } catch (error) {
        console.error('[Whisper ASR] ❌ Error:', error.message);
        return getSimulatedTranscript();
    } finally {
        if (fs.existsSync(tempAudioPath)) {
            fs.unlinkSync(tempAudioPath);
        }
    }
}

/**
 * Use HuggingFace Whisper for transcription (FREE but slower)
 */
async function extractWithHuggingFace(audioBuffer, apiKey) {
    const tempAudioPath = path.join(os.tmpdir(), `whisper_hf_${Date.now()}.mp3`);

    try {
        console.log('[HF Whisper ASR] 🎙️ Starting transcription with HuggingFace Whisper (FREE)...');

        // 1. Convert to audio if needed
        const tempVideoPath = path.join(os.tmpdir(), `upload_${Date.now()}.mp4`);
        fs.writeFileSync(tempVideoPath, audioBuffer);

        console.log('[HF Whisper ASR] 🎵 Extracting Audio with FFmpeg...');
        const ffmpegPath = `C:\\Users\\gogoh\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.0.1-full_build\\bin\\ffmpeg.exe`;

        await new Promise((resolve, reject) => {
            exec(`"${ffmpegPath}" -y -i "${tempVideoPath}" -vn -acodec libmp3lame -q:a 4 "${tempAudioPath}"`, (error, stdout, stderr) => {
                if (error) {
                    console.warn('[HF Whisper ASR] ⚠️ FFmpeg conversion failed, using original buffer');
                    fs.writeFileSync(tempAudioPath, audioBuffer);
                    resolve();
                } else {
                    console.log('[HF Whisper ASR] ✅ Audio extracted successfully.');
                    resolve();
                }
            });
        });

        // Clean up temp video
        if (fs.existsSync(tempVideoPath)) {
            fs.unlinkSync(tempVideoPath);
        }

        // 2. Call HuggingFace Serverless Inference API (Distil-Whisper for faster free tier)
        console.log('[HF Whisper ASR] 📡 Sending to HuggingFace Serverless Inference API...');
        console.log('[HF Whisper ASR] ⏳ Note: Free tier may be slow or queue requests');
        console.log('[HF Whisper ASR] 💡 Using distil-whisper (optimized for free tier)');

        const audioData = fs.readFileSync(tempAudioPath);

        // Use Serverless Inference API endpoint
        const response = await fetch('https://api-inference.huggingface.co/models/distil-whisper/distil-large-v3', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`
            },
            body: audioData
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HuggingFace API Error: ${response.status} - ${errorText}`);
        }

        const result = await response.json();
        console.log('[HF Whisper ASR] ✅ Transcription received');

        // HuggingFace returns: { "text": "full transcript..." }
        // Note: Basic HF API doesn't return timestamps, so we'll create mock segments
        const fullText = result.text || '';

        // Split into sentences for basic segmentation
        const sentences = fullText.match(/[^.!?]+[.!?]+/g) || [fullText];
        const avgDuration = 5; // Estimate 5 seconds per sentence

        const segments = sentences.map((sentence, i) => ({
            start: i * avgDuration,
            end: (i + 1) * avgDuration,
            text: sentence.trim(),
            emotion: 'neutral'
        }));

        const transcriptData = {
            language: "en", // HF basic API doesn't detect language
            languageName: "English",
            segments: segments,
            hasTranslation: false,
            duration: segments.length * avgDuration
        };

        console.log(`[HF Whisper ASR] 🧾 Parsed ${segments.length} segments (estimated timestamps).`);
        console.log(`[HF Whisper ASR] ⚠️ Note: Free HF API doesn't provide precise timestamps`);

        // Apply same filters as OpenAI version
        if (transcriptData && transcriptData.segments) {
            const cleanSegments = transcriptData.segments.filter(seg => {
                const text = (seg.text || '').trim();
                if (!text) return false;
                if (/^\[(silence|music|applause|foreign|noise|sound|background|no audio)\]$/i.test(text)) return false;
                if (/^[.,\s]+$/.test(text)) return false;
                if (/^(thank you|thanks|subtitle|copyright|caption)[.!?, \n]*$/i.test(text)) return false;
                return true;
            });

            const uniqueSegments = [];
            const recentTexts = [];

            cleanSegments.forEach(seg => {
                const currentText = seg.text.trim().toLowerCase().replace(/[.,!?]/g, '');

                if (uniqueSegments.length > 0) {
                    const lastText = uniqueSegments[uniqueSegments.length - 1].text.trim().toLowerCase().replace(/[.,!?]/g, '');
                    if (currentText === lastText) return;
                }

                if (currentText.length < 20 && recentTexts.includes(currentText)) {
                    const count = recentTexts.filter(t => t === currentText).length;
                    if (count >= 2) return;
                }

                recentTexts.push(currentText);
                if (recentTexts.length > 5) recentTexts.shift();

                seg.textKo = "";
                uniqueSegments.push(seg);
            });

            transcriptData.segments = uniqueSegments;
        }

        transcriptData.hasTranslation = false;

        if (transcriptData.segments.length > 0) {
            const lastSeg = transcriptData.segments[transcriptData.segments.length - 1];
            transcriptData.duration = Math.max(transcriptData.duration, lastSeg.end);
        }

        return transcriptData;

    } catch (error) {
        console.error('[HF Whisper ASR] ❌ Error:', error.message);
        return getSimulatedTranscript();
    } finally {
        if (fs.existsSync(tempAudioPath)) {
            fs.unlinkSync(tempAudioPath);
        }
    }
}

// Helper: Convert language code to full name
function getLanguageName(code) {
    const langMap = {
        'en': 'English',
        'ko': 'Korean',
        'ja': 'Japanese',
        'zh': 'Chinese',
        'es': 'Spanish',
        'fr': 'French',
        'de': 'German'
    };
    return langMap[code] || code.charAt(0).toUpperCase() + code.slice(1);
}

/**
 * Simulated transcript for fallback
 */
function getSimulatedTranscript() {
    return {
        language: "en",
        languageName: "English",
        duration: 300.0,
        segments: [
            { start: 0, end: 3, text: "[ASR Failed - Please check API configuration]", emotion: "neutral", textKo: "" },
            { start: 3, end: 6, text: "This is a simulated transcript for testing purposes.", emotion: "neutral", textKo: "" },
            { start: 6, end: 10, text: "In a real scenario, this would contain the actual extracted dialogue.", emotion: "neutral", textKo: "" },
            { start: 10, end: 14, text: "Each segment would have precise timestamps and emotion tags.", emotion: "neutral", textKo: "" },
            { start: 14, end: 18, text: "The API integration is currently unavailable.", emotion: "sad", textKo: "" }
        ],
        hasTranslation: false
    };
}

module.exports = {
    extractTranscriptWithTimestamps
};
