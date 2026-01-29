require('dotenv').config();

async function listModels() {
    const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
    console.log('Fetching available models from Zhipu AI...');
    const apiKey = process.env.ZHIPU_API_KEY;

    if (!apiKey) {
        console.error('ZHIPU_API_KEY not found in .env');
        return;
    }

    try {
        // Many OpenAI-compatible APIs support /v4/models or /v1/models
        const response = await fetch('https://open.bigmodel.cn/api/paas/v4/models', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();
        console.log('\n--- Available Models ---');
        console.log(JSON.stringify(data, null, 2));
        console.log('------------------------\n');
    } catch (error) {
        console.error('Failed to fetch models:', error.message);
    }
}

listModels();
