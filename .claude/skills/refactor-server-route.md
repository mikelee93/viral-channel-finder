# Refactor Server Route

Extract a route from server.js and move it to server/routes/ following project conventions.

## Task

You will refactor an existing route from the bloated server.js (7000+ lines) into the modular architecture in server/routes/.

## Steps to Follow

### 1. Identify the Route

Ask the user which route to refactor, or let them specify:
- Route path (e.g., `/api/trending`, `/api/analyze-channel`)
- Route method (GET, POST, PUT, DELETE)

If not specified, ask: "Which route would you like to refactor? (e.g., POST /api/analyze)"

### 2. Read and Extract Route Code

1. Read the server.js file and locate the route handler
2. Identify all dependencies:
   - Required modules/utilities
   - Helper functions used
   - Middleware specific to this route
3. Note the exact route definition (method, path, handler)

### 3. Create Route File

Create `server/routes/[feature-name].routes.js` with ES6 module syntax:

```javascript
/**
 * [Feature Name] Routes
 *
 * Description: [What this route does]
 */

import express from 'express';
// Import any required utilities/services
// const { utility } = require('../utils/utility-name.util');

const router = express.Router();

/**
 * [METHOD] /api/[path]
 * [Description of what this endpoint does]
 */
router.[method]('/[path]', async (req, res) => {
  try {
    // Input validation
    const { field1, field2 } = req.body; // or req.query for GET

    if (!field1) {
      return res.status(400).json({
        success: false,
        error: '필수 필드가 누락되었습니다'
      });
    }

    // Business logic (paste from server.js)
    // ...

    // Success response (ensure format compliance)
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

**CRITICAL:** Convert CommonJS patterns to ES6:
- `require()` → `import`
- `module.exports` → `export default`
- Keep utility imports as CommonJS if they use `require` (Node.js handles mixed modules)

### 4. Update server.js

1. **Remove** the extracted route handler
2. **Add import** at the top with other route imports:
   ```javascript
   const featureRoutes = require('./server/routes/[feature-name].routes.js');
   ```
3. **Register route** with app (add near other route registrations):
   ```javascript
   app.use('/api', featureRoutes);
   ```

### 5. Verify API Response Format

Ensure the refactored route uses the standard format:
```javascript
// Success
{ success: true, data: {...} }

// Error
{ success: false, error: 'message' }
```

If the original route uses a different format, update it.

### 6. Create Test File

Create `test_[feature-name].js` in project root:

```javascript
/**
 * Test script for [Feature Name] API
 * Usage: node test_[feature-name].js
 */

const API_BASE = 'http://localhost:4000/api';

async function test[FeatureName]() {
  console.log('Testing [Feature Name] endpoint...\n');

  try {
    const response = await fetch(`${API_BASE}/[path]`, {
      method: '[METHOD]',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        // Test payload
        field1: 'test-value'
      })
    });

    const data = await response.json();

    console.log('✅ Response received');
    console.log('Success:', data.success);
    console.log('Data:', JSON.stringify(data.data || data.error, null, 2));

    if (!data.success) {
      console.error('❌ API returned error:', data.error);
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

test[FeatureName]();
```

### 7. Run Verification Loop

Execute the mandatory testing workflow:

```bash
# 1. Start dev server (if not running)
npm run dev

# 2. Run test script
node test_[feature-name].js

# 3. Verify output shows success
```

### 8. Report Results

Provide a summary:
```
✅ Refactoring Complete

Files Modified:
- server.js (-XX lines)
- server/routes/[feature-name].routes.js (created, +XX lines)
- test_[feature-name].js (created)

Route: [METHOD] /api/[path]
Status: ✅ Tested and working

Next Steps:
- Server is running with refactored route
- Test file available: node test_[feature-name].js
```

## Quality Checklist

Before completing, verify:
- [ ] Route extracted to server/routes/
- [ ] ES6 module syntax used (import/export)
- [ ] API response format follows { success, data/error }
- [ ] Test file created and passes
- [ ] server.js imports and registers new route
- [ ] No duplicate code left in server.js
- [ ] Error handling with try/catch
- [ ] Input validation included

## Example

User: "Refactor the POST /api/analyze endpoint"

You should:
1. Read server.js and find the `/api/analyze` route
2. Create `server/routes/analyze.routes.js`
3. Move the route logic (converting to ES6)
4. Update server.js to import and use it
5. Create `test_analyze.js`
6. Run `npm run dev` and `node test_analyze.js`
7. Report success

## Notes

- **DO NOT refactor multiple routes at once** - focus on one at a time
- **Preserve functionality exactly** - don't change business logic
- **Update imports/exports carefully** - mixed CommonJS/ES6 is OK
- **Test before reporting complete** - verify the route still works
