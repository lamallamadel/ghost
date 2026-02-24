# Ghost Extension API Documentation

Complete reference for building Ghost CLI extensions using the I/O Intent Schema and JSON-RPC communication protocol.

## Table of Contents

- [Overview](#overview)
- [Getting Started](#getting-started)
- [I/O Intent Schema](#io-intent-schema)
- [Extension SDK](#extension-sdk)
- [Pipeline Architecture](#pipeline-architecture)
- [API Reference](#api-reference)
- [Examples](#examples)
- [Security Model](#security-model)
- [Best Practices](#best-practices)

## Overview

Ghost CLI uses an extensible gateway architecture where extensions communicate with the host through a secure I/O pipeline using JSON-RPC intents. All operations are validated, authorized, audited, and rate-limited before execution.

### Architecture Layers

```
Extension → Intent → Pipeline → Result
                        ↓
            [Intercept → Auth → Audit → Execute]
```

1. **Intercept Layer**: Validates intent schema and normalizes messages
2. **Authorization Layer**: Checks permissions, rate limits, and capabilities
3. **Audit Layer**: Logs security events, validates content (NIST, entropy)
4. **Execution Layer**: Executes operation with circuit breakers and timeouts

## Getting Started

### 1. Scaffold a New Extension

```bash
ghost extension init my-extension
cd my-extension
npm install
```

This creates:
- `manifest.json` - Extension metadata and capabilities
- `index.js` - Main extension code
- `package.json` - NPM dependencies
- `README.md` - Documentation

### 2. Install the SDK

```bash
npm install @ghost/extension-sdk
```

### 3. Implement Your Extension

```javascript
const { ExtensionSDK } = require('@ghost/extension-sdk');

class MyExtension {
    constructor() {
        this.sdk = new ExtensionSDK('my-extension-id');
    }

    async initialize() {
        console.log('Extension initialized');
    }

    async myCommand(params) {
        const { args, flags } = params;
        
        try {
            // Your logic here
            return { success: true, output: 'Done!' };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async shutdown() {
        console.log('Extension shutting down');
    }
}

module.exports = MyExtension;
```

### 4. Validate and Install

```bash
ghost extension validate
ghost extension install .
```

## I/O Intent Schema

All extension operations use the Intent schema for communication with the Ghost pipeline.

### Intent Structure

```javascript
{
    type: string,           // 'filesystem' | 'network' | 'git' | 'process'
    operation: string,      // Specific operation within the type
    params: object,         // Operation-specific parameters
    extensionId: string,    // Your extension identifier
    requestId: string       // Optional, auto-generated if not provided
}
```

### Valid Intent Types

#### Filesystem Intents

```javascript
{
    type: 'filesystem',
    operation: 'read' | 'write' | 'stat' | 'readdir' | 'mkdir' | 'unlink' | 'rmdir',
    params: {
        path: string,           // Required: file/directory path
        content?: string,       // Required for 'write' operation
        encoding?: string,      // Optional: default 'utf8'
        recursive?: boolean     // Optional: for 'mkdir'
    },
    extensionId: 'your-extension-id'
}
```

**Examples:**

```javascript
// Read a file
{
    type: 'filesystem',
    operation: 'read',
    params: { path: './package.json' },
    extensionId: 'my-extension'
}

// Write a file
{
    type: 'filesystem',
    operation: 'write',
    params: { 
        path: './output.txt', 
        content: 'Hello, world!' 
    },
    extensionId: 'my-extension'
}

// List directory
{
    type: 'filesystem',
    operation: 'readdir',
    params: { path: './src' },
    extensionId: 'my-extension'
}

// Get file stats
{
    type: 'filesystem',
    operation: 'stat',
    params: { path: './file.txt' },
    extensionId: 'my-extension'
}
```

#### Network Intents

```javascript
{
    type: 'network',
    operation: 'http' | 'https',
    params: {
        url: string,                    // Required: full URL
        method?: string,                // Optional: GET, POST, PUT, DELETE, PATCH, HEAD
        headers?: object,               // Optional: HTTP headers
        body?: string                   // Optional: request body
    },
    extensionId: 'your-extension-id'
}
```

**Examples:**

```javascript
// GET request
{
    type: 'network',
    operation: 'https',
    params: {
        url: 'https://api.github.com/repos/owner/repo',
        method: 'GET',
        headers: {
            'Accept': 'application/vnd.github.v3+json'
        }
    },
    extensionId: 'my-extension'
}

// POST request
{
    type: 'network',
    operation: 'https',
    params: {
        url: 'https://api.example.com/data',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ key: 'value' })
    },
    extensionId: 'my-extension'
}
```

#### Git Intents

```javascript
{
    type: 'git',
    operation: 'status' | 'log' | 'diff' | 'show' | 'ls-files' | 'commit' | 'branch' | 'tag' | 'push' | 'reset',
    params: {
        args?: string[]     // Optional: additional git arguments
    },
    extensionId: 'your-extension-id'
}
```

**Examples:**

```javascript
// Git status
{
    type: 'git',
    operation: 'status',
    params: { args: ['--short'] },
    extensionId: 'my-extension'
}

// Git log
{
    type: 'git',
    operation: 'log',
    params: { args: ['--oneline', '-10'] },
    extensionId: 'my-extension'
}

// Git diff
{
    type: 'git',
    operation: 'diff',
    params: { args: ['HEAD~1', 'HEAD'] },
    extensionId: 'my-extension'
}

// Git commit
{
    type: 'git',
    operation: 'commit',
    params: { args: ['-m', 'Commit message'] },
    extensionId: 'my-extension'
}
```

#### Process Intents

```javascript
{
    type: 'process',
    operation: 'spawn' | 'exec',
    params: {
        command: string,        // Required: command to execute
        args?: string[]         // Optional: command arguments
    },
    extensionId: 'your-extension-id'
}
```

**Example:**

```javascript
{
    type: 'process',
    operation: 'spawn',
    params: {
        command: 'npm',
        args: ['test']
    },
    extensionId: 'my-extension'
}
```

### Response Schema

All intents return a standardized response:

```javascript
{
    success: boolean,           // Operation success status
    result?: any,              // Result data (present on success)
    error?: string,            // Error message (present on failure)
    code?: string,             // Error code
    stage?: string,            // Pipeline stage where error occurred
    requestId?: string,        // Request identifier
    warnings?: string[]        // Optional warnings
}
```

**Success Response:**

```javascript
{
    success: true,
    result: "file content here",
    requestId: "my-extension-1234567890-abc123",
    warnings: []
}
```

**Error Response:**

```javascript
{
    success: false,
    stage: 'AUTHORIZATION',
    error: 'Permission denied: network access not allowed',
    code: 'PERMISSION_DENIED',
    requestId: "my-extension-1234567890-abc123"
}
```

## Extension SDK

The `@ghost/extension-sdk` package provides high-level helpers for building extensions.

### Installation

```bash
npm install @ghost/extension-sdk
```

### ExtensionSDK Class

```javascript
const { ExtensionSDK } = require('@ghost/extension-sdk');

const sdk = new ExtensionSDK('your-extension-id');
```

### Filesystem Methods

#### requestFileRead(params)

```javascript
const content = await sdk.requestFileRead({
    path: './file.txt',
    encoding: 'utf8'  // optional
});
```

#### requestFileWrite(params)

```javascript
await sdk.requestFileWrite({
    path: './output.txt',
    content: 'Hello, world!',
    encoding: 'utf8'  // optional
});
```

#### requestFileReadDir(params)

```javascript
const files = await sdk.requestFileReadDir({
    path: './src'
});
```

#### requestFileStat(params)

```javascript
const stats = await sdk.requestFileStat({
    path: './file.txt'
});
```

### Network Methods

#### requestNetworkCall(params)

```javascript
const response = await sdk.requestNetworkCall({
    url: 'https://api.example.com/endpoint',
    method: 'POST',  // optional, defaults to GET
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({ data: 'value' })
});
```

### Git Methods

#### requestGitExec(params)

```javascript
const result = await sdk.requestGitExec({
    operation: 'status',
    args: ['--short']
});
```

#### Convenience Methods

```javascript
// Git status
const status = await sdk.requestGitStatus(['--short']);

// Git log
const log = await sdk.requestGitLog(['--oneline', '-10']);

// Git diff
const diff = await sdk.requestGitDiff(['HEAD~1', 'HEAD']);
```

### Low-Level API

#### emitIntent(intent)

Send a custom intent directly:

```javascript
const response = await sdk.emitIntent({
    type: 'filesystem',
    operation: 'read',
    params: { path: './file.txt' }
});

if (!response.success) {
    console.error('Error:', response.error);
}
```

#### buildIntent()

Use the builder pattern:

```javascript
const builder = sdk.buildIntent();

const intent = builder.filesystem('read', { path: './file.txt' });
const response = await sdk.emitIntent(intent);
```

### Batch Operations

```javascript
const { RPCClient } = require('@ghost/extension-sdk');

const client = new RPCClient('my-extension');
const builder = sdk.buildIntent();

const intents = [
    builder.filesystem('read', { path: './file1.txt' }),
    builder.filesystem('read', { path: './file2.txt' }),
    builder.filesystem('read', { path: './file3.txt' })
];

const responses = await client.sendBatch(intents);
```

## Pipeline Architecture

### 1. Intercept Layer

**Purpose**: Validate and normalize incoming intents

**Validations**:
- JSON-RPC format compliance
- Schema validation (type, operation, params)
- Required field presence

**Error Codes**:
- `PIPELINE_INTERCEPT_ERROR` - Schema validation failed

### 2. Authorization Layer

**Purpose**: Enforce permissions and rate limits

**Checks**:
- Extension is registered
- Capability declarations match intent type
- Filesystem path patterns (glob matching)
- Network URL allowlists
- Git read/write permissions
- Rate limits (CIR/Bc token bucket)

**Error Codes**:
- `PERMISSION_DENIED` - Missing capability
- `PATH_NOT_ALLOWED` - Filesystem path violation
- `URL_NOT_ALLOWED` - Network URL not in allowlist
- `RATE_LIMIT_EXCEEDED` - Too many requests

### 3. Audit Layer

**Purpose**: Security scanning and logging

**Validations**:
- NIST 800-53 compliance checks
- Entropy analysis for secrets/keys
- Content pattern matching
- Security event logging

**Error Codes**:
- `AUDIT_FAILED` - Security violation detected
- `HIGH_ENTROPY_DETECTED` - Possible secret in content

### 4. Execution Layer

**Purpose**: Execute operations safely

**Features**:
- Circuit breakers (prevent cascade failures)
- Timeout management
- Resource cleanup
- Error handling

**Error Codes**:
- `PIPELINE_EXECUTION_ERROR` - Operation failed
- `CIRCUIT_BREAKER_OPEN` - Too many failures
- `TIMEOUT_EXCEEDED` - Operation took too long

## Examples

### Example 1: Read and Process Files

```javascript
const { ExtensionSDK } = require('@ghost/extension-sdk');

class FileProcessorExtension {
    constructor() {
        this.sdk = new ExtensionSDK('file-processor');
    }

    async processFiles(params) {
        try {
            // List all JavaScript files
            const files = await this.sdk.requestFileReadDir({
                path: './src'
            });

            const jsFiles = files.filter(f => f.endsWith('.js'));

            // Read and process each file
            for (const file of jsFiles) {
                const content = await this.sdk.requestFileRead({
                    path: `./src/${file}`
                });

                // Process content...
                const processed = this.transform(content);

                // Write back
                await this.sdk.requestFileWrite({
                    path: `./dist/${file}`,
                    content: processed
                });
            }

            return {
                success: true,
                output: `Processed ${jsFiles.length} files`
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    transform(content) {
        // Your transformation logic
        return content;
    }
}

module.exports = FileProcessorExtension;
```

### Example 2: API Integration

```javascript
const { ExtensionSDK } = require('@ghost/extension-sdk');

class GithubExtension {
    constructor() {
        this.sdk = new ExtensionSDK('github-extension');
        this.apiBase = 'https://api.github.com';
    }

    async createIssue(params) {
        const { owner, repo, title, body } = params.args;

        try {
            const response = await this.sdk.requestNetworkCall({
                url: `${this.apiBase}/repos/${owner}/${repo}/issues`,
                method: 'POST',
                headers: {
                    'Accept': 'application/vnd.github.v3+json',
                    'Authorization': `token ${process.env.GITHUB_TOKEN}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ title, body })
            });

            const issue = JSON.parse(response);

            return {
                success: true,
                output: `Created issue #${issue.number}: ${issue.html_url}`
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }
}

module.exports = GithubExtension;
```

### Example 3: Git Operations

```javascript
const { ExtensionSDK } = require('@ghost/extension-sdk');

class GitExtension {
    constructor() {
        this.sdk = new ExtensionSDK('git-helper');
    }

    async analyzeChanges(params) {
        try {
            // Check status
            const status = await this.sdk.requestGitStatus();

            if (status.includes('nothing to commit')) {
                return {
                    success: true,
                    output: 'No changes to analyze'
                };
            }

            // Get diff
            const diff = await this.sdk.requestGitDiff();

            // Analyze diff
            const analysis = this.analyzeDiff(diff);

            // Get recent commits
            const log = await this.sdk.requestGitLog(['--oneline', '-5']);

            return {
                success: true,
                output: JSON.stringify({
                    status,
                    analysis,
                    recentCommits: log.split('\n')
                }, null, 2)
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    analyzeDiff(diff) {
        const lines = diff.split('\n');
        return {
            additions: lines.filter(l => l.startsWith('+')).length,
            deletions: lines.filter(l => l.startsWith('-')).length,
            files: lines.filter(l => l.startsWith('diff --git')).length
        };
    }
}

module.exports = GitExtension;
```

### Example 4: Custom Intent Builder

```javascript
const { ExtensionSDK } = require('@ghost/extension-sdk');

class CustomExtension {
    constructor() {
        this.sdk = new ExtensionSDK('custom-extension');
    }

    async customOperation(params) {
        const builder = this.sdk.buildIntent();

        // Build multiple intents
        const readIntent = builder.filesystem('read', {
            path: './config.json'
        });

        const statusIntent = builder.git('status', {
            args: ['--short']
        });

        try {
            // Execute intents
            const [config, status] = await Promise.all([
                this.sdk.emitIntent(readIntent),
                this.sdk.emitIntent(statusIntent)
            ]);

            if (!config.success || !status.success) {
                throw new Error('Operation failed');
            }

            return {
                success: true,
                output: {
                    config: JSON.parse(config.result),
                    status: status.result
                }
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }
}

module.exports = CustomExtension;
```

## Security Model

### Capability Declarations

All capabilities must be declared in `manifest.json`:

```json
{
    "capabilities": {
        "filesystem": {
            "read": ["**/*.js", "package.json"],
            "write": ["dist/**"]
        },
        "network": {
            "allowlist": [
                "https://api.github.com",
                "https://api.example.com"
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

### Rate Limiting

Network capabilities use Two-Rate Three-Color (trTCM) traffic policing:

- **CIR** (Committed Information Rate): Sustained requests per minute
- **Bc** (Burst Committed): Maximum burst size

Example: `"cir": 60, "bc": 100` allows 60 requests/minute sustained, with bursts up to 100.

### Audit Logging

All operations are logged to `~/.ghost/audit.log`:

```json
{
    "timestamp": "2024-01-15T10:30:00.000Z",
    "type": "SECURITY_EVENT",
    "extensionId": "my-extension",
    "message": "Rate limit exceeded",
    "violations": [...]
}
```

View logs:

```bash
ghost audit-log view --limit 50 --extension my-extension
```

## Best Practices

### 1. Handle Errors Gracefully

```javascript
try {
    const result = await sdk.requestFileRead({ path: './file.txt' });
} catch (error) {
    console.error('Failed to read file:', error.message);
    return { success: false, error: error.message };
}
```

### 2. Validate Inputs

```javascript
async myCommand(params) {
    const { args } = params;
    
    if (!args || args.length === 0) {
        return {
            success: false,
            error: 'Missing required arguments'
        };
    }
    
    // Process...
}
```

### 3. Use Minimal Permissions

Request only the capabilities you need:

```json
{
    "capabilities": {
        "filesystem": {
            "read": ["src/**/*.js"],
            "write": []  // Don't request write if not needed
        }
    }
}
```

### 4. Implement Proper Cleanup

```javascript
class MyExtension {
    async shutdown() {
        // Clean up resources
        if (this.connection) {
            await this.connection.close();
        }
    }
}
```

### 5. Use Batch Operations When Possible

```javascript
// Instead of sequential reads:
for (const file of files) {
    await sdk.requestFileRead({ path: file });
}

// Use batch operations:
const intents = files.map(file => 
    builder.filesystem('read', { path: file })
);
const results = await client.sendBatch(intents);
```

### 6. Respect Rate Limits

```javascript
async makeApiCall(url) {
    try {
        return await this.sdk.requestNetworkCall({ url });
    } catch (error) {
        if (error.message.includes('rate limit')) {
            // Wait and retry
            await this.delay(1000);
            return await this.sdk.requestNetworkCall({ url });
        }
        throw error;
    }
}
```

## CLI Commands

### Development Commands

```bash
# Create new extension
ghost extension init my-extension

# Validate manifest and permissions
ghost extension validate

# Install extension
ghost extension install .

# List installed extensions
ghost extension list

# Show extension info
ghost extension info my-extension-id

# Remove extension
ghost extension remove my-extension-id
```

### Gateway Commands

```bash
# Show gateway status
ghost gateway status

# Show telemetry metrics
ghost gateway metrics my-extension-id

# View audit logs
ghost audit-log view --limit 100 --extension my-extension-id
```

## Resources

- [Manifest Reference](../core/MANIFEST_REFERENCE.md)
- [Extension Development Guide](../core/EXTENSION_GUIDE.md)
- [Pipeline Architecture](../core/ARCHITECTURE.md)
- [@ghost/extension-sdk NPM Package](../packages/extension-sdk/README.md)

## Support

- GitHub Issues: https://github.com/lamallamadel/ghost/issues
- Documentation: https://github.com/lamallamadel/ghost
