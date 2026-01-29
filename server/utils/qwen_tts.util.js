const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

/**
 * Qwen-TTS Utility
 * Supports text-to-speech using Qwen models (e.g., Qwen2-Audio or dedicated TTS models)
 * Primarily targeting Hugging Face / ModelScope public APIs
 */

async function generateQwenTTS(text, options = {}) {
    const {
        language = 'ko',
        voice = 'default',
        speed = 1.0,
        pitch = 1.0,
        apiToken = process.env.HF_API_TOKEN
    } = options;

    // Default to a public Hugging Face space or ModelScope URL if not provided
    // Local Python Server (Qwen3-TTS)
    const API_URL = "http://127.0.0.1:5001/tts";

    try {
        // Validation for local server doesn't strictly need HF token, but good to have env
        console.log(`[Qwen-TTS] Generating speech for: "${text.substring(0, 30)}..."`);

        const response = await fetch(API_URL, {

            headers: { 'Content-Type': 'application/json' },
            method: "POST",
            body: JSON.stringify({
                text: text,
                language: language,
                speaker: voice, // Map 'voice' to 'speaker'
                prompt: options.prompt || 'Natural speech'
            }),

        });

        if (!response.ok) {
            const errorText = await response.text();
            console.warn(`[Qwen-TTS] API returned error ${response.status}: ${errorText}`);
            throw new Error(`HF API Error ${response.status}: ${errorText}`);
        }

        const result = await response.arrayBuffer();
        return Buffer.from(result);
    } catch (error) {
        console.error('[Qwen-TTS] Error:', error);
        throw error; // Re-throw to let frontend know
    }
}

module.exports = {
    generateQwenTTS
};
