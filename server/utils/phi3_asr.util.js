const fs = require('fs');
const path = require('path');
const os = require('os');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { GoogleAIFileManager } = require("@google/generative-ai/server");

/**
 * Enhanced ASR Utility with Timestamp Support
 * Uses Google Gemini 1.5 Flash for reliable, free(tier) transcription
 */

/**
 * Extract transcript with timestamps from audio/video buffer
 * @param {Buffer} audioBuffer - Audio or video file buffer
 * @param {Object} options - Configuration options
 * @returns {Object} - Structured transcript with timestamps
 */
async function extractTranscriptWithTimestamps(audioBuffer, options = {}) {
    // Prefer Gemini 1.5 Flash as it is multimodal and free tier friendly
    // Fallback to HF Whisper is removed due to instability

    const apiKey = options.apiKey || process.env.GEMINI_API_KEY;

    if (!apiKey) {
        console.error('[ASR] ❌ GEMINI_API_KEY is missing!');
        return getSimulatedTranscript();
    }

    return await extractWithGemini(audioBuffer, apiKey);
}

/**
 * Use Gemini 1.5 Flash for transcription
 */
async function extractWithGemini(audioBuffer, apiKey) {
    const fileManager = new GoogleAIFileManager(apiKey);
    const genAI = new GoogleGenerativeAI(apiKey);
    // Updated to 'gemini-2.0-flash' based on list_models check
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    // 1. Save buffer to temp file
    const tempFilePath = path.join(os.tmpdir(), `upload_${Date.now()}.mp4`);

    try {
        console.log('[Gemini ASR] 🎙️ Starting transcription with Gemini 1.5 Flash...');
        fs.writeFileSync(tempFilePath, audioBuffer);

        // 2. Upload file
        const uploadResult = await fileManager.uploadFile(tempFilePath, {
            mimeType: "video/mp4",
            displayName: "Video for Transcript",
        });

        const fileUri = uploadResult.file.uri;
        console.log(`[Gemini ASR] ✅ Uploaded file: ${fileUri}`);

        // 3. Wait for processing (usually fast for small files)
        // Gemini Flash is multimodal, so we don't always need to wait long, but let's be safe
        let file = await fileManager.getFile(uploadResult.file.name);
        while (file.state === "PROCESSING") {
            console.log('[Gemini ASR] ⏳ Processing file...');
            await new Promise((resolve) => setTimeout(resolve, 2000));
            file = await fileManager.getFile(uploadResult.file.name);
        }

        if (file.state === "FAILED") {
            throw new Error("Video processing failed.");
        }

        // 4. Generate content (Transcript)
        const prompt = `
        Listen to this video/audio carefully and extract the transcript with timestamps.
        
        Output Requirements:
        - Detect language automatically (en, ko, ja, etc.).
        - Format as a JSON object with a "segments" array.
        - "emotion" must be one of: neutral, excitement, tension, surprise, joy, anger, sadness.
        - Timestamps in seconds (float).
        
        Example Structure (Do NOT copy the text content, use ACTUAL audio content):
        {
            "language": "en", 
            "languageName": "English",
            "segments": [
                {
                    "start": 0.0,
                    "end": 3.5,
                    "text": "(Write the actual spoken words from the audio here)",
                    "emotion": "neutral"
                }
            ]
        }
        
        IMPORTANT: Return ONLY the raw JSON. No markdown formatting.
        `;

        const result = await model.generateContent([
            { fileData: { mimeType: file.mimeType, fileUri: fileUri } },
            { text: prompt },
        ]);

        const responseText = result.response.text();
        console.log('[Gemini ASR] 📜 Received response:', responseText.substring(0, 100) + '...');

        // 5. Parse JSON
        let jsonStr = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
        const transcriptData = JSON.parse(jsonStr);

        // Add formatted duration if missing
        if (!transcriptData.duration && transcriptData.segments.length > 0) {
            transcriptData.duration = transcriptData.segments[transcriptData.segments.length - 1].end;
        }

        // Add fullText
        if (!transcriptData.fullText) {
            transcriptData.fullText = transcriptData.segments.map(s => s.text).join(' ');
        }

        // 6. Cleanup (delete from Gemini to save storage)
        // Note: In production, you might want to keep it or manage storage better.
        // await fileManager.deleteFile(uploadResult.file.name); 

        return transcriptData;

    } catch (error) {
        console.error('[Gemini ASR] ❌ Error:', error);
        return getSimulatedTranscript();
    } finally {
        // Cleanup temp file
        if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
        }
    }
}

/**
 * Simulation fallback (kept for extreme failures)
 */
function getSimulatedTranscript() {
    return {
        fullText: "Look at this! A cheetah is approaching the bridge. But on the other side... there are more than 30 baboons! This is an intense standoff. Who will win?",
        segments: [
            { start: 0, end: 3, text: "Look at this!", emotion: "excitement" },
            { start: 3, end: 7, text: "A cheetah is approaching the bridge.", emotion: "neutral" },
            { start: 7, end: 12, text: "But on the other side... there are more than 30 baboons!", emotion: "surprise" },
            { start: 12, end: 16, text: "This is an intense standoff.", emotion: "tension" },
            { start: 16, end: 18, text: "Who will win?", emotion: "curiosity" }
        ],
        language: 'en',
        languageName: 'English',
        hasTimestamps: true,
        duration: 18,
        isSimulated: true
    };
}

module.exports = {
    extractTranscriptWithTimestamps
};
