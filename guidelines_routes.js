// ========================================
// YouTube Guidelines Monitoring System APIs
// ========================================

const Guideline = require('./models/Guideline');
const ViolationCheck = require('./models/ViolationCheck');
const multer = require('multer');
const fs = require('fs');
const { geminiGenerateJSON } = require('./server/utils/gemini.util');

// Configure video upload
const videoUpload = multer({
    dest: 'uploads/temp/',
    limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
    fileFilter: (req, file, cb) => {
        const allowed = ['video/mp4', 'video/mov', 'video/avi', 'video/quicktime'];
        if (allowed.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only MP4, MOV, AVI allowed.'));
        }
    }
});

module.exports = function (app, GEMINI_API_KEY, PERPLEXITY_API_KEY) {

    // API: Get all guidelines
    app.get('/api/guidelines', async (req, res) => {
        try {
            const { category } = req.query;

            const query = category ? { category, isActive: true } : { isActive: true };
            const guidelines = await Guideline.find(query).sort({ category: 1, title: 1 });

            res.json({
                guidelines,
                totalCount: guidelines.length
            });
        } catch (error) {
            console.error('[Guidelines API] Error:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // API: Check uploaded video file with Gemini Vision
    app.post('/api/guidelines/check-video', videoUpload.single('video'), async (req, res) => {
        let videoPath = null;

        try {
            const { title, description } = req.body;

            if (!req.file) {
                return res.status(400).json({ error: 'No video file uploaded' });
            }

            videoPath = req.file.path;
            console.log('[Guidelines] Analyzing uploaded video:', title);
            console.log('[Guidelines] File:', videoPath, req.file.mimetype);

            // Read video file
            console.log('[Guidelines] Reading video file...');
            const videoData = fs.readFileSync(videoPath);
            const videoBase64 = videoData.toString('base64');

            // Analyze with Gemini Vision
            console.log('[Guidelines] Starting Gemini Vision analysis...');
            const analysis = await analyzeVideoWithGemini({
                inlineData: {
                    data: videoBase64,
                    mimeType: req.file.mimetype
                }
            }, {
                title: title || 'Untitled',
                description: description || ''
            }, GEMINI_API_KEY);

            console.log('[Guidelines] Analysis complete');

            // Save to database
            const check = await ViolationCheck.create({
                videoFile: req.file.filename,
                title: title || 'Uploaded Video',
                description,
                analysis
            });

            // Clean up local file
            if (fs.existsSync(videoPath)) {
                fs.unlinkSync(videoPath);
                console.log('[Guidelines] Temp file cleaned up');
            }

            res.json({
                checkId: check._id,
                title,
                analysis
            });

        } catch (error) {
            console.error('[Guidelines Check Video] Error:', error);

            // Clean up on error
            if (videoPath && fs.existsSync(videoPath)) {
                fs.unlinkSync(videoPath);
            }

            res.status(500).json({ error: error.message });
        }
    });

    // API: Generate Shorts titles (Korean, Japanese, Japanese pronunciation)
    app.post('/api/guidelines/generate-titles', videoUpload.single('video'), async (req, res) => {
        let videoPath = null;

        try {
            const { title, description } = req.body;

            if (!req.file) {
                return res.status(400).json({ error: 'No video file uploaded' });
            }

            videoPath = req.file.path;
            console.log('[Title Generation] Analyzing video:', title);

            // Read video file
            console.log('[Title Generation] Reading video file...');
            const videoData = fs.readFileSync(videoPath);
            const videoBase64 = videoData.toString('base64');

            console.log('[Title Generation] Generating titles...');
            const titles = await generateShortsTitle({
                inlineData: {
                    data: videoBase64,
                    mimeType: req.file.mimetype
                }
            }, {
                title: title || '',
                description: description || ''
            }, GEMINI_API_KEY);

            // Clean up local file
            if (fs.existsSync(videoPath)) {
                fs.unlinkSync(videoPath);
            }

            res.json({
                success: true,
                titles
            });

        } catch (error) {
            console.error('[Title Generation] Error:', error);

            // Clean up on error
            if (videoPath && fs.existsSync(videoPath)) {
                fs.unlinkSync(videoPath);
            }

            res.status(500).json({ error: error.message });
        }
    });

    // API: Get guideline updates (Perplexity)
    app.get('/api/guidelines/updates', async (req, res) => {
        try {
            const query = `YouTube에서 최근 30일 내 업데이트된 커뮤니티 가이드라인, 수익 창출 정책, Shorts 정책 변경사항을 알려주세요. 날짜와 출처를 포함해주세요.`;

            const response = await fetch('https://api.perplexity.ai/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: 'llama-3.1-sonar-large-128k-online',
                    messages: [{ role: 'user', content: query }]
                })
            });

            const data = await response.json();
            const updates = data.choices[0].message.content;

            res.json({
                updates,
                queriedAt: new Date()
            });

        } catch (error) {
            console.error('[Guidelines Updates] Error:', error);
            res.status(500).json({ error: error.message });
        }
    });

};

// Analyze video with Gemini Vision API
async function analyzeVideoWithGemini(file, metadata, GEMINI_API_KEY) {
    const prompt = `당신은 YouTube 가이드라인 전문가입니다.
이 비디오가 YouTube 정책을 위반하는지 분석해주세요.

제목: ${metadata.title}
설명: ${metadata.description}

비디오를 보면서 다음을 분석해주세요:
1. 영상 내용 (폭력성, 선정성, 위험한 행위, 혐오 표현)
2. 음성 내용 (욕설, 혐오 발언, 거짓 정보, 스팸)
3. 시각적 요소 (부적절한 이미지, 타인 저작물 도용)
4. Shorts 정책 준수 (60초 이하, 세로 영상 등)
5. 배경음악(BGM) 분석
   - 저작권이 있을 가능성 (유명 음원, 상업적 음악 감지 여부)
   - 음악의 분위기가 영상 내용과 조화를 이루는지
   - 음량과 품질이 적절한지

타임스탬프와 함께 구체적인 문제점을 지적해주세요.

JSON 형식으로만 응답:
{
  "overallStatus": "safe" | "warning" | "danger",
  "score": 85,
  "violations": [
    {
      "timestamp": "00:15",
      "category": "community_guidelines",
      "severity": "medium",
      "issue": "부적절한 언어 사용",
      "recommendation": "해당 표현을 순화"
    }
  ],
  "summary": "전반적인 평가",
  "bgmAnalysis": {
    "hasCopyrightRisk": true,
    "copyrightRiskLevel": "low",
    "atmosphereMatch": "잘 어울림",
    "volumeQuality": "적절함",
    "recommendation": "BGM 관련 권장사항"
  }
}`;

    try {
        const analysis = await geminiGenerateJSON(GEMINI_API_KEY, 'gemini-2.0-flash-exp', [
            file,
            { text: prompt }
        ]);

        console.log('[Gemini Vision] Analysis complete');
        return analysis;

    } catch (error) {
        console.error('[Analyze Video] Error:', error);
        throw error;
    }
}

// Generate Shorts titles with Gemini Vision API
async function generateShortsTitle(file, metadata, GEMINI_API_KEY) {
    const prompt = `당신은 YouTube Shorts 전문 콘텐츠 크리에이터입니다.
이 영상을 분석하여 Shorts에 최적화된 임팩트 있는 제목을 만들어주세요.

${metadata.title ? `참고 제목: ${metadata.title}` : ''}
${metadata.description ? `참고 설명: ${metadata.description}` : ''}

영상의 핵심 내용, 감정, 분위기를 파악하여 다음 조건에 맞는 제목을 생성해주세요:

**제목 생성 규칙:**
- 짧고 임팩트 있게 (10-20자 권장)
- 호기심을 유발하는 표현 사용
- 감정을 자극하는 단어 포함
- Shorts 특성에 맞는 직관적 표현

**출력 형식 (JSON):**
{
  "korean": [
    "한국어 제목 1",
    "한국어 제목 2",
    "한국어 제목 3"
  ],
  "japanese": [
    "日本語タイトル1",
    "日本語タイトル2",
    "日本語タイトル3"
  ],
  "japanesePronunciation": [
    "니혼고 타이토루 1 (한글 발음)",
    "니혼고 타이토루 2 (한글 발음)",
    "니혼고 타이토루 3 (한글 발음)"
  ],
  "videoInterpretation": "영상을 어떻게 해석했는지 간단히 설명 (핵심 내용, 분위기, 메시지 등)"
}`;

    try {
        const titles = await geminiGenerateJSON(GEMINI_API_KEY, 'gemini-2.0-flash-exp', [
            file,
            { text: prompt }
        ]);

        console.log('[Title Generation] Titles generated');
        return titles;

    } catch (error) {
        console.error('[Generate Titles] Error:', error);
        throw error;
    }
}
