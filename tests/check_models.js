require('dotenv').config();
const { GoogleGenerativeAI } = require("@google/generative-ai");

async function listModels() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error("No API KEY found in .env");
        return;
    }

    console.log("Checking models for API Key ending in: ..." + apiKey.slice(-4));

    try {
        // We use the raw REST API for listing models to be sure, or the SDK if it exposes it.
        // SDK doesn't expose listModels directly on the main class in older versions, 
        // but let's try a direct fetch which is safer and dependency-free for this check.

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        const data = await response.json();

        if (data.error) {
            console.error("Error listing models:", data.error);
            return;
        }

        if (!data.models) {
            console.log("No models found or different response structure:", data);
            return;
        }

        console.log("Available Models:");
        data.models.forEach(m => {
            if (m.supportedGenerationMethods.includes("generateContent")) {
                console.log(`- ${m.name}`);
            }
        });

    } catch (error) {
        console.error("Exception:", error);
    }
}

listModels();
