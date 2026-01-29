const { generatePersonaDialogue } = require('./persona_plex.util');
// const { generateQwenTTS } = require('./qwen_tts.util'); // Moved to client-side triggering


/**
 * Dialogue Manager
 * Orchestrates a multi-turn conversation between two AI personas.
 */
class DialogueManager {
    constructor() {
        this.activeSessions = new Map();
    }

    /**
     * Starts a new dialogue session
     * @param {string} topic - The conversation topic
     * @param {object} personaA - Definition for Persona A { name, role, gender, language }
     * @param {object} personaB - Definition for Persona B { name, role, gender, language }
     * @param {number} turns - Number of turns to generate
     */
    async generateDialogue(topic, personaA, personaB, turns = 3) {
        const dialogue = [];
        let currentSpeaker = personaA;
        let otherSpeaker = personaB;
        let lastMessage = `Let's talk about: ${topic}`;

        console.log(`[DialogueManager] Starting conversation between ${personaA.name} and ${personaB.name} on '${topic}'`);

        for (let i = 0; i < turns * 2; i++) {
            // 1. Generate Text Response (PersonaPlex)
            // Currently PersonaPlex util is a placeholder, so we'll simulate dynamic response if needed
            // or pass the context if the util supports it.
            const textResponse = await generatePersonaDialogue(
                [{ role: 'user', content: lastMessage }],
                { persona: currentSpeaker.role }
            );

            let generatedText = textResponse.text;

            // If simulation, make it slightly dynamic so it's not identical every time
            if (textResponse.status === 'simulation') {
                const simulatedResponses = [
                    `That is an interesting point about ${topic}.`,
                    `I agree, and I think we should also consider the implications.`,
                    `From my perspective as a ${currentSpeaker.role}, I see it differently.`,
                    `Could you elaborate more on that?`,
                    `That's fascinating! Tell me more.`
                ];
                generatedText = simulatedResponses[i % simulatedResponses.length];
            }

            // 2. Generate Audio (Qwen-TTS) - SKIPPED for performance (Client will fetch)
            // We return just the text so the UI loads instantly.
            console.log(`[DialogueManager] Generated text for ${currentSpeaker.name}: "${generatedText}"`);

            const audioBuffer = null; // Client will trigger TTS individually


            // 3. Add to dialogue history
            const turnData = {
                speaker: currentSpeaker.name,
                role: currentSpeaker.role,
                text: generatedText,
                audio: audioBuffer ? audioBuffer.toString('base64') : null,
                timestamp: new Date().toISOString()
            };

            dialogue.push(turnData);

            // Swap speakers
            lastMessage = generatedText;
            const temp = currentSpeaker;
            currentSpeaker = otherSpeaker;
            otherSpeaker = temp;
        }

        return dialogue;
    }

    /**
     * Parses a raw text script into structured dialogue objects using LLM
     * @param {string} rawScript - The raw script text
     * @param {object} personaA - Definition for Persona A
     * @param {object} personaB - Definition for Persona B
     */
    async parseScriptToDialogue(rawScript, personaA, personaB) {
        const { generatePersonaDialogue } = require('./persona_plex.util'); // Lazy load

        console.log('[DialogueManager] Parsing raw script with LLM...');

        // We use the existing persona_plex utility but with a special system prompt for parsing
        // Since persona_plex util is designed for chat, we might need a direct call or adapt it.
        // Actually, let's just use the OpenAI logic inside persona_plex if we can, or duplicate the fetch for flexibility.
        // For simplicity and to use the high-quality model we confirmed (OpenAI), I'll implement a helper here or reuse the util if it allowed system prompt override.
        // The current util takes `messages`. We can construct a parsing task.

        const prompt = `
        You are a script parser. I will provide a script with scenes, narrations, and dialogue bubbles.
        Your task is to convert this into a JSON array of dialogue turns.
        
        CHARACTERS:
        1. ${personaA.name} (${personaA.role}) - Gender: ${personaA.gender}
        2. ${personaB.name} (${personaB.role}) - Gender: ${personaB.gender}
        3. Narrator (if applicable)

        SCRIPT FORMAT INCLUDES:
        - Narration (KO)
        - Bubble (KO)
        - Bubble (JP)
        
        INSTRUCTIONS:
        - Return ONLY a JSON array. No markdown formatting.
        - For each turn, identify the SPEAKER based on the context.
        - **PRIMARY AUDIO SOURCE**: Use the content of "Bubble (KO)" for the 'text' field.
        - **TRANSLATION**: Use "Bubble (JP)" for the 'translation' field (if present).
        - **PRONUNCIATION**: Use "Bubble (발음)" for the 'pronunciation' field (if present).
        - If the user wants to switch languages later, I will update this. For now, prioritize KOREAN for audio.
        
        OUTPUT FORMAT:
        [
            { "speaker": "Name", "role": "Role", "text": "Audio Text (KO)", "translation": "Subtitle (JP)", "pronunciation": "Pronunciation", "language": "Korean" }
        ]


        RAW SCRIPT:
        ${rawScript}
        `;

        // Reuse generatePersonaDialogue but hijack it for this one-off instruction
        // Or better, just make a direct call since we want JSON output strictly.
        // Let's rely on the util's OpenAI backbone but force strict output.

        try {
            const apiToken = process.env.OPENAI_API_KEY;
            const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

            const response = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${apiToken}`
                },
                body: JSON.stringify({
                    model: "gpt-4o",
                    messages: [
                        { role: "system", content: "You are a helpful assistant that converts scripts to JSON." },
                        { role: "user", content: prompt }
                    ],
                    response_format: { type: "json_object" }, // Force JSON
                    temperature: 0.2
                })
            });

            const data = await response.json();
            if (!data.choices) throw new Error("LLM failed to parse script");

            const content = data.choices[0].message.content;
            const json = JSON.parse(content);

            // OpenAI json_object mode requires the root to be an object usually, or we ask for { "dialogue": [...] }
            return json.dialogue || json;

        } catch (e) {
            console.error("Parsing failed:", e);
            // Fallback: Return empty or error
            throw new Error("Script parsing failed: " + e.message);
        }
    }
}

module.exports = new DialogueManager();
