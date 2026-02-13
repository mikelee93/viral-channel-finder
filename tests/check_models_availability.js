require('dotenv').config();
const { GoogleGenerativeAI } = require("@google/generative-ai");

async function listModels() {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    try {
        // Note: The Node.js SDK for listModels might be different or accessed via the model manager.
        // However, usually we can't directly list via the simple client in older versions, 
        // but let's try accessing the model list if possible or just test a few names.
        // Actually, the SDK supports `getGenerativeModel` but listing might need `genAI.getModel`? 
        // Let's try to infer or just test if 2.5/3.0 throws error.

        // Instead of listing which can be tricky with just the client, let's try to instantiate 2.5 and 3.0 and generating a simple "hello".

        const modelsToTest = [
            "gemini-1.5-flash",
            "gemini-1.5-flash-latest",
            "gemini-1.5-flash-001",
            "gemini-1.5-flash-002",
            "gemini-1.5-pro",
            "gemini-1.5-pro-latest",
            "gemini-1.5-pro-001",
            "gemini-1.5-pro-002",
            "gemini-2.0-flash",
            "gemini-2.0-flash-exp",
            "gemini-2.0-flash-lite-preview-02-05",
            "gemini-2.0-pro-exp-02-05"
        ];

        console.log("Testing Model Availability...");

        for (const modelName of modelsToTest) {
            try {
                const model = genAI.getGenerativeModel({ model: modelName });
                const result = await model.generateContent("Hello");
                const response = await result.response;
                console.log(`✅ ${modelName}: Available`);
            } catch (error) {
                if (error.message.includes("404") || error.message.includes("not found")) {
                    console.log(`❌ ${modelName}: Not Found (404)`);
                } else if (error.message.includes("429")) {
                    console.log(`⚠️ ${modelName}: Rate Limited (429)`);
                } else {
                    console.log(`⚠️ ${modelName}: Error - ${error.message.split('\n')[0]}`);
                }
            }
        }

    } catch (error) {
        console.error("Error:", error);
    }
}

listModels();
