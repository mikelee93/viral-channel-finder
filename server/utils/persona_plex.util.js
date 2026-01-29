const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

/**
 * PersonaPlex Utility
 * Handles conversational AI logic using OpenAI (as PersonaPlex backbone) or NVIDIA/HF models.
 */

async function generatePersonaDialogue(messages, options = {}) {
    const {
        persona = 'helpful assistant',
        temperature = 0.7,
        apiToken = process.env.OPENAI_API_KEY // Prefer OpenAI for high quality
    } = options;

    try {
        console.log(`[PersonaPlex] Generating dialogue via OpenAI for persona: ${persona}`);

        // Construct a system message based on the persona
        const systemMessage = {
            role: "system",
            content: `You are a roleplay character. 
            ROLE: ${persona}
            INSTRUCTION: Respond naturally to the conversation. Keep responses concise (1-2 sentences) and conversational. 
            Do NOT include stage directions or prefixes like "Character Name:". Just speak.
            LANGUAGE: Respond in the language appropriate for the context or as requested.`
        };

        const apiMessages = [systemMessage, ...messages];

        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiToken}`
            },
            body: JSON.stringify({
                model: "gpt-4o", // Use high quality model
                messages: apiMessages,
                temperature: temperature,
                max_tokens: 150
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error('[PersonaPlex] OpenAI API Error:', errText);
            throw new Error(`OpenAI API Error: ${response.status}`);
        }

        const data = await response.json();
        const generatedText = data.choices[0].message.content.trim();

        return {
            text: generatedText,
            status: 'success'
        };

    } catch (error) {
        console.warn('[PersonaPlex] Real API failed, falling back to local simulation...', error);

        // Fallback simulation (better than before)
        const simResponses = [
            "그 점에 대해서는 저도 동의합니다.",
            "정말 흥미로운 주제네요. 더 자세히 이야기해볼까요?",
            "제 생각에는 조금 다른 관점에서 볼 필요가 있다고 생각합니다.",
            "아, 그렇군요! 이해했습니다."
        ];

        return {
            text: simResponses[Math.floor(Math.random() * simResponses.length)],
            status: 'simulation'
        };
    }
}

module.exports = {
    generatePersonaDialogue
};
