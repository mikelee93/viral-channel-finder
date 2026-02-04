const { GoogleGenerativeAI } = require('@google/generative-ai');
const fetch = require('node-fetch');

/**
 * Helper to wait for a specified duration
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Unified Gemini Generate Content Function with Exponential Backoff Retry Logic
 * 
 * @param {string} apiKey - Gemini API Key
 * @param {string} modelName - Model name (e.g., 'gemini-2.0-flash')
 * @param {Array|Object} contents - The contents to generate from (SDK format or raw parts)
 * @param {Object} options - Additional options (maxRetries, initialDelay)
 * @returns {Promise<Object>} - The parsed JSON or text response
 */
async function geminiGenerateContent(apiKey, modelName, contents, options = {}) {
    const {
        maxRetries = 3,
        initialDelay = 2000,
        responseMimeType = null
    } = options;

    let lastError = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            // Log attempt
            if (attempt > 0) {
                const delay = initialDelay * Math.pow(2, attempt - 1);
                console.log(`[Gemini Retry] Attempt ${attempt} after waiting ${delay}ms...`);
                await sleep(delay);
            }

            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({
                model: modelName,
                generationConfig: responseMimeType ? { response_mime_type: responseMimeType } : undefined
            });

            const result = await model.generateContent(contents);
            const response = await result.response;
            const text = response.text();

            return text;

        } catch (error) {
            lastError = error;
            const status = error.status || (error.response && error.response.status);

            // Check if it's a rate limit error (429)
            if (status === 429 || error.message.includes('429') || error.message.includes('Too Many Requests')) {
                console.warn(`[Gemini API] 429 Rate Limit hit on attempt ${attempt + 1}`);
                if (attempt === maxRetries) break;
                continue; // Retry
            }

            // For other errors, we might not want to retry or handle them differently
            console.error(`[Gemini API] Error on attempt ${attempt + 1}:`, error.message);
            throw error;
        }
    }

    console.error(`[Gemini API] Max retries (${maxRetries}) exceeded.`);
    throw lastError;
}

/**
 * Specialized helper for JSON responses
 */
async function geminiGenerateJSON(apiKey, modelName, contents, options = {}) {
    const text = await geminiGenerateContent(apiKey, modelName, contents, {
        ...options,
        responseMimeType: 'application/json'
    });

    try {
        // Clean up markdown code blocks if the model returned them despite responseMimeType
        let cleanedText = text.trim();
        const jsonMatch = cleanedText.match(/```json\s*\n([\s\S]*?)\n```/);
        if (jsonMatch) {
            cleanedText = jsonMatch[1];
        } else if (cleanedText.startsWith('```')) {
            cleanedText = cleanedText.replace(/^```\n?/, '').replace(/\n?```$/, '');
        }

        return JSON.parse(cleanedText);
    } catch (e) {
        console.error('[Gemini Util] Failed to parse JSON response:', e);
        console.error('[Gemini Util] Raw text:', text);
        throw new Error('Failed to parse AI response as JSON');
    }
}

module.exports = {
    geminiGenerateContent,
    geminiGenerateJSON,
    uploadFileToGemini,
    deleteFileFromGemini
};

const { GoogleAIFileManager } = require('@google/generative-ai/server');

/**
 * Uploads a file to Gemini using the File API (for large files > 20MB)
 * @param {string} filePath - Local path to the file
 * @param {string} mimeType - Mime type of the file
 * @param {string} apiKey - API Key
 * @returns {Promise<Object>} - The uploaded file object (contains name, uri, etc.)
 */
async function uploadFileToGemini(filePath, mimeType, apiKey) {
    const fileManager = new GoogleAIFileManager(apiKey);

    console.log(`[Gemini File API] Uploading file: ${filePath}`);
    const uploadResult = await fileManager.uploadFile(filePath, {
        mimeType: mimeType,
        displayName: "Uploaded Video for Analysis",
    });

    const file = uploadResult.file;
    console.log(`[Gemini File API] Uploaded file: ${file.name} (URI: ${file.uri})`);

    // Wait for the file to be processed
    let activeFile = await waitForFileActive(fileManager, file.name);
    return activeFile;
}

/**
 * Waits for a file to become active (processed)
 */
async function waitForFileActive(fileManager, fileName) {
    console.log(`[Gemini File API] Waiting for file processing...`);
    let file = await fileManager.getFile(fileName);

    while (file.state === "PROCESSING") {
        await sleep(2000); // Wait 2 seconds
        file = await fileManager.getFile(fileName);
    }

    if (file.state !== "ACTIVE") {
        throw new Error(`File ${file.name} failed to process. State: ${file.state}`);
    }

    console.log(`[Gemini File API] File is ACTIVE and ready.`);
    return file;
}

/**
 * Deletes a file from Gemini storage
 */
async function deleteFileFromGemini(apiKey, fileName) {
    try {
        const fileManager = new GoogleAIFileManager(apiKey);
        await fileManager.deleteFile(fileName);
        console.log(`[Gemini File API] Deleted file: ${fileName}`);
    } catch (error) {
        console.warn(`[Gemini File API] Warning: Failed to delete file ${fileName}:`, error.message);
    }
}

