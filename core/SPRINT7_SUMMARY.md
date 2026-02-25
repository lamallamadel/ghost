# Sprint 7 Summary: Developer Toolkit & Extension SDK

**Sprint Goal**: Deliver a complete developer toolkit for building, validating, and publishing Ghost CLI extensions with comprehensive documentation and tooling.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [CLI Commands](#cli-commands)
- [SDK Package](#sdk-package)
- [Scaffolding System](#scaffolding-system)
- [Validation Engine](#validation-engine)
- [NPM Publishing Workflow](#npm-publishing-workflow)
- [Complete Developer Workflow](#complete-developer-workflow)
- [Extension Developer Quickstart](#extension-developer-quickstart)
- [Deliverables Summary](#deliverables-summary)

## Overview

Sprint 7 introduces the complete developer toolkit for building Ghost CLI extensions. This toolkit provides scaffolding tools, validation engines, a typed SDK package, and comprehensive documentation to streamline extension development from initialization to publication.

### Key Components

1. **CLI Scaffolding Commands** (`ghost extension init`, `ghost extension validate`)
2. **Extension SDK Package** (`@ghost/extension-sdk`)
3. **Validation Engine** (manifest validation, permission checking)
4. **NPM Publishing Workflow** (prepublish hooks, GitHub Actions)
5. **Complete Documentation** (API reference, examples, quickstart guides)

### Design Principles

- **Developer Experience First**: Minimize boilerplate, maximize productivity
- **Type Safety**: Full TypeScript support with `.d.ts` declarations
- **Security by Default**: Manifest-driven capability contracts
- **Fail Fast**: Comprehensive validation before runtime
- **Convention Over Configuration**: Sensible defaults, explicit overrides

## Architecture

### Developer Toolkit Layers

```
┌─────────────────────────────────────────────────────────┐
│                    Developer Experience                  │
├─────────────────────────────────────────────────────────┤
│  CLI Commands                                            │
│  - ghost extension init <name>                           │
│  - ghost extension validate [path]                       │
│  - ghost extension install <path>                        │
└─────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────┐
│               Scaffolding & Validation                   │
├─────────────────────────────────────────────────────────┤
│  Template Generation:                                    │
│  - manifest.json (capability contracts)                  │
│  - index.js (boilerplate with SDK)                       │
│  - index.d.ts (TypeScript declarations)                  │
│  - package.json (dependencies)                           │
│  - README.md (documentation)                             │
│                                                          │
│  Validation Engine:                                      │
│  - Schema validation (manifest structure)                │
│  - Glob pattern validation (filesystem capabilities)     │
│  - URL validation (network allowlists)                   │
│  - Git hooks validation                                  │
│  - Permission simulation (intent testing)                │
└─────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────┐
│                   Extension SDK                          │
├─────────────────────────────────────────────────────────┤
│  High-Level API:                                         │
│  - ExtensionSDK (request helpers)                        │
│  - IntentBuilder (fluent interface)                      │
│  - RPCClient (batch operations)                          │
│                                                          │
│  Error Hierarchy:                                        │
│  - IntentError (base class)                              │
│  - ValidationError (schema errors)                       │
│  - RateLimitError (rate limiting)                        │
│                                                          │
│  Ergonomic Helpers:                                      │
│  - requestFileReadJSON()                                 │
│  - requestGitCurrentBranch()                             │
│  - requestFileReadBatch()                                │
└─────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────┐
│              JSON-RPC Communication                      │
├─────────────────────────────────────────────────────────┤
│  Stdio Transport:                                        │
│  - JSON-RPC 2.0 protocol                                 │
│  - Request/response correlation                          │
│  - Batch request support                                 │
│  - Timeout management                                    │
└─────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────┐
│                   Pipeline Layers                        │
├─────────────────────────────────────────────────────────┤
│  Intercept → Auth → Audit → Execute                      │
└─────────────────────────────────────────────────────────┘
```

### Manifest-Driven Capability Contracts

Extensions declare capabilities in `manifest.json`, which the pipeline enforces at runtime:

```json
{
  "capabilities": {
    "filesystem": {
      "read": ["**/*.js", "src/**/*"],
      "write": ["dist/**"]
    },
    "network": {
      "allowlist": ["https://api.github.com"],
      "rateLimit": {
        "cir": 60,
        "bc": 100,
        "be": 204800
      }
    },
    "git": {
      "read": true,
      "write": false
    },
    "hooks": ["pre-commit", "post-merge"]
  }
}
```

**Enforcement Points**:
- **Intercept Layer**: Validates intent schema
- **Auth Layer**: Matches paths/URLs against patterns, enforces rate limits
- **Audit Layer**: NIST SI-10 validation (path traversal, SSRF, secrets)
- **Execute Layer**: Circuit breakers, timeouts, resource cleanup

## CLI Commands

### T7.1: `ghost extension init <name>` - Scaffolding Command

**Purpose**: Generate a complete extension project with boilerplate code, TypeScript declarations, and documentation.

**Implementation Location**: `ghost.js` → `_scaffoldExtension()` method

**Usage**:
```bash
ghost extension init my-extension
ghost extension init my-extension --author "Your Name"
```

**Generated Structure**:
```
my-extension/
├── manifest.json       # Extension metadata and capabilities
├── index.js           # Main extension code with SDK integration
├── index.d.ts         # TypeScript declarations
├── package.json       # NPM dependencies (@ghost/extension-sdk)
├── README.md          # Usage documentation
└── .gitignore         # Git ignore patterns
```

**Generated Files**:

#### manifest.json
```json
{
  "id": "my-extension",
  "name": "My Extension",
  "version": "1.0.0",
  "description": "My Extension extension for Ghost CLI",
  "author": "Your Name",
  "main": "index.js",
  "capabilities": {
    "filesystem": {
      "read": ["**/*"],
      "write": []
    },
    "network": {
      "allowlist": [],
      "rateLimit": {
        "cir": 60,
        "bc": 100,
        "be": 204800
      }
    },
    "git": {
      "read": true,
      "write": false
    },
    "hooks": ["pre-commit", "post-merge"]
  },
  "permissions": [
    "filesystem:read",
    "git:read"
  ]
}
```

**Default Capability Templates**:
- **Filesystem**: Read-only access to all files (`**/*`)
- **Network**: Empty allowlist, standard rate limits (CIR=60, Bc=100, Be=204800)
- **Git**: Read-only access
- **Hooks**: Pre-commit and post-merge hooks enabled

**Rate Limit Defaults**:
- **CIR (Committed Information Rate)**: 60 tokens/min (1 req/sec sustained)
- **Bc (Burst Committed)**: 100 tokens (burst capacity)
- **Be (Burst Excess)**: 204800 bytes (200KB, for response size limits)

#### index.js (Boilerplate Pattern)
```javascript
const { ExtensionSDK, IntentBuilder, RPCClient } = require('@ghost/extension-sdk');

class MyExtension {
    constructor() {
        this.sdk = new ExtensionSDK('my-extension');
        this.rpcClient = new RPCClient('my-extension');
        this.intentBuilder = new IntentBuilder('my-extension');
    }

    async initialize() {
        console.log('My Extension initialized');
    }

    async myCommand(params) {
        const { subcommand, args, flags } = params;

        try {
            this._logInfo('Executing myCommand', { subcommand, args, flags });

            // Example: Batch file read operations
            const filePaths = args.length > 0 ? args : ['README.md', 'package.json'];
            const intents = filePaths.map(file => 
                this.intentBuilder.filesystem('read', { path: file })
            );

            const results = await this.rpcClient.sendBatch(intents);
            
            const successCount = results.filter(r => r.success).length;
            this._logInfo('Batch operation completed', { 
                total: filePaths.length, 
                successful: successCount 
            });

            return {
                success: true,
                output: `Command executed successfully. Read ${successCount} files.`
            };
        } catch (error) {
            this._logError('Command execution failed', {
                command: 'myCommand',
                error: error.message,
                stack: error.stack
            });

            return {
                success: false,
                error: error.message
            };
        }
    }

    async preCommit(params) {
        try {
            this._logInfo('Pre-commit hook triggered');
            const status = await this.sdk.requestGitStatus();
            return { success: true, output: 'Pre-commit checks passed' };
        } catch (error) {
            this._logError('Pre-commit hook failed', { error: error.message });
            return { success: false, error: error.message };
        }
    }

    async postMerge(params) {
        try {
            this._logInfo('Post-merge hook triggered');
            return { success: true, output: 'Post-merge tasks completed' };
        } catch (error) {
            this._logError('Post-merge hook failed', { error: error.message });
            return { success: false, error: error.message };
        }
    }

    _logInfo(message, data = {}) {
        const logEntry = {
            level: 'INFO',
            timestamp: new Date().toISOString(),
            extension: 'my-extension',
            message,
            ...data
        };
        console.log(JSON.stringify(logEntry));
    }

    _logError(message, data = {}) {
        const logEntry = {
            level: 'ERROR',
            timestamp: new Date().toISOString(),
            extension: 'my-extension',
            message,
            ...data
        };
        console.error(JSON.stringify(logEntry));
    }

    async shutdown() {
        this._logInfo('My Extension shutting down');
    }
}

module.exports = MyExtension;
```

**Boilerplate Patterns**:
1. **SDK Initialization**: ExtensionSDK, RPCClient, IntentBuilder instances
2. **Error Handling**: Try-catch with structured logging
3. **Batch Operations**: Example using `sendBatch()` for multiple file reads
4. **Structured Logging**: JSON-formatted logs with timestamps and context
5. **Hook Integration**: Pre-commit and post-merge hook handlers
6. **Lifecycle Methods**: `initialize()`, `shutdown()` for resource management

#### index.d.ts (TypeScript Declarations)
```typescript
import { ExtensionSDK, IntentBuilder, RPCClient } from '@ghost/extension-sdk';

declare class MyExtension {
    sdk: ExtensionSDK;
    rpcClient: RPCClient;
    intentBuilder: IntentBuilder;

    constructor();
    initialize(): Promise<void>;
    
    myCommand(params: {
        subcommand?: string;
        args: string[];
        flags: Record<string, any>;
    }): Promise<{
        success: boolean;
        output?: string;
        error?: string;
    }>;

    preCommit(params: Record<string, any>): Promise<{
        success: boolean;
        output?: string;
        error?: string;
    }>;

    postMerge(params: Record<string, any>): Promise<{
        success: boolean;
        output?: string;
        error?: string;
    }>;

    shutdown(): Promise<void>;
}

export = MyExtension;
```

#### package.json
```json
{
  "name": "my-extension",
  "version": "1.0.0",
  "description": "My Extension extension for Ghost CLI",
  "main": "index.js",
  "types": "index.d.ts",
  "scripts": {
    "test": "echo \"Error: no test specified\" && exit 1"
  },
  "dependencies": {
    "@ghost/extension-sdk": "^1.0.0"
  },
  "keywords": ["ghost", "extension"],
  "author": "Your Name",
  "license": "MIT"
}
```

**Features**:
- ✅ TypeScript declaration file (`index.d.ts`)
- ✅ Comprehensive JSDoc comments
- ✅ Batch operations example
- ✅ Structured error handling and logging
- ✅ Git hooks integration (pre-commit, post-merge)
- ✅ Network rate limit with Be parameter (200KB)

### T7.2: `ghost extension validate [path]` - Validation Command

**Purpose**: Validate extension manifest structure, permissions, and simulate intent execution.

**Implementation Location**: `ghost.js` → `_validateExtension()` method

**Usage**:
```bash
ghost extension validate                # Validate current directory
ghost extension validate ./my-extension  # Validate specific path
```

**Validation Checks**:

#### 1. Manifest Schema Validation

**Required Fields**:
- `id`: Lowercase alphanumeric with hyphens (e.g., `my-extension`)
- `name`: Human-readable extension name
- `version`: Semantic versioning (e.g., `1.0.0`)
- `main`: Entry point file path
- `capabilities`: Capability declarations object

**Semantic Versioning**:
```javascript
if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) {
    errors.push('Invalid version: must be semantic version (major.minor.patch)');
}
```

**ID Pattern**:
```javascript
if (!/^[a-z0-9-]+$/.test(manifest.id)) {
    errors.push('Invalid id: must be lowercase alphanumeric with hyphens');
}
```

#### 2. Glob Pattern Validation (Filesystem)

**Purpose**: Validate filesystem capability patterns using `GlobMatcher`

```javascript
const fs_cap = manifest.capabilities.filesystem;

// Validate read patterns
fs_cap.read.forEach(pattern => {
    try {
        GlobMatcher.match('test/file.txt', pattern);
        
        // Warn about overly permissive patterns
        if (pattern === '**/*' || pattern === '**') {
            warnings.push(
                `Filesystem read pattern "${pattern}" is overly permissive (matches all files)`
            );
        }
    } catch (e) {
        errors.push(`Invalid filesystem read glob pattern: "${pattern}" - ${e.message}`);
    }
});

// Validate write patterns
fs_cap.write.forEach(pattern => {
    try {
        GlobMatcher.match('test/file.txt', pattern);
        
        if (pattern === '**/*' || pattern === '**') {
            warnings.push(
                `Filesystem write pattern "${pattern}" is DANGEROUS - allows writing to all files`
            );
        }
    } catch (e) {
        errors.push(`Invalid filesystem write glob pattern: "${pattern}" - ${e.message}`);
    }
});
```

**Warning Patterns**:
- `**/*` or `**`: Matches all files (overly permissive)
- `*` or `/*`: Matches all files in root (broad access)

#### 3. Network Allowlist Validation

**URL Format Validation**:
```javascript
const net_cap = manifest.capabilities.network;

net_cap.allowlist.forEach(url => {
    if (!/^https?:\/\/[^/]+$/.test(url)) {
        errors.push(
            `Invalid network allowlist entry: ${url} (must be protocol + domain only)`
        );
    } else {
        try {
            const parsedUrl = new URL(url);
            const hostname = parsedUrl.hostname;
            
            // Check for localhost/loopback
            if (!hostname || hostname === 'localhost' || 
                /^127\.\d+\.\d+\.\d+$/.test(hostname) || 
                /^0\.0\.0\.0$/.test(hostname)) {
                warnings.push(
                    `Network allowlist entry "${url}" uses localhost or loopback address`
                );
            } 
            
            // Check for IP addresses
            else if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
                warnings.push(
                    `Network allowlist entry "${url}" uses IP address instead of domain name`
                );
            } 
            
            // Validate domain structure
            else {
                const domainParts = hostname.split('.');
                if (domainParts.length < 2 || domainParts.some(part => part === '')) {
                    errors.push(
                        `Network allowlist entry "${url}" has invalid domain structure`
                    );
                }
            }
        } catch (e) {
            errors.push(`Network allowlist entry "${url}" is not a valid URL`);
        }
    }
});
```

**Be Parameter Validation**:
```javascript
const rateLimit = net_cap.rateLimit;

// Required fields
if (!rateLimit.cir || !rateLimit.bc) {
    errors.push('Network rate limit requires both "cir" and "bc" fields');
}

// Be type check
if (rateLimit.be !== undefined && typeof rateLimit.be !== 'number') {
    errors.push('Network rate limit "be" must be a number if specified');
}

// Be required check
if (!rateLimit.be) {
    errors.push('Network rate limit missing required "be" (excess burst size) parameter');
}

// Be vs Bc validation
if (rateLimit.be && rateLimit.bc && rateLimit.be < rateLimit.bc) {
    warnings.push(
        `Network rate limit: Be (${rateLimit.be}) is less than Bc (${rateLimit.bc}). ` +
        `This means no burst capacity above committed rate.`
    );
}
```

**Rate Limit Simulation**:
```javascript
if (rateLimit.cir && rateLimit.bc) {
    const refillTimeSeconds = (rateLimit.bc / rateLimit.cir) * 60;
    const tokensPerSecond = rateLimit.cir / 60;
    
    console.log(`  - Rate limit simulation:`);
    console.log(`    CIR: ${rateLimit.cir} tokens/min (${tokensPerSecond.toFixed(2)} tokens/sec)`);
    console.log(`    Bc (committed burst): ${rateLimit.bc} tokens`);
    console.log(`    Be (excess burst): ${rateLimit.be || 0} bytes`);
    console.log(`    Bucket refills to capacity in: ${refillTimeSeconds.toFixed(1)}s`);
    console.log(`    Sustained rate: 1 request every ${(60 / rateLimit.cir).toFixed(2)}s`);
}
```

#### 4. Git Hooks Validation

**Allowed Hooks**:
```javascript
const ALLOWED_HOOKS = [
    'pre-commit', 'commit-msg', 'pre-push', 'post-merge',
    'pre-rebase', 'post-checkout', 'post-commit',
    'pre-applypatch', 'post-applypatch', 'pre-receive',
    'post-receive', 'update'
];

manifest.capabilities.hooks.forEach(hook => {
    if (!ALLOWED_HOOKS.includes(hook)) {
        errors.push(
            `Invalid git hook: "${hook}". Allowed hooks are: ${ALLOWED_HOOKS.join(', ')}`
        );
    }
});

if (manifest.capabilities.hooks.length === 0) {
    warnings.push('Git hooks capability declared but no hooks specified');
}
```

#### 5. Permission Simulation

**Intent Validation**:
```javascript
const testIntents = [
    {
        type: 'filesystem',
        operation: 'read',
        params: { path: './test.txt' },
        extensionId: manifest.id
    },
    {
        type: 'git',
        operation: 'status',
        params: { args: [] },
        extensionId: manifest.id
    }
];

for (const intent of testIntents) {
    const { IntentSchema } = require('./core/pipeline/intercept');
    const validation = IntentSchema.validate(intent);
    
    if (validation.valid) {
        console.log(`✓ ${intent.type}:${intent.operation} - valid intent`);
    } else {
        console.log(`✗ ${intent.type}:${intent.operation} - invalid intent`);
        validation.errors.forEach(err => {
            console.log(`  ${err}`);
        });
    }
}
```

**Output Example**:
```
Validating extension at: /path/to/my-extension

✓ Valid JSON syntax
✓ Valid extension id: my-extension
✓ Extension name: My Extension
✓ Valid version: 1.0.0
✓ Main file exists: index.js
✓ Capabilities defined
  - Filesystem read: 1 pattern(s)
  - Rate limit simulation:
    CIR: 60 tokens/min (1.00 tokens/sec)
    Bc (committed burst): 100 tokens
    Be (excess burst): 204800 bytes
    Bucket refills to capacity in: 100.0s
    Sustained rate: 1 request every 1.00s
  - Git read: enabled

Simulating permission requests:
✓ filesystem:read - valid intent
✓ git:status - valid intent

Warnings:
  ⚠ Filesystem read pattern "**/*" is overly permissive (matches all files)

✓ Extension is valid!

Ready to install with: ghost extension install ./my-extension
```

**Permission Warnings**:
- Overly broad filesystem patterns
- Write access to dangerous locations
- Git write permissions
- Localhost/private IP in network allowlist
- Missing Be parameter in rate limits

## SDK Package

### T7.3: @ghost/extension-sdk - NPM Package

**Location**: `packages/extension-sdk/`

**Package Structure**:
```
packages/extension-sdk/
├── lib/
│   ├── sdk.js              # ExtensionSDK class
│   ├── sdk.d.ts            # TypeScript declarations
│   ├── intent-builder.js   # IntentBuilder class
│   ├── intent-builder.d.ts
│   ├── rpc-client.js       # RPCClient class
│   ├── rpc-client.d.ts
│   ├── errors.js           # Error hierarchy
│   └── errors.d.ts
├── index.js                # Main export
├── index.d.ts              # Root declarations
├── package.json            # Package metadata
├── README.md               # Complete API documentation
├── CHANGELOG.md            # Version history
└── LICENSE                 # MIT license
```

### ExtensionSDK Class

**Purpose**: High-level API for common operations

**API Methods**:

#### Filesystem Operations
```javascript
// Read file
const content = await sdk.requestFileRead({
    path: './file.txt',
    encoding: 'utf8'  // optional
});

// Write file
await sdk.requestFileWrite({
    path: './output.txt',
    content: 'Hello, world!',
    encoding: 'utf8'
});

// Read directory
const files = await sdk.requestFileReadDir({ path: './src' });

// Get file stats
const stats = await sdk.requestFileStat({ path: './file.txt' });

// Check file existence
const exists = await sdk.requestFileExists('./config.json');

// Read JSON file
const config = await sdk.requestFileReadJSON('./package.json');

// Write JSON file
await sdk.requestFileWriteJSON('./config.json', { key: 'value' });

// Batch read files
const contents = await sdk.requestFileReadBatch([
    './file1.txt',
    './file2.txt',
    './file3.txt'
]);
```

#### Network Operations
```javascript
const response = await sdk.requestNetworkCall({
    url: 'https://api.github.com/repos/owner/repo',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer token'
    },
    body: JSON.stringify({ key: 'value' }),
    timeout: 30000  // optional
});
```

#### Git Operations
```javascript
// General git execution
const result = await sdk.requestGitExec({
    operation: 'status',
    args: ['--short']
});

// Convenience methods
const status = await sdk.requestGitStatus(['--short']);
const log = await sdk.requestGitLog(['--oneline', '-10']);
const diff = await sdk.requestGitDiff(['HEAD~1', 'HEAD']);
const branch = await sdk.requestGitCurrentBranch();
const staged = await sdk.requestGitStagedFiles();

// Git write operations (requires git.write: true)
await sdk.requestGitCommit('feat: add new feature', {
    all: true,
    author: 'Name <email@example.com>',
    amend: false,
    noVerify: false,
    allowEmpty: false
});
```

#### Low-Level API
```javascript
// Build and send custom intent
const builder = sdk.buildIntent();
const intent = builder.filesystem('read', { path: './file.txt' });
const response = await sdk.emitIntent(intent);

if (!response.success) {
    console.error('Error:', response.error, response.code);
}
```

#### Batch Operations
```javascript
const requests = [
    builder.filesystem('read', { path: './file1.txt' }),
    builder.filesystem('read', { path: './file2.txt' }),
    builder.git('status', { args: ['--short'] })
];

const responses = await sdk.requestBatch(requests);

responses.forEach((response, index) => {
    if (!response.success) {
        console.error(`Operation ${index} failed:`, response.error);
    }
});
```

### IntentBuilder Class

**Purpose**: Fluent interface for constructing intents

```javascript
const { IntentBuilder } = require('@ghost/extension-sdk');

const builder = new IntentBuilder('my-extension');

// Filesystem intents
const readIntent = builder.filesystem('read', { path: './file.txt' });
const writeIntent = builder.filesystem('write', { 
    path: './output.txt', 
    content: 'data' 
});

// Network intents
const httpIntent = builder.network('https', {
    url: 'https://api.example.com/data',
    method: 'GET'
});

// Git intents
const statusIntent = builder.git('status', { args: ['--short'] });

// Process intents
const spawnIntent = builder.process('spawn', {
    command: 'npm',
    args: ['test']
});
```

### RPCClient Class

**Purpose**: Low-level JSON-RPC communication with batch support

```javascript
const { RPCClient } = require('@ghost/extension-sdk');

const client = new RPCClient('my-extension', {
    timeout: 30000,  // default timeout in ms
    stdio: true      // use stdio transport
});

// Single request
const response = await client.send(intent);

// Batch request
const responses = await client.sendBatch([intent1, intent2, intent3]);

// Check response
if (response.success) {
    console.log('Result:', response.result);
} else {
    console.error('Error:', response.error, response.code, response.stage);
}
```

**Batch Operation Benefits**:
- **Performance**: Execute multiple operations concurrently
- **Rate Limit Efficiency**: One rate limit token for entire batch
- **Atomic Transactions**: All succeed or all fail (optional)

### Error Hierarchy

**Purpose**: Typed error classes for different failure scenarios

#### Base Class: IntentError
```javascript
class IntentError extends Error {
    constructor(message, code, stage, requestId) {
        super(message);
        this.name = 'IntentError';
        this.code = code;
        this.stage = stage;
        this.requestId = requestId;
    }
}
```

**Properties**:
- `message`: Human-readable error description
- `code`: Machine-readable error code (e.g., `AUTH_PERMISSION_DENIED`)
- `stage`: Pipeline stage where error occurred (`INTERCEPT`, `AUTHORIZATION`, `AUDIT`, `EXECUTION`)
- `requestId`: Request identifier for tracking and debugging

#### ValidationError
```javascript
class ValidationError extends IntentError {
    constructor(message, code, stage, requestId) {
        super(message, code, stage || 'validation', requestId);
        this.name = 'ValidationError';
    }
}
```

**Use Cases**:
- Missing required parameters
- Invalid parameter types
- Schema validation failures
- Malformed intents

**Example**:
```javascript
try {
    await sdk.requestFileRead({ path: '' }); // Invalid: empty path
} catch (error) {
    if (error instanceof ValidationError) {
        console.error('Validation failed:', error.message);
        console.error('Code:', error.code); // 'MISSING_FILE_PATH'
        console.error('Stage:', error.stage); // 'validation'
    }
}
```

#### RateLimitError
```javascript
class RateLimitError extends IntentError {
    constructor(message, code, stage, requestId) {
        super(message, code || 'RATE_LIMIT_EXCEEDED', stage || 'authorization', requestId);
        this.name = 'RateLimitError';
    }
}
```

**Use Cases**:
- CIR/Bc token bucket exhausted
- Too many requests in time window
- Network rate limit exceeded

**Example with Retry**:
```javascript
async function fetchWithRetry(url, maxRetries = 3) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await sdk.requestNetworkCall({ url });
        } catch (error) {
            if (error instanceof RateLimitError && attempt < maxRetries - 1) {
                const backoff = Math.pow(2, attempt) * 1000; // Exponential backoff
                console.log(`Rate limited, retrying in ${backoff}ms...`);
                await new Promise(resolve => setTimeout(resolve, backoff));
                continue;
            }
            throw error;
        }
    }
}
```

### Ergonomic Helpers

**Purpose**: Simplify common operations with higher-level abstractions

#### requestFileReadJSON
```javascript
async requestFileReadJSON(path) {
    const content = await this.requestFileRead({ path, encoding: 'utf8' });
    try {
        return JSON.parse(content);
    } catch (error) {
        throw new ValidationError(
            `Failed to parse JSON from ${path}: ${error.message}`,
            'JSON_PARSE_ERROR',
            'validation'
        );
    }
}
```

**Benefits**:
- Automatic JSON parsing
- Typed error on parse failure
- Single method call instead of read + parse

#### requestFileWriteJSON
```javascript
async requestFileWriteJSON(path, object) {
    if (object === undefined || object === null) {
        throw new ValidationError('Object is required', 'MISSING_OBJECT', 'validation');
    }
    
    let content;
    try {
        content = JSON.stringify(object, null, 2);
    } catch (error) {
        throw new ValidationError(
            `Failed to stringify object: ${error.message}`,
            'JSON_STRINGIFY_ERROR',
            'validation'
        );
    }
    
    return await this.requestFileWrite({ path, content, encoding: 'utf8' });
}
```

#### requestGitCurrentBranch
```javascript
async requestGitCurrentBranch() {
    const result = await this.requestGitExec({ 
        operation: 'symbolic-ref', 
        args: ['--short', 'HEAD'] 
    });
    
    if (result && result.stdout) {
        return result.stdout.trim();
    }
    
    throw new IntentError(
        'Failed to get current branch',
        'GIT_BRANCH_ERROR',
        'execution'
    );
}
```

#### requestGitStagedFiles
```javascript
async requestGitStagedFiles() {
    const result = await this.requestGitExec({ 
        operation: 'diff', 
        args: ['--cached', '--name-only'] 
    });
    
    if (result && result.stdout) {
        const files = result.stdout.trim();
        return files 
            ? files.split('\n').map(f => f.trim()).filter(f => f.length > 0) 
            : [];
    }
    
    return [];
}
```

#### requestFileReadBatch
```javascript
async requestFileReadBatch(paths) {
    if (!Array.isArray(paths)) {
        throw new ValidationError('Paths must be an array', 'INVALID_PATHS', 'validation');
    }
    
    if (paths.length === 0) {
        return [];
    }
    
    for (const path of paths) {
        if (!path || typeof path !== 'string') {
            throw new ValidationError(
                'Each path must be a non-empty string',
                'INVALID_PATH',
                'validation'
            );
        }
    }
    
    const intents = paths.map(path => 
        this.intentBuilder.filesystem('read', { path, encoding: 'utf8' })
    );
    
    const responses = await this.rpcClient.sendBatch(intents);
    
    return responses.map((response, index) => {
        if (!response.success) {
            throw this._createErrorFromResponse(response, intents[index].requestId);
        }
        return response.result;
    });
}
```

### Stdio-Based JSON-RPC Communication

**Architecture**:
```
Extension Process (Child)
    ↓ stdout (JSON-RPC request)
Ghost CLI (Parent)
    ↓ Pipeline processing
Ghost CLI (Parent)
    ↓ stdin (JSON-RPC response)
Extension Process (Child)
```

**JSON-RPC Request Format**:
```json
{
    "jsonrpc": "2.0",
    "method": "intent",
    "params": {
        "type": "filesystem",
        "operation": "read",
        "params": { "path": "./file.txt" },
        "extensionId": "my-extension",
        "requestId": "my-extension-1234567890-abc123"
    },
    "id": 1
}
```

**JSON-RPC Response Format**:
```json
{
    "jsonrpc": "2.0",
    "result": {
        "success": true,
        "result": "file contents here",
        "requestId": "my-extension-1234567890-abc123"
    },
    "id": 1
}
```

**Error Response Format**:
```json
{
    "jsonrpc": "2.0",
    "result": {
        "success": false,
        "error": "Permission denied",
        "code": "AUTH_PERMISSION_DENIED",
        "stage": "AUTHORIZATION",
        "requestId": "my-extension-1234567890-abc123"
    },
    "id": 1
}
```

**Batch Request Format**:
```json
[
    {
        "jsonrpc": "2.0",
        "method": "intent",
        "params": { /* intent 1 */ },
        "id": 1
    },
    {
        "jsonrpc": "2.0",
        "method": "intent",
        "params": { /* intent 2 */ },
        "id": 2
    }
]
```

**RPCClient Implementation Details**:
```javascript
class RPCClient {
    async send(intent) {
        const requestId = intent.requestId || this._generateRequestId();
        const rpcRequest = {
            jsonrpc: '2.0',
            method: 'intent',
            params: { ...intent, extensionId: this.extensionId, requestId },
            id: this.nextId++
        };
        
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.pending.delete(rpcRequest.id);
                reject(new Error('Request timeout'));
            }, this.timeout);
            
            this.pending.set(rpcRequest.id, { resolve, reject, timeout });
            
            // Write to stdout
            process.stdout.write(JSON.stringify(rpcRequest) + '\n');
        });
    }
    
    async sendBatch(intents) {
        const rpcRequests = intents.map((intent, index) => ({
            jsonrpc: '2.0',
            method: 'intent',
            params: {
                ...intent,
                extensionId: this.extensionId,
                requestId: intent.requestId || this._generateRequestId()
            },
            id: this.nextId++
        }));
        
        // Write batch as JSON array
        process.stdout.write(JSON.stringify(rpcRequests) + '\n');
        
        // Wait for all responses
        return Promise.all(
            rpcRequests.map(req => this._waitForResponse(req.id))
        );
    }
    
    _handleStdin(data) {
        const lines = data.toString().split('\n').filter(l => l.trim());
        
        for (const line of lines) {
            try {
                const response = JSON.parse(line);
                
                if (Array.isArray(response)) {
                    // Batch response
                    response.forEach(r => this._resolveResponse(r));
                } else {
                    // Single response
                    this._resolveResponse(response);
                }
            } catch (error) {
                console.error('Failed to parse JSON-RPC response:', error);
            }
        }
    }
}
```

## NPM Publishing Workflow

### T7.4: Package Metadata Requirements

**package.json Configuration**:
```json
{
  "name": "@ghost/extension-sdk",
  "version": "1.0.0",
  "description": "SDK for building Ghost CLI extensions with typed JSON-RPC helpers",
  "main": "index.js",
  "types": "index.d.ts",
  "files": [
    "index.js",
    "index.d.ts",
    "lib/**/*.js",
    "lib/**/*.d.ts",
    "README.md",
    "LICENSE",
    "CHANGELOG.md"
  ],
  "scripts": {
    "test": "echo \"Error: no test specified\" && exit 1",
    "verify": "node scripts/verify-publish.js",
    "pack:test": "npm pack && node scripts/test-install.js",
    "prepublishOnly": "node scripts/verify-publish.js"
  },
  "keywords": [
    "ghost",
    "extension",
    "sdk",
    "json-rpc",
    "cli"
  ],
  "author": "Adel Lamallam",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/lamallamadel/ghost.git",
    "directory": "packages/extension-sdk"
  },
  "bugs": {
    "url": "https://github.com/lamallamadel/ghost/issues"
  },
  "homepage": "https://github.com/lamallamadel/ghost/tree/main/packages/extension-sdk#readme",
  "engines": {
    "node": ">=14.0.0"
  }
}
```

**Critical Fields**:
- `name`: Scoped package name (`@ghost/extension-sdk`)
- `version`: Semantic versioning (updated via `npm version`)
- `types`: TypeScript declaration entry point
- `files`: Whitelist of files to include in package
- `repository.directory`: Monorepo subdirectory path
- `engines.node`: Minimum Node.js version requirement

### T7.5: Prepublish Validation Hooks

**Script**: `packages/extension-sdk/scripts/verify-publish.js`

```javascript
#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const packageJson = require('../package.json');

console.log('Verifying package before publish...\n');

const errors = [];
const warnings = [];

// 1. Check version is not 0.0.0
if (packageJson.version === '0.0.0') {
    errors.push('Version is 0.0.0 - update version before publishing');
}

// 2. Check required files exist
const requiredFiles = [
    'index.js',
    'index.d.ts',
    'lib/sdk.js',
    'lib/sdk.d.ts',
    'lib/intent-builder.js',
    'lib/intent-builder.d.ts',
    'lib/rpc-client.js',
    'lib/rpc-client.d.ts',
    'lib/errors.js',
    'lib/errors.d.ts',
    'README.md',
    'LICENSE',
    'CHANGELOG.md'
];

requiredFiles.forEach(file => {
    const filePath = path.join(__dirname, '..', file);
    if (!fs.existsSync(filePath)) {
        errors.push(`Required file missing: ${file}`);
    }
});

// 3. Verify TypeScript declarations have corresponding JS files
const dtsFiles = requiredFiles.filter(f => f.endsWith('.d.ts'));
dtsFiles.forEach(dtsFile => {
    const jsFile = dtsFile.replace('.d.ts', '.js');
    const jsPath = path.join(__dirname, '..', jsFile);
    if (!fs.existsSync(jsPath)) {
        errors.push(`TypeScript declaration ${dtsFile} has no corresponding JS file: ${jsFile}`);
    }
});

// 4. Check CHANGELOG has entry for current version
const changelog = fs.readFileSync(
    path.join(__dirname, '..', 'CHANGELOG.md'),
    'utf8'
);

if (!changelog.includes(`## [${packageJson.version}]`)) {
    warnings.push(
        `CHANGELOG.md does not contain entry for version ${packageJson.version}`
    );
}

// 5. Verify package.json metadata
if (!packageJson.description) {
    errors.push('package.json missing description');
}

if (!packageJson.author) {
    errors.push('package.json missing author');
}

if (!packageJson.license) {
    errors.push('package.json missing license');
}

if (!packageJson.repository) {
    warnings.push('package.json missing repository field');
}

// 6. Check for common issues
if (packageJson.dependencies && Object.keys(packageJson.dependencies).length > 0) {
    warnings.push(
        'Package has dependencies - ensure they are necessary for a zero-dependency philosophy'
    );
}

// Print results
console.log('Validation Results:');
console.log('===================\n');

if (errors.length === 0 && warnings.length === 0) {
    console.log('✓ All checks passed! Package is ready to publish.\n');
    process.exit(0);
}

if (warnings.length > 0) {
    console.log('Warnings:');
    warnings.forEach(w => console.log(`  ⚠ ${w}`));
    console.log('');
}

if (errors.length > 0) {
    console.log('Errors:');
    errors.forEach(e => console.log(`  ✗ ${e}`));
    console.log('');
    console.log('❌ Package validation failed. Fix errors before publishing.\n');
    process.exit(1);
}

console.log('✓ Validation passed with warnings. Proceed with caution.\n');
process.exit(0);
```

**Validation Checks**:
1. ✅ Version is not `0.0.0`
2. ✅ All required files exist (`index.js`, `index.d.ts`, `lib/**`, docs)
3. ✅ TypeScript `.d.ts` files have corresponding `.js` files
4. ⚠️ CHANGELOG has entry for current version
5. ✅ package.json has description, author, license
6. ⚠️ Repository field is set
7. ⚠️ No unnecessary dependencies (zero-dependency philosophy)

### T7.6: Semantic Versioning & Changelog Conventions

**Versioning Strategy**:
```bash
# Bug fixes (1.0.0 → 1.0.1)
npm version patch

# New features (1.0.0 → 1.1.0)
npm version minor

# Breaking changes (1.0.0 → 2.0.0)
npm version major
```

**CHANGELOG.md Format** (Keep a Changelog):
```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- New features that are in development

### Changed
- Changes to existing functionality

### Deprecated
- Soon-to-be removed features

### Removed
- Features that were removed

### Fixed
- Bug fixes

### Security
- Security vulnerability fixes

## [1.1.0] - 2024-01-20

### Added
- `requestFileReadBatch()` method for concurrent file reads
- `requestGitStagedFiles()` helper for pre-commit hooks
- TypeScript declaration files for all modules

### Changed
- Improved error messages for validation errors
- Updated README with batch operation examples

### Fixed
- Fixed race condition in batch request handling
- Corrected TypeScript type for GitCommitOptions

## [1.0.0] - 2024-01-15

### Added
- Initial release of @ghost/extension-sdk
- ExtensionSDK class with high-level API
- IntentBuilder for fluent intent construction
- RPCClient for JSON-RPC communication
- Error hierarchy (IntentError, ValidationError, RateLimitError)
- Complete TypeScript definitions
- Comprehensive API documentation

[Unreleased]: https://github.com/lamallamadel/ghost/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/lamallamadel/ghost/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/lamallamadel/ghost/releases/tag/v1.0.0
```

**Changelog Categories**:
- **Added**: New features
- **Changed**: Changes to existing functionality
- **Deprecated**: Features marked for removal
- **Removed**: Removed features
- **Fixed**: Bug fixes
- **Security**: Security vulnerability fixes

### T7.7: GitHub Actions Automation

**Workflow**: `.github/workflows/publish-sdk.yml`

```yaml
name: Publish Extension SDK

on:
  push:
    tags:
      - 'sdk-v*.*.*'

jobs:
  publish:
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          registry-url: 'https://registry.npmjs.org'
      
      - name: Install dependencies
        working-directory: packages/extension-sdk
        run: npm ci || npm install
      
      - name: Run prepublish validation
        working-directory: packages/extension-sdk
        run: npm run verify
      
      - name: Extract version from tag
        id: get_version
        run: echo "VERSION=${GITHUB_REF#refs/tags/sdk-v}" >> $GITHUB_OUTPUT
      
      - name: Update package.json version
        working-directory: packages/extension-sdk
        run: npm version ${{ steps.get_version.outputs.VERSION }} --no-git-tag-version
      
      - name: Publish to NPM
        working-directory: packages/extension-sdk
        run: npm publish --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
      
      - name: Create GitHub Release
        uses: actions/create-release@v1
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          tag_name: ${{ github.ref }}
          release_name: Extension SDK ${{ steps.get_version.outputs.VERSION }}
          body: |
            Extension SDK version ${{ steps.get_version.outputs.VERSION }}
            
            See [CHANGELOG.md](https://github.com/lamallamadel/ghost/blob/main/packages/extension-sdk/CHANGELOG.md) for details.
          draft: false
          prerelease: false
```

**Trigger**:
```bash
# Create and push version tag
git tag sdk-v1.1.0
git push origin sdk-v1.1.0
```

**Workflow Steps**:
1. Checkout repository code
2. Setup Node.js 18 with npm registry
3. Install dependencies
4. Run prepublish validation (`npm run verify`)
5. Extract version from tag name
6. Update package.json version (no git commit)
7. Publish to npm registry (`npm publish --access public`)
8. Create GitHub release with changelog excerpt

**Required Secrets**:
- `NPM_TOKEN`: npm access token for publishing
- `GITHUB_TOKEN`: Automatically provided by GitHub Actions

## Complete Developer Workflow

### Full Lifecycle: Idea to Publication

#### 1. Scaffold Extension
```bash
ghost extension init my-awesome-extension
cd my-awesome-extension
npm install
```

**Generated Files**:
- `manifest.json`: Extension metadata and capabilities
- `index.js`: Boilerplate code with SDK integration
- `index.d.ts`: TypeScript declarations
- `package.json`: NPM dependencies
- `README.md`: Usage documentation
- `.gitignore`: Git ignore patterns

#### 2. Edit Manifest (Customize Capabilities)

**manifest.json**:
```json
{
  "id": "my-awesome-extension",
  "name": "My Awesome Extension",
  "version": "1.0.0",
  "description": "Automates GitHub PR workflows",
  "author": "Your Name",
  "main": "index.js",
  "capabilities": {
    "filesystem": {
      "read": ["src/**/*.js", "package.json"],
      "write": ["dist/**", ".github/workflows/*.yml"]
    },
    "network": {
      "allowlist": [
        "https://api.github.com"
      ],
      "rateLimit": {
        "cir": 60,
        "bc": 100,
        "be": 204800
      }
    },
    "git": {
      "read": true,
      "write": false
    },
    "hooks": ["pre-commit"]
  },
  "commands": ["pr-check", "pr-create"],
  "permissions": [
    "filesystem:read",
    "filesystem:write",
    "network:https",
    "git:read"
  ]
}
```

#### 3. Implement Extension Logic

**index.js**:
```javascript
const { ExtensionSDK, IntentError, ValidationError, RateLimitError } = require('@ghost/extension-sdk');

class MyAwesomeExtension {
    constructor() {
        this.sdk = new ExtensionSDK('my-awesome-extension', { timeout: 60000 });
    }

    async initialize() {
        this._logInfo('Extension initialized');
    }

    async prCheck(params) {
        const { args, flags } = params;
        
        try {
            // Get git status
            const status = await this.sdk.requestGitStatus();
            
            // Get staged files
            const staged = await this.sdk.requestGitStagedFiles();
            
            if (staged.length === 0) {
                return {
                    success: false,
                    error: 'No staged files found'
                };
            }
            
            // Validate files (batch read)
            const contents = await this.sdk.requestFileReadBatch(staged);
            
            // Run checks
            const issues = this._runChecks(contents, staged);
            
            if (issues.length > 0) {
                return {
                    success: false,
                    error: `Found ${issues.length} issue(s)`,
                    issues
                };
            }
            
            return {
                success: true,
                output: `✓ All checks passed for ${staged.length} file(s)`
            };
        } catch (error) {
            if (error instanceof RateLimitError) {
                this._logError('Rate limit exceeded', { error: error.message });
                return {
                    success: false,
                    error: 'Rate limit exceeded, please try again later'
                };
            }
            
            this._logError('PR check failed', {
                error: error.message,
                stack: error.stack
            });
            
            return {
                success: false,
                error: error.message
            };
        }
    }

    async prCreate(params) {
        const { args, flags } = params;
        
        try {
            // Get current branch
            const branch = await this.sdk.requestGitCurrentBranch();
            
            // Read config
            const config = await this.sdk.requestFileReadJSON('./package.json');
            
            // Create PR via GitHub API
            const response = await this.sdk.requestNetworkCall({
                url: 'https://api.github.com/repos/owner/repo/pulls',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `token ${process.env.GITHUB_TOKEN}`,
                    'Accept': 'application/vnd.github.v3+json'
                },
                body: JSON.stringify({
                    title: flags.title || `PR from ${branch}`,
                    body: flags.body || 'Automated PR',
                    head: branch,
                    base: flags.base || 'main'
                })
            });
            
            const pr = JSON.parse(response);
            
            return {
                success: true,
                output: `✓ PR created: ${pr.html_url}`
            };
        } catch (error) {
            this._logError('PR creation failed', {
                error: error.message,
                code: error.code,
                stage: error.stage
            });
            
            return {
                success: false,
                error: error.message
            };
        }
    }

    async preCommit(params) {
        try {
            // Run checks before commit
            const result = await this.prCheck(params);
            
            if (!result.success) {
                this._logError('Pre-commit checks failed', result);
                return result;
            }
            
            return {
                success: true,
                output: 'Pre-commit checks passed'
            };
        } catch (error) {
            this._logError('Pre-commit hook failed', { error: error.message });
            return { success: false, error: error.message };
        }
    }

    _runChecks(contents, files) {
        const issues = [];
        
        contents.forEach((content, index) => {
            const file = files[index];
            
            // Check for console.log
            if (content.includes('console.log')) {
                issues.push({
                    file,
                    line: this._findLine(content, 'console.log'),
                    message: 'Found console.log statement'
                });
            }
            
            // Check for TODO comments
            if (content.includes('TODO')) {
                issues.push({
                    file,
                    line: this._findLine(content, 'TODO'),
                    message: 'Found TODO comment'
                });
            }
        });
        
        return issues;
    }

    _findLine(content, search) {
        const lines = content.split('\n');
        return lines.findIndex(line => line.includes(search)) + 1;
    }

    _logInfo(message, data = {}) {
        const logEntry = {
            level: 'INFO',
            timestamp: new Date().toISOString(),
            extension: 'my-awesome-extension',
            message,
            ...data
        };
        console.log(JSON.stringify(logEntry));
    }

    _logError(message, data = {}) {
        const logEntry = {
            level: 'ERROR',
            timestamp: new Date().toISOString(),
            extension: 'my-awesome-extension',
            message,
            ...data
        };
        console.error(JSON.stringify(logEntry));
    }

    async shutdown() {
        this._logInfo('Extension shutting down');
    }
}

module.exports = MyAwesomeExtension;
```

#### 4. Validate Extension
```bash
ghost extension validate
```

**Expected Output**:
```
Validating extension at: /path/to/my-awesome-extension

✓ Valid JSON syntax
✓ Valid extension id: my-awesome-extension
✓ Extension name: My Awesome Extension
✓ Valid version: 1.0.0
✓ Main file exists: index.js
✓ Capabilities defined
  - Filesystem read: 2 pattern(s)
  - Filesystem write: 2 pattern(s)
  - Network allowlist: 1 domain(s)
  - Rate limit simulation:
    CIR: 60 tokens/min (1.00 tokens/sec)
    Bc (committed burst): 100 tokens
    Be (excess burst): 204800 bytes
    Bucket refills to capacity in: 100.0s
    Sustained rate: 1 request every 1.00s
  - Git read: enabled
  - Git hooks: pre-commit

Simulating permission requests:
✓ filesystem:read - valid intent
✓ git:status - valid intent

Warnings:
  ⚠ Extension requests write access to filesystem

✓ Extension is valid!

Ready to install with: ghost extension install .
```

#### 5. Install Extension Locally
```bash
ghost extension install .
```

**Output**:
```
✓ Extension My Awesome Extension installed successfully
  Location: ~/.ghost/extensions/my-awesome-extension
```

#### 6. Test Extension
```bash
# Test pr-check command
ghost pr-check

# Test pr-create command
ghost pr-create --title "feat: add new feature" --base main

# Test with verbose mode
ghost pr-check --verbose
```

**Verbose Output**:
```
[Verbose Mode] Filtering by: my-awesome-extension
[Telemetry] my-awesome-extension → Intercept ✓ 2ms
  Intent: filesystem:read
[Telemetry] my-awesome-extension → Auth ✓ 1ms [100/100]
[Telemetry] my-awesome-extension → Audit ✓ 3ms
[Telemetry] my-awesome-extension → Execute ✓ 5ms
✓ All checks passed for 3 file(s)
```

#### 7. Debug Issues

**Check Audit Logs**:
```bash
ghost audit-log view --extension my-awesome-extension --limit 50
```

**Check Gateway Metrics**:
```bash
ghost gateway metrics my-awesome-extension
```

**Check Extension State**:
```bash
ghost gateway extensions
```

#### 8. Publish to NPM (Optional)

**Update Version**:
```bash
npm version patch  # 1.0.0 → 1.0.1
```

**Update CHANGELOG.md**:
```markdown
## [1.0.1] - 2024-01-20

### Fixed
- Fixed rate limit handling in pr-create command
- Improved error messages for validation failures
```

**Test Package**:
```bash
npm pack
npm install -g ./my-awesome-extension-1.0.1.tgz
ghost pr-check
```

**Publish**:
```bash
npm publish
```

#### 9. Share with Others

**Installation from NPM**:
```bash
npm install -g my-awesome-extension
ghost extension install $(npm root -g)/my-awesome-extension
```

**Installation from Git**:
```bash
git clone https://github.com/user/my-awesome-extension.git
ghost extension install ./my-awesome-extension
```

**Installation from Local Path**:
```bash
ghost extension install /path/to/my-awesome-extension
```

## Extension Developer Quickstart

### 5-Minute Quickstart Guide

#### Prerequisites
```bash
# Install Ghost CLI globally
npm install -g atlasia-ghost

# Verify installation
ghost --version
```

#### Step 1: Create Extension (1 minute)
```bash
# Scaffold new extension
ghost extension init hello-world --author "Your Name"
cd hello-world
npm install
```

#### Step 2: Customize Manifest (1 minute)

**Edit manifest.json**:
```json
{
  "capabilities": {
    "filesystem": {
      "read": ["*.txt"]
    },
    "git": {
      "read": true
    }
  },
  "commands": ["hello"]
}
```

#### Step 3: Implement Command (2 minutes)

**Edit index.js**:
```javascript
const { ExtensionSDK } = require('@ghost/extension-sdk');

class HelloWorldExtension {
    constructor() {
        this.sdk = new ExtensionSDK('hello-world');
    }

    async initialize() {
        console.log('Hello World extension loaded!');
    }

    async hello(params) {
        try {
            // Get git branch
            const branch = await this.sdk.requestGitCurrentBranch();
            
            return {
                success: true,
                output: `Hello from branch: ${branch}!`
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async shutdown() {
        console.log('Goodbye!');
    }
}

module.exports = HelloWorldExtension;
```

#### Step 4: Install & Test (1 minute)
```bash
# Validate extension
ghost extension validate

# Install locally
ghost extension install .

# Test command
ghost hello
```

**Expected Output**:
```
Hello from branch: main!
```

### Reference Documentation

**Complete Guides**:
- 📖 [Extension API Documentation](../docs/extension-api.md) - Complete I/O intent schema reference
- 📖 [Extension Examples](../docs/extension-examples.md) - Working code examples
- 📖 [Developer Toolkit Guide](../docs/DEVELOPER_TOOLKIT.md) - Full toolkit reference
- 📖 [Quick Reference Card](../docs/QUICK_REFERENCE.md) - Command cheat sheet
- 📖 [Manifest Reference](./MANIFEST_REFERENCE.md) - Manifest schema details
- 📖 [SDK Package README](../packages/extension-sdk/README.md) - Complete SDK API

**Key Concepts**:
1. **Manifest-Driven Capabilities**: Declare permissions before use
2. **Pipeline Layers**: Intercept → Auth → Audit → Execute
3. **Typed Errors**: IntentError, ValidationError, RateLimitError
4. **Batch Operations**: Efficient concurrent operations
5. **Rate Limiting**: Token bucket (CIR/Bc/Be parameters)

## Deliverables Summary

### T7.1: CLI Scaffolding Command ✅
- `ghost extension init <name>` command implementation
- Template generation for manifest.json, index.js, index.d.ts, package.json, README.md
- Default capability templates with CIR=60, Bc=100, Be=204800
- Boilerplate patterns for error handling and structured logging

### T7.2: CLI Validation Command ✅
- `ghost extension validate [path]` command implementation
- Manifest schema validation with Be parameter checks
- Glob pattern validation for filesystem capabilities
- Network allowlist URL verification (protocol + domain + port)
- Git hooks validation against allowed list
- Permission simulation with sample intents
- Warning system for overly broad patterns

### T7.3: Extension SDK Package ✅
- `@ghost/extension-sdk` NPM package structure
- ExtensionSDK class with high-level API methods
- IntentBuilder class for fluent intent construction
- RPCClient class for JSON-RPC communication and batch operations
- Error hierarchy: IntentError, ValidationError, RateLimitError
- Ergonomic helpers: requestFileReadJSON, requestGitCurrentBranch, requestFileReadBatch
- Complete TypeScript declarations (.d.ts files)
- Comprehensive README with API documentation

### T7.4: Package Metadata ✅
- package.json with scoped name (@ghost/extension-sdk)
- TypeScript types entry point (index.d.ts)
- Files whitelist for NPM package
- Repository metadata with monorepo directory path
- Engine requirements (Node.js >=14.0.0)

### T7.5: Prepublish Validation Hooks ✅
- verify-publish.js script for pre-publish checks
- Version validation (not 0.0.0)
- Required files existence checks
- TypeScript declaration validation
- Changelog entry verification
- Package metadata validation

### T7.6: Semantic Versioning & Changelog ✅
- CHANGELOG.md following Keep a Changelog format
- Semantic versioning conventions (patch/minor/major)
- Version comparison links
- Categorized changes (Added, Changed, Fixed, etc.)

### T7.7: GitHub Actions Automation ✅
- publish-sdk.yml workflow for automated publishing
- Tag-triggered deployment (sdk-v*.*.*)
- Prepublish validation in CI
- NPM publishing with access token
- GitHub release creation with changelog

### T7.8: Complete Documentation ✅
- Extension API documentation (docs/extension-api.md) - Complete I/O intent schema
- Extension examples (docs/extension-examples.md) - Working code samples
- Developer toolkit guide (docs/DEVELOPER_TOOLKIT.md) - Complete toolkit reference
- Quick reference card (docs/QUICK_REFERENCE.md) - Command cheat sheet
- Sprint 7 summary (core/SPRINT7_SUMMARY.md) - Architecture and workflows
- SDK README (packages/extension-sdk/README.md) - Complete API reference

---

## Architecture Highlights

### Key Design Decisions

1. **Manifest-Driven Capability Contracts**
   - Declarative permissions in manifest.json
   - Runtime enforcement by pipeline layers
   - Fail-fast validation with detailed error messages

2. **Typed SDK with Error Hierarchy**
   - ExtensionSDK for high-level operations
   - IntentBuilder for fluent API
   - RPCClient for low-level control
   - Structured error types (IntentError, ValidationError, RateLimitError)

3. **Stdio-Based JSON-RPC Communication**
   - Simple protocol (JSON-RPC 2.0)
   - Batch operation support
   - Request/response correlation
   - Timeout management

4. **Comprehensive Validation**
   - Schema validation (manifest structure)
   - Glob pattern validation (filesystem)
   - URL validation (network allowlists)
   - Git hooks validation
   - Permission simulation

5. **Developer Experience**
   - Scaffolding command for quick start
   - Validation command for fast feedback
   - Verbose mode for debugging
   - Structured logging patterns
   - Complete documentation and examples

### Pipeline Integration

```
Extension Code (SDK)
    ↓
JSON-RPC Intent
    ↓
Intercept Layer (Schema Validation)
    ↓
Authorization Layer (Capability Checks, Rate Limits)
    ↓
Audit Layer (NIST SI-10, Entropy, Content Validation)
    ↓
Execution Layer (Circuit Breakers, Timeouts)
    ↓
Result
    ↓
Extension Code (SDK)
```

### Rate Limiting (trTCM)

**Token Bucket Parameters**:
- **CIR (Committed Information Rate)**: Sustained requests per minute
- **Bc (Burst Committed)**: Maximum burst capacity (tokens)
- **Be (Burst Excess)**: Additional burst capacity for response sizes (bytes)

**Three-Color Marking**:
- **Green**: Tokens ≥ 1 and ≤ Bc (conforming)
- **Yellow**: Tokens > Bc and ≤ (Bc + Be) (exceeding with warning)
- **Red**: Tokens < 1 (violating, blocked)

### Security Model

**NIST SI-10 Validation**:
- Path traversal protection (SI-10-PATH-TRAVERSAL)
- Command injection protection (SI-10-COMMAND-INJECTION)
- SSRF protection (SI-10-SSRF-*)
- Secret detection (SI-10-CONTENT-SECRETS)

**Audit Logging**:
- Immutable audit trail (~/.ghost/audit.log)
- Security event logging
- Violation tracking
- Request correlation

---

**Sprint 7 Status**: ✅ Complete

All developer toolkit components delivered:
- CLI commands (init, validate) ✅
- Extension SDK package ✅
- Validation engine ✅
- NPM publishing workflow ✅
- Complete documentation ✅
- Developer quickstart guide ✅

**Next Steps for Developers**:
1. Run `ghost extension init my-extension` to start
2. Customize manifest.json with required capabilities
3. Implement extension logic using SDK
4. Validate with `ghost extension validate`
5. Install and test locally
6. Publish to npm (optional)
7. Share with the community!
