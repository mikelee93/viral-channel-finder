require('dotenv').config();
const { GoogleGenerativeAI } = require("@google/generative-ai");

async function checkModels() {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const models = ["gemini-2.0-flash", "gemini-2.5-flash", "gemini-3.0-flash"];

    console.log("--- START CHECK ---");
    for (const modelName of models) {
        try {
            // Add a small delay
            await new Promise(r => setTimeout(r, 1000));
            process.stdout.write(`Testing ${modelName}... `);
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent("Hi");
            const text = result.response.text();
            console.log(`✅ SUCCESS`);
        } catch (e) {
            if (e.message.includes("404")) console.log(`❌ 404 Not Found`);
            else console.log(`⚠️ Error: ${e.message.split('\n')[0]}`);
        }
    }
    console.log("--- END CHECK ---");
}

checkModels();
