# Extension Migration Guide: v0.x → v1.0.0

## Overview

Ghost CLI v1.0.0 introduces significant improvements to extension architecture with the **@ghost/extension-sdk** package. This guide helps you migrate your v0.x extensions to the new SDK.

## What's New in v1.0.0

### 1. ExtensionSDK Package
- Centralized SDK package: `@ghost/extension-sdk`
- High-level API with automatic error handling
- Built-in intent builders and RPC client
- TypeScript definitions included

### 2. Core Handler Injection
- RPC clients must accept `coreHandler` parameter
- Enables proper dependency injection
- Supports better testing and mocking

### 3. Manifest Updates
- New required field: `capabilities.network.rateLimit.be`
- Enhanced validation rules
- Improved capability declarations

### 4. I/O Operations
- All file, network, and git operations go through SDK
- Consistent error handling
- Automatic audit logging

## Migration Tool

Ghost CLI includes an automated migration tool:

```bash
# Analyze extension without making changes
ghost extension migrate

# Analyze from specific path
ghost extension migrate /path/to/extension

# Apply migration changes automatically
ghost extension migrate --apply

# Apply migration without creating backups
ghost extension migrate --apply --no-backup
```

### What the Tool Does

**Automated:**
1. ✅ Analyzes v0.x code patterns
2. ✅ Validates manifest compatibility
3. ✅ Generates ExtensionWrapper boilerplate
4. ✅ Updates package.json with @ghost/extension-sdk
5. ✅ Updates manifest.json for v1.0.0
6. ✅ Creates MIGRATION_GUIDE.md with instructions
7. ✅ Backs up original files to .migration-backup/

**Manual (Requires Review):**
1. ⚠️ Replace direct fs/http/git operations with SDK calls
2. ⚠️ Update RPC client constructor with coreHandler
3. ⚠️ Refactor custom I/O logic

## Migration Steps

### Step 1: Backup Your Extension

```bash
# Create backup
cp -r your-extension your-extension-backup
```

### Step 2: Run Migration Tool

```bash
cd your-extension
ghost extension migrate
```

Review the output:
- **Code Pattern Analysis**: Identifies legacy patterns
- **Manifest Validation**: Checks v1.0.0 compatibility
- **Migration Plan**: Lists automated and manual changes

### Step 3: Apply Automated Changes

```bash
ghost extension migrate --apply
```

This creates:
- `extension-wrapper.js` - New SDK-based wrapper
- `MIGRATION_GUIDE.md` - Detailed migration instructions
- `.migration-backup/` - Original file backups
- Updated `manifest.json` and `package.json`

### Step 4: Install Dependencies

```bash
npm install
```

### Step 5: Manual Code Changes

Review `MIGRATION_GUIDE.md` for required manual changes.

Common patterns to update:

#### Pattern 1: Direct fs Operations

**Before (v0.x):**
```javascript
const fs = require('fs');

// Synchronous
const content = fs.readFileSync('file.txt', 'utf8');
fs.writeFileSync('output.txt', data);

// Asynchronous
fs.readFile('file.txt', 'utf8', (err, data) => {
    if (err) throw err;
    // process data
});
```

**After (v1.0.0):**
```javascript
const { ExtensionSDK } = require('@ghost/extension-sdk');

class MyExtension {
    constructor(extensionId, coreHandler) {
        this.sdk = new ExtensionSDK(extensionId, { coreHandler });
    }

    async processFiles() {
        // All operations are async
        const content = await this.sdk.requestFileRead({ path: 'file.txt' });
        await this.sdk.requestFileWrite({ path: 'output.txt', content: data });
    }
}
```

#### Pattern 2: Direct HTTP Requests

**Before (v0.x):**
```javascript
const https = require('https');

https.request({
    hostname: 'api.example.com',
    path: '/endpoint',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
}, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => console.log(JSON.parse(data)));
}).end(JSON.stringify(payload));
```

**After (v1.0.0):**
```javascript
const response = await this.sdk.requestNetworkCall({
    url: 'https://api.example.com/endpoint',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
});

const data = JSON.parse(response.body);
```

#### Pattern 3: Direct Git Commands

**Before (v0.x):**
```javascript
const { execSync } = require('child_process');

const status = execSync('git status --short', { encoding: 'utf8' });
const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
```

**After (v1.0.0):**
```javascript
const statusResult = await this.sdk.requestGitExec({
    operation: 'status',
    args: ['--short']
});
const status = statusResult.stdout;

const branchResult = await this.sdk.requestGitExec({
    operation: 'rev-parse',
    args: ['--abbrev-ref', 'HEAD']
});
const branch = branchResult.stdout.trim();

// Or use convenience methods
const branch = await this.sdk.requestGitCurrentBranch();
```

#### Pattern 4: RPC Client Constructor

**Before (v0.x):**
```javascript
class ExtensionRPCClient {
    constructor() {
        this.requestId = 0;
    }

    async call(method, params) {
        // Manual RPC implementation
    }
}

class MyExtension {
    constructor() {
        this.rpc = new ExtensionRPCClient();
    }
}

// Export
module.exports = new MyExtension();
```

**After (v1.0.0):**
```javascript
const { ExtensionSDK } = require('@ghost/extension-sdk');

class MyExtension {
    constructor(extensionId, coreHandler) {
        this.extensionId = extensionId;
        this.sdk = new ExtensionSDK(extensionId, { coreHandler });
    }

    async initialize() {
        console.log(`${this.extensionId} initialized`);
    }

    async handleCommand(params) {
        // Command routing
    }
}

function createExtension(extensionId, coreHandler) {
    return new MyExtension(extensionId, coreHandler);
}

module.exports = { MyExtension, createExtension };
```

### Step 6: Update Manifest

Ensure your `manifest.json` includes:

```json
{
  "id": "my-extension",
  "name": "My Extension",
  "version": "1.0.0",
  "main": "index.js",
  "capabilities": {
    "filesystem": {
      "read": ["**/*.js"],
      "write": ["dist/**"]
    },
    "network": {
      "allowlist": ["https://api.example.com"],
      "rateLimit": {
        "cir": 60,
        "bc": 100,
        "be": 50
      }
    },
    "git": {
      "read": true,
      "write": false
    }
  },
  "dependencies": {
    "@ghost/extension-sdk": "^1.0.0"
  }
}
```

**Key Changes:**
- `capabilities.network.rateLimit.be` is now required
- `dependencies` should include `@ghost/extension-sdk`

### Step 7: Validate Extension

```bash
ghost extension validate
```

Fix any validation errors or warnings.

### Step 8: Test Extension

```bash
# Install locally
ghost extension install .

# Test your commands
ghost <your-command> --help
ghost <your-command> <args>

# Check telemetry
ghost gateway metrics <extension-id>
```

## Common Issues

### Issue 1: Missing coreHandler Parameter

**Error:**
```
No core handler registered for RPC call: intent
```

**Solution:**
Ensure your extension class accepts `coreHandler` and passes it to ExtensionSDK:

```javascript
constructor(extensionId, coreHandler) {
    this.sdk = new ExtensionSDK(extensionId, { coreHandler });
}
```

### Issue 2: Direct fs Module Still in Use

**Error:**
```
Extension uses direct filesystem access
```

**Solution:**
Replace all `fs` calls with SDK methods:
- `fs.readFileSync()` → `await sdk.requestFileRead()`
- `fs.writeFileSync()` → `await sdk.requestFileWrite()`
- `fs.existsSync()` → `await sdk.requestFileExists()`

### Issue 3: Missing rate limit 'be' parameter

**Error:**
```
Network rate limit missing required "be" parameter
```

**Solution:**
Add `be` (excess burst) to your rate limit config:

```json
"rateLimit": {
  "cir": 60,
  "bc": 100,
  "be": 50
}
```

Rule of thumb: `be` = 50% of `bc` for moderate tolerance

### Issue 4: Synchronous Code Patterns

**Error:**
```
Cannot read property 'then' of undefined
```

**Solution:**
All SDK methods return Promises. Update your code:

```javascript
// Before
const data = this.readFile('file.txt');

// After
const data = await this.readFile('file.txt');
```

Make sure all calling functions are marked `async`.

## ExtensionSDK API Reference

### Filesystem Operations

```javascript
// Read file
const content = await sdk.requestFileRead({ path, encoding: 'utf8' });

// Write file
await sdk.requestFileWrite({ path, content, encoding: 'utf8' });

// Check if file exists
const exists = await sdk.requestFileExists(path);

// Read directory
const files = await sdk.requestFileReadDir({ path });

// Get file stats
const stats = await sdk.requestFileStat({ path });

// Batch read
const contents = await sdk.requestFileReadBatch(['file1.txt', 'file2.txt']);

// JSON helpers
const data = await sdk.requestFileReadJSON('config.json');
await sdk.requestFileWriteJSON('output.json', { key: 'value' });
```

### Network Operations

```javascript
// HTTP request
const response = await sdk.requestNetworkCall({
    url: 'https://api.example.com/endpoint',
    method: 'GET',
    headers: { 'Authorization': 'Bearer token' },
    body: null
});
```

### Git Operations

```javascript
// Execute git command
const result = await sdk.requestGitExec({
    operation: 'status',
    args: ['--short']
});

// Convenience methods
const branch = await sdk.requestGitCurrentBranch();
const files = await sdk.requestGitStagedFiles();
await sdk.requestGitCommit('message', { all: true });

// Git operations
await sdk.requestGitStatus();
await sdk.requestGitLog(['--oneline', '-10']);
await sdk.requestGitDiff(['HEAD~1..HEAD']);
```

### Batch Operations

```javascript
// Send multiple intents at once
const results = await sdk.requestBatch([
    sdk.buildIntent().filesystem('read', { path: 'file1.txt' }),
    sdk.buildIntent().filesystem('read', { path: 'file2.txt' }),
    sdk.buildIntent().git('status', { args: [] })
]);
```

### Error Handling

```javascript
const { IntentError, ValidationError, RateLimitError } = require('@ghost/extension-sdk');

try {
    await sdk.requestFileRead({ path: 'missing.txt' });
} catch (error) {
    if (error instanceof ValidationError) {
        console.error('Validation failed:', error.message);
    } else if (error instanceof RateLimitError) {
        console.error('Rate limit exceeded:', error.message);
    } else if (error instanceof IntentError) {
        console.error('Intent failed:', error.message);
    }
}
```

## Testing

### Unit Testing with Mocked SDK

```javascript
const { ExtensionSDK } = require('@ghost/extension-sdk');

describe('MyExtension', () => {
    it('should read configuration', async () => {
        // Mock coreHandler
        const mockHandler = jest.fn().mockResolvedValue({
            jsonrpc: '2.0',
            id: 1,
            result: { content: 'test content' }
        });

        const ext = new MyExtension('test-ext', mockHandler);
        const config = await ext.loadConfig();

        expect(mockHandler).toHaveBeenCalled();
        expect(config).toBe('test content');
    });
});
```

## Rollback

If migration fails, restore from backup:

```bash
# Restore from migration backup
cp .migration-backup/* .

# Or restore from manual backup
rm -rf your-extension
cp -r your-extension-backup your-extension
```

## Resources

- **SDK Documentation**: `packages/extension-sdk/README.md`
- **API Reference**: `docs/extension-api.md`
- **Examples**: `docs/extension-examples.md`
- **Manifest Schema**: `core/manifest-schema.json`

## Getting Help

If you encounter issues during migration:

1. Check `MIGRATION_GUIDE.md` generated by the tool
2. Review existing migrated extensions in `extensions/`
3. Run `ghost extension validate` for detailed errors
4. Consult the SDK documentation

## Migration Checklist

- [ ] Backup extension code
- [ ] Run `ghost extension migrate`
- [ ] Review analysis and migration plan
- [ ] Apply automated changes with `--apply`
- [ ] Install `@ghost/extension-sdk` dependency
- [ ] Replace direct fs operations with SDK
- [ ] Replace direct network operations with SDK
- [ ] Replace direct git operations with SDK
- [ ] Update RPC client with coreHandler injection
- [ ] Update manifest.json (add `be` parameter)
- [ ] Make all operations async/await
- [ ] Validate extension
- [ ] Test all commands
- [ ] Update documentation
- [ ] Commit changes

## Example: Complete Migration

See the bundled `ghost-git-extension` for a complete v1.0.0 reference implementation:

```bash
cd extensions/ghost-git-extension
cat extension.js  # See ExtensionWrapper pattern
cat manifest.json # See v1.0.0 manifest
```
