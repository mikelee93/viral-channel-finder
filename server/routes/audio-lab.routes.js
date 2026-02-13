/**
 * Audio AI Lab Routes
 *
 * Description: Audio processing endpoints including TTS, ASR, and dialogue generation
 */

const express = require('express');
const { generatePersonaDialogue } = require('../utils/persona_plex.util');
const dialogueManager = require('../utils/dialogue_manager');

const router = express.Router();

/**
 * POST /api/audio/qwen-tts
 * Qwen3-TTS text-to-speech (proxy to local Flask server)
 *
 * Request body:
 * - text: string - Text to convert to speech (required)
 * - language: string - Language code
 * - prompt: string - Voice prompt (default: 'Natural speech')
 *
 * Response: audio/mpeg
 */
router.post('/qwen-tts', async (req, res) => {
    const { text, language, prompt } = req.body;

    if (!text) {
        return res.status(400).json({
            success: false,
            error: 'No text provided'
        });
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
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/audio/persona-chat
 * PersonaPlex chat generation
 *
 * Request body:
 * - messages: Array - Chat messages
 * - persona: string - Persona identifier
 * - temperature: number - Generation temperature
 *
 * Response:
 * - success: boolean
 * - data: Object - Generated dialogue
 */
router.post('/persona-chat', async (req, res) => {
    const { messages, persona, temperature } = req.body;

    try {
        const result = await generatePersonaDialogue(messages, { persona, temperature });

        return res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('[Persona Chat Error]', error);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/audio/dialogue
 * PersonaPlex Dialogue (Tiki-Taka) Generation
 *
 * Request body:
 * - topic: string - Dialogue topic (required)
 * - personaA: string - First persona (required)
 * - personaB: string - Second persona (required)
 * - turns: number - Number of dialogue turns (default: 3)
 *
 * Response:
 * - success: boolean
 * - data: { dialogue: Array } - Generated dialogue
 */
router.post('/dialogue', async (req, res) => {
    const { topic, personaA, personaB, turns } = req.body;

    if (!topic || !personaA || !personaB) {
        return res.status(400).json({
            success: false,
            error: 'Missing required parameters: topic, personaA, personaB'
        });
    }

    try {
        console.log(`[Dialogue API] Starting dialogue on: ${topic}`);
        const dialogue = await dialogueManager.generateDialogue(topic, personaA, personaB, turns || 3);

        return res.json({
            success: true,
            data: { dialogue }
        });
    } catch (error) {
        console.error('[Dialogue API] Error:', error);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/audio/parse-script
 * Parse custom script into dialogue format
 *
 * Request body:
 * - script: string - Script text (required)
 * - personaA: string - First persona
 * - personaB: string - Second persona
 *
 * Response:
 * - success: boolean
 * - data: { dialogue: Array } - Parsed dialogue
 */
router.post('/parse-script', async (req, res) => {
    const { script, personaA, personaB } = req.body;

    if (!script) {
        return res.status(400).json({
            success: false,
            error: 'No script text provided'
        });
    }

    try {
        console.log(`[Parse Script API] Parsing script...`);
        // Use DialogueManager to parse
        const dialogue = await dialogueManager.parseScriptToDialogue(script, personaA, personaB);

        return res.json({
            success: true,
            data: { dialogue }
        });
    } catch (error) {
        console.error('[Parse Script API] Error:', error);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/audio/phi3-asr
 * MS Phi-3-Voice ASR (Speech-to-Text)
 *
 * Request body:
 * - audioData: string - Base64 encoded audio data (required)
 * - language: string - Language code
 *
 * Response:
 * - success: boolean
 * - data: { transcript: string } - Transcribed text
 */
router.post('/phi3-asr', async (req, res) => {
    const { audioData, language } = req.body;

    if (!audioData) {
        return res.status(400).json({
            success: false,
            error: 'No audio data provided'
        });
    }

    try {
        let buffer;
        if (audioData.startsWith('data:')) {
            // Handle base64 data URL
            const base64Data = audioData.split(',')[1];
            buffer = Buffer.from(base64Data, 'base64');
        } else {
            buffer = Buffer.from(audioData, 'base64');
        }

        // TODO: extractTranscriptPhi3 function needs to be imported from server/utils/phi3_asr.util
        // const { extractTranscriptPhi3 } = require('../utils/phi3_asr.util');
        // const transcript = await extractTranscriptPhi3(buffer, { language });

        // Temporary placeholder response
        return res.status(501).json({
            success: false,
            error: 'Phi3-ASR not yet implemented in modular routes. Please use original endpoint.'
        });

    } catch (error) {
        console.error('[Phi3-ASR Error]', error);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
