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

        // 3. Merge & Deduplicate (Filter out MrBeast)
        // 3. Merge & Deduplicate (Filter out MrBeast)
        const styles = [...mongoStyles, ...jsonStyles].filter(s =>
            s.channelId !== 'SAMPLE_MRBEAST' &&
            (!s.channelTitle || !s.channelTitle.includes('MrBeast'))
        );

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
    console.log('[Production] Request Body Keys:', Object.keys(req.body));
    try {
        const { sourceUrl, styleId, styleIds, isHybrid, categoryName, transcriptText, transcriptSegments, videoExplanation, keyMoments, timelineAnalysis } = req.body;

        // Validation: Require either styleId OR (isHybrid + styleIds)
        const hasStyle = styleId || (isHybrid && styleIds && styleIds.length > 0);

        if ((!sourceUrl && !transcriptText && !videoExplanation) || !hasStyle) {
            return res.status(400).json({ error: 'Source URL, Transcript, or Visual Explanation, and Valid Style Selection are required' });
        }

        console.log(`[Production] Generating script using ${isHybrid ? `Hybrid Style (${categoryName})` : `Style ID: ${styleId}`}`);

        // 1. Get Source Transcript
        let finalTranscript = '';
        let sourceMetadata = {
            title: 'Source Video',
            timeline: [],
            duration: 'Unknown',
            key_moments: []
        };
        let timelineData = ''; // NEW: Timeline with timestamps

        if (transcriptText) {
            // Case A: Transcript provided directly (from Local File Whisper)
            finalTranscript = transcriptText;
            sourceMetadata = { title: 'Local File Upload' };

            // NEW: Format timeline with timestamps if segments are provided
            if (transcriptSegments && Array.isArray(transcriptSegments)) {
                sourceMetadata.timeline = transcriptSegments; // Store original segments
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
                    ...sourceMetadata,
                    title: sourceAnalysis.metadata?.title || 'YouTube Video',
                    thumbnail: 'https://img.youtube.com/vi/' + extractYouTubeId(sourceUrl) + '/maxresdefault.jpg'
                };
                // If sourceAnalysis provided segments, we could map them here. 
                // Currently youtube-analyzer returns joined text. 
                // We'll fallback to an empty timeline if segments aren't enriched.
                if (sourceAnalysis.segments) {
                    sourceMetadata.timeline = sourceAnalysis.segments;
                }
            } catch (err) {
                return res.status(400).json({ error: `Video Analysis Failed: ${err.message}` });
            }
        }

        // 2. Fetch Selected Style Data (Handling Hybrid & Single)
        let styleChannel = null;

        if (isHybrid && styleIds && Array.isArray(styleIds)) {
            // === HYBRID MODE ===
            console.log(`[Production] Generating Hybrid Style for ${styleIds.length} channels...`);

            // Fetch all channels
            // Fetch all channels
            let channels = await HotChannel.find({ channelId: { $in: styleIds } }).lean();

            // Fallback: Check for missing IDs in Style Lab JSON
            const missingIds = styleIds.filter(id => !channels.find(c => c.channelId === id));

            if (missingIds.length > 0) {
                try {
                    const fs = require('fs');
                    const path = require('path');
                    const DB_PATH = path.join(__dirname, '../../channel_personas.json');

                    if (fs.existsSync(DB_PATH)) {
                        const data = fs.readFileSync(DB_PATH, 'utf8');
                        const personas = JSON.parse(data);

                        missingIds.forEach(missingId => {
                            const found = personas.find(p => p.id === missingId);
                            if (found) {
                                channels.push({
                                    channelId: found.id,
                                    channelTitle: found.name,
                                    thumbnail: null,
                                    aiAnalysis: {
                                        strategy: found.analysis
                                    }
                                });
                            }
                        });
                    }
                } catch (e) {
                    console.warn('[Production] Hybrid JSON Fallback Error:', e);
                }
            }

            if (channels.length > 0) {
                // Merge DNA
                const names = channels.map(c => c.channelTitle).join(', ');
                const tones = [...new Set(channels.map(c => c.aiAnalysis?.strategy?.tone).filter(Boolean))].join(' + ');
                const personas = channels.map(c => c.aiAnalysis?.strategy?.persona).filter(Boolean).join(' | ');
                const hooks = channels.map(c => c.aiAnalysis?.strategy?.hooks).filter(Boolean).join(' OR ');

                // Merge Arrays (Director Rules, Catchphrases, Transition Phrases)
                const allRules = channels.flatMap(c => c.aiAnalysis?.strategy?.director_rules || []);
                const allCatchphrases = channels.flatMap(c => c.aiAnalysis?.strategy?.catchphrases || []);
                const allTransitions = channels.flatMap(c => c.aiAnalysis?.strategy?.transition_phrases || []);
                const allStructure = channels[0]?.aiAnalysis?.strategy?.structure_template || []; // Use first channel's structure as base for now

                styleChannel = {
                    channelTitle: `Hybrid ${categoryName || 'Mix'} (${names})`,
                    aiAnalysis: {
                        strategy: {
                            persona: `HYBRID PERSONA Mixing traits of: ${names}. Combine these styles: ${personas}`,
                            tone: `Composite Tone: ${tones}`,
                            hooks: `Mix of hooks: ${hooks}`,
                            director_rules: [...new Set(allRules)], // Remove duplicates
                            structure_template: allStructure,
                            catchphrases: [...new Set(allCatchphrases)],
                            vocabulary_patterns: { note: "Mix vocabulary patterns from all source channels" },
                            transition_phrases: [...new Set(allTransitions)],
                            sentence_structure: "Dynamic hybrid structure matching the most engaging elements of each style."
                        }
                    }
                };
            }
        }

        if (!styleChannel && styleId) {
            // === SINGLE MODE ===
            styleChannel = await HotChannel.findOne({ channelId: styleId }).lean();

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
        }

        if (!styleChannel) {
            return res.status(404).json({ error: 'Style Channel(s) not found' });
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
        1. Understand the content and context of the source transcript regardless of language.
        2. Translate and adapt it to **NATURAL, HIGH-QUALITY SPOKEN JAPANESE**.
           - **Style**: Use native-like phrasing, not robotic literal translation.
           - **Nuance**: Capture the exact emotion (anger, sarcasm, shock) of the original speaker.
           - **Constraints**: Do NOT change key facts or meanings.
        3. Apply the creator's DNA style to the translated content.
        4. Ensure text_pron accurately represents the natural Japanese pronunciation using Korean Hangul characters.
        5. **CREATIVE LIBERTY - NON-LINEAR EDITING (DNA FIRST) ✂️**:
           - **DO NOT simply follow the original video's linear timeline if it's boring**. 
           - **COMPRESS and REARRANGE**: If a 45s video can be told more effectively in 40s by skipping boring parts, DO IT.
           - **REORDER DIALOGUE**: You can swap the order of dialogue if it makes the "Hybrid Style" hook or twist stronger.
           - **NARRATOR DOMINANCE**: The Narrator owns the story. Use Dialogue only as "Proof/Evidence" for the Narrator's claims.
        6. **DISTINGUISH BETWEEN:**
           - **"Narration"**: New voiceover you create to add context/style (type: "Narration")
           - **"Dialogue"**: Original dialogue from the source video (type: "Dialogue")
        
        7. 🚨 **CRITICAL - DIALOGUE TRANSLATION ACCURACY:**
           - Translate dialogue LITERALLY and ACCURATELY.
           - Keep the original tone, emotion, and intent.
        
        VALIDATION CHECKLIST (Check before finalizing):
        ✓ Uses at least 3 catchphrases from the DNA.
        ✓ Sentence structure matches the creator's pattern.
        ✓ Transitions use the specified phrases.
        ✓ Tone is consistent throughout.
        ✓ **STORY FLOW (DNA)** is more important than matching original timestamps 1:1.
        ✓ **Type** is correctly set (Narration vs Dialogue).
 
        Source Video Timeline (with original dialogue):
        ${sourceMetadata.timeline.map(t => `- [${t.start} - ${t.end}] ${t.text}`).join('\n')}
 
        **SOURCE VIDEO DURATION: ${sourceMetadata.duration || 'Unknown'}** (DO NOT EXCEED THIS TIME)
 
        **KEY MOMENTS (Use these to anchor your Narration):**
        ${sourceMetadata.key_moments ? sourceMetadata.key_moments.join('\n') : 'No key moments provided'}
 
        VISUAL CONTEXT (Use this to create Narration when dialogue is missing):
        ${videoExplanation ? `Video Explanation: ${videoExplanation}` : ''}
        ${timelineAnalysis ? `Timeline Analysis: ${timelineAnalysis}` : ''}
        
        **INSTRUCTIONS FOR TIMELINE MAPPING (HYBRID STYLE):**
        - **TIME COMPRESSION**: You may shorten the duration of Dialogue segments to increase pacing.
        - **OVERLAP**: Narration can start right after (or slightly before) Dialogue ends for a "Machine Gun" pacing.
        - **MM:SS FORMAT**: ALL segments (both Narration and Dialogue) MUST include "time", "start_time", and "end_time".
          
        **🚨 CRITICAL: STRUCTURE TEMPLATE COMPLIANCE (MANDATORY)**
        You MUST follow the creator's Viral Structure DNA template: ${structureTemplate}
        
        **🚨🚨🚨 CRITICAL: NARRATOR REQUIREMENTS - HYBRID STYLE DNA 🚨🚨🚨**
        
        **MANDATORY NARRATOR COUNT (Minimums based on Style):**
        - **Hook (0-7s)**: MUST start with a Narrator Hook. Never start with raw dialogue.
        - **Body/Twist**: The Narrator MUST speak at least every 10 seconds.
        - **Resolution**: Wrap up with the Narrator asking a question.
        
        **HYBRID STYLE WORDS (MANDATORY)**:
        - Use words like: "사실은(実は)", "경악(驚愕)", "더욱이나(さらに)", "말도 안 돼(ありえない)", "도대체(一体)".
        
        **Narrator Style**: Use ${styleChannel.persona || 'INTRIGUED, SUSPENSEFUL'} tone.
        
        8. **VIRAL OPTIMIZATION OUTPUT (REQUIRED):**
           - Analyze your OWN generated script and provide:
             - "viral_potential": { "score": 0-100, "reason": "Why this script will go viral" }
             - "key_moments": [ { "time": "00:04", "description": "Moment description" } ]
        - Narration segments should have realistic durations (typically 2 - 4 seconds for Hybrid Pacing).
        
         Output Requirements:
        1. ** Titles **: Generate 3 viral title variations matching the high - impact style in the reference images.
            - Patterns: [Specific Subject / Situation] + [Shocking Result / Emotion / Question]
            - Example: "스키장에서 벌어진 충격적인 상황! 당신의 생각은?" or "고의로 사고를 낸 사기꾼들의 최후"
                - Each title must include: Korean(kr), Japanese(jp), Japanese Pronunciation(pron)
                    - Title 1: Hook - focused(curiosity - driven, extreme situation)
                        - Title 2: Emotion - focused(shock / surprise / outrage)
                            - Title 3: Question - focused(user engagement / judgment)
        2. ** Thumbnail Texts **: Generate 3 thumbnail text variations(STRICTLY 2 lines, short and punchy)
            - MUST use \\n to separate exactly two lines for design impact.
            - Pattern: Top line(context / subject), Bottom line(main hook / result)
            - Thumbnail 1: Situation hook
                - Thumbnail 2: Number hook(e.g., "3초만에\\n상황 반전!")
                    - Thumbnail 3: Mystery / Curiosity hook
                        - Each thumbnail must include: Korean(kr), Japanese(jp), Japanese Pronunciation in Hangul(pron)
                            - ** CRITICAL **: Use \\n for ALL languages(kr, jp, pron) to split into exactly 2 lines.
          3. ** Timeline **: FULL DURATION of the story(60s + allowed if necessary to cover the ending / twist)
    - ** DO NOT CUT OFF THE ENDING **
        - If the source video is longer than 60s, compress dialogue or speed up pacing, but ** INCLUDE THE RESOLUTION **.
         4. ** Script Content **:
- "section": Hook / Body / Twist / Conclusion / CTA(based on structure template)
    - "type": Narration(Narrator) or Dialogue(Character)
        - "time": Display time MM: SS
            - "start_time": Start time MM: SS(REQUIRED for ALL segments)
    - "end_time": End time MM: SS(REQUIRED for ALL segments)
    - "text_jp": Japanese with "/" separators between words / phrases for Shorts subtitle timing
        ** MANDATORY **: Add CapCut color tags to 2 - 3 key words per sentence
Example: "常識外れの / <color=#B794F6>行動</color>に、/ <color=#FF6B6B>怒り</color>は / 募るばかりですが..."
    - "text_pron": Hangul pronunciation with "/" matching text_jp separators exactly
        ** MANDATORY **: Apply SAME color tags as text_jp to corresponding words
Example: "죠-시키하즈레노 / <color=#B794F6>코-도-</color>니, / <color=#FF6B6B>이카리</color>와 / 츠노루 바카리 데스가..."
    - "text_kr": Korean Translation using DNA vocabulary
- "original_text": ** CRITICAL ** For 'Dialogue' type, include the EXACT original original language text from the transcript.For 'Narration', keep empty string "".
              ** DO NOT ** fabricate original text.If unknown, leave empty.
            - "emphasis": { "words": ["word1", "word2"], "color": "#FF6B6B", "reason": "emotion/key point" }
- "sfx": Specific sound effect cue
    - "visual_cue": Camera direction

        - **🚨 CRITICAL: 전략적 컬러 강조(CapCut 스타일) - MANDATORY FOR EVERY SEGMENT **
            * EVERY script segment MUST have 2 - 3 color - tagged words in both text_jp and text_pron
    * Use < color=#HEX > 단어</color > format for key words:
              - ** #B794F6(보라) **: 주인공, 핵심 명사, 깜짝 반전 요소, 충격, 미스터리
    - ** #FF6B6B(빨강) **: 위기, 강렬 감정(분노), 액션 키워드, 경고
        - ** #FFD93D(노랑) **: 숫자, 팩트, 꿀팁, 핵심 정보, 긍정 감정
            - **#6BCF7F(초록) **: 질문, 궁금증 유발, 새로운 사실, 안정
                - **#4DABF7(파랑) **: 슬픔, 냉정, 이성적 판단, 차가움

8. ** VISUAL DIRECTION Rules 🎥**
    - You act as the Video Editor.For every segment, provide a specific 'visual_cue'.
           - Must match the 'director_rules' and pacing.
           - Examples: "Zoom In (Fast)", "Camera Shake", "Black & White Filter", "Slow Motion", "Split Screen", "Text Overlay: [Text]"
    - ** Hook Section **: Must be visually aggressive(e.g., "Rapid Zoom", "Flash Effect").

        9. ** VIRAL REASONING 🧠**
    - Explain WHY you chose this specific Hook and Title in a new field 'viral_logic'.
           - Connect it back to the Creator's Persona.

        Output Format(JSON):
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
            "viral_logic": "Hook uses 'Shocking Situation' strategy...",
            "viral_potential": {
                "score": 95,
                "reason": "Why this script will go viral (e.g. strong hook, unexpected twist)"
            },
            "key_moments": [
                { "time": "00:04", "description": "Moment description" },
                { "time": "00:12", "description": "Another moment" }
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
                    "original_text": "",
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
                    "original_text": "Tu pourrais essayer d'aller plus vite",
                    "emphasis": { "words": ["速く", "どうだ"], "color": "#FFD93D, #6BCF7F", "reason": "speed emphasis, question" },
                    "sfx": "None",
                    "visual_cue": "Medium shot"
                }
            ]
        }
        `;

        // 4. Call Gemini (Direct Client with Stability Settings)
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({
            model: "gemini-2.5-flash",
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
