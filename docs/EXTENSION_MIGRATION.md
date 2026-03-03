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
- New required field: `commands` array
- New required field: `dependencies` object
- New required parameter: `capabilities.network.rateLimit.be`
- Enhanced validation rules
- Improved capability declarations

### 4. I/O Operations
- All file, network, and git operations go through SDK
- Consistent error handling
- Automatic audit logging
- Security pipeline enforcement

## Migration Tool

Ghost CLI includes an automated migration tool that analyzes your v0.x extension and generates migration artifacts.

### Basic Usage

```bash
# Analyze extension without making changes (dry run)
ghost extension migrate

# Analyze from specific path
ghost extension migrate /path/to/extension

# Apply migration changes automatically with backup
ghost extension migrate --auto

# Apply migration without creating backups (not recommended)
ghost extension migrate --auto --no-backup

# Apply migration and run basic validation
ghost extension migrate --auto --validate
```

### What the Tool Does

**Automated Steps:**
1. ✅ Analyzes v0.x code patterns (module.exports, RPC clients, direct I/O)
2. ✅ Detects legacy patterns (direct fs/http/git, missing coreHandler)
3. ✅ Validates manifest compatibility with v1.0.0 schema
4. ✅ Generates file-by-file diff preview of changes
5. ✅ Creates ExtensionWrapper boilerplate with ExtensionSDK
6. ✅ Updates package.json with @ghost/extension-sdk dependency
7. ✅ Updates manifest.json (adds commands, dependencies, rate limit be parameter)
8. ✅ Creates comprehensive MIGRATION_GUIDE.md with examples
9. ✅ Backs up original files to .migration-backup/ with timestamp

**Manual Steps (Documented in Generated Guide):**
1. ⚠️ Replace direct fs/http/git operations with SDK calls
2. ⚠️ Update RPC client constructor with coreHandler parameter
3. ⚠️ Convert sync operations to async/await
4. ⚠️ Refactor custom I/O logic to use pipeline

### Migration Output

The tool generates:
- **Analysis Report**: Code pattern analysis with severity levels
- **Manifest Validation**: Compatibility check with detailed errors
- **Migration Plan**: Step-by-step plan with automated and manual changes
- **Diff Previews**: File-by-file preview of changes with line numbers
- **extension-wrapper.js**: Generated SDK-based wrapper (if needed)
- **MIGRATION_GUIDE.md**: Comprehensive guide with examples
- **.migration-backup/**: Timestamped backup of original files
- **Updated manifest.json**: v1.0.0 compatible manifest
- **Updated package.json**: With @ghost/extension-sdk dependency

## Migration Steps

### Step 1: Backup Your Extension

```bash
# Create manual backup (tool also creates automatic backup)
cp -r your-extension your-extension-backup
```

### Step 2: Run Migration Analysis

```bash
cd your-extension
ghost extension migrate
```

Review the output carefully:

**Code Pattern Analysis:**
- Export pattern (class, object, function)
- RPC client detection (builtin, custom)
- CoreHandler injection status
- Direct I/O usage (fs, http/https, git, stdio)
- Legacy patterns with severity levels

**Manifest Validation:**
- Required field checks
- Schema compatibility
- Required upgrades (be parameter, commands array, dependencies)

**Migration Plan:**
- Automated steps (file creation/modification)
- Manual changes required (with priority levels)
- File count summary

**Diff Previews:**
- Line-by-line changes for each file
- Color-coded additions/removals
- Preview of generated files

### Step 3: Apply Automated Migration

```bash
ghost extension migrate --auto
```

This will:
1. Create timestamped backup in `.migration-backup/YYYY-MM-DDTHH-MM-SS/`
2. Update or create package.json with SDK dependency
3. Update manifest.json with v1.0.0 fields
4. Generate extension-wrapper.js (if needed)
5. Create comprehensive MIGRATION_GUIDE.md

### Step 4: Install Dependencies

```bash
npm install
```

This installs `@ghost/extension-sdk` and any other dependencies.

### Step 5: Complete Manual Changes

Review `MIGRATION_GUIDE.md` for required manual changes. The guide includes:
- Specific file and line information
- Current code patterns
- Suggested v1.0.0 patterns
- Detailed migration guides for each pattern
- Priority levels (critical, high, medium)

Common patterns to update:

#### Pattern 1: Direct fs Operations → SDK Methods

**Before (v0.x):**
```javascript
const fs = require('fs');

// Synchronous operations
const content = fs.readFileSync('file.txt', 'utf8');
fs.writeFileSync('output.txt', data);

// Async operations
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
        // All operations are async and return Promises
        const content = await this.sdk.requestFileRead({ path: 'file.txt' });
        await this.sdk.requestFileWrite({ path: 'output.txt', content: data });
    }
}
```

#### Pattern 2: Direct HTTP Requests → SDK Network Calls

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

#### Pattern 3: Direct Git Commands → SDK Git Operations

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
```

#### Pattern 4: Direct stdio JSON-RPC → CoreHandler Injection

**Before (v0.x):**
```javascript
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

rl.on('line', (line) => {
    const request = JSON.parse(line);
    // ... handle request
    process.stdout.write(JSON.stringify(response) + '\n');
});
```

**After (v1.0.0):**
```javascript
class MyExtension {
    async init(config) {
        this.coreHandler = config.coreHandler;
        this.sdk = new ExtensionSDK(this.extensionId, { 
            coreHandler: config.coreHandler 
        });
    }
    
    async myCommand(params) {
        // Use SDK methods which internally use coreHandler
        const result = await this.sdk.requestFileRead({ path: 'file.txt' });
        return result;
    }
}

module.exports = new MyExtension();
```

#### Pattern 5: RPC Client Without CoreHandler → With CoreHandler

**Before (v0.x):**
```javascript
class ExtensionRPCClient {
    constructor() {
        this.requestId = 0;
    }

    async call(method, params) {
        // Manual RPC implementation with stdio
        process.stdout.write(JSON.stringify(request) + '\n');
    }
}
```

**After (v1.0.0):**
```javascript
class ExtensionRPCClient {
    constructor(coreHandler) {
        this.coreHandler = coreHandler;
        this.requestId = 0;
    }

    async call(method, params) {
        // Use injected coreHandler
        const response = await this.coreHandler(request);
        if (response.error) throw new Error(response.error.message);
        return response.result;
    }
}

// In extension init:
async init(config) {
    this.rpcClient = new ExtensionRPCClient(config.coreHandler);
}
```

#### Pattern 6: Object Export → Class-Based Export

**Before (v0.x):**
```javascript
module.exports = {
    commit: async (params) => { /* ... */ },
    push: async (params) => { /* ... */ }
};
```

**After (v1.0.0):**
```javascript
class MyExtension {
    async init(config) {
        this.coreHandler = config.coreHandler;
        this.sdk = new ExtensionSDK('my-extension', { coreHandler: config.coreHandler });
    }
    
    async commit(params) {
        // Your commit logic using SDK
    }
    
    async push(params) {
        // Your push logic using SDK
    }
}

module.exports = new MyExtension();
```

### Step 6: Update Manifest

Ensure your `manifest.json` includes all required v1.0.0 fields:

```json
{
  "id": "my-extension",
  "name": "My Extension",
  "version": "1.0.0",
  "main": "index.js",
  "commands": ["my-command", "another-command"],
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

**Key v1.0.0 Changes:**
- `commands`: Array of CLI commands exposed by extension
- `dependencies`: Must include `@ghost/extension-sdk`
- `capabilities.network.rateLimit.be`: Excess burst parameter (required if rateLimit exists)

### Step 7: Validate Extension

```bash
ghost extension validate
```

This runs comprehensive validation including:
- Manifest schema compliance
- Permission declarations
- Rate limit configuration
- File structure
- Glob pattern validation
- Intent simulation

Fix any validation errors or warnings before installation.

### Step 8: Test Extension

```bash
# Install locally
ghost extension install .

# Test your commands
ghost <your-command> --help
ghost <your-command> <args>

# Check telemetry and audit logs
ghost gateway metrics <extension-id>
ghost gateway logs --extension=<extension-id>
```

## Incompatibility Patterns Detected by Migration Tool

### Critical Severity

**1. Direct stdio JSON-RPC (Code: DIRECT_STDIO)**
- **Issue**: Extension uses process.stdin/stdout for JSON-RPC
- **Impact**: Bypasses security pipeline, no audit logging
- **Fix**: Use init() with coreHandler injection
- **Guide**: See Pattern 4 above

**2. Missing coreHandler Injection (Code: NO_CORE_HANDLER)**
- **Issue**: RPC client constructor doesn't accept coreHandler
- **Impact**: Cannot communicate with Ghost core pipeline
- **Fix**: Add coreHandler parameter to constructor
- **Guide**: See Pattern 5 above

### High Severity

**3. Direct fs Module Usage (Code: DIRECT_FS)**
- **Issue**: Direct require('fs') usage
- **Impact**: Bypasses permission checks and audit logging
- **Fix**: Replace with ExtensionSDK.requestFileRead/Write
- **Guide**: See Pattern 1 above

**4. Direct HTTP/HTTPS Usage (Code: DIRECT_HTTP)**
- **Issue**: Direct require('http') or require('https')
- **Impact**: Bypasses network allowlist and rate limiting
- **Fix**: Replace with ExtensionSDK.requestNetworkCall
- **Guide**: See Pattern 2 above

**5. Object Export Pattern (Code: OBJECT_EXPORT)**
- **Issue**: module.exports = { ... } without class wrapper
- **Impact**: Cannot receive init() with coreHandler
- **Fix**: Convert to class-based export
- **Guide**: See Pattern 6 above

### Medium Severity

**6. Direct Git Execution (Code: DIRECT_GIT)**
- **Issue**: Direct execSync('git ...') or spawn
- **Impact**: Bypasses git permission checks
- **Fix**: Replace with ExtensionSDK.requestGitExec
- **Guide**: See Pattern 3 above

## Common Issues & Solutions

### Issue 1: Missing coreHandler Parameter

**Error:**
```
No core handler registered for RPC call: intent
```

**Cause:** Extension class doesn't accept or use coreHandler

**Solution:**
```javascript
class MyExtension {
    async init(config) {
        if (!config || !config.coreHandler) {
            throw new Error('coreHandler required');
        }
        this.coreHandler = config.coreHandler;
        this.sdk = new ExtensionSDK('my-extension', { coreHandler: config.coreHandler });
    }
}
```

### Issue 2: Direct fs Module Still in Use

**Error:**
```
Extension uses direct filesystem access
Pipeline: Authorization denied
```

**Solution:**
Remove all `require('fs')` and replace with SDK:
```javascript
// Remove: const fs = require('fs');
// Replace: fs.readFileSync() → await this.sdk.requestFileRead()
// Replace: fs.writeFileSync() → await this.sdk.requestFileWrite()
```

### Issue 3: Missing rate limit 'be' parameter

**Error:**
```
Network rate limit missing required "be" parameter
```

**Solution:**
Add `be` (excess burst) to rate limit config:
```json
"rateLimit": {
  "cir": 60,
  "bc": 100,
  "be": 50
}
```

**Rule of thumb:** 
- `be` = 50-100% of `bc` for moderate burst tolerance
- `be` = 200% of `bc` for high burst tolerance
- Lower `be` for stricter rate limiting

### Issue 4: Synchronous Code Patterns

**Error:**
```
Cannot read property 'then' of undefined
TypeError: this.sdk.requestFileRead(...).then is not a function
```

**Cause:** SDK methods return Promises, must use async/await

**Solution:**
```javascript
// Before: const data = this.sdk.requestFileRead({ path: 'file.txt' });
// After:  const data = await this.sdk.requestFileRead({ path: 'file.txt' });

// Ensure all calling functions are async:
async myCommand(params) {
    const data = await this.sdk.requestFileRead({ path: 'file.txt' });
    return data;
}
```

### Issue 5: Missing commands Array

**Error:**
```
Missing required field: commands
```

**Solution:**
Add `commands` array to manifest.json listing all CLI commands:
```json
{
  "commands": ["my-command", "another-command"],
  ...
}
```

### Issue 6: ExtensionSDK Not Found

**Error:**
```
Cannot find module '@ghost/extension-sdk'
```

**Solution:**
```bash
npm install
```

Ensure package.json has the dependency:
```json
{
  "dependencies": {
    "@ghost/extension-sdk": "^1.0.0"
  }
}
```

## ExtensionSDK API Reference

See `packages/extension-sdk/README.md` for complete API documentation.

### Quick Reference

```javascript
// Filesystem
await sdk.requestFileRead({ path, encoding: 'utf8' })
await sdk.requestFileWrite({ path, content, encoding: 'utf8' })
await sdk.requestFileExists(path)
await sdk.requestFileReadDir({ path })
await sdk.requestFileStat({ path })
await sdk.requestFileReadJSON(path)
await sdk.requestFileWriteJSON(path, data)

// Network
await sdk.requestNetworkCall({ url, method, headers, body })

// Git
await sdk.requestGitExec({ operation, args })
await sdk.requestGitStatus()
await sdk.requestGitCurrentBranch()
await sdk.requestGitCommit(message, options)

// Batch operations
await sdk.requestBatch([intent1, intent2, intent3])

// Intent builder
const intent = sdk.buildIntent()
    .filesystem('read', { path: 'file.txt' })
    .build()
```

## Testing Your Migration

### Unit Testing with Mocked SDK

```javascript
const { ExtensionSDK } = require('@ghost/extension-sdk');

describe('MyExtension', () => {
    it('should read configuration', async () => {
        const mockHandler = jest.fn().mockResolvedValue({
            jsonrpc: '2.0',
            id: 1,
            result: { content: 'test content' }
        });

        const ext = new MyExtension('test-ext', mockHandler);
        await ext.init({ coreHandler: mockHandler });
        const config = await ext.loadConfig();

        expect(mockHandler).toHaveBeenCalled();
        expect(config).toBe('test content');
    });
});
```

## Rollback Instructions

If migration fails or causes issues:

### Restore from Migration Backup

```bash
# List available backups
ls -la .migration-backup/

# Restore from specific backup (replace timestamp)
cp -r .migration-backup/2024-01-15T10-30-00/* .

# Or restore latest
cp -r .migration-backup/$(ls -t .migration-backup | head -1)/* .
```

### Restore from Manual Backup

```bash
rm -rf your-extension
cp -r your-extension-backup your-extension
```

### Reinstall Extension

```bash
ghost extension remove <extension-id>
ghost extension install .
```

## Migration Checklist

Use this checklist to ensure complete migration:

- [ ] **Backup**: Created manual backup of extension
- [ ] **Analyze**: Ran `ghost extension migrate` (dry run)
- [ ] **Review**: Reviewed analysis report and migration plan
- [ ] **Apply**: Ran `ghost extension migrate --auto`
- [ ] **Dependencies**: Ran `npm install`
- [ ] **Review Guide**: Read generated MIGRATION_GUIDE.md
- [ ] **Direct I/O**: Replaced all direct fs operations with SDK
- [ ] **Network**: Replaced all direct http/https with SDK
- [ ] **Git**: Replaced all direct git commands with SDK
- [ ] **CoreHandler**: Updated RPC client with coreHandler injection
- [ ] **Async**: Converted sync operations to async/await
- [ ] **Manifest**: Added commands array
- [ ] **Manifest**: Added dependencies object
- [ ] **Manifest**: Added rate limit be parameter
- [ ] **Validate**: Ran `ghost extension validate` successfully
- [ ] **Test**: Tested all commands
- [ ] **Telemetry**: Checked audit logs and metrics
- [ ] **Documentation**: Updated extension README if needed
- [ ] **Commit**: Committed migration changes

## Example: Complete Migration

The bundled `ghost-git-extension` serves as a reference v1.0.0 implementation:

```bash
cd extensions/ghost-git-extension
cat extension.js      # ExtensionWrapper pattern with SDK
cat manifest.json     # v1.0.0 manifest schema
cat index.js          # Entry point
```

### v0.x Sample Extension

See `core/examples/v0-extension-migration-sample.js` for a complete v0.x extension that demonstrates all legacy patterns.

## Resources

- **SDK Documentation**: `packages/extension-sdk/README.md`
- **API Reference**: `docs/extension-api.md`
- **Examples**: `docs/extension-examples.md`
- **Developer Toolkit**: `docs/DEVELOPER_TOOLKIT.md`
- **Quick Reference**: `docs/QUICK_REFERENCE.md`
- **Manifest Schema**: `core/manifest-schema.json`

## Getting Help

If you encounter issues during migration:

1. Review generated `MIGRATION_GUIDE.md`
2. Check this document for common issues
3. Run `ghost extension validate` for detailed diagnostics
4. Review error messages with suggested fixes
5. Examine reference implementation in `extensions/ghost-git-extension`
6. Consult extension examples in `docs/extension-examples.md`

## Advanced Topics

### Custom RPC Client Migration

If your extension has a custom RPC client:

```javascript
// v0.x custom RPC client
class MyRPCClient {
    constructor() {
        this.pending = new Map();
    }
    
    async request(method, params) {
        // Custom implementation
    }
}

// v1.0.0 migration
class MyRPCClient {
    constructor(coreHandler) {
        this.coreHandler = coreHandler;
        this.pending = new Map();
    }
    
    async request(method, params) {
        const response = await this.coreHandler({
            jsonrpc: '2.0',
            id: this.nextId(),
            method,
            params
        });
        
        if (response.error) {
            throw new Error(response.error.message);
        }
        
        return response.result;
    }
}
```

### Multi-File Extensions

For extensions with multiple source files:

1. Migrate main entry point first
2. Update imports in dependent files
3. Pass SDK instance to helper modules
4. Ensure all async operations use await

```javascript
// main.js
class MyExtension {
    constructor(extensionId, coreHandler) {
        this.sdk = new ExtensionSDK(extensionId, { coreHandler });
        this.helper = new Helper(this.sdk);
    }
}

// helper.js
class Helper {
    constructor(sdk) {
        this.sdk = sdk;
    }
    
    async doWork() {
        return await this.sdk.requestFileRead({ path: 'file.txt' });
    }
}
```

### Performance Considerations

v1.0.0 introduces pipeline overhead for security:
- Each I/O operation goes through intercept → auth → audit → execute layers
- Consider batching operations when possible
- Use SDK batch methods for multiple related operations
- Monitor telemetry to identify bottlenecks

```javascript
// Less efficient: sequential operations
for (const file of files) {
    await this.sdk.requestFileRead({ path: file });
}

// More efficient: batch operations
const intents = files.map(file => 
    this.sdk.buildIntent().filesystem('read', { path: file })
);
await this.sdk.requestBatch(intents);
```

---

*Migration tool version: 1.0.0*
*Last updated: 2024*
