require('dotenv').config();
const { glmGenerateContent } = require('./server/utils/glm.util');
const fs = require('fs');

async function askGLM() {
    const args = process.argv.slice(2);
    const prompt = args[0];
    const filePath = args[1]; // Optional file path to include as context

    if (!prompt) {
        console.error('Usage: node glm_ask.js "prompt" [filePath]');
        process.exit(1);
    }

    const apiKey = process.env.ZHIPU_API_KEY;
    if (!apiKey) {
        console.error('ZHIPU_API_KEY not found in .env');
        process.exit(1);
    }

    let fullPrompt = prompt;
    if (filePath && fs.existsSync(filePath)) {
        const fileContent = fs.readFileSync(filePath, 'utf8');
        fullPrompt = `Context from file ${filePath}:\n\n\`\`\`\n${fileContent}\n\`\`\`\n\nTask: ${prompt}`;
    }

    try {
        const response = await glmGenerateContent(apiKey, 'glm-4.7-flash', fullPrompt);
        console.log(response);
    } catch (error) {
        console.error('GLM Brain error:', error.message);
        process.exit(1);
    }
}

askGLM();
