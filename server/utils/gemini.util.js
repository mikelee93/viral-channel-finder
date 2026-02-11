const { GoogleGenerativeAI } = require('@google/generative-ai');
const { GoogleAIFileManager } = require('@google/generative-ai/server');
const fetch = require('node-fetch');

/**
 * Helper to wait for a specified duration
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Unified Gemini Generate Content Function with Exponential Backoff Retry Logic
 * 
 * @param {string} apiKey - Gemini API Key
 * @param {string} modelName - Model name (e.g., 'gemini-2.5-flash')
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
 * Specialized helper for JSON responses with robust error handling
 */
async function geminiGenerateJSON(apiKey, modelName, contents, options = {}) {
    const text = await geminiGenerateContent(apiKey, modelName, contents, {
        ...options,
        responseMimeType: 'application/json'
    });

    try {
        // Step 1: Remove markdown code blocks
        let cleanedText = text.trim();
        const jsonMatch = cleanedText.match(/```json\s*\n([\s\S]*?)\n```/);
        if (jsonMatch) {
            cleanedText = jsonMatch[1];
        } else if (cleanedText.startsWith('```')) {
            cleanedText = cleanedText.replace(/^```json\n?/i, '').replace(/^```\n?/, '').replace(/\n?```$/, '');
        }

        // Step 2: Find JSON boundaries (first { to last })
        const firstBrace = cleanedText.indexOf('{');
        const lastBrace = cleanedText.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            cleanedText = cleanedText.substring(firstBrace, lastBrace + 1);
        }

        // Step 3: Escape control characters inside strings only
        let sanitized = '';
        let inString = false;
        let escaped = false;

        for (let i = 0; i < cleanedText.length; i++) {
            const char = cleanedText[i];

            if (char === '"' && !escaped) {
                inString = !inString;
                sanitized += char;
            } else if (inString) {
                // Inside a string - escape control characters
                if (char === '\n') sanitized += '\\n';
                else if (char === '\r') sanitized += '\\r';
                else if (char === '\t') sanitized += '\\t';
                else if (char === '\\' && !escaped) {
                    escaped = true;
                    sanitized += char;
                    continue;
                } else {
                    sanitized += char;
                }
            } else {
                // Outside string - keep as is
                sanitized += char;
            }
            escaped = false;
        }

        return JSON.parse(sanitized);
    } catch (e) {
        console.error('[Gemini Util] Failed to parse JSON response:', e.message);
        console.error('[Gemini Util] Raw text (first 500 chars):', text.substring(0, 500));
        console.error('[Gemini Util] Raw text (last 500 chars):', text.substring(Math.max(0, text.length - 500)));

        // Try one more time with a more aggressive cleanup
        try {
            const stripped = text.replace(/```json/gi, '').replace(/```/g, '').trim();
            const match = stripped.match(/\{[\s\S]*\}/);
            if (match) {
                return JSON.parse(match[0]);
            }
        } catch (fallbackError) {
            console.error('[Gemini Util] Fallback parsing also failed');
        }

        throw new Error(`Failed to parse AI response as JSON: ${e.message}`);
    }
}

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

/**
 * Analyze a video using Gemini Pro Vision
 * @param {Object} fileData - The file data object { fileUri, mimeType }
 * @param {Object} metadata - Metadata object { title, description, comments }
 * @param {string} apiKey - Gemini API Key
 * @returns {Promise<Object>} - The analysis result
 */
async function analyzeVideoWithGemini(fileData, metadata, apiKey) {
    const { title, description, comments } = metadata;

    const prompt = `
당신은 유튜브 쇼츠 바이럴 전문가입니다.
이 영상을 분석하여 바이럴 가능성을 평가하고, 쇼츠로 제작했을 때의 전략을 제안해주세요.

**📺 영상 정보:**
- 제목: ${title || '제목 없음'}
- 설명: ${description || '설명 없음'}
- **💬 시청자 반응 (댓글):**
${comments && comments.length > 0 ? comments.join('\n') : '(제공된 댓글 없음)'}

**🎯 분석 요청 사항:**
1. **Viral Score (0-100점)**: 이 영상이 쇼츠로 성공할 가능성
2. **Viral Reason**: 왜 이 영상이 바이럴 될 것 같은지 (또는 안 될 것 같은지) 구체적 이유
3. **Target Audience**: 주 타겟 시청자층 (연령, 성별, 관심사 등)
4. **Video Explanation**: 영상 내용에 대한 상세한 설명 (한국어)
5. **Key Moments**: 쇼츠에 포함해야 할 핵심 장면 (타임스탬프 또는 설명)
6. **Timeline Analysis**: 시간에 따른 감정 변화나 흥미도 그래프 (텍스트 묘사)

**Response JSON Format:**
\`\`\`json
{
  "viralScore": 85,
  "viralReason": "고양이의 예상치 못한 점프 실패가 주는 반전 웃음 요소가 강력함. 댓글에서도 '귀엽다', '웃기다' 반응이 압도적임.",
  "targetAudience": "10-30대 반려동물 애호가 및 유머 컨텐츠 선호층",
  "videoExplanation": "영상은 고양이가 높은 곳으로 점프하려다 미끄러지는 장면으로 시작합니다...",
  "keyMoments": [
    "00:05 - 점프 직전의 긴장감",
    "00:08 - 미끄러지는 결정적 순간",
    "00:12 - 주인과 눈이 마주치는 민망한 표정"
  ],
  "timelineAnalysis": "초반 5초간 긴장감 고조 -> 8초 구간에서 폭소 유발 -> 마지막 3초간 여운 및 귀여움 어필"
}
\`\`\`
`;

    console.log('[Gemini Vision] Sending request to Gemini...');

    // Prepare contents
    const contents = [
        { text: prompt },
        {
            fileData: {
                mimeType: fileData.mimeType,
                fileUri: fileData.fileUri
            }
        }
    ];

    return await geminiGenerateJSON(apiKey, 'gemini-2.5-flash', contents);
}

/**
 * Generate viral Shorts titles using Gemini
 * @param {Object} fileData - The file data object { fileUri, mimeType }
 * @param {Object} metadata - Metadata object { title, description }
 * @param {string} apiKey - Gemini API Key
 * @returns {Promise<Array>} - List of titles
 */
async function generateShortsTitle(fileData, metadata, apiKey) {
    const { title, description } = metadata;

    const prompt = `
당신은 유튜브 쇼츠 전문 카피라이터입니다.
이 영상을 분석하여 **클릭을 유도하는 바이럴 제목 10개**를 생성해주세요.

**📺 영상 정보:**
- 제목: ${title || '제목 없음'}
- 설명: ${description || '설명 없음'}

**🎯 제목 스타일 가이드:**
- **후킹(Hooking)**: 호기심 자극, 질문형, 반전 예고
- **간결함**: 모바일 환경 최적화 (20자 이내 권장)
- **키워드**: 핵심 소재 포함
- **다국어 지원**: 한국어 제목과, 일본어 번역(및 발음), 영어 번역 제공

**Response JSON Format:**
\`\`\`json
[
  {
    "korean": "결국 참지 못한 고양이의 최후 ㅋㅋ",
    "english": "The cat who finally lost its patience lol",
    "japanese": "ついに我慢できなかった猫の最後www",
    "japanese_pronunciation": "츠이니 가만데키나캇타 네코노 사이고 www"
  },
  ...
]
\`\`\`
`;

    console.log('[Gemini Title] Sending request to Gemini...');

    // Prepare contents
    const contents = [
        { text: prompt },
        {
            fileData: {
                mimeType: fileData.mimeType,
                fileUri: fileData.fileUri
            }
        }
    ];

    return await geminiGenerateJSON(apiKey, 'gemini-2.5-flash', contents);
}

module.exports = {
    geminiGenerateContent,
    geminiGenerateJSON,
    uploadFileToGemini,
    deleteFileFromGemini,
    analyzeVideoWithGemini,
    generateShortsTitle
};
