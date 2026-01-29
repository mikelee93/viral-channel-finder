const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

/**
 * Unified GLM Generate Content Function
 * 
 * @param {string} apiKey - Zhipu AI API Key
 * @param {string} modelName - Model name (e.g., 'glm-4.7-flash')
 * @param {string|Array} messages - Prompt or messages in OpenAI-compatible format
 * @param {Object} options - Additional options
 * @returns {Promise<string>} - The generated text response
 */
async function glmGenerateContent(apiKey, modelName, messages, options = {}) {
    const {
        temperature = 0.7,
        max_tokens = 4096,
        top_p = 1.0
    } = options;

    // Convert string prompt to message format if needed
    const formattedMessages = typeof messages === 'string'
        ? [{ role: 'user', content: messages }]
        : messages;

    try {
        const response = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: modelName,
                messages: formattedMessages,
                temperature,
                max_tokens,
                top_p
            })
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('[GLM API] Error response:', data);
            throw new Error(data.error?.message || `GLM API error: ${response.status}`);
        }

        return data.choices[0].message.content;

    } catch (error) {
        console.error('[GLM API] Error:', error.message);
        throw error;
    }
}

/**
 * Specialized helper for JSON responses from GLM
 */
async function glmGenerateJSON(apiKey, modelName, messages, options = {}) {
    const text = await glmGenerateContent(apiKey, modelName, messages, options);

    try {
        let cleanedText = text.trim();
        // Remove markdown code blocks
        const jsonMatch = cleanedText.match(/```json\s*\n([\s\S]*?)\n```/);
        if (jsonMatch) {
            cleanedText = jsonMatch[1];
        } else if (cleanedText.startsWith('```')) {
            cleanedText = cleanedText.replace(/^```\n?/, '').replace(/\n?```$/, '');
        }

        return JSON.parse(cleanedText);
    } catch (e) {
        console.error('[GLM Util] Failed to parse JSON response:', e);
        console.error('[GLM Util] Raw text:', text);
        throw new Error('Failed to parse AI response as JSON');
    }
}

module.exports = {
    glmGenerateContent,
    glmGenerateJSON
};
