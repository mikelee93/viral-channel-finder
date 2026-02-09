/**
 * AI Production Pipeline Routes
 * Handles Style Selection and Script Generation
 */

const express = require('express');
const router = express.Router();
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");
const { analyzeVideoUrl } = require('../services/url-analyzer.service');
const { geminiGenerateJSON } = require('../utils/gemini.util');
const HotChannel = require('../../models/HotChannel'); // Adjusted path to root models
const { extractYouTubeId } = require('../services/youtube-analyzer.service');

/**
 * Helper: Format seconds to MM:SS
 */
function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * GET /api/production/styles
 * Returns list of available styles (Hot Channels)
 */
router.get('/styles', async (req, res) => {
    try {
        const fs = require('fs');
        const path = require('path');
        const DB_PATH = path.join(__dirname, '../../channel_personas.json'); // Path to Style Lab DB

        // 1. Fetch from MongoDB (HotChannel)
        const mongoStyles = await HotChannel.find({
            'aiAnalysis.strategy': { $exists: true }
        })
            .select('channelId channelTitle categoryName thumbnail aiAnalysis.strategy aiAnalysis.summary')
            .sort({ lastUpdated: -1 })
            .lean();

        // 2. Fetch from JSON File (Style Lab)
        let jsonStyles = [];
        try {
            if (fs.existsSync(DB_PATH)) {
                const data = fs.readFileSync(DB_PATH, 'utf8');
                const personas = JSON.parse(data);

                // Map JSON structure to MongoDB structure
                jsonStyles = personas.map(p => ({
                    channelId: p.id,
                    channelTitle: p.name,
                    categoryName: p.category, // e.g. 'entertainment' (lowercase ID)
                    thumbnail: null, // JSON DB might not have thumbnail stored persistently?
                    aiAnalysis: {
                        strategy: p.analysis, // Takes the whole analysis object
                        summary: p.analysis.summary
                    },
                    isJsonSource: true
                }));
            }
        } catch (e) {
            console.error('[Production] Error reading channel_personas.json', e);
        }

        // 3. Merge & Deduplicate
        const styles = [...mongoStyles, ...jsonStyles];

        // Category Mapping (English -> Korean) matching Hot Channel functions
        const CATEGORY_MAPPING = {
            'Film & Animation': '영화/애니메이션',
            'Autos & Vehicles': '자동차',
            'Music': '음악',
            'Pets & Animals': '반려동물/동물',
            'Sports': '스포츠',
            'Travel & Events': '여행/이벤트',
            'Gaming': '게임',
            'People & Blogs': '인물/블로그',
            'Comedy': '코미디',
            'Entertainment': '엔터테인먼트',
            'News & Politics': '뉴스/정치',
            'Howto & Style': '노하우/스타일',
            'Education': '교육',
            'Science & Technology': '과학기술',
            'Nonprofits & Activism': '비영리/사회운동',
            // Lowercase IDs from Style Lab
            'film': '영화/애니메이션',
            'autos': '자동차',
            'music': '음악',
            'pets': '반려동물/동물',
            'sports': '스포츠',
            'travel': '여행/이벤트',
            'gaming': '게임',
            'people': '인물/블로그',
            'comedy': '코미디',
            'entertainment': '엔터테인먼트',
            'news': '뉴스/정치',
            'howto': '노하우/스타일',
            'education': '교육',
            'tech': '과학기술',
            'nonprofit': '비영리/사회운동',
            'general': '일반'
        };

        // Group by Category
        const stylesByCategory = {};
        styles.forEach(style => {
            const rawCat = style.categoryName || 'General';
            // Translate to Korean if possible, otherwise use raw
            const cat = CATEGORY_MAPPING[rawCat] || rawCat;

            // Normalize "General" fallback
            const finalCat = (cat === 'General') ? '일반' : cat;

            if (!stylesByCategory[finalCat]) stylesByCategory[finalCat] = [];

            // Avoid duplicate IDs
            if (!stylesByCategory[finalCat].find(s => s.id === style.channelId)) {
                stylesByCategory[finalCat].push({
                    id: style.channelId,
                    name: style.channelTitle,
                    thumbnail: style.thumbnail,
                    strategy: style.aiAnalysis?.strategy, // Use strategy properly
                    summary: style.aiAnalysis?.summary
                });
            }
        });

        res.json({ success: true, styles: stylesByCategory });

    } catch (error) {
        console.error('[Production API] Error fetching styles:', error);
        res.status(500).json({ error: 'Failed to load styles' });
    }
});

/**
 * POST /api/production/generate
 * Generates AI Script based on Source Video and Selected Style
 */
router.post('/generate', async (req, res) => {
    try {
        const { sourceUrl, styleId, transcriptText, transcriptSegments } = req.body;

        if ((!sourceUrl && !transcriptText) || !styleId) {
            return res.status(400).json({ error: 'Source URL (or Transcript) and Style ID are required' });
        }

        console.log(`[Production] Generating script using style ${styleId}`);

        // 1. Get Source Transcript
        let finalTranscript = '';
        let sourceMetadata = {};
        let timelineData = ''; // NEW: Timeline with timestamps

        if (transcriptText) {
            // Case A: Transcript provided directly (from Local File Whisper)
            finalTranscript = transcriptText;
            sourceMetadata = { title: 'Local File Upload' };

            // NEW: Format timeline with timestamps if segments are provided
            if (transcriptSegments && Array.isArray(transcriptSegments)) {
                timelineData = transcriptSegments.map(seg => {
                    const start = formatTime(seg.start);
                    const end = formatTime(seg.end);
                    return `[${start} → ${end}] ${seg.text}`;
                }).join('\n');
            }
        } else {
            // Case B: URL provided (YouTube)
            try {
                const sourceAnalysis = await analyzeVideoUrl(sourceUrl);
                if (!sourceAnalysis.transcript) {
                    return res.status(400).json({ error: 'No transcript found for this video.' });
                }
                finalTranscript = sourceAnalysis.transcript;
                sourceMetadata = {
                    title: sourceAnalysis.metadata?.title,
                    thumbnail: 'https://img.youtube.com/vi/' + extractYouTubeId(sourceUrl) + '/maxresdefault.jpg'
                };
            } catch (err) {
                return res.status(400).json({ error: `Video Analysis Failed: ${err.message}` });
            }
        }

        // 2. Fetch Selected Style Data
        let styleChannel = await HotChannel.findOne({ channelId: styleId }).lean();

        // Fallback: Check Style Lab JSON (channel_personas.json)
        if (!styleChannel) {
            try {
                const fs = require('fs');
                const path = require('path');
                const DB_PATH = path.join(__dirname, '../../channel_personas.json');

                if (fs.existsSync(DB_PATH)) {
                    const data = fs.readFileSync(DB_PATH, 'utf8');
                    const personas = JSON.parse(data);
                    const found = personas.find(p => p.id === styleId);

                    if (found) {
                        console.log(`[Production] Found style in Style Lab File: ${found.name}`);
                        // Map JSON to MongoDB structure expected below
                        styleChannel = {
                            channelTitle: found.name,
                            thumbnail: null, // Fallback
                            aiAnalysis: {
                                strategy: {
                                    persona: found.analysis.prompt_instruction, // Map 'prompt_instruction' to 'persona'
                                    tone: found.analysis.tone,
                                    hooks: found.analysis.hook_style,
                                    director_rules: found.analysis.director_rules,
                                    structure_template: found.analysis.structure_template
                                }
                            }
                        };
                    }
                }
            } catch (e) {
                console.error('[Production] Error checking Style Lab file:', e);
            }
        }

        if (!styleChannel) {
            return res.status(404).json({ error: 'Style Channel not found' });
        }

        // 3. Construct Gemini Prompt with STRONG DNA ENFORCEMENT
        const stylePersona = styleChannel.aiAnalysis?.strategy?.persona || 'A witty and engaging narrator';
        const styleTone = styleChannel.aiAnalysis?.strategy?.tone || 'Energetic and fast-paced';
        const styleHooks = styleChannel.aiAnalysis?.strategy?.hooks || 'Ask a surprising question';
        const directorRules = JSON.stringify(styleChannel.aiAnalysis?.strategy?.director_rules || []);
        const structureTemplate = JSON.stringify(styleChannel.aiAnalysis?.strategy?.structure_template || []);

        // NEW: Extract vocabulary and linguistic patterns
        const catchphrases = JSON.stringify(styleChannel.aiAnalysis?.strategy?.catchphrases || []);
        const vocabularyPatterns = JSON.stringify(styleChannel.aiAnalysis?.strategy?.vocabulary_patterns || {});
        const sentenceStructure = styleChannel.aiAnalysis?.strategy?.sentence_structure || 'Dynamic mix of short and long sentences';
        const transitionPhrases = JSON.stringify(styleChannel.aiAnalysis?.strategy?.transition_phrases || []);

        const prompt = `
        Role: You are a professional YouTube Shorts Director mirroring a specific Creator Persona.
        
        Target Persona DNA:
        - Name: ${styleChannel.channelTitle}
        - Tone: ${styleTone}
        - Style: ${stylePersona}
        - Hook Strategy: ${styleHooks}
        - Structure Template: ${structureTemplate}
        
        ═══════════════════════════════════════════════════════════════
        🧬 CRITICAL DNA APPLICATION RULES (STRICT ENFORCEMENT REQUIRED)
        ═══════════════════════════════════════════════════════════════
        
        1. **VOCABULARY LOCK 🔒**
           - You MUST use these exact catchphrases: ${catchphrases}
           - Preferred vocabulary patterns: ${vocabularyPatterns}
           - Every sentence should feel like it came from the original creator
        
        2. **SENTENCE STRUCTURE MATCH 📏**
           - Target structure: ${sentenceStructure}
           - Mirror the original's rhythm and flow precisely
           - DO NOT write in generic "AI voice" - copy the creator's syntax
        
        3. **TRANSITION PHRASES 🔗**
           - Use ONLY these transition words: ${transitionPhrases}
           - Connect ideas exactly how the original creator would
        
        4. **TONE CONSISTENCY 🎭**
           - Every single line must reflect: ${styleTone}
           - Check each sentence against this tone requirement
        
        5. **STRUCTURE TEMPLATE ⏱️**
           - Follow this timing EXACTLY: ${structureTemplate}
           - DO NOT deviate from the original pacing
        
        6. **DIRECTOR RULES 🎬**
           - Apply these rules to every frame: ${directorRules}
        
        ═══════════════════════════════════════════════════════════════

        Task: 
        Rewrite the following source video transcript into a new Viral Shorts Script that is INDISTINGUISHABLE from the original creator's style.
        
        **IMPORTANT: The source transcript may be in ANY language (English, French, Spanish, etc.). You MUST:**
        1. Understand the content and context of the source transcript regardless of language
        2. Translate and adapt it to **NATURAL, HIGH-QUALITY SPOKEN JAPANESE**
           - **Style**: Use native-like phrasing, not robotic literal translation.
           - **Nuance**: Capture the exact emotion (anger, sarcasm, shock) of the original speaker.
           - **Constraints**: Do NOT change key facts or meanings (e.g. "stain" -> "snow").
        3. Apply the creator's DNA style to the translated content
        4. Ensure text_pron accurately represents the natural Japanese pronunciation using Korean Hangul characters (use strong consonants for emphasis)
        5. **USE THE ORIGINAL TIMELINE TIMESTAMPS** - Map your script to the exact timestamps from the source video
        6. **DISTINGUISH BETWEEN:**
           - **"Narration"**: New voiceover you create to add context/style (type: "Narration")
           - **"Dialogue"**: Original dialogue from the source video (type: "Dialogue", use original timestamps)
        
        7. 🚨 **CRITICAL - DIALOGUE TRANSLATION ACCURACY:**
           - **DO NOT reinterpret or change the meaning of original dialogue**
           - Translate dialogue LITERALLY and ACCURATELY
           - Example: "je te met une tache" = "I'll put a stain on you" → "跡をつける" (leave a mark)
           - **DO NOT** change threatening language into playful language
           - **DO NOT** add context that isn't in the original (e.g., changing "stain" to "snow")
           - Keep the original tone, emotion, and intent
        
        VALIDATION CHECKLIST (Check before finalizing):
        ✓ Uses at least 3 catchphrases from the DNA
        ✓ Sentence structure matches the creator's pattern
        ✓ Transitions use the specified phrases
        ✓ Tone is consistent throughout
        ✓ Structure template timing is followed
        ✓ All director rules are applied
        ✓ **Timestamps match the original video timeline**
        ✓ **Type is correctly set (Narration vs Dialogue)**

        Source Video Timeline (with original dialogue):
        ${timelineData || finalTranscript.slice(0, 6000)}
        
        
        **🚨 CRITICAL: STRUCTURE TEMPLATE COMPLIANCE (MANDATORY)**
        You MUST follow the creator's Viral Structure DNA template. Each section requires BOTH Narration and Dialogue:
        
        **🚨🚨🚨 CRITICAL: NARRATOR REQUIREMENTS - YOU WILL BE PENALIZED IF YOU SKIP THIS 🚨🚨🚨**
        
        **MANDATORY NARRATOR COUNT (MINIMUM per section) - COUNT THEM BEFORE SUBMITTING:**
        - **Hook (0-5s)**: Minimum 1 Narrator
        - **Rising Action (5-20s)**: Minimum 2 Narrators
        - **Climax/Twist (20-40s+)**: � **MINIMUM 3 NARRATORS - THIS IS NON-NEGOTIABLE** 🔴
          * **RULE**: After every 2-3 dialogue segments, INSERT 1 narrator segment
                    * **Example pattern**: NARRATOR → Dialogue → Dialogue → NARRATOR → Dialogue → Dialogue → NARRATOR → Dialogue → NARRATOR
          * Narrator examples for Climax:
            - "しかし、この男の主張は..." (But this man's claim...)
            - "果たして、誰が正しいのか？" (Who is right?)
            - "常識外れの行動に、怒りは募るばかりですが..." (This outrageous behavior only fuels anger...)
        - **Resolution (40-55s+)**: Minimum 1-2 Narrators
          * Wrap up with ironic commentary
          * Ask audience question: "皆さんはどう思いますか？"
        
        **VALIDATION CHECKLIST - CHECK BEFORE SUBMITTING:**
        ✅ Hook section has at least 1 narrator? 
        ✅ Rising Action has at least 2 narrators?
        ✅ **Climax/Twist has at least 3 narrators?** ← MOST IMPORTANT
        ✅ Resolution has at least 1 narrator?
        ✅ Total narrator count is at least 7-8?
        
        **Narrator Style**: Use ${styleChannel.persona || 'INTRIGUED, SUSPENSEFUL'} tone:
        - Add dramatic context between dialogue
        - Build suspense and curiosity
        - Highlight ironic or shocking elements
        - **DO NOT just translate dialogue - ADD NEW NARRATIVE CONTEXT**
        
        **INSTRUCTIONS FOR TIMELINE MAPPING:**
        - For **Dialogue** segments: Use the EXACT timestamps from the source timeline above
        - For **Narration** segments: Insert between dialogue segments where appropriate
        - **CRITICAL**: ALL segments (both Narration and Dialogue) MUST include:
          - "time": Display time in MM:SS format (e.g., "00:15")
          - "start_time": Start timestamp in MM:SS format (e.g., "00:15")
          - "end_time": End timestamp in MM:SS format (e.g., "00:18")
        - Narration segments should have realistic durations (typically 3-5 seconds per sentence)
        
         Output Requirements:
         1. **Titles**: Generate 3 viral title variations matching the high-impact style in the reference images.
            - Patterns: [Specific Subject/Situation] + [Shocking Result/Emotion/Question]
            - Example: "스키장에서 벌어진 충격적인 상황! 당신의 생각은?" or "고의로 사고를 낸 사기꾼들의 최후"
            - Each title must include: Korean (kr), Japanese (jp), Japanese Pronunciation (pron)
            - Title 1: Hook-focused (curiosity-driven, extreme situation)
            - Title 2: Emotion-focused (shock/surprise/outrage)
            - Title 3: Question-focused (user engagement/judgment)
         2. **Thumbnail Texts**: Generate 3 thumbnail text variations (STRICTLY 2 lines, short and punchy)
            - MUST use \\n to separate exactly two lines for design impact.
            - Pattern: Top line (context/subject), Bottom line (main hook/result)
            - Thumbnail 1: Situation hook
            - Thumbnail 2: Number hook (e.g., "3초만에\\n상황 반전!")
            - Thumbnail 3: Mystery/Curiosity hook
            - Each thumbnail must include: Korean (kr), Japanese (jp), Japanese Pronunciation in Hangul (pron)
            - **CRITICAL**: Use \\n for ALL languages (kr, jp, pron) to split into exactly 2 lines.
          3. **Timeline**: FULL DURATION of the story (60s+ allowed if necessary to cover the ending/twist)
             - **DO NOT CUT OFF THE ENDING**
             - If the source video is longer than 60s, compress dialogue or speed up pacing, but **INCLUDE THE RESOLUTION**.
         4. **Script Content**:
            - "section": Hook / Body / Twist / Conclusion / CTA (based on structure template)
            - "type": Narration (Narrator) or Dialogue (Character)
            - "time": Display time MM:SS
            - "start_time": Start time MM:SS (REQUIRED for ALL segments)
            - "end_time": End time MM:SS (REQUIRED for ALL segments)
            - "text_jp": Japanese with "/" separators between words/phrases for Shorts subtitle timing
              **MANDATORY**: Add CapCut color tags to 2-3 key words per sentence
              Example: "常識外れの / <color=#B794F6>行動</color>に、/ <color=#FF6B6B>怒り</color>は / 募るばかりですが..."
            - "text_pron": Hangul pronunciation with "/" matching text_jp separators exactly
              **MANDATORY**: Apply SAME color tags as text_jp to corresponding words
              Example: "죠-시키하즈레노 / <color=#B794F6>코-도-</color>니, / <color=#FF6B6B>이카리</color>와 / 츠노루 바카리 데스가..."
            - "text_kr": Korean Translation using DNA vocabulary
            - "emphasis": { "words": ["word1", "word2"], "color": "#FF6B6B", "reason": "emotion/key point" }
            - "sfx": Specific sound effect cue
            - "visual_cue": Camera direction
         
          - **🚨 CRITICAL: 전략적 컬러 강조 (CapCut 스타일) - MANDATORY FOR EVERY SEGMENT**
            * EVERY script segment MUST have 2-3 color-tagged words in both text_jp and text_pron
            * Use <color=#HEX>단어</color> format for key words:
              - **#B794F6 (보라)**: 주인공, 핵심 명사, 깜짝 반전 요소, 충격, 미스터리
              - **#FF6B6B (빨강)**: 위기, 강렬 감정(분노), 액션 키워드, 경고
              - **#FFD93D (노랑)**: 숫자, 팩트, 꿀팁, 핵심 정보, 긍정 감정
              - **#6BCF7F (초록)**: 질문, 궁금증 유발, 새로운 사실, 안정
              - **#4DABF7 (파랑)**: 슬픔, 냉정, 이성적 판단, 차가움

        Output Format (JSON):
        {
          "titles": [
            {
              "kr": "🔥 스키장에서 벌어진 충격적인 상황! 당신의 생각은?",
              "jp": "🔥 スキー場で起きた衝撃的な状況！皆さんの考えは？",
              "pron": "🔥 스키-죠-데 오키타 쇼-게키테키나 죠-쿄-! 미나산노 칸가에와?"
            },
            {
              "kr": "😱 블랙코스 한가운데서 멈춘 남자... 믿을 수 없는 주장!",
              "jp": "😱 ブラックコースの真ん中で止まった男…信じられない主張！",
              "pron": "😱 부랏쿠코-스노 만나카데 토맛타 오토코... 신지라레나이 슈쵸-!"
            },
            {
              "kr": "❓ 이 상황, 누가 잘못한 걸까요?",
              "jp": "❓ この状況、誰が悪いのでしょうか？",
              "pron": "❓ 코노 죠-쿄-, 다레가 와루이노데쇼-카?"
            }
          ],
          "thumbnails": [
            {
              "kr": "블랙코스 한가운데서\\n멈춘 남자",
              "jp": "ブラックコースの\\n真ん中で止まった男",
              "pron": "부랏쿠코-스노\\n만나카데 토맛타 오토코"
            },
            {
              "kr": "3초만에\\n상황 반전!",
              "jp": "3秒で\\n状況が逆転！",
              "pron": "산뵤-데\\n죠-쿄-가 갸쿠텐!"
            },
            {
              "kr": "충격적인 주장\\n과연 누가?",
              "jp": "衝撃的な主張\\n果たして誰が？",
              "pron": "쇼-게키테키나 슈쵸-\\n하타시테 다레가?"
            }
          ],
          "bgm_mood": "Mood description",
          "keywords": ["#Shorts", "#Keyword"],
          "script": [
            {
              "time": "00:00",
              "start_time": "00:00",
              "end_time": "00:04",
              "section": "Hook",
              "type": "Narration",
              "speaker": "Narrator",
              "text_jp": "スキー場で / 起きた / <color=#FF6B6B>衝撃的な</color> / 状況！",
              "text_pron": "스키-죠-데 / 오키타 / <color=#FF6B6B>쇼-게키테키나</color> / 죠-쿄-!",
              "text_kr": "스키장에서 벌어진 충격적인 상황!",
              "emphasis": { "words": ["衝撃的な"], "color": "#FF6B6B", "reason": "shock emotion" },
              "sfx": "Boom",
              "visual_cue": "Close up"
            },
            {
              "time": "00:05",
              "start_time": "00:05",
              "end_time": "00:08",
              "section": "Rising Action",
              "type": "Dialogue",
              "speaker": "Original Speaker",
              "text_jp": "もっと / <color=#FFD93D>速く</color> / 滑ってみたら / <color=#6BCF7F>どうだ</color>？",
              "text_pron": "못토 / <color=#FFD93D>하야쿠</color> / 스베테 미타라 / <color=#6BCF7F>도-다</color>?",
              "text_kr": "좀 더 빨리 타보지 그래?",
              "emphasis": { "words": ["速く", "どうだ"], "color": "#FFD93D, #6BCF7F", "reason": "speed emphasis, question" },
              "original_text": "Tu pourrais essayer d'aller plus vite",
              "sfx": "None",
              "visual_cue": "Medium shot"
            }
          ]
        }
        `;

        // 4. Call Gemini (Direct Client with Stability Settings)
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({
            model: "gemini-2.0-flash",
            generationConfig: {
                maxOutputTokens: 65536,
                temperature: 0.7,
                responseMimeType: "application/json"
            },
            safetySettings: [
                { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
                { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
                { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
                { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
            ]
        }, {
            timeout: 1800000 // 30 mins timeout
        });

        const result = await model.generateContent([prompt]);
        const responseText = result.response.text();

        let scriptJson;
        try {
            // 1. Extract JSON block (find first { and last })
            let jsonContent = responseText.trim();
            const firstBrace = jsonContent.indexOf('{');
            const lastBrace = jsonContent.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace !== -1) {
                jsonContent = jsonContent.substring(firstBrace, lastBrace + 1);
            }

            // 2. Robust JSON cleanup: Only escape control chars if they are INSIDE double quotes
            // This prevents breaking the overall JSON structure while fixing "Bad control character" errors
            let sanitizedResponse = "";
            let inString = false;
            let escaped = false;

            for (let i = 0; i < jsonContent.length; i++) {
                const char = jsonContent[i];

                if (char === '"' && !escaped) {
                    inString = !inString;
                    sanitizedResponse += char;
                } else if (inString) {
                    if (char === '\n') sanitizedResponse += '\\n';
                    else if (char === '\r') sanitizedResponse += '\\r';
                    else if (char === '\t') sanitizedResponse += '\\t';
                    else if (char === '\\' && !escaped) {
                        escaped = true;
                        sanitizedResponse += char;
                        continue;
                    } else sanitizedResponse += char;
                } else {
                    sanitizedResponse += char;
                }
                escaped = false;
            }

            scriptJson = JSON.parse(sanitizedResponse);
        } catch (e) {
            console.warn('[Production] ⚠️ JSON Parse Failed. Attempting Truncation Repair...');
            let jsonStr = responseText.trim();

            // Try to find the last valid object/array completion
            const lastCompleteObject = jsonStr.lastIndexOf('},');
            const lastCompleteArray = jsonStr.lastIndexOf(']');

            if (lastCompleteObject !== -1) {
                const repairedJson = jsonStr.substring(0, lastCompleteObject + 1) + '] }';
                try {
                    scriptJson = JSON.parse(repairedJson);
                    console.log('[Production] 🔧 JSON Repaired Successfully (Object Truncation)!');
                } catch (repairError) {
                    console.error('[Production] ❌ Repair Failed:', repairError);
                    throw e;
                }
            } else if (lastCompleteArray !== -1) {
                const repairedJson = jsonStr.substring(0, lastCompleteArray + 1) + ' }';
                try {
                    scriptJson = JSON.parse(repairedJson);
                    console.log('[Production] 🔧 JSON Repaired Successfully (Array Truncation)!');
                } catch (repairError) {
                    console.error('[Production] ❌ Repair Failed:', repairError);
                    throw e;
                }
            } else {
                throw e;
            }
        }

        console.log('[Production] Script Generated Successfully');

        res.json({
            success: true,
            data: scriptJson,  // Return parsed JSON, not raw Gemini result
            sourceMetadata,
            styleMetadata: {
                name: styleChannel.channelTitle,
                thumbnail: styleChannel.thumbnail
            }
        });

    } catch (error) {
        console.error('[Production API] Generate Error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
