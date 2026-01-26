// ========================================
// VOICEVOX API Utility Functions
// ========================================
// VOICEVOX 로컬 서버와 통신하는 유틸리티 함수들

const ENGINES = {
    VOICEVOX: 'http://localhost:50021',
    AIVISS: 'http://localhost:10101'
};

/**
 * 전동 서버 연결 확인 (모든 엔진)
 */
async function checkVoicevoxConnection() {
    const results = await Promise.all(
        Object.entries(ENGINES).map(async ([name, url]) => {
            try {
                const response = await fetch(`${url}/version`, { method: 'GET' });
                return { name, connected: response.ok };
            } catch (e) {
                return { name, connected: false };
            }
        })
    );
    return results.some(r => r.connected);
}

/**
 * 모든 캐릭터(화자) 목록 가져오기 (모든 엔진 통합)
 */
async function getSpeakers() {
    const allSpeakers = [];

    for (const [engineName, baseUrl] of Object.entries(ENGINES)) {
        try {
            const response = await fetch(`${baseUrl}/speakers`, { method: 'GET' });
            if (response.ok) {
                const speakers = await response.json();
                console.log(`[${engineName}] Loaded ${speakers.length} speakers`);

                // 엔진 정보 태그 추가
                speakers.forEach(s => {
                    s.engineUrl = baseUrl;
                    s.engineName = engineName;
                });

                allSpeakers.push(...speakers);
            }
        } catch (error) {
            console.warn(`[${engineName}] Failed to fetch speakers:`, error.message);
        }
    }

    if (allSpeakers.length === 0) {
        throw new Error('음성 엔진 서버에 연결할 수 없습니다. VOICEVOX 또는 AIVISSpeech가 실행 중인지 확인하세요.');
    }

    return allSpeakers;
}

/**
 * 오디오 쿼리 생성 (1단계: 텍스트 → 음성 정보)
 * @param {string} text - 변환할 텍스트 (일본어)
 * @param {number} speakerId - 화자 ID
 * @returns {Promise<Object>} 오디오 쿼리 데이터
 */
async function generateAudioQuery(text, speakerId, baseUrl = ENGINES.VOICEVOX) {
    try {
        const response = await fetch(
            `${baseUrl}/audio_query?text=${encodeURIComponent(text)}&speaker=${speakerId}`,
            { method: 'POST' }
        );

        if (!response.ok) {
            throw new Error(`Audio query failed: ${response.statusText}`);
        }

        const audioQuery = await response.json();
        return audioQuery;

    } catch (error) {
        console.error('[VOICEVOX] generateAudioQuery error:', error);
        throw error;
    }
}

/**
 * 음성 합성 (2단계: 음성 정보 → WAV 파일)
 * @param {Object} audioQuery - 오디오 쿼리 데이터
 * @param {number} speakerId - 화자 ID
 * @returns {Promise<Buffer>} WAV 오디오 데이터
 */
async function synthesizeSpeech(audioQuery, speakerId, baseUrl = ENGINES.VOICEVOX) {
    try {
        const response = await fetch(
            `${baseUrl}/synthesis?speaker=${speakerId}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(audioQuery)
            }
        );

        if (!response.ok) {
            throw new Error(`Synthesis failed: ${response.statusText}`);
        }

        const audioBuffer = await response.arrayBuffer();
        return Buffer.from(audioBuffer);

    } catch (error) {
        console.error('[VOICEVOX] synthesizeSpeech error:', error);
        throw error;
    }
}

/**
 * 텍스트 → TTS 음성 파일 생성 (전체 프로세스)
 * @param {string} text - 변환할 텍스트 (일본어)
 * @param {number} speakerId - 화자 ID
 * @returns {Promise<Buffer>} WAV 오디오 데이터
 */
async function generateTTS(text, speakerId, baseUrl = ENGINES.VOICEVOX) {
    try {
        console.log(`[TTS] Generating (${baseUrl}): speaker=${speakerId}, text="${text.slice(0, 20)}..."`);

        // 1단계: 오디오 쿼리 생성
        const audioQuery = await generateAudioQuery(text, speakerId, baseUrl);

        // 2단계: 음성 합성
        const audioBuffer = await synthesizeSpeech(audioQuery, speakerId, baseUrl);

        console.log(`[VOICEVOX] TTS generated successfully (${audioBuffer.length} bytes)`);
        return audioBuffer;

    } catch (error) {
        console.error('[VOICEVOX] generateTTS error:', error);
        throw error;
    }
}

/**
 * 샘플 음성 미리듣기 생성
 * @param {number} speakerId - 화자 ID
 * @param {string} sampleText - 샘플 텍스트 (기본값: "こんにちは")
 * @returns {Promise<Buffer>} WAV 오디오 데이터
 */
async function generatePreview(speakerId, sampleText = 'こんにちは、よろしくお願いします。', baseUrl = ENGINES.VOICEVOX) {
    try {
        console.log(`[TTS] Generating preview for speaker ${speakerId} on ${baseUrl}`);
        return await generateTTS(sampleText, speakerId, baseUrl);
    } catch (error) {
        console.error('[VOICEVOX] generatePreview error:', error);
        throw error;
    }
}

/**
 * 여러 대본을 일괄 처리하여 TTS 생성
 * @param {Array} scripts - [{ text, speakerId, filename }]
 * @returns {Promise<Array>} 생성된 오디오 데이터 배열
 */
async function batchGenerateTTS(scripts) {
    try {
        console.log(`[VOICEVOX] Batch generating ${scripts.length} TTS files`);

        const results = [];
        for (const script of scripts) {
            const audioBuffer = await generateTTS(script.text, script.speakerId);
            results.push({
                filename: script.filename,
                buffer: audioBuffer,
                size: audioBuffer.length
            });
        }

        console.log(`[VOICEVOX] Batch generation complete`);
        return results;

    } catch (error) {
        console.error('[VOICEVOX] batchGenerateTTS error:', error);
        throw error;
    }
}

module.exports = {
    checkVoicevoxConnection,
    getSpeakers,
    generateAudioQuery,
    synthesizeSpeech,
    generateTTS,
    generatePreview,
    batchGenerateTTS
};
