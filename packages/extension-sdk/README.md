# @ghost/extension-sdk

Official SDK for building Ghost CLI extensions with typed JSON-RPC helpers.

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Complete API Reference](#complete-api-reference)
- [Batch Operations](#batch-operations)
- [Error Handling](#error-handling)
- [Timeout Configuration & Retry Strategies](#timeout-configuration--retry-strategies)
- [Manifest Integration Guide](#manifest-integration-guide)
- [Migration Guide from Direct RPC](#migration-guide-from-direct-rpc)
- [Performance Tips & Rate Limit Optimization](#performance-tips--rate-limit-optimization)
- [TypeScript Support](#typescript-support)
- [Examples](#examples)

## Installation

```bash
npm install @ghost/extension-sdk
```

## Quick Start

```javascript
const { ExtensionSDK } = require('@ghost/extension-sdk');

class MyExtension {
    constructor() {
        this.sdk = new ExtensionSDK('my-extension-id');
    }

    async myCommand(params) {
        const { args, flags } = params;

        try {
            // Read a file
            const content = await this.sdk.requestFileRead({
                path: './package.json'
            });

            // Make a network call
            const data = await this.sdk.requestNetworkCall({
                url: 'https://api.example.com/data',
                method: 'GET'
            });

            // Execute git command
            const status = await this.sdk.requestGitStatus();

            return {
                success: true,
                output: 'Command executed successfully'
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }
}

module.exports = MyExtension;
```

## Complete API Reference

### Constructor

#### `new ExtensionSDK(extensionId, options?)`

Creates a new SDK instance.

**Parameters:**
- `extensionId` (string, required): Unique identifier for your extension
- `options` (object, optional):
  - `timeout` (number): Default timeout for all operations in milliseconds (default: 30000)

**Returns:** ExtensionSDK instance

**Example:**
```javascript
const sdk = new ExtensionSDK('my-extension', { timeout: 60000 });
```

---

### Core Methods

#### `emitIntent(intent)`

Send a custom intent directly to the pipeline. Low-level API for advanced use cases.

**Parameters:**
- `intent` (IntentParams): Intent object with type, operation, params

**Returns:** Promise<IntentResponse>

**Throws:**
- `ValidationError`: Invalid intent structure
- `IntentError`: Operation failed
- `RateLimitError`: Rate limit exceeded

**Example:**
```javascript
const response = await sdk.emitIntent({
    type: 'filesystem',
    operation: 'read',
    params: { path: './file.txt' }
});

if (!response.success) {
    console.error('Error:', response.error);
} else {
    console.log('Result:', response.result);
}
```

#### `buildIntent()`

Create an IntentBuilder instance for fluent intent creation.

**Returns:** IntentBuilder

**Example:**
```javascript
const builder = sdk.buildIntent();
const intent = builder.filesystem('read', { path: './file.txt' });
const response = await sdk.emitIntent(intent);
```

---

### Filesystem Operations

#### `requestFileRead(params)`

Read a file from the filesystem.

**Parameters:**
- `params` (object):
  - `path` (string, required): File path (relative or absolute)
  - `encoding` (string, optional): File encoding (default: 'utf8')
    - Valid values: 'utf8', 'ascii', 'base64', 'hex', 'binary', 'utf16le'

**Returns:** Promise<string> - File contents

**Throws:**
- `ValidationError`: Missing or invalid path
- `IntentError`: File not found or read error

**Example:**
```javascript
const content = await sdk.requestFileRead({
    path: './file.txt',
    encoding: 'utf8'
});
```

#### `requestFileWrite(params)`

Write content to a file.

**Parameters:**
- `params` (object):
  - `path` (string, required): File path
  - `content` (string, required): Content to write
  - `encoding` (string, optional): File encoding (default: 'utf8')

**Returns:** Promise<void>

**Throws:**
- `ValidationError`: Missing path or content
- `IntentError`: Write permission denied or disk error

**Security:** Content is scanned for high-entropy secrets before writing.

**Example:**
```javascript
await sdk.requestFileWrite({
    path: './output.txt',
    content: 'Hello, world!',
    encoding: 'utf8'
});
```

#### `requestFileReadDir(params)`

List directory contents.

**Parameters:**
- `params` (object):
  - `path` (string, required): Directory path

**Returns:** Promise<string[]> - Array of filenames

**Throws:**
- `ValidationError`: Missing or invalid path
- `IntentError`: Directory not found or read error

**Example:**
```javascript
const files = await sdk.requestFileReadDir({
    path: './src'
});
console.log('Files:', files);
```

#### `requestFileStat(params)`

Get file or directory statistics.

**Parameters:**
- `params` (object):
  - `path` (string, required): File or directory path

**Returns:** Promise<fs.Stats> - File statistics object with properties:
- `size` (number): File size in bytes
- `mtime` (Date): Last modified time
- `isFile()` (function): Returns true if file
- `isDirectory()` (function): Returns true if directory

**Throws:**
- `ValidationError`: Missing or invalid path
- `IntentError`: Path not found

**Example:**
```javascript
const stats = await sdk.requestFileStat({
    path: './file.txt'
});
console.log(`Size: ${stats.size} bytes, Modified: ${stats.mtime}`);
```

#### `requestFileExists(path)`

Check if a file or directory exists.

**Parameters:**
- `path` (string, required): File or directory path

**Returns:** Promise<boolean> - true if exists, false otherwise

**Throws:**
- `ValidationError`: Missing or invalid path

**Example:**
```javascript
const exists = await sdk.requestFileExists('./config.json');
if (!exists) {
    console.log('Config file not found');
}
```

#### `requestFileReadJSON(path)`

Read and parse a JSON file.

**Parameters:**
- `path` (string, required): JSON file path

**Returns:** Promise<any> - Parsed JSON object

**Throws:**
- `ValidationError`: Missing path or JSON parse error
- `IntentError`: File not found or read error

**Example:**
```javascript
const config = await sdk.requestFileReadJSON('./package.json');
console.log('Version:', config.version);
```

#### `requestFileWriteJSON(path, object)`

Stringify and write an object as JSON.

**Parameters:**
- `path` (string, required): Output file path
- `object` (any, required): Object to serialize

**Returns:** Promise<void>

**Throws:**
- `ValidationError`: Missing path/object or stringify error
- `IntentError`: Write error

**Example:**
```javascript
await sdk.requestFileWriteJSON('./config.json', {
    version: '1.0.0',
    name: 'my-extension'
});
```

#### `requestFileReadBatch(paths)`

Read multiple files concurrently.

**Parameters:**
- `paths` (string[], required): Array of file paths

**Returns:** Promise<string[]> - Array of file contents (same order as input)

**Throws:**
- `ValidationError`: Invalid paths array
- `IntentError`: If any read fails

**Example:**
```javascript
const contents = await sdk.requestFileReadBatch([
    './file1.txt',
    './file2.txt',
    './file3.txt'
]);
```

---

### Network Operations

#### `requestNetworkCall(params)`

Make an HTTP/HTTPS request.

**Parameters:**
- `params` (object):
  - `url` (string, required): Full URL with protocol
  - `method` (string, optional): HTTP method (default: 'GET')
    - Valid values: 'GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'
  - `headers` (object, optional): HTTP headers as key-value pairs
  - `body` (string, optional): Request body (use JSON.stringify for objects)
  - `timeout` (number, optional): Request timeout in milliseconds

**Returns:** Promise<string> - Response body

**Throws:**
- `ValidationError`: Invalid URL
- `RateLimitError`: Rate limit exceeded
- `IntentError`: Network error or timeout

**Security:**
- URLs must be in manifest allowlist
- SSRF protection blocks localhost and private IPs
- Rate limiting enforced (CIR/Bc token bucket)

**Example:**
```javascript
const response = await sdk.requestNetworkCall({
    url: 'https://api.github.com/repos/owner/repo',
    method: 'GET',
    headers: {
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `token ${process.env.GITHUB_TOKEN}`
    }
});

const data = JSON.parse(response);
```

---

### Git Operations

#### `requestGitExec(params)`

Execute a git operation.

**Parameters:**
- `params` (object):
  - `operation` (string, required): Git subcommand
    - Read operations: 'status', 'log', 'diff', 'show', 'ls-files', 'branch', 'tag', 'rev-parse', 'describe', 'symbolic-ref'
    - Write operations: 'commit', 'push', 'reset' (requires git.write permission)
  - `args` (string[], optional): Additional git arguments

**Returns:** Promise<object> - Object with stdout and stderr properties

**Throws:**
- `ValidationError`: Invalid operation or args
- `IntentError`: Git command failed

**Security:**
- Read operations require `git.read: true` in manifest
- Write operations require `git.write: true` in manifest
- Dangerous arguments (`--exec`, `-c`) are blocked

**Example:**
```javascript
const result = await sdk.requestGitExec({
    operation: 'status',
    args: ['--short']
});
console.log(result.stdout);
```

#### `requestGitStatus(args?)`

Get git status.

**Parameters:**
- `args` (string[], optional): Additional git status arguments

**Returns:** Promise<string> - Git status output

**Example:**
```javascript
const status = await sdk.requestGitStatus(['--short']);
```

#### `requestGitLog(args?)`

Get git log.

**Parameters:**
- `args` (string[], optional): Additional git log arguments

**Returns:** Promise<string> - Git log output

**Example:**
```javascript
const log = await sdk.requestGitLog(['--oneline', '-10']);
```

#### `requestGitDiff(args?)`

Get git diff.

**Parameters:**
- `args` (string[], optional): Additional git diff arguments

**Returns:** Promise<string> - Git diff output

**Example:**
```javascript
const diff = await sdk.requestGitDiff(['HEAD~1', 'HEAD']);
```

#### `requestGitCurrentBranch()`

Get the current branch name.

**Parameters:** None

**Returns:** Promise<string> - Current branch name

**Example:**
```javascript
const branch = await sdk.requestGitCurrentBranch();
console.log('Current branch:', branch);
```

#### `requestGitStagedFiles()`

Get list of staged files.

**Parameters:** None

**Returns:** Promise<string[]> - Array of staged file paths

**Example:**
```javascript
const staged = await sdk.requestGitStagedFiles();
console.log('Staged files:', staged);
```

#### `requestGitCommit(message, options?)`

Create a git commit.

**Parameters:**
- `message` (string, required): Commit message
- `options` (object, optional):
  - `all` (boolean): Stage all tracked files (git commit -a)
  - `amend` (boolean): Amend previous commit
  - `noVerify` (boolean): Skip pre-commit hooks
  - `allowEmpty` (boolean): Allow empty commit
  - `author` (string): Override commit author

**Returns:** Promise<string> - Commit output

**Requires:** `git.write: true` in manifest

**Example:**
```javascript
await sdk.requestGitCommit('feat: add new feature', {
    all: true,
    author: 'Name <email@example.com>'
});
```

---

### Batch Operations

#### `requestBatch(requests)`

Execute multiple intents concurrently.

**Parameters:**
- `requests` (IntentParams[], required): Array of intent objects

**Returns:** Promise<IntentResponse[]> - Array of responses

**Throws:**
- `ValidationError`: Invalid requests array

**Example:**
```javascript
const builder = sdk.buildIntent();
const responses = await sdk.requestBatch([
    builder.filesystem('read', { path: './file1.txt' }),
    builder.filesystem('read', { path: './file2.txt' }),
    builder.git('status', { args: ['--short'] })
]);
```

---

## Batch Operations

Batch operations allow you to execute multiple requests concurrently, significantly improving performance when you need to perform multiple I/O operations.

### Concurrent File Reads

Read multiple files in parallel instead of sequentially:

```javascript
// ❌ Sequential (slow)
const files = ['file1.txt', 'file2.txt', 'file3.txt'];
const contents = [];
for (const file of files) {
    const content = await sdk.requestFileRead({ path: file });
    contents.push(content);
}
// Total time: ~3 * file_read_time

// ✅ Parallel (fast)
const contents = await sdk.requestFileReadBatch([
    'file1.txt',
    'file2.txt',
    'file3.txt'
]);
// Total time: ~1 * file_read_time
```

### Mixed Operation Batching

Combine different operation types in a single batch:

```javascript
const builder = sdk.buildIntent();

const [fileContent, apiResponse, gitStatus] = await sdk.requestBatch([
    builder.filesystem('read', { path: './config.json' }),
    builder.network('https', {
        url: 'https://api.github.com/user',
        headers: { 'Authorization': `token ${token}` }
    }),
    builder.git('status', { args: ['--short'] })
]);
```

### Error Handling in Batch Operations

Individual operations can fail independently:

```javascript
const builder = sdk.buildIntent();
const responses = await sdk.requestBatch([
    builder.filesystem('read', { path: './exists.txt' }),
    builder.filesystem('read', { path: './missing.txt' }),
    builder.filesystem('read', { path: './also-exists.txt' })
]);

responses.forEach((response, index) => {
    if (!response.success) {
        console.error(`Operation ${index} failed:`, response.error);
    } else {
        console.log(`Operation ${index} succeeded:`, response.result);
    }
});
```

### Performance Considerations

**When to use batch operations:**
- Reading multiple files (10+ files)
- Making multiple API calls to same endpoint
- Performing multiple git queries
- Any scenario with I/O-bound parallel work

**When NOT to use batch operations:**
- Operations depend on each other's results
- Very large batches (>100 operations) - split into chunks
- Operations have different rate limit requirements

**Optimal batch sizes:**
```javascript
// Large file set - chunk it
const allFiles = [...Array(500)].map((_, i) => `file${i}.txt`);
const CHUNK_SIZE = 50;

for (let i = 0; i < allFiles.length; i += CHUNK_SIZE) {
    const chunk = allFiles.slice(i, i + CHUNK_SIZE);
    const contents = await sdk.requestFileReadBatch(chunk);
    // Process chunk...
}
```

### Advanced Batching with Custom RPCClient

For more control over batch operations:

```javascript
const { RPCClient } = require('@ghost/extension-sdk');

const client = new RPCClient('my-extension', { timeout: 60000 });
const builder = sdk.buildIntent();

// Create intents
const intents = files.map(file =>
    builder.filesystem('read', { path: file })
);

// Send batch with custom timeout
const responses = await client.sendBatch(intents);

// Process responses
const successful = responses.filter(r => r.success);
const failed = responses.filter(r => !r.success);

console.log(`Success: ${successful.length}, Failed: ${failed.length}`);
```

---

## Error Handling

The SDK provides typed error classes for different failure scenarios.

### Error Types

#### `IntentError`

Generic error for operation failures.

**Properties:**
- `message` (string): Human-readable error message
- `code` (string): Machine-readable error code
- `stage` (string): Pipeline stage where error occurred
- `requestId` (string): Request identifier for tracking

**Example:**
```javascript
try {
    await sdk.requestFileRead({ path: './missing.txt' });
} catch (error) {
    if (error instanceof IntentError) {
        console.error('Operation failed:', error.message);
        console.error('Code:', error.code);
        console.error('Stage:', error.stage);
        console.error('Request ID:', error.requestId);
    }
}
```

#### `ValidationError`

Error for schema validation failures.

**Properties:**
- `message` (string): Error description
- `code` (string): Validation error code (e.g., 'MISSING_FILE_PATH')
- `stage` (string): Always 'validation'
- `requestId` (string): Request identifier

**Example:**
```javascript
try {
    await sdk.requestFileRead({ path: '' }); // Invalid: empty path
} catch (error) {
    if (error instanceof ValidationError) {
        console.error('Validation failed:', error.message);
        // Fix your parameters and retry
    }
}
```

#### `RateLimitError`

Error when rate limit is exceeded.

**Properties:**
- `message` (string): Rate limit error message
- `code` (string): Always 'RATE_LIMIT_EXCEEDED'
- `stage` (string): 'gateway' or 'authorization'
- `requestId` (string): Request identifier

**Example:**
```javascript
try {
    await sdk.requestNetworkCall({ url: 'https://api.example.com' });
} catch (error) {
    if (error instanceof RateLimitError) {
        console.error('Rate limit exceeded');
        // Implement backoff and retry
    }
}
```

### Error Handling Patterns

#### Basic Try-Catch

```javascript
try {
    const content = await sdk.requestFileRead({ path: './file.txt' });
    return { success: true, data: content };
} catch (error) {
    console.error('Failed to read file:', error.message);
    return { success: false, error: error.message };
}
```

#### Type-Based Error Handling

```javascript
const { IntentError, ValidationError, RateLimitError } = require('@ghost/extension-sdk');

try {
    const response = await sdk.requestNetworkCall({
        url: 'https://api.example.com/data'
    });
    return JSON.parse(response);
} catch (error) {
    if (error instanceof ValidationError) {
        console.error('Invalid request parameters:', error.message);
        // Fix parameters
    } else if (error instanceof RateLimitError) {
        console.error('Rate limit exceeded, waiting...');
        // Implement backoff
        await sleep(5000);
        return retry();
    } else if (error instanceof IntentError) {
        console.error('Operation failed:', error.message);
        // Log and report
    } else {
        console.error('Unexpected error:', error);
        throw error;
    }
}
```

#### Error Recovery with Fallbacks

```javascript
async function readConfigWithFallback() {
    try {
        return await sdk.requestFileReadJSON('./config.json');
    } catch (error) {
        console.warn('Failed to read config, using defaults:', error.message);
        return {
            version: '1.0.0',
            enabled: true
        };
    }
}
```

#### Granular Error Inspection

```javascript
try {
    await sdk.requestFileWrite({
        path: './output.txt',
        content: 'sensitive data'
    });
} catch (error) {
    // Check specific error codes
    if (error.code === 'AUTH_PERMISSION_DENIED') {
        console.error('Missing write permission in manifest');
    } else if (error.code === 'SI-10-CONTENT-SECRETS') {
        console.error('Content contains secrets, cannot write');
    } else if (error.stage === 'EXECUTION') {
        console.error('Disk error or filesystem issue');
    }
}
```

#### Logging for Debugging

```javascript
async function safeOperation(fn, context) {
    try {
        return await fn();
    } catch (error) {
        const errorInfo = {
            message: error.message,
            code: error.code,
            stage: error.stage,
            requestId: error.requestId,
            context,
            timestamp: new Date().toISOString()
        };
        
        // Log to file for debugging
        await sdk.requestFileWrite({
            path: './error.log',
            content: JSON.stringify(errorInfo, null, 2)
        });
        
        throw error;
    }
}
```

---

## Timeout Configuration & Retry Strategies

### Global Timeout Configuration

Set default timeout for all SDK operations:

```javascript
const sdk = new ExtensionSDK('my-extension', {
    timeout: 60000  // 60 seconds
});
```

### Per-Operation Timeouts

Override timeout for specific operations:

```javascript
// Network call with custom timeout
await sdk.requestNetworkCall({
    url: 'https://api.slow-service.com/endpoint',
    timeout: 120000  // 2 minutes for this specific call
});
```

### Retry Strategies

#### Exponential Backoff

```javascript
async function fetchWithExponentialBackoff(url, maxRetries = 5) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await sdk.requestNetworkCall({ url });
        } catch (error) {
            const isLastAttempt = attempt === maxRetries - 1;
            
            if (error instanceof RateLimitError && !isLastAttempt) {
                const backoff = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s, 8s, 16s
                console.log(`Rate limited, retrying in ${backoff}ms...`);
                await sleep(backoff);
                continue;
            }
            
            throw error;
        }
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
```

#### Linear Backoff with Jitter

```javascript
async function fetchWithJitter(url, maxRetries = 3) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await sdk.requestNetworkCall({ url });
        } catch (error) {
            if (error instanceof RateLimitError && attempt < maxRetries - 1) {
                const baseDelay = 5000; // 5 seconds
                const jitter = Math.random() * 1000; // 0-1 second
                const delay = baseDelay + jitter;
                
                console.log(`Retry ${attempt + 1}/${maxRetries} after ${delay}ms`);
                await sleep(delay);
                continue;
            }
            
            throw error;
        }
    }
}
```

#### Conditional Retry

```javascript
async function fetchWithConditionalRetry(url) {
    const retryableErrors = ['TIMEOUT_EXCEEDED', 'CIRCUIT_BREAKER_OPEN'];
    const maxRetries = 3;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await sdk.requestNetworkCall({ url });
        } catch (error) {
            const shouldRetry = retryableErrors.includes(error.code) &&
                               attempt < maxRetries - 1;
            
            if (shouldRetry) {
                const delay = (attempt + 1) * 2000; // 2s, 4s, 6s
                console.log(`Retrying after ${delay}ms due to ${error.code}`);
                await sleep(delay);
                continue;
            }
            
            throw error;
        }
    }
}
```

#### Retry with Circuit Breaker

```javascript
class CircuitBreaker {
    constructor(threshold = 5, timeout = 60000) {
        this.failureCount = 0;
        this.threshold = threshold;
        this.timeout = timeout;
        this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
        this.nextAttempt = null;
    }
    
    async execute(fn) {
        if (this.state === 'OPEN') {
            if (Date.now() < this.nextAttempt) {
                throw new Error('Circuit breaker is OPEN');
            }
            this.state = 'HALF_OPEN';
        }
        
        try {
            const result = await fn();
            this.onSuccess();
            return result;
        } catch (error) {
            this.onFailure();
            throw error;
        }
    }
    
    onSuccess() {
        this.failureCount = 0;
        this.state = 'CLOSED';
    }
    
    onFailure() {
        this.failureCount++;
        if (this.failureCount >= this.threshold) {
            this.state = 'OPEN';
            this.nextAttempt = Date.now() + this.timeout;
            console.log(`Circuit breaker opened for ${this.timeout}ms`);
        }
    }
}

// Usage
const breaker = new CircuitBreaker(5, 60000);

async function protectedCall(url) {
    return breaker.execute(() => sdk.requestNetworkCall({ url }));
}
```

---

## Manifest Integration Guide

The SDK capabilities must be declared in your extension's `manifest.json`. This section explains how SDK methods map to manifest permissions.

### Filesystem Operations Mapping

SDK methods require corresponding filesystem patterns in manifest:

```json
{
  "capabilities": {
    "filesystem": {
      "read": [
        "**/*.js",
        "**/*.json",
        "src/**/*"
      ],
      "write": [
        "dist/**/*",
        "output.txt"
      ]
    }
  }
}
```

**SDK to Manifest Mapping:**

| SDK Method | Manifest Permission | Pattern Example |
|------------|-------------------|-----------------|
| `requestFileRead()` | `filesystem.read` | `"**/*.txt"` |
| `requestFileReadDir()` | `filesystem.read` | `"src/**/*"` |
| `requestFileStat()` | `filesystem.read` | `"**/*.json"` |
| `requestFileExists()` | `filesystem.read` | `"config.json"` |
| `requestFileReadJSON()` | `filesystem.read` | `"**/*.json"` |
| `requestFileWrite()` | `filesystem.write` | `"dist/**/*"` |
| `requestFileWriteJSON()` | `filesystem.write` | `"output/**/*.json"` |
| `requestFileReadBatch()` | `filesystem.read` | Match all paths |

**Glob Pattern Examples:**

```javascript
// Match all JavaScript files recursively
"read": ["**/*.js"]

// Match specific directory
"read": ["src/**/*"]

// Match specific files in root
"read": ["package.json", "README.md"]

// Match with exclusions (not supported directly, use specific patterns)
"read": ["src/**/*.js", "!src/**/*.test.js"]  // ❌ Not supported
"read": ["src/**/*.js"]  // ✅ Use specific patterns
```

### Network Operations Mapping

Network operations require URL allowlist:

```json
{
  "capabilities": {
    "network": {
      "allowlist": [
        "https://api.github.com",
        "https://api.npmjs.org"
      ],
      "rateLimit": {
        "cir": 60,
        "bc": 100
      }
    }
  }
}
```

**SDK to Manifest Mapping:**

| SDK Method | Manifest Permission | Configuration |
|------------|-------------------|---------------|
| `requestNetworkCall()` | `network.allowlist` | URL origins |

**Important:** Allowlist matching is origin-based (protocol + domain + port):

```javascript
// ✅ Matches "https://api.github.com"
await sdk.requestNetworkCall({
    url: 'https://api.github.com/repos/owner/repo'
});

// ❌ Doesn't match (different protocol)
await sdk.requestNetworkCall({
    url: 'http://api.github.com/repos/owner/repo'
});

// ❌ Doesn't match (different port)
await sdk.requestNetworkCall({
    url: 'https://api.github.com:8080/api'
});
```

### Git Operations Mapping

Git operations require read and/or write permissions:

```json
{
  "capabilities": {
    "git": {
      "read": true,
      "write": false
    }
  }
}
```

**SDK to Manifest Mapping:**

| SDK Method | Manifest Permission |
|------------|-------------------|
| `requestGitStatus()` | `git.read` |
| `requestGitLog()` | `git.read` |
| `requestGitDiff()` | `git.read` |
| `requestGitCurrentBranch()` | `git.read` |
| `requestGitStagedFiles()` | `git.read` |
| `requestGitCommit()` | `git.write` |
| `requestGitExec()` | `git.read` or `git.write` |

**Permission Requirements:**

```javascript
// Read operations - requires git.read: true
await sdk.requestGitStatus();
await sdk.requestGitLog();
await sdk.requestGitDiff();

// Write operations - requires git.write: true
await sdk.requestGitCommit('feat: new feature');
await sdk.requestGitExec({ operation: 'push', args: ['origin', 'main'] });
```

### Rate Limit Configuration

Configure rate limits in manifest to match your usage patterns:

```json
{
  "capabilities": {
    "network": {
      "allowlist": ["https://api.example.com"],
      "rateLimit": {
        "cir": 60,    // Committed Information Rate: requests per minute
        "bc": 100,    // Burst Committed: max burst size
        "be": 50      // Burst Excess: additional burst capacity (optional)
      }
    }
  }
}
```

**Rate Limit Scenarios:**

```javascript
// Low-frequency polling
{
  "rateLimit": {
    "cir": 30,   // 30 requests/min (0.5/sec sustained)
    "bc": 50     // Burst up to 50
  }
}

// Standard API usage
{
  "rateLimit": {
    "cir": 60,   // 60 requests/min (1/sec sustained)
    "bc": 100    // Burst up to 100
  }
}

// High-throughput batch processing
{
  "rateLimit": {
    "cir": 120,  // 120 requests/min (2/sec sustained)
    "bc": 200,   // Burst up to 200
    "be": 100    // Additional 100 for peaks
  }
}
```

### Complete Manifest Example

```json
{
  "id": "my-extension",
  "name": "My Extension",
  "version": "1.0.0",
  "main": "index.js",
  "capabilities": {
    "filesystem": {
      "read": [
        "**/*.js",
        "**/*.json",
        "src/**/*"
      ],
      "write": [
        "dist/**/*",
        "logs/**/*.log"
      ]
    },
    "network": {
      "allowlist": [
        "https://api.github.com",
        "https://api.npmjs.org"
      ],
      "rateLimit": {
        "cir": 60,
        "bc": 100
      }
    },
    "git": {
      "read": true,
      "write": false
    }
  }
}
```

---

## Migration Guide from Direct RPC

If you're migrating from direct RPC/IPC communication to the SDK, this guide will help.

### Before: Direct RPC

```javascript
// Old approach - manual JSON-RPC
class OldExtension {
    async readFile(path) {
        const message = {
            jsonrpc: '2.0',
            method: 'intent',
            params: {
                type: 'filesystem',
                operation: 'read',
                params: { path },
                extensionId: this.id,
                requestId: this.generateId()
            },
            id: this.generateId()
        };
        
        process.stdout.write(JSON.stringify(message) + '\n');
        
        return new Promise((resolve, reject) => {
            const handler = (data) => {
                const response = JSON.parse(data.toString());
                if (response.id === message.id) {
                    process.stdin.removeListener('data', handler);
                    if (response.error) {
                        reject(new Error(response.error.message));
                    } else {
                        resolve(response.result);
                    }
                }
            };
            process.stdin.on('data', handler);
        });
    }
}
```

### After: SDK

```javascript
// New approach - clean SDK
const { ExtensionSDK } = require('@ghost/extension-sdk');

class NewExtension {
    constructor() {
        this.sdk = new ExtensionSDK('my-extension-id');
    }
    
    async readFile(path) {
        return await this.sdk.requestFileRead({ path });
    }
}
```

### Migration Steps

#### Step 1: Install SDK

```bash
npm install @ghost/extension-sdk
```

#### Step 2: Replace IPC Code

**Before:**
```javascript
function sendIntent(type, operation, params) {
    const message = {
        jsonrpc: '2.0',
        method: 'intent',
        params: {
            type,
            operation,
            params,
            extensionId: this.id,
            requestId: generateRequestId()
        },
        id: generateRequestId()
    };
    
    process.send(message);
    
    return new Promise((resolve, reject) => {
        process.on('message', (response) => {
            if (response.id === message.id) {
                if (response.error) {
                    reject(new Error(response.error.message));
                } else {
                    resolve(response.result);
                }
            }
        });
    });
}
```

**After:**
```javascript
const sdk = new ExtensionSDK('my-extension-id');

// That's it! SDK handles all IPC
```

#### Step 3: Convert Intent Calls

**Filesystem Operations:**

```javascript
// Before
const content = await sendIntent('filesystem', 'read', { path: './file.txt' });

// After
const content = await sdk.requestFileRead({ path: './file.txt' });
```

**Network Operations:**

```javascript
// Before
const response = await sendIntent('network', 'https', {
    url: 'https://api.example.com',
    method: 'GET'
});

// After
const response = await sdk.requestNetworkCall({
    url: 'https://api.example.com',
    method: 'GET'
});
```

**Git Operations:**

```javascript
// Before
const status = await sendIntent('git', 'status', { args: ['--short'] });

// After
const status = await sdk.requestGitStatus(['--short']);
```

#### Step 4: Update Error Handling

**Before:**
```javascript
try {
    const result = await sendIntent('filesystem', 'read', { path });
} catch (error) {
    console.error('Error:', error.message);
}
```

**After:**
```javascript
const { IntentError, ValidationError, RateLimitError } = require('@ghost/extension-sdk');

try {
    const result = await sdk.requestFileRead({ path });
} catch (error) {
    if (error instanceof ValidationError) {
        console.error('Invalid parameters:', error.message);
    } else if (error instanceof RateLimitError) {
        console.error('Rate limited:', error.message);
    } else if (error instanceof IntentError) {
        console.error('Operation failed:', error.message);
    }
}
```

#### Step 5: Batch Operations

**Before:**
```javascript
const promises = files.map(file => 
    sendIntent('filesystem', 'read', { path: file })
);
const contents = await Promise.all(promises);
```

**After:**
```javascript
// Even simpler with SDK
const contents = await sdk.requestFileReadBatch(files);
```

### Benefits of Migration

| Feature | Direct RPC | SDK |
|---------|-----------|-----|
| **Code Lines** | ~50 lines | ~5 lines |
| **Type Safety** | Manual | TypeScript definitions |
| **Error Handling** | Generic errors | Typed error classes |
| **Batch Operations** | Manual Promise.all | Built-in helpers |
| **Timeout Management** | Manual | Configurable |
| **Request ID Generation** | Manual | Automatic |
| **Validation** | None | Built-in |

---

## Performance Tips & Rate Limit Optimization

### Rate Limit Optimization

#### 1. Batch Similar Requests

```javascript
// ❌ Bad: Multiple individual requests
for (const file of files) {
    await sdk.requestFileRead({ path: file });
}
// Result: High rate limit consumption

// ✅ Good: Single batch request
const contents = await sdk.requestFileReadBatch(files);
// Result: Same rate limit cost, faster execution
```

#### 2. Cache API Responses

```javascript
class CachedAPI {
    constructor(sdk, cacheDuration = 60000) {
        this.sdk = sdk;
        this.cache = new Map();
        this.cacheDuration = cacheDuration;
    }
    
    async fetch(url) {
        const cached = this.cache.get(url);
        
        if (cached && Date.now() - cached.timestamp < this.cacheDuration) {
            return cached.data;
        }
        
        const data = await this.sdk.requestNetworkCall({ url });
        this.cache.set(url, {
            data,
            timestamp: Date.now()
        });
        
        return data;
    }
}

// Usage
const api = new CachedAPI(sdk, 60000); // 1 minute cache
const data = await api.fetch('https://api.example.com/data');
```

#### 3. Implement Request Queuing

```javascript
class RequestQueue {
    constructor(sdk, rateLimit = 60) {
        this.sdk = sdk;
        this.queue = [];
        this.interval = 60000 / rateLimit; // ms between requests
        this.lastRequest = 0;
    }
    
    async enqueue(fn) {
        return new Promise((resolve, reject) => {
            this.queue.push({ fn, resolve, reject });
            this.process();
        });
    }
    
    async process() {
        if (this.queue.length === 0) return;
        
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequest;
        
        if (timeSinceLastRequest < this.interval) {
            setTimeout(() => this.process(), this.interval - timeSinceLastRequest);
            return;
        }
        
        const { fn, resolve, reject } = this.queue.shift();
        this.lastRequest = Date.now();
        
        try {
            const result = await fn();
            resolve(result);
        } catch (error) {
            reject(error);
        }
        
        if (this.queue.length > 0) {
            setTimeout(() => this.process(), this.interval);
        }
    }
}

// Usage
const queue = new RequestQueue(sdk, 60); // 60 requests per minute

async function fetchWithQueue(url) {
    return queue.enqueue(() => sdk.requestNetworkCall({ url }));
}
```

#### 4. Monitor Token Bucket State

```javascript
class RateLimitMonitor {
    constructor() {
        this.tokens = 100; // Initial bc value
        this.capacity = 100;
        this.cir = 60; // per minute
        this.lastRefill = Date.now();
    }
    
    refill() {
        const now = Date.now();
        const elapsed = (now - this.lastRefill) / 60000; // minutes
        const tokensToAdd = Math.floor(elapsed * this.cir);
        
        if (tokensToAdd > 0) {
            this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
            this.lastRefill = now;
        }
    }
    
    canMakeRequest() {
        this.refill();
        return this.tokens > 0;
    }
    
    consumeToken() {
        this.refill();
        if (this.tokens > 0) {
            this.tokens--;
            return true;
        }
        return false;
    }
    
    async waitForToken() {
        while (!this.canMakeRequest()) {
            await sleep(1000);
        }
    }
}

// Usage
const monitor = new RateLimitMonitor();

async function safeNetworkCall(url) {
    await monitor.waitForToken();
    monitor.consumeToken();
    return await sdk.requestNetworkCall({ url });
}
```

### Performance Best Practices

#### 1. Minimize File I/O

```javascript
// ❌ Bad: Multiple small reads
const config = await sdk.requestFileReadJSON('./config.json');
const pkg = await sdk.requestFileReadJSON('./package.json');
const readme = await sdk.requestFileRead({ path: './README.md' });

// ✅ Good: Batch read
const [config, pkg, readme] = await sdk.requestFileReadBatch([
    './config.json',
    './package.json',
    './README.md'
]);
```

#### 2. Stream Large Files

For very large files, read in chunks:

```javascript
// For large files, consider using node:fs directly if available
const fs = require('fs');
const stream = fs.createReadStream('./large-file.txt', { encoding: 'utf8' });

stream.on('data', (chunk) => {
    // Process chunk
});
```

#### 3. Parallel Independent Operations

```javascript
// ❌ Bad: Sequential
const gitStatus = await sdk.requestGitStatus();
const files = await sdk.requestFileReadDir({ path: './src' });
const apiData = await sdk.requestNetworkCall({ url });

// ✅ Good: Parallel
const [gitStatus, files, apiData] = await Promise.all([
    sdk.requestGitStatus(),
    sdk.requestFileReadDir({ path: './src' }),
    sdk.requestNetworkCall({ url })
]);
```

#### 4. Lazy Loading

```javascript
class LazyExtension {
    constructor() {
        this.sdk = new ExtensionSDK('my-extension');
        this._config = null;
    }
    
    async getConfig() {
        if (!this._config) {
            this._config = await this.sdk.requestFileReadJSON('./config.json');
        }
        return this._config;
    }
}
```

#### 5. Debounce Frequent Operations

```javascript
function debounce(fn, delay) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => fn.apply(this, args), delay);
    };
}

// Debounce file writes
const debouncedWrite = debounce(async (path, content) => {
    await sdk.requestFileWrite({ path, content });
}, 1000);

// Usage: only writes once after 1s of no calls
debouncedWrite('./output.txt', 'data 1');
debouncedWrite('./output.txt', 'data 2');
debouncedWrite('./output.txt', 'data 3'); // Only this executes
```

### Rate Limit Troubleshooting

**Symptom:** Frequent rate limit errors

**Solutions:**

1. **Increase rate limits in manifest:**
```json
{
  "capabilities": {
    "network": {
      "rateLimit": {
        "cir": 120,  // Increase from 60
        "bc": 200    // Increase from 100
      }
    }
  }
}
```

2. **Implement request batching:**
```javascript
// Batch multiple requests
const responses = await sdk.requestBatch(intents);
```

3. **Add request delays:**
```javascript
for (const url of urls) {
    await sdk.requestNetworkCall({ url });
    await sleep(1000); // 1 second between requests
}
```

4. **Use caching:**
```javascript
const cache = new Map();
const cached = cache.get(url);
if (cached) return cached;

const data = await sdk.requestNetworkCall({ url });
cache.set(url, data);
return data;
```

---

## TypeScript Support

The SDK includes complete TypeScript definitions.

### Basic Usage

```typescript
import { ExtensionSDK, IntentParams, IntentResponse } from '@ghost/extension-sdk';

const sdk = new ExtensionSDK('my-extension');

const content: string = await sdk.requestFileRead({
    path: './file.txt'
});
```

### Type Definitions

```typescript
import {
    ExtensionSDK,
    IntentError,
    ValidationError,
    RateLimitError,
    FileReadParams,
    FileWriteParams,
    NetworkCallParams,
    GitExecParams,
    GitCommitOptions,
    SDKOptions
} from '@ghost/extension-sdk';
```

### Typed Extension Class

```typescript
class MyExtension {
    private sdk: ExtensionSDK;
    
    constructor() {
        this.sdk = new ExtensionSDK('my-extension', {
            timeout: 60000
        });
    }
    
    async readConfig(): Promise<any> {
        return await this.sdk.requestFileReadJSON('./config.json');
    }
    
    async fetchAPI(url: string): Promise<any> {
        const response: string = await this.sdk.requestNetworkCall({
            url,
            method: 'GET'
        });
        
        return JSON.parse(response);
    }
    
    async getStatus(): Promise<string> {
        return await this.sdk.requestGitStatus(['--short']);
    }
}
```

### Error Handling with Types

```typescript
import { IntentError, ValidationError, RateLimitError } from '@ghost/extension-sdk';

async function handleOperation() {
    try {
        const result = await sdk.requestFileRead({ path: './file.txt' });
        return result;
    } catch (error) {
        if (error instanceof ValidationError) {
            console.error('Validation error:', error.code);
        } else if (error instanceof RateLimitError) {
            console.error('Rate limited:', error.requestId);
        } else if (error instanceof IntentError) {
            console.error('Intent failed:', error.stage);
        }
        throw error;
    }
}
```

---

## Examples

### Reading and Processing Files

```javascript
const files = await sdk.requestFileReadDir({ path: './src' });

for (const file of files) {
    const content = await sdk.requestFileRead({
        path: `./src/${file}`
    });
    
    // Process content...
}
```

### Making API Calls

```javascript
const response = await sdk.requestNetworkCall({
    url: 'https://api.github.com/repos/owner/repo',
    method: 'GET',
    headers: {
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `token ${process.env.GITHUB_TOKEN}`
    }
});

const data = JSON.parse(response);
```

### Git Integration

```javascript
// Check if there are uncommitted changes
const status = await sdk.requestGitStatus();

if (status.includes('nothing to commit')) {
    console.log('Working tree is clean');
} else {
    // Get diff of changes
    const diff = await sdk.requestGitDiff();
    console.log('Changes:', diff);
}
```

### Complete Extension Example

```javascript
const { ExtensionSDK } = require('@ghost/extension-sdk');

class CodeAnalyzer {
    constructor() {
        this.sdk = new ExtensionSDK('code-analyzer', { timeout: 60000 });
    }

    async analyze() {
        try {
            // Get all JavaScript files
            const files = await sdk.requestFileReadDir({ path: './src' });
            const jsFiles = files.filter(f => f.endsWith('.js'));
            
            // Read all files in parallel
            const contents = await sdk.requestFileReadBatch(
                jsFiles.map(f => `./src/${f}`)
            );
            
            // Analyze code
            const analysis = this.analyzeCode(contents);
            
            // Write report
            await sdk.requestFileWriteJSON('./analysis-report.json', analysis);
            
            return { success: true, analysis };
        } catch (error) {
            console.error('Analysis failed:', error.message);
            return { success: false, error: error.message };
        }
    }
    
    analyzeCode(contents) {
        // Your analysis logic here
        return {
            totalFiles: contents.length,
            totalLines: contents.reduce((sum, c) => sum + c.split('\n').length, 0)
        };
    }
}

module.exports = CodeAnalyzer;
```

## Documentation

- [Extension API Documentation](https://github.com/lamallamadel/ghost/blob/main/docs/extension-api.md)
- [Manifest Reference](https://github.com/lamallamadel/ghost/blob/main/core/MANIFEST_REFERENCE.md)
- [Extension Development Guide](https://github.com/lamallamadel/ghost/blob/main/core/EXTENSION_GUIDE.md)

## Publishing Checklist

Before publishing a new version of `@ghost/extension-sdk` to npm, complete the following steps:

### Pre-Publish Verification

1. **Run Tests**
   ```bash
   npm test
   ```
   Ensure all tests pass before proceeding.

2. **Bump Version**
   ```bash
   npm version patch  # for bug fixes
   npm version minor  # for new features
   npm version major  # for breaking changes
   ```
   This updates `package.json` and creates a git tag.

3. **Update Changelog**
   - Move changes from `[Unreleased]` section to new version section in `CHANGELOG.md`
   - Add release date in format `[X.Y.Z] - YYYY-MM-DD`
   - Follow [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) format
   - Update version comparison links at bottom of file

4. **Validate TypeScript Definitions**
   ```bash
   # Verify .d.ts files are present and valid
   ls -la index.d.ts lib/*.d.ts
   ```
   Ensure all TypeScript definition files exist.

5. **Verify Package Contents**
   ```bash
   npm pack --dry-run
   ```
   Review the list of files that will be included in the package.

6. **Test Local Installation**
   ```bash
   npm pack
   npm install -g ghost-extension-sdk-*.tgz
   # Test the package works as expected
   ```

7. **Review Documentation**
   - Ensure README.md is up to date
   - Verify all API examples work
   - Check that links are not broken

8. **Check Git Status**
   ```bash
   git status
   ```
   Ensure CHANGELOG.md updates are committed.

### Publishing

#### Automated (Recommended)

Push a version tag to trigger automated publishing via GitHub Actions:

```bash
git push origin main
git push origin v1.0.0  # Replace with your version
```

The GitHub workflow will automatically:
- Validate the package
- Run the prepublishOnly hook
- Publish to npm registry

#### Manual

If manual publishing is needed:

```bash
npm publish --access public
```

### Post-Publish Verification

1. **Verify on npm**
   ```bash
   npm view @ghost/extension-sdk
   ```
   Check that the new version appears on npm registry.

2. **Test Installation**
   ```bash
   npm install @ghost/extension-sdk@latest
   ```
   Verify the package can be installed from npm.

3. **Create GitHub Release**
   - Go to GitHub releases page
   - Create release from version tag
   - Copy changelog entries to release notes

### Prepublish Hook

The `prepublishOnly` script automatically validates:
- Version is set (not 0.0.0)
- Required files exist (index.js, index.d.ts)
- Package structure is valid

This hook runs automatically before `npm publish` to prevent publishing invalid packages.

## License

MIT
