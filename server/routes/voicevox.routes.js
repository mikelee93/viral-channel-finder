// ========================================
// VOICEVOX TTS API Routes
// ========================================

const express = require('express');
const router = express.Router();
const voicevoxUtil = require('../utils/voicevox.util');
const { geminiGenerateJSON } = require('../utils/gemini.util');

/**
 * GET /api/voicevox/speakers
 * VOICEVOX 캐릭터(화자) 목록 조회
 */
router.get('/speakers', async (req, res) => {
    try {
        // Load Korean metadata
        const {
            CHARACTER_NAMES_KR,
            STYLE_NAMES_KR,
            CHARACTER_CATEGORIES,
            CHARACTER_METADATA
        } = require('../utils/voicevox-metadata');

        // VOICEVOX 서버 연결 확인
        const isConnected = await voicevoxUtil.checkVoicevoxConnection();
        if (!isConnected) {
            return res.status(503).json({
                error: 'VOICEVOX 서버에 연결할 수 없습니다.',
                message: 'VOICEVOX 앱을 실행해주세요.'
            });
        }

        // 캐릭터 목록 가져오기
        const speakers = await voicevoxUtil.getSpeakers();


        // GitHub Directory Map (UUID -> Directory Name) from voicevox_resource/character_info
        const SPEAKER_DIRECTORY_MAP = {
            '044830d2-f23b-44d6-ac0d-b5d733caa900': 'No7_044830d2-f23b-44d6-ac0d-b5d733caa900',
            '0ebe2c7d-96f3-4f0e-a2e3-ae13fe27c403': 'Voidoll_0ebe2c7d-96f3-4f0e-a2e3-ae13fe27c403',
            '67d5d8da-acd7-4207-bb10-b5542d3a663b': 'WhiteCUL_67d5d8da-acd7-4207-bb10-b5542d3a663b',
            'dda44ade-5f9c-4a3a-9d2c-2a976c7476d9': 'あいえるたん_dda44ade-5f9c-4a3a-9d2c-2a976c7476d9',
            '3be49e15-34bb-48a0-9e2f-9b80c96e9905': 'あんこもん_3be49e15-34bb-48a0-9e2f-9b80c96e9905',
            '388f246b-8c41-4ac1-8e2d-5d79f3ff56d9': 'ずんだもん_388f246b-8c41-4ac1-8e2d-5d79f3ff56d9',
            '0156da66-4300-474a-a398-49eb2e8dd853': 'ぞん子_0156da66-4300-474a-a398-49eb2e8dd853',
            '468b8e94-9da4-4f7a-8715-a22a48844f9e': 'ちび式じい_468b8e94-9da4-4f7a-8715-a22a48844f9e',
            '9f3ee141-26ad-437e-97bd-d22298d02ad2': 'もち子さん_9f3ee141-26ad-437e-97bd-d22298d02ad2',
            '882a636f-3bac-431a-966d-c5e6bba9f949': 'ナースロボタイプＴ_882a636f-3bac-431a-966d-c5e6bba9f949',
            '462cd6b4-c088-42b0-b357-3816e24f112e': 'ユーレイちゃん_462cd6b4-c088-42b0-b357-3816e24f112e',
            '1f18ffc3-47ea-4ce0-9829-0576d03a7ec8': '中国うさぎ_1f18ffc3-47ea-4ce0-9829-0576d03a7ec8',
            '4614a7de-9829-465d-9791-97eb8a5f9b86': '中部つるぎ_4614a7de-9829-465d-9791-97eb8a5f9b86',
            '481fb609-6446-4870-9f46-90c4dd623403': '九州そら_481fb609-6446-4870-9f46-90c4dd623403',
            '8eaad775-3119-417e-8cf4-2a10bfd592c8': '冥鳴ひまり_8eaad775-3119-417e-8cf4-2a10bfd592c8',
            '1a17ca16-7ee5-4ea5-b191-2f02ace24d21': '剣崎雌雄_1a17ca16-7ee5-4ea5-b191-2f02ace24d21',
            '7ffcb7ce-00ec-4bdc-82cd-45a8889e43ff': '四国めたん_7ffcb7ce-00ec-4bdc-82cd-45a8889e43ff',
            'a8cc6d22-aad0-4ab8-bf1e-2f843924164a': '小夜SAYO_a8cc6d22-aad0-4ab8-bf1e-2f843924164a',
            '0f56c2f2-644c-49c9-8989-94e11f7129d0': '後鬼_0f56c2f2-644c-49c9-8989-94e11f7129d0',
            '35b2c544-660e-401e-b503-0e14c635303a': '春日部つむぎ_35b2c544-660e-401e-b503-0e14c635303a',
            'ba5d2428-f7e0-4c20-ac41-9dd56e9178b4': '春歌ナナ_ba5d2428-f7e0-4c20-ac41-9dd56e9178b4',
            '1bd6b32b-d650-4072-bbe5-1d0ef4aaa28b': '東北きりたん_1bd6b32b-d650-4072-bbe5-1d0ef4aaa28b',
            '80802b2d-8c75-4429-978b-515105017010': '東北ずん子_80802b2d-8c75-4429-978b-515105017010',
            'ab4c31a3-8769-422a-b412-708f5ae637e8': '東北イタコ_ab4c31a3-8769-422a-b412-708f5ae637e8',
            '04dbd989-32d0-40b4-9e71-17c920f2a8a9': '栗田まろん_04dbd989-32d0-40b4-9e71-17c920f2a8a9',
            '0693554c-338e-4790-8982-b9c6d476dc69': '櫻歌ミコ_0693554c-338e-4790-8982-b9c6d476dc69',
            'b1a81618-b27b-40d2-b0ea-27a9ad408c4b': '波音リツ_b1a81618-b27b-40d2-b0ea-27a9ad408c4b',
            '287aa49f-e56b-4530-a469-855776c84a8d': '満別花丸_287aa49f-e56b-4530-a469-855776c84a8d',
            '00a5c10c-d3bd-459f-83fd-43180b521a44': '猫使アル_00a5c10c-d3bd-459f-83fd-43180b521a44',
            'c20a2254-0349-4470-9fc8-e5c0f8cf3404': '猫使ビィ_c20a2254-0349-4470-9fc8-e5c0f8cf3404',
            'c30dc15a-0992-4f8d-8bb8-ad3b314e6a6f': '玄野武宏_c30dc15a-0992-4f8d-8bb8-ad3b314e6a6f',
            '97a4af4b-086e-4efd-b125-7ae2da85e697': '琴詠ニア_97a4af4b-086e-4efd-b125-7ae2da85e697',
            'e5020595-5c5d-4e87-b849-270a518d0dcf': '白上虎太郎_e5020595-5c5d-4e87-b849-270a518d0dcf',
            '471e39d2-fb11-4c8c-8d89-4b322d2498e0': '聖騎士紅桜_471e39d2-fb11-4c8c-8d89-4b322d2498e0',
            '0acebdee-a4a5-4e12-a695-e19609728e30': '雀松朱司_0acebdee-a4a5-4e12-a695-e19609728e30',
            '3b91e034-e028-4acb-a08d-fbdcd207ea63': '離途_3b91e034-e028-4acb-a08d-fbdcd207ea63',
            '3474ee95-c274-47f9-aa1a-8322163d96f1': '雨晴はう_3474ee95-c274-47f9-aa1a-8322163d96f1',
            '4f51116a-d9ee-4516-925d-21f183e2afad': '青山龍星_4f51116a-d9ee-4516-925d-21f183e2afad',
            '7d1e7ba7-f957-40e5-a3fc-da49f769ab65': '麒ヶ島宗麟_7d1e7ba7-f957-40e5-a3fc-da49f769ab65',
            '0b466290-f9b6-4718-8d37-6c0c81e824ac': '黒沢冴白_0b466290-f9b6-4718-8d37-6c0c81e824ac'
        };

        // 한국어 정보 추가
        const enrichedSpeakers = speakers.map(speaker => {
            const nameKr = CHARACTER_NAMES_KR[speaker.name] || speaker.name;
            const metadata = CHARACTER_METADATA[speaker.name] || {};

            // Use locally hosted character icons (downloaded for reliability)
            // Path: /public/voicevox-icons/{uuid}.png
            let imageUrl = `/public/voicevox-icons/${speaker.speaker_uuid}.png`;

            // AIVISSpeech Mao specific icon (if not in local icons)
            if (speaker.name === 'まお' && !speaker.speaker_uuid.includes('7ffcb7ce')) {
                imageUrl = 'https://aivis-project.com/assets/images/header/logo.png'; // Placeholder logo for now
            }

            return {
                ...speaker,
                nameKr,
                nameJp: speaker.name,
                speaker_uuid: speaker.speaker_uuid,
                imageUrl,
                portraitUrl: '',
                gender: metadata.gender || 'unknown',
                useCase: metadata.useCase || '',
                engineUrl: speaker.engineUrl, // Preserving engineUrl from utility
                engineName: speaker.engineName,
                styles: speaker.styles.map(style => ({
                    ...style,
                    nameKr: STYLE_NAMES_KR[style.name] || style.name,
                    nameJp: style.name
                }))
            };
        });

        // 카테고리별로 그룹화
        const categorized = {};
        Object.entries(CHARACTER_CATEGORIES).forEach(([category, characterNames]) => {
            categorized[category] = enrichedSpeakers.filter(speaker =>
                characterNames.includes(speaker.nameJp)
            );
        });

        // Add AIVISS category if not present
        if (enrichedSpeakers.some(s => s.engineName === 'AIVISS')) {
            categorized['AIVISS - 고품질'] = enrichedSpeakers.filter(s => s.engineName === 'AIVISS');
        }

        res.json({
            success: true,
            speakers: enrichedSpeakers,
            categorized,
            count: enrichedSpeakers.length
        });

    } catch (error) {
        console.error('[VOICEVOX API] /speakers error:', error);
        res.status(500).json({
            error: error.message,
            message: 'VOICEVOX 캐릭터 목록을 가져오는 데 실패했습니다.'
        });
    }
});

/**
 * GET /api/voicevox/image-proxy
 * Proxy character images from GitHub to bypass CORS
 * Query: url (GitHub raw content URL)
 */
router.get('/image-proxy', async (req, res) => {
    try {
        const { url } = req.query;

        console.log('[VOICEVOX API] Image proxy request for:', url);

        if (!url || !url.startsWith('https://raw.githubusercontent.com/VOICEVOX/')) {
            console.log('[VOICEVOX API] Invalid URL:', url);
            return res.status(400).json({
                error: 'Invalid or missing image URL'
            });
        }

        // Fetch image from GitHub (with redirect handling)
        const https = require('https');

        const fetchImage = (imageUrl, redirectCount = 0) => {
            if (redirectCount > 5) {
                console.error('[VOICEVOX API] Too many redirects');
                return res.status(500).json({ error: 'Too many redirects' });
            }

            https.get(imageUrl, (imageRes) => {
                console.log('[VOICEVOX API] GitHub response status:', imageRes.statusCode);
                console.log('[VOICEVOX API] Content-Type:', imageRes.headers['content-type']);

                // Handle redirects
                if (imageRes.statusCode === 301 || imageRes.statusCode === 302 || imageRes.statusCode === 307 || imageRes.statusCode === 308) {
                    const redirectUrl = imageRes.headers.location;
                    console.log('[VOICEVOX API] Redirecting to:', redirectUrl);
                    imageRes.resume(); // Consume response data to free up memory
                    return fetchImage(redirectUrl, redirectCount + 1);
                }

                if (imageRes.statusCode !== 200) {
                    console.error('[VOICEVOX API] Non-200 status:', imageRes.statusCode);
                    return res.status(imageRes.statusCode).json({
                        error: 'Failed to fetch image from GitHub',
                        statusCode: imageRes.statusCode
                    });
                }

                // Set appropriate headers
                res.set({
                    'Content-Type': imageRes.headers['content-type'] || 'image/png',
                    'Cache-Control': 'public, max-age=86400',
                    'Access-Control-Allow-Origin': '*'
                });

                console.log('[VOICEVOX API] Piping image data to client');
                imageRes.pipe(res);
            }).on('error', (err) => {
                console.error('[VOICEVOX API] HTTPS error:', err);
                if (!res.headersSent) {
                    res.status(500).json({
                        error: 'Failed to fetch image',
                        message: err.message
                    });
                }
            });
        };

        fetchImage(url);

    } catch (error) {
        console.error('[VOICEVOX API] /image-proxy error:', error);
        res.status(500).json({
            error: error.message,
            message: 'Image proxy failed'
        });
    }
});


/**
 * POST /api/voicevox/preview
 * 샘플 음성 미리듣기
 * Body: { speakerId, sampleText? }
 */
router.post('/preview', async (req, res) => {
    try {
        const { speakerId, sampleText, options = {} } = req.body;

        if (!speakerId) {
            return res.status(400).json({
                error: 'speakerId is required'
            });
        }

        // 샘플 음성 생성
        const { engineUrl } = req.body;
        const audioBuffer = await voicevoxUtil.generatePreview(
            parseInt(speakerId),
            sampleText,
            engineUrl,
            options
        );

        // WAV 파일로 응답
        res.set({
            'Content-Type': 'audio/wav',
            'Content-Length': audioBuffer.length,
            'Content-Disposition': `inline; filename="preview_${speakerId}.wav"`
        });
        res.send(audioBuffer);

    } catch (error) {
        console.error('[VOICEVOX API] /preview error:', error);
        res.status(500).json({
            error: error.message,
            message: '샘플 음성 생성에 실패했습니다.'
        });
    }
});

/**
 * POST /api/voicevox/generate-script
 * Gemini를 사용하여 영상 분석 → 일본어 대본 자동 생성
 * Body: { videoAnalysis, duration }
 */
router.post('/generate-script', async (req, res) => {
    try {
        const { videoAnalysis, duration = 15 } = req.body;

        if (!videoAnalysis) {
            return res.status(400).json({
                error: 'videoAnalysis is required'
            });
        }

        const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
        if (!GEMINI_API_KEY) {
            throw new Error('GEMINI_API_KEY not configured');
        }

        // Gemini 프롬프트: 타임라인 대본 생성 (3개 국어)
        const prompt = `당신은 YouTube Shorts 전문 콘텐츠 크리에이터입니다.
다음 영상 분석 결과를 바탕으로 일본어 대본을 타임라인 형식으로 생성하세요.

영상 분석:
${JSON.stringify(videoAnalysis, null, 2)}

목표 영상 길이: ${duration}초

요구사항:
1. **일본어 원문 (text_jp)**: 자연스럽고 임팩트 있는 대사
                2. **한국어 번역 (text_kr)**: 원문의 뉘앙스를 살린 번역
                3. **일본어 발음 (text_pron)**: 
                   - 한국인이 읽기 편하도록 한글로 표기
                   - 의미 단위(구/절)마다 `/ ` 기호로 명확히 구분
                   - 장음은 `- ` 사용
                   - 예: "하지메마시테 / 와타시와 / 타나카데스"

                구조:
                - 타임라인 형식으로 구간 분할 (도입-본론-마무리)
                - 각 구간은 TTS로 읽기에 적절한 길이 (구간당 3~8초 권장)
                - Shorts에 최적화된 간결하고 강렬한 표현

JSON 형식으로 응답:
{
  "timeline": [
    {
      "start": 0,
      "end": 3,
      "text_jp": "皆さん、こんにちは！",
      "text_kr": "여러분, 안녕하세요!",
      "text_pron": "미나상, 곤니치와!",
      "description": "도입부"
    },
    ...
  ],
  "totalDuration": ${duration},
  "scriptSummary": "대본 전체 요약"
}`;

        // Gemini로 대본 생성
        const script = await geminiGenerateJSON(
            GEMINI_API_KEY,
            'gemini-2.0-flash',
            [{ text: prompt }]
        );


        console.log('[VOICEVOX API] Script generated:', script);

        res.json({
            success: true,
            script
        });

    } catch (error) {
        console.error('[VOICEVOX API] /generate-script error:', error);
        res.status(500).json({
            error: error.message,
            message: '대본 생성에 실패했습니다.'
        });
    }
});

/**
 * POST /api/voicevox/generate-tts
 * 대본을 TTS 음성 파일로 변환
 * Body: { text, speakerId, filename? }
 */
router.post('/generate-tts', async (req, res) => {
    try {
        const { text, speakerId, filename = 'output.wav', options = {} } = req.body;

        if (!text || !speakerId) {
            return res.status(400).json({
                error: 'text and speakerId are required'
            });
        }

        console.log(`[VOICEVOX API] Generating TTS for: "${text}" with options:`, options);

        // TTS 생성
        const { engineUrl } = req.body;
        const audioBuffer = await voicevoxUtil.generateTTS(
            text,
            parseInt(speakerId),
            engineUrl,
            options
        );

        // WAV 파일로 응답
        res.set({
            'Content-Type': 'audio/wav',
            'Content-Length': audioBuffer.length,
            'Content-Disposition': `attachment; filename="${filename}"`
        });
        res.send(audioBuffer);

    } catch (error) {
        console.error('[VOICEVOX API] /generate-tts error:', error);
        res.status(500).json({
            error: error.message,
            message: 'TTS 생성에 실패했습니다.'
        });
    }
});

/**
 * POST /api/voicevox/batch-generate
 * 여러 대본을 일괄 처리하여 TTS 생성
 * Body: { scripts: [{ text, speakerId, filename }] }
 */
router.post('/batch-generate', async (req, res) => {
    try {
        const { scripts } = req.body;

        if (!scripts || !Array.isArray(scripts)) {
            return res.status(400).json({
                error: 'scripts array is required'
            });
        }

        console.log(`[VOICEVOX API] Batch generating ${scripts.length} TTS files`);

        // 일괄 TTS 생성
        const results = await voicevoxUtil.batchGenerateTTS(scripts);

        // ZIP 파일로 묶어서 응답 (또는 개별 다운로드 URL 제공)
        // 여기서는 간단히 JSON으로 파일 정보만 반환
        res.json({
            success: true,
            files: results.map(r => ({
                filename: r.filename,
                size: r.size
            })),
            message: `${results.length}개의 TTS 파일이 생성되었습니다.`
        });

    } catch (error) {
        console.error('[VOICEVOX API] /batch-generate error:', error);
        res.status(500).json({
            error: error.message,
            message: '일괄 TTS 생성에 실패했습니다.'
        });
    }
});

module.exports = router;
