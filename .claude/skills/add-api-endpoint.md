# Add API Endpoint

Create a new API endpoint following project standards and CLAUDE.md conventions.

## Task

You will create a new API endpoint with proper route structure, error handling, testing, and documentation.

## Steps to Follow

### 1. Gather Requirements

Ask the user for endpoint details (if not provided):

**Required Information:**
- **Feature name**: What is this endpoint for? (e.g., "video-upload", "channel-search")
- **HTTP method**: GET, POST, PUT, DELETE
- **Route path**: /api/[path] (e.g., /api/upload-video, /api/search-channels)
- **Purpose**: What does this endpoint do?
- **Input parameters**: What data does it accept? (body, query, params)
- **Expected output**: What should it return?

**Example prompts:**
- "What feature are we adding?"
- "Should this be a GET or POST endpoint?"
- "What data will the endpoint receive?"

### 2. Create Route File

Create `server/routes/[feature-name].routes.js`:

```javascript
/**
 * [Feature Name] Routes
 *
 * Description: [Brief description of what this route handles]
 */

import express from 'express';
// Import required utilities
// const { someUtil } = require('../utils/some-util.util');
// const { SomeModel } = require('../../models/SomeModel');

const router = express.Router();

/**
 * [METHOD] /api/[path]
 * [Detailed description of endpoint purpose]
 *
 * Request body/query:
 * - field1: [type] - [description]
 * - field2: [type] - [description]
 *
 * Response:
 * - success: boolean
 * - data: { [response structure] }
 */
router.[method]('/[path]', async (req, res) => {
  try {
    // 1. Input validation
    const { field1, field2 } = req.body; // or req.query for GET, req.params for URL params

    if (!field1) {
      return res.status(400).json({
        success: false,
        error: '필수 필드가 누락되었습니다: field1'
      });
    }

    // Additional validation (type checks, format validation, etc.)
    if (typeof field1 !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'field1은 문자열이어야 합니다'
      });
    }

    // 2. Business logic
    // Call services/utilities, database operations, AI calls, etc.
    const result = await performBusinessLogic(field1, field2);

    // 3. Success response (MANDATORY FORMAT)
    return res.json({
      success: true,
      data: result
    });

  } catch (error) {
    // 4. Error handling
    console.error('[Feature Name Error]', error);

    // Differentiate error types
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }

    return res.status(500).json({
      success: false,
      error: error.message || '요청 처리 중 오류가 발생했습니다'
    });
  }
});

// Add more routes if needed (same feature group)
// router.get('/[another-path]', async (req, res) => { ... });

export default router;
```

### 3. Implement Business Logic

Based on the feature type, implement appropriate logic:

**For AI Integration:**
```javascript
// Use existing utilities (NEVER call AI APIs directly)
const { geminiGenerateContent } = require('../utils/gemini.util');

const result = await geminiGenerateContent(
  process.env.GEMINI_API_KEY,
  'gemini-2.5-flash',
  prompt,
  { maxRetries: 3 }
);
```

**For Database Operations:**
```javascript
const SomeModel = require('../../models/SomeModel');

const data = await SomeModel.find({ field: value })
  .limit(10)
  .sort({ createdAt: -1 });
```

**For External APIs:**
```javascript
const response = await fetch(externalApiUrl, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload)
});

const data = await response.json();
```

### 4. Create Model (if needed)

If this endpoint needs a new MongoDB collection, create `models/[ModelName].js`:

```javascript
const mongoose = require('mongoose');

const [ModelName]Schema = new mongoose.Schema({
  field1: { type: String, required: true, index: true },
  field2: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now, index: true }
});

module.exports = mongoose.model('[ModelName]', [ModelName]Schema);
```

### 5. Register Route in server.js

Add to server.js (near other route registrations):

```javascript
// Import route
const [featureName]Routes = require('./server/routes/[feature-name].routes.js');

// Register route (after app initialization)
app.use('/api', [featureName]Routes);
```

**Location:** Add near line ~200-300 where other routes are registered.

### 6. Create Test File

Create `test_[feature-name].js` in project root:

```javascript
/**
 * Test script for [Feature Name] API
 *
 * Usage:
 *   1. Start server: npm run dev
 *   2. Run test: node test_[feature-name].js
 */

const API_BASE = 'http://localhost:4000/api';

async function test[FeatureName]() {
  console.log('🧪 Testing [Feature Name] API...\n');

  try {
    // Test Case 1: Valid request
    console.log('Test 1: Valid request');
    const response1 = await fetch(`${API_BASE}/[path]`, {
      method: '[METHOD]',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        field1: 'test-value',
        field2: 'test-value-2'
      })
    });

    const data1 = await response1.json();
    console.log('✅ Response:', data1);
    console.log('Success:', data1.success);
    console.log('Data:', JSON.stringify(data1.data, null, 2));
    console.log('');

    // Test Case 2: Missing required field
    console.log('Test 2: Missing required field (should fail)');
    const response2 = await fetch(`${API_BASE}/[path]`, {
      method: '[METHOD]',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        // field1 missing
        field2: 'test-value-2'
      })
    });

    const data2 = await response2.json();
    console.log('Expected error:', data2);
    console.log('Success:', data2.success, '(should be false)');
    console.log('Error:', data2.error);
    console.log('');

    // Test Case 3: Invalid data type (if applicable)
    // Add more test cases as needed

    console.log('✅ All tests completed');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run tests
test[FeatureName]();
```

### 7. Run Verification Loop (MANDATORY)

```bash
# Terminal 1: Start server
npm run dev

# Terminal 2: Run test
node test_[feature-name].js
```

**Verify:**
- ✅ Server starts without errors
- ✅ Test script runs successfully
- ✅ Valid requests return `{ success: true, data: {...} }`
- ✅ Invalid requests return `{ success: false, error: '...' }` with appropriate status codes

### 8. Update CLAUDE.md (Optional)

If this is a major feature, add to CLAUDE.md under "API Routes":

```markdown
- `[METHOD] /api/[path]` - [Brief description]
```

### 9. Report Completion

Provide summary:

```
✅ API Endpoint Created Successfully

📁 Files Created:
- server/routes/[feature-name].routes.js (+XX lines)
- test_[feature-name].js (+XX lines)
- models/[ModelName].js (+XX lines) [if applicable]

📝 Files Modified:
- server.js (+3 lines - route registration)

🔗 Endpoint Details:
- Method: [METHOD]
- Path: /api/[path]
- Request: { field1, field2 }
- Response: { success, data }

✅ Testing:
- Valid request: PASSED
- Missing field: PASSED (returns error)
- Invalid type: PASSED (returns error)

🚀 Ready to use!

Usage Example:
```javascript
const response = await fetch('http://localhost:4000/api/[path]', {
  method: '[METHOD]',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ field1: 'value' })
});
const data = await response.json();
```
```

## Quality Checklist

Before completing, verify:
- [ ] Route created in `server/routes/`, NOT in server.js
- [ ] ES6 module syntax (import/export)
- [ ] API response format: `{ success: boolean, data/error }`
- [ ] Input validation for all required fields
- [ ] Error handling with try/catch
- [ ] Appropriate HTTP status codes (400 for validation, 500 for server errors)
- [ ] Test file created with multiple test cases
- [ ] Tests pass successfully
- [ ] Route registered in server.js
- [ ] Korean error messages for user-facing errors
- [ ] AI calls use utilities from server/utils/
- [ ] Database operations use models from models/

## Common Patterns

### Pattern 1: Simple Data Retrieval (GET)
```javascript
router.get('/list', async (req, res) => {
  try {
    const { limit = 10, offset = 0 } = req.query;
    const items = await Model.find().limit(limit).skip(offset);

    return res.json({
      success: true,
      data: { items, total: items.length }
    });
  } catch (error) {
    console.error('[List Error]', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
```

### Pattern 2: AI-Powered Analysis (POST)
```javascript
router.post('/analyze', async (req, res) => {
  try {
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({
        success: false,
        error: '분석할 텍스트가 필요합니다'
      });
    }

    const { geminiGenerateJSON } = require('../utils/gemini.util');
    const analysis = await geminiGenerateJSON(
      process.env.GEMINI_API_KEY,
      'gemini-2.5-flash',
      `Analyze this text: ${text}`
    );

    return res.json({
      success: true,
      data: { analysis }
    });
  } catch (error) {
    console.error('[Analyze Error]', error);
    return res.status(500).json({
      success: false,
      error: '분석 중 오류가 발생했습니다'
    });
  }
});
```

### Pattern 3: Database Update (POST/PUT)
```javascript
router.post('/update', async (req, res) => {
  try {
    const { id, updates } = req.body;

    if (!id || !updates) {
      return res.status(400).json({
        success: false,
        error: 'ID와 업데이트 내용이 필요합니다'
      });
    }

    const updated = await Model.findByIdAndUpdate(
      id,
      updates,
      { new: true, runValidators: true }
    );

    if (!updated) {
      return res.status(404).json({
        success: false,
        error: '데이터를 찾을 수 없습니다'
      });
    }

    return res.json({
      success: true,
      data: { updated }
    });
  } catch (error) {
    console.error('[Update Error]', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
```

## Notes

- **Follow CLAUDE.md rules strictly** - all 4 development rules apply
- **Never add routes to server.js** - always use server/routes/
- **Always create test files** - testing is mandatory
- **Use existing utilities** - don't reinvent AI/database wrappers
- **Korean error messages** - user-facing errors should be in Korean
- **Validate early** - check inputs before processing
