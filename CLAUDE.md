# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

YouTube Viral Finder & AI Analyzer - A web application that helps users discover viral content, analyze trending channels, and generate AI-powered video scripts. The application supports multiple platforms (YouTube, TikTok) and integrates with various AI services for content analysis and generation.

## Development Commands

### Server
```bash
npm start              # Start production server (port 4000)
npm run dev            # Start development server with nodemon (auto-restart on file changes)
```

### Development & Testing Loop (MANDATORY WORKFLOW)

**Every time you add/modify a feature, follow this loop:**

```bash
# 1. Start development server in one terminal
npm run dev

# 2. In another terminal, run appropriate test script
node test_models.js              # Verify AI models are accessible
node test_hot_channels_api.js    # Test hot channel API
node test_single_analysis.js     # Test video analysis
node test_whisper_single.js      # Test Whisper transcription
node verify_system.js            # Full system health check

# 3. Check console output for:
#    ✅ Success messages
#    ❌ Error messages (fix before proceeding)

# 4. Test in browser at http://localhost:4000
```

**Available Test Scripts:**
- `test_models.js` - Check all AI model availability (Gemini, Claude, OpenAI)
- `test_hot_channels_api.js` - Test hot channel discovery endpoint
- `test_single_analysis.js` - Test single video viral analysis
- `test_whisper_single.js` - Test audio transcription
- `test_director_api.js` - Test director/script generation
- `test_audio_apis.js` - Test TTS APIs
- `verify_system.js` - Comprehensive system check
- `view_latest_data.js` - View MongoDB data (for debugging)

### MongoDB
- Connection string in `.env` as `MONGODB_URI`
- Database: `viral-shorts-db`
- Collections: TrendingVideo, HotChannel, KeywordSnapshot, Guideline, ViolationCheck

### Python Environment
```bash
# Activate virtual environment (Windows)
.venv\Scripts\activate

# Python utilities exist for specific tasks (TTS server, fix scripts)
python local_tts_server.py    # Run local TTS server (port 8765)
```

## Architecture

### Backend Structure (Node.js/Express)

**Entry Point:** `server.js`
- Monolithic Express server with all route handlers
- CORS enabled for frontend access
- Serves static files from root directory
- MongoDB connection management
- Cron jobs for automated data collection

**Modular Components** (newer architecture):
- `server/routes/` - API route handlers (viral, guidelines, voicevox, production, channel_analysis)
- `server/services/` - Business logic layer (platform detection, video analyzers)
- `server/utils/` - Utility functions (AI integrations, TTS, timestamp refinement)
- `models/` - MongoDB Mongoose schemas

**Key Architectural Patterns:**
1. **YouTube API Key Rotation**: Automatic rotation across 6 API keys when quota is exceeded (see `server.js:40-99`)
2. **Multi-Platform Analysis**: Platform-agnostic analyzer using strategy pattern (platform-detector → specific analyzer)
3. **AI Service Abstraction**: Separate utils for each AI provider (gemini.util.js, glm.util.js)
4. **Retry Logic**: All AI utilities implement exponential backoff retry

### Frontend Structure

**Main Interface:** `index.html` (single-page application)
- Tailwind CSS for styling (dark mode by default)
- Vanilla JavaScript (no framework)
- Tab-based navigation system
- Key scripts:
  - `hot_channels_v3.js` - Hot channel discovery and filtering
  - `dialogue_mode.js` - AI dialogue management
  - `qwen_audio.js` - Audio processing

### API Routes

**Main Routes (in server.js):**
- `GET /api/trending` - Get trending YouTube videos
- `POST /api/analyze` - Analyze video for viral potential
- `POST /api/generate-script` - Generate AI script from analysis
- `POST /api/hot-channels` - Discover trending channels
- `POST /api/analyze-channel` - Deep channel strategy analysis

**Modular Routes (ES6 modules):**
- `POST /api/analyze-viral-video` - Unified viral video analyzer (YouTube/TikTok)
- Guidelines routes - Content violation checking
- VoiceVox routes - Japanese TTS
- Production routes - Video production workflow

### Database Models

- **TrendingVideo** - Stores trending video snapshots with metadata
- **HotChannel** - Channels with rapid growth metrics
- **KeywordSnapshot** - Multilingual keyword tracking
- **Guideline** - Content policy rules
- **ViolationCheck** - Cached violation check results

### AI Service Integration

**Multiple AI Providers (all have API keys in .env):**

1. **Gemini (Google)** - Primary analysis engine
   - Models: `gemini-2.5-flash`, `gemini-pro-vision`
   - **Utils:** `server/utils/gemini.util.js`
     - `geminiGenerateContent(apiKey, modelName, contents, options)`
     - `geminiGenerateJSON(apiKey, modelName, contents, options)`
   - Includes retry logic with exponential backoff

2. **Claude (Anthropic)** - Script generation and refinement
   - Model: `claude-sonnet-4-5-20250929`
   - **Currently:** Direct API calls in server.js (legacy)
   - **TODO:** Extract to `server/utils/claude.util.js` following gemini.util.js pattern
   - When adding new Claude features, create utility first

3. **OpenAI** - Whisper (speech-to-text), GPT analysis
   - **Currently:** Direct calls in server.js
   - **TODO:** Create `server/utils/openai.util.js` for new features

4. **GLM/Zhipu** - Chinese language model
   - **Utils:** `server/utils/glm.util.js`
     - `glmGenerateContent(prompt, options)`
     - `glmGenerateJSON(prompt, options)`
   - Includes retry logic

5. **Perplexity** - Real-time web search
   - **Currently:** Direct API calls
   - Create utility if usage increases

6. **FAL.ai** - Image generation
   - **Currently:** Direct API calls
   - Create utility if usage increases

**TTS Systems:**
- VoiceVox (Japanese) - Local/API integration in `server/utils/voicevox.util.js`
- Qwen TTS - Chinese voices in `server/utils/qwen_tts.util.js`
- Phi3 ASR - Audio transcription in `server/utils/phi3_asr.util.js`

### Key Features & Workflows

1. **Hot Channel Discovery**
   - Fetches trending videos via YouTube Data API
   - Identifies channels with rapid growth
   - Categorizes by content type (entertainment, gaming, food, etc.)
   - Filters by country (KR, US, JP, etc.)

2. **Viral Video Analysis**
   - Platform detection (YouTube/TikTok/Instagram)
   - Transcript extraction via Apify actors
   - AI-powered viral factor analysis (hook, pacing, emotional beats)
   - Visual/audio analysis for production quality

3. **AI Script Generation**
   - Persona-based dialogue generation (`persona_plex.util.js`)
   - Multi-turn conversation simulation
   - Localized prompts support (`localized-prompts.util.js`)
   - Timestamp refinement for subtitle sync

4. **Channel Strategy Analysis**
   - Analyzes top videos from channel
   - Identifies content patterns and trends
   - Provides actionable recommendations
   - See `server/utils/channel_analyzer.util.js`

## Environment Variables

Critical API keys required in `.env`:
- `YOUTUBE_API_KEY` through `YOUTUBE_API_KEY_6` - YouTube Data API (rotation system)
- `GEMINI_API_KEY` - Google AI
- `ANTHROPIC_API_KEY` - Claude AI
- `OPENAI_API_KEY` - OpenAI services
- `ZHIPU_API_KEY` - GLM/Zhipu
- `APIFY_TOKEN` - Web scraping service
- `MONGODB_URI` - MongoDB Atlas connection
- `PORT` - Server port (default: 4000)

## Development Rules (MUST FOLLOW)

### 1. Route Organization - CRITICAL
**server.js is 7000+ lines and MUST NOT grow further.**

**NEVER add new routes to server.js.** All new API endpoints MUST be created in `server/routes/`:

```javascript
// ❌ WRONG - Do not add to server.js
app.post('/api/new-feature', async (req, res) => { ... });

// ✅ CORRECT - Create server/routes/new-feature.routes.js
import express from 'express';
const router = express.Router();

router.post('/new-feature', async (req, res) => { ... });

export default router;

// Then import in server.js:
// const newFeatureRoutes = require('./server/routes/new-feature.routes.js');
// app.use('/api', newFeatureRoutes);
```

### 2. API Response Format - MANDATORY

**ALL API responses MUST follow this exact format:**

```javascript
// ✅ Success response
return res.json({
  success: true,
  data: { /* your data here */ }
});

// ✅ Error response
return res.status(400).json({
  success: false,
  error: 'Error message in Korean or English'
});

// ❌ WRONG - Inconsistent format
return res.json({ result: data });  // Missing success field
return res.json({ error: 'msg' }); // Missing success: false
```

**Exception:** Only streaming responses (SSE, file downloads) may deviate.

### 3. AI Service Calls - REQUIRED

**NEVER call AI APIs directly in routes.** Always use utilities in `server/utils/`:

```javascript
// ❌ WRONG - Direct API call in route
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const result = await genAI.generateContent(...);

// ✅ CORRECT - Use utility function
const { geminiGenerateContent } = require('./server/utils/gemini.util');
const result = await geminiGenerateContent(GEMINI_API_KEY, 'gemini-2.5-flash', contents);
```

**Available AI utilities:**
- `server/utils/gemini.util.js` - Gemini (Google AI)
- `server/utils/glm.util.js` - GLM (Zhipu AI)
- `server/utils/persona_plex.util.js` - Persona dialogue generation
- Direct Anthropic/OpenAI calls should also be extracted to utils

**Why:** Utilities include retry logic, error handling, and exponential backoff.

### 4. Testing Workflow - MANDATORY

After implementing any feature, ALWAYS follow this verification loop:

```bash
# 1. Start dev server
npm run dev

# 2. Run relevant test script(s)
node test_models.js              # Test AI model availability
node test_hot_channels_api.js    # Test hot channels endpoint
node test_single_analysis.js     # Test video analysis
node test_whisper_single.js      # Test audio transcription
# ... use appropriate test_*.js for your feature

# 3. Verify console output shows success
# 4. If test fails, fix before proceeding
```

**When creating new features:**
- Create a corresponding `test_[feature].js` file
- Include basic happy path and error case tests
- Update this list with new test files

## Code Style & Conventions

- **Module systems**: server.js uses CommonJS (`require`), new routes MUST use ES6 modules (`import/export`)
- **Korean comments/logs**: User-facing messages in Korean, code comments can be English/Korean
- **Error handling**: Console.error for errors, detailed error messages in API responses
- **Input validation**: Always validate request body/params before processing

## Common Development Tasks

### Adding a New API Endpoint

**Step-by-step process (following all rules above):**

1. **Create route file** in `server/routes/[feature].routes.js`:
   ```javascript
   import express from 'express';
   const router = express.Router();

   router.post('/endpoint-name', async (req, res) => {
     try {
       // Input validation
       const { requiredField } = req.body;
       if (!requiredField) {
         return res.status(400).json({
           success: false,
           error: '필수 필드가 누락되었습니다'
         });
       }

       // Business logic (call services/utils)
       const result = await someService(requiredField);

       // Success response
       return res.json({
         success: true,
         data: result
       });

     } catch (error) {
       console.error('[Feature Error]', error);
       return res.status(500).json({
         success: false,
         error: error.message
       });
     }
   });

   export default router;
   ```

2. **Register route in server.js**:
   ```javascript
   const featureRoutes = require('./server/routes/feature.routes.js');
   app.use('/api', featureRoutes);
   ```

3. **Create test file** `test_feature.js`:
   ```javascript
   const API_BASE = 'http://localhost:4000/api';

   async function testFeature() {
     const response = await fetch(`${API_BASE}/endpoint-name`, {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ requiredField: 'test' })
     });
     const data = await response.json();
     console.log('Success:', data.success);
     console.log('Data:', data.data);
   }

   testFeature();
   ```

4. **Run verification**:
   ```bash
   npm run dev
   node test_feature.js
   ```

### Adding AI Integration

1. **Create utility in `server/utils/[service].util.js`**:
   ```javascript
   // Follow gemini.util.js pattern
   async function serviceGenerateContent(apiKey, model, prompt, options = {}) {
     const { maxRetries = 3, initialDelay = 2000 } = options;

     for (let attempt = 0; attempt <= maxRetries; attempt++) {
       try {
         // API call logic
         return result;
       } catch (error) {
         if (attempt === maxRetries) throw error;
         await sleep(initialDelay * Math.pow(2, attempt));
       }
     }
   }

   module.exports = { serviceGenerateContent };
   ```

2. **Use in route handler** (never call API directly)
3. **Add API key to `.env`**
4. **Create test script** and verify

### Adding a New Platform Analyzer

1. Add detection logic to `server/services/platform-detector.service.js`
2. Create analyzer in `server/services/[platform]-analyzer.service.js`
3. Update `url-analyzer.service.js` switch statement
4. Create test with sample URL

### Working with MongoDB

- **Models**: Use Mongoose ODM in `models/` directory
- **Indexes**: Always add indexes for query fields
  ```javascript
  fieldName: { type: String, required: true, index: true }
  ```
- **Time-series**: Use `snapshot: { type: Date, default: Date.now, index: true }`
- **Testing**: Use `view_latest_data.js` to inspect database contents

## Important Files

### Core Application
- `server.js` - Main application logic (7000+ lines, DO NOT ADD MORE ROUTES HERE)
- `index.html` - Complete frontend UI (4000+ lines)
- `package.json` - Dependencies and npm scripts

### Configuration & Data
- `.env` - API keys and environment variables (NEVER commit this)
- `channel_personas.json` - Predefined channel personality templates
- `models.json` - AI model configurations and metadata

### Routes & Services
- `server/routes/viral.routes.js` - Viral video analysis endpoints
- `server/routes/guidelines.routes.js` - Content policy checking
- `server/services/url-analyzer.service.js` - Platform-agnostic video analyzer
- `server/utils/gemini.util.js` - Gemini AI integration with retry logic

### Database Models
- `models/TrendingVideo.js` - YouTube trending video schema
- `models/HotChannel.js` - Rapidly growing channel schema
- `models/Guideline.js` - Content policy rules

### Test Scripts (Critical for Development)
- `test_models.js` - Verify AI model availability
- `test_hot_channels_api.js` - Test hot channel discovery
- `test_single_analysis.js` - Test video analysis
- `test_whisper_single.js` - Test audio transcription
- `test_director_api.js` - Test director API
- `verify_system.js` - System health check

### Utility Scripts
- `view_latest_data.js` - Inspect MongoDB collections
- `clear_db.js` - Clear database (use with caution)
- `batch_analyze.js` - Batch video analysis

## Known Patterns

- **Cron Jobs**: Automated trending video collection runs on schedule
- **File Uploads**: Multer configured for audio/video processing in temp directories
- **Transcript Handling**: Apify actors used for YouTube transcripts (more reliable than youtube-transcript package)
- **Player Scripts**: Multiple cached player script files (1768*.js) - likely for debugging YouTube extraction

## Codebase Health & Technical Debt

### Current State
- **server.js**: 7000+ lines (BLOATED - do not add more code here)
- **index.html**: 4000+ lines (consider splitting into components)
- **Architecture**: Transitioning from monolithic to modular

### Refactoring Guidelines

**When touching existing code in server.js:**
1. If adding/modifying a route → Extract to `server/routes/` instead
2. If adding AI logic → Create/update utility in `server/utils/`
3. If adding business logic → Move to `server/services/`

**DO NOT refactor existing working code** unless:
- It's blocking new feature development
- User explicitly requests cleanup
- Moving route to comply with "no new routes in server.js" rule

### Module System Migration
- **Old code (server.js)**: CommonJS (`require`, `module.exports`)
- **New code (server/*)**: ES6 modules (`import`, `export`)
- **Interop**: Use `require()` in server.js to load ES6 modules

### Quality Checklist (before committing)
- [ ] New routes created in `server/routes/`, not server.js
- [ ] API responses use `{ success, data/error }` format
- [ ] AI calls use utilities from `server/utils/`
- [ ] Test script created and passes (npm run dev + node test_*.js)
- [ ] Error handling with try/catch and proper status codes
- [ ] Input validation for all request parameters
- [ ] Korean error messages for user-facing errors
