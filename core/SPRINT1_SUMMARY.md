# Sprint 1 Summary - Gateway Architecture & Zero Trust Extension System

## Executive Summary

Sprint 1 delivered a production-ready Gateway architecture with a Zero Trust security model for Ghost CLI's extension system. The implementation includes a four-layer I/O pipeline (Intercept → Authorization → Audit → Execute), comprehensive manifest schema validation, and complete developer tooling for extension creation and validation.

**Key Deliverables:** T1.1 through T1.8 fully implemented and tested.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Gateway Architecture Diagram](#gateway-architecture-diagram)
- [Manifest Schema Reference](#manifest-schema-reference)
- [Pipeline Layer Contracts](#pipeline-layer-contracts)
- [Zero Trust Design Principles](#zero-trust-design-principles)
- [Extension Developer Quickstart](#extension-developer-quickstart)
- [Deliverables Summary](#deliverables-summary)

---

## Architecture Overview

Ghost CLI implements a layered architecture separating concerns across Gateway (orchestration), Pipeline (security), and Runtime (execution):

```
┌─────────────────────────────────────────────────────────────┐
│                         Ghost CLI                            │
├─────────────────────────────────────────────────────────────┤
│  User Command → CLI Entry → Gateway → Pipeline → Extension  │
└─────────────────────────────────────────────────────────────┘
```

### Core Components

1. **Gateway** (`core/gateway.js`) - Pure extension orchestration
2. **ExtensionLoader** (`core/extension-loader.js`) - Discovery and validation
3. **IOPipeline** (`core/pipeline/index.js`) - Four-layer security processing
4. **Runtime** (`core/runtime.js`) - Extension process management
5. **Manifest Schema** (`core/manifest-schema.json`) - Capability contract definition

---

## Gateway Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────────┐
│                              GATEWAY LAYER                                │
│                         (Pure Orchestration)                              │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  ┌──────────────────┐         ┌──────────────────┐                       │
│  │  ExtensionLoader │────────▶│  Extension       │                       │
│  │                  │         │  Registry (Map)  │                       │
│  │  - Discovery     │         │                  │                       │
│  │  - Validation    │         │  extensionId →   │                       │
│  │  - Instantiation │         │    {manifest,    │                       │
│  └──────────────────┘         │     instance,    │                       │
│         │                     │     path}        │                       │
│         │                     └──────────────────┘                       │
│         │                              │                                  │
│         ▼                              ▼                                  │
│  ┌─────────────────────────────────────────────────┐                     │
│  │         ORCHESTRATION FLOW                      │                     │
│  │                                                  │                     │
│  │  1. User Extensions Discovery                   │                     │
│  │     (fail-closed manifest validation)           │                     │
│  │                                                  │                     │
│  │  2. Bundled Extensions Discovery                │                     │
│  │     (deterministic collision resolution)        │                     │
│  │                                                  │                     │
│  │  3. Registry Population                         │                     │
│  │     (first-registered wins)                     │                     │
│  │                                                  │                     │
│  │  4. Execution Routing                           │                     │
│  │     (zero business logic delegation)            │                     │
│  └─────────────────────────────────────────────────┘                     │
│                                                                            │
└────────────────────────────────┬───────────────────────────────────────────┘
                                 │
                                 ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                         I/O PIPELINE (4 LAYERS)                           │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │ LAYER 1: INTERCEPT (Message Validation)                         │    │
│  ├─────────────────────────────────────────────────────────────────┤    │
│  │                                                                   │    │
│  │  Raw Message → JSON-RPC 2.0 Validation → Intent Normalization   │    │
│  │                                                                   │    │
│  │  - Deserialize JSON-RPC message                                  │    │
│  │  - Validate: jsonrpc="2.0", method, id fields                    │    │
│  │  - Normalize to Intent schema                                    │    │
│  │  - Validate Intent: type, operation, params, extensionId         │    │
│  │                                                                   │    │
│  │  OUTPUT: Intent{type, operation, params, extensionId, requestId}│    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                         │                                                 │
│                         ▼                                                 │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │ LAYER 2: AUTHORIZATION (Permission Enforcement)                  │    │
│  ├─────────────────────────────────────────────────────────────────┤    │
│  │                                                                   │    │
│  │  Intent → Permission Check → Rate Limiting → Traffic Policing    │    │
│  │                                                                   │    │
│  │  ┌─────────────────────┐    ┌─────────────────────┐             │    │
│  │  │ PermissionChecker   │    │ RateLimitManager    │             │    │
│  │  │                     │    │                     │             │    │
│  │  │ - Filesystem: Glob  │    │ - Token Bucket     │             │    │
│  │  │ - Network: Allowlist│    │ - CIR/BC params    │             │    │
│  │  │ - Git: Read/Write   │    │ - Per-extension    │             │    │
│  │  │ - Process: Spawn    │    └─────────────────────┘             │    │
│  │  └─────────────────────┘                                         │    │
│  │                                                                   │    │
│  │  ┌─────────────────────────────────────────┐                    │    │
│  │  │ TrafficPolicer (trTCM RFC 2698)        │                    │    │
│  │  │                                          │                    │    │
│  │  │ - Committed Bucket (CIR/Bc)             │                    │    │
│  │  │ - Excess Bucket (Be)                    │                    │    │
│  │  │ - Three-color marking: Green/Yellow/Red │                    │    │
│  │  └─────────────────────────────────────────┘                    │    │
│  │                                                                   │    │
│  │  OUTPUT: {authorized: boolean, reason?, code?, metadata?}        │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                         │                                                 │
│                         ▼                                                 │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │ LAYER 3: AUDIT (NIST SI-10 Compliance)                          │    │
│  ├─────────────────────────────────────────────────────────────────┤    │
│  │                                                                   │    │
│  │  Intent → Security Validation → Audit Logging → Pass/Block      │    │
│  │                                                                   │    │
│  │  ┌─────────────────────────────────────────────────────────┐    │    │
│  │  │ NISTValidator                                           │    │    │
│  │  │                                                          │    │    │
│  │  │ - SI-10-PATH-TRAVERSAL: ../, encoding, null bytes      │    │    │
│  │  │ - SI-10-COMMAND-INJECTION: &&, ||, ;, |, $(), backticks│    │    │
│  │  │ - SI-10-SSRF-*: localhost, private IPs, metadata       │    │    │
│  │  │ - SI-10-SECRET-DETECTION: entropy analysis, patterns    │    │    │
│  │  └─────────────────────────────────────────────────────────┘    │    │
│  │                                                                   │    │
│  │  ┌─────────────────────────────────────────────────────────┐    │    │
│  │  │ AuditLogger                                             │    │    │
│  │  │                                                          │    │    │
│  │  │ - Immutable JSON log entries                            │    │    │
│  │  │ - ISO 8601 timestamps                                   │    │    │
│  │  │ - Newline-delimited format                              │    │    │
│  │  │ - Secret sanitization                                   │    │    │
│  │  └─────────────────────────────────────────────────────────┘    │    │
│  │                                                                   │    │
│  │  OUTPUT: {passed: boolean, violations?, warnings?}               │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                         │                                                 │
│                         ▼                                                 │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │ LAYER 4: EXECUTE (Resilient Operation)                          │    │
│  ├─────────────────────────────────────────────────────────────────┤    │
│  │                                                                   │    │
│  │  Intent → Executor Selection → Circuit Breaker → Operation      │    │
│  │                                                                   │    │
│  │  ┌──────────────────┐   ┌──────────────────┐                    │    │
│  │  │ FilesystemExec   │   │ NetworkExecutor  │                    │    │
│  │  │ - read/write     │   │ - http/https     │                    │    │
│  │  │ - stat/readdir   │   │ - timeout mgmt   │                    │    │
│  │  │ - mkdir/unlink   │   │ - error mapping  │                    │    │
│  │  └──────────────────┘   └──────────────────┘                    │    │
│  │                                                                   │    │
│  │  ┌──────────────────┐   ┌──────────────────┐                    │    │
│  │  │ GitExecutor      │   │ ProcessExecutor  │                    │    │
│  │  │ - git commands   │   │ - spawn/exec     │                    │    │
│  │  │ - timeout mgmt   │   │ - timeout mgmt   │                    │    │
│  │  └──────────────────┘   └──────────────────┘                    │    │
│  │                                                                   │    │
│  │  ┌─────────────────────────────────────────────────────────┐    │    │
│  │  │ CircuitBreaker (per executor type)                      │    │    │
│  │  │                                                          │    │    │
│  │  │ States: CLOSED → OPEN → HALF_OPEN                       │    │    │
│  │  │ - Failure threshold: 5 failures                         │    │    │
│  │  │ - Reset timeout: 60s                                    │    │    │
│  │  │ - Auto-recovery on success                              │    │    │
│  │  └─────────────────────────────────────────────────────────┘    │    │
│  │                                                                   │    │
│  │  OUTPUT: {success: boolean, result?, error?, code?}              │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
                          Extension Instance
                          (Receives Result)
```

### Data Flow Example

```
1. Extension sends JSON-RPC message:
   {"jsonrpc":"2.0", "id":1, "method":"filesystem.read", 
    "params":{"path":"./file.txt", "extensionId":"my-ext"}}

2. INTERCEPT validates and normalizes to Intent:
   {type:"filesystem", operation:"read", params:{path:"./file.txt"},
    extensionId:"my-ext", requestId:"my-ext-123456"}

3. AUTHORIZATION checks manifest permissions:
   - Filesystem read pattern: "**/*.txt" ✓ matches "./file.txt"
   - Rate limit check: 45/100 tokens available ✓

4. AUDIT validates security:
   - Path traversal: no "../" patterns ✓
   - Secret detection: no high-entropy strings ✓
   - Logs to audit.log

5. EXECUTE performs operation:
   - Circuit breaker state: CLOSED ✓
   - fs.readFile("./file.txt") → "Hello, world!"
   - Returns {success:true, content:"Hello, world!"}
```

---

## Manifest Schema Reference

The manifest schema defines the capability contract between extensions and Ghost CLI. All fields are validated at extension load time using fail-closed validation.

### Core Fields

```json
{
  "id": "string (required)",
  "name": "string (required)",
  "version": "string (required, semver)",
  "description": "string (optional)",
  "author": "string (optional)",
  "main": "string (required, entry point)",
  "capabilities": "object (required)",
  "permissions": "array (optional)",
  "dependencies": "object (optional)",
  "config": "object (optional)"
}
```

### Complete Example

```json
{
  "id": "my-extension",
  "name": "My Extension",
  "version": "1.0.0",
  "description": "Example extension demonstrating all capabilities",
  "author": "Developer Name",
  "main": "index.js",
  
  "capabilities": {
    "filesystem": {
      "read": [
        "**/*.js",
        "**/*.json",
        "src/**",
        "test/**"
      ],
      "write": [
        "dist/**",
        "build/**",
        ".cache/**"
      ]
    },
    
    "network": {
      "allowlist": [
        "https://api.github.com",
        "https://api.anthropic.com",
        "https://api.groq.com"
      ],
      "rateLimit": {
        "cir": 100,
        "bc": 500,
        "be": 200
      }
    },
    
    "git": {
      "read": true,
      "write": true
    },
    
    "hooks": [
      "pre-commit",
      "commit-msg",
      "pre-push"
    ]
  },
  
  "permissions": [
    "filesystem:read",
    "filesystem:write",
    "network:https",
    "git:read",
    "git:write",
    "process:spawn",
    "env:read"
  ],
  
  "dependencies": {
    "@ghost/extension-sdk": "^1.0.0",
    "axios": "^1.6.0",
    "minimatch": "^9.0.0"
  },
  
  "config": {
    "timeout": 30000,
    "retryAttempts": 3,
    "logLevel": "info"
  }
}
```

### Capability Details

#### Filesystem Capability

**Purpose:** Define read/write access to files using glob patterns.

**Schema:**
```json
{
  "filesystem": {
    "read": ["pattern1", "pattern2"],
    "write": ["pattern1", "pattern2"]
  }
}
```

**Glob Pattern Syntax:**
- `**` - Match zero or more directories (e.g., `**/*.js` matches all JS files)
- `*` - Match any characters except `/` (e.g., `src/*.js` matches JS in src/)
- `?` - Match exactly one character
- `{a,b}` - Match either a or b
- `[abc]` - Match any character in set
- `!(pattern)` - Negative match

**Examples:**
```json
{
  "read": [
    "**/*.{js,ts}",           // All JS/TS files
    "src/**",                  // Everything in src/
    "config/*.json",           // JSON files in config/
    "**/*",                    // Everything (broad permission)
    "!**/*.secret"             // Exclude secret files
  ],
  "write": [
    "dist/**",                 // Output directory
    "build/**/*.js",           // Built JS files
    ".cache/**",               // Cache directory
    []                         // Read-only (no write access)
  ]
}
```

**Authorization Logic:**
1. Intent arrives with `params.path = "./src/utils.js"`
2. Normalize path: `src/utils.js` (forward slashes)
3. Check against read patterns: `**/*.js` matches ✓
4. Grant access

**Failure Modes:**
- Path not matching any pattern → `AUTH_PERMISSION_DENIED`
- No filesystem capability declared → `AUTH_PERMISSION_DENIED`
- Write operation with no write patterns → `AUTH_PERMISSION_DENIED`

#### Network Capability

**Purpose:** Define allowed network destinations and rate limiting.

**Schema:**
```json
{
  "network": {
    "allowlist": ["https://domain.com"],
    "rateLimit": {
      "cir": 60,
      "bc": 100,
      "be": 0
    }
  }
}
```

**Allowlist Format:**
- Must include protocol (`http://` or `https://`)
- Must include domain (no paths)
- Port is optional (defaults: 80/443)
- Exact origin match required

**Rate Limit Parameters (trTCM RFC 2698):**
- `cir` (Committed Information Rate): Sustained requests per minute
- `bc` (Burst Committed): Maximum burst tokens (≥ CIR)
- `be` (Burst Excess): Additional excess burst tokens (≥ 0, optional)

**Token Bucket Algorithm:**
```
Green traffic:  Within CIR, consumes Bc tokens
Yellow traffic: Exceeds CIR but within Be, consumes Be tokens
Red traffic:    Exceeds both, request denied
```

**Examples:**
```json
{
  "allowlist": [
    "https://api.github.com",      // GitHub API
    "https://api.anthropic.com",   // Anthropic API
    "http://localhost:3000"        // Local dev server
  ],
  "rateLimit": {
    "cir": 100,                    // 100 req/min sustained
    "bc": 500,                     // Burst to 500
    "be": 200                      // Extra 200 for spikes
  }
}
```

**Authorization Logic:**
1. Intent arrives with `params.url = "https://api.github.com/repos"`
2. Parse URL: protocol=https, host=api.github.com
3. Construct origin: `https://api.github.com`
4. Check allowlist: exact match found ✓
5. Check rate limit: 45/500 tokens available ✓
6. Traffic police: consume 1 token, classified GREEN ✓
7. Grant access

**Failure Modes:**
- URL not in allowlist → `AUTH_PERMISSION_DENIED`
- Rate limit exceeded → `AUTH_RATE_LIMIT`
- Traffic policer RED classification → `QOS_RATE_LIMIT_EXCEEDED`
- Invalid URL format → `AUTH_PERMISSION_DENIED`

#### Git Capability

**Purpose:** Define read/write access to git operations.

**Schema:**
```json
{
  "git": {
    "read": true,
    "write": false
  }
}
```

**Operation Categories:**
- **Read:** status, log, diff, show, ls-files, branch --list, tag --list
- **Write:** commit, add, rm, branch, tag, push, fetch, pull, reset, checkout, merge, rebase

**Examples:**
```json
// Read-only access
{"read": true, "write": false}

// Full access
{"read": true, "write": true}

// No access (default)
{"read": false, "write": false}
// or omit git capability entirely
```

**Authorization Logic:**
1. Intent arrives with `operation = "status"`
2. Check if operation is write: status is read ✓
3. Check git.read permission: true ✓
4. Grant access

**Failure Modes:**
- Write operation without write permission → `AUTH_PERMISSION_DENIED`
- Read operation without read permission → `AUTH_PERMISSION_DENIED`
- No git capability declared → `AUTH_PERMISSION_DENIED`

#### Hooks Capability

**Purpose:** Register extension for git hook lifecycle events.

**Schema:**
```json
{
  "hooks": ["pre-commit", "commit-msg", "pre-push"]
}
```

**Valid Hook Names:**
- `pre-commit` - Before commit (can block)
- `post-commit` - After commit (informational)
- `pre-push` - Before push (can block)
- `post-checkout` - After checkout (informational)
- `commit-msg` - Validate commit message (can block)
- `pre-rebase` - Before rebase (can block)

**Hook Behavior:**
- Pre-hooks can block operations by returning non-zero exit code
- Post-hooks are informational only
- Extensions receive hook invocation via JSON-RPC notification

**Examples:**
```json
{
  "hooks": [
    "pre-commit",    // Validate code before commit
    "commit-msg"     // Enforce commit message format
  ]
}
```

### Validation Rules

#### ID Field
- **Pattern:** `^[a-z0-9-]+$` (lowercase alphanumeric with hyphens)
- **Required:** Yes
- **Examples:** `my-extension`, `ghost-git-extension`, `code-formatter`
- **Invalid:** `MyExtension`, `my_extension`, `my.extension`

#### Version Field
- **Pattern:** `^\d+\.\d+\.\d+$` (semantic versioning)
- **Required:** Yes
- **Examples:** `1.0.0`, `2.3.4`, `0.1.0`
- **Invalid:** `1.0`, `v1.0.0`, `1.0.0-alpha`

#### Main Field
- **Type:** String (relative path from extension root)
- **Required:** Yes
- **Validated:** File existence checked at load time
- **Examples:** `index.js`, `src/main.js`, `dist/extension.js`

#### Capabilities Field
- **Type:** Object (not null, not array)
- **Required:** Yes
- **Validation:** Deep validation of all nested structures
- **Fail-closed:** Any validation error prevents extension loading

---

## Pipeline Layer Contracts

Each pipeline layer has a defined contract specifying inputs, outputs, and failure modes.

### Layer 1: Intercept (Message Interceptor)

**Responsibility:** Validate and normalize incoming messages to Intent schema.

**Input:**
```javascript
// Raw JSON-RPC 2.0 message
{
  jsonrpc: "2.0",
  id: string | number | null,
  method: string,
  params: object
}
```

**Processing:**
1. Deserialize JSON
2. Validate JSON-RPC 2.0 format:
   - `jsonrpc` must be exactly "2.0"
   - `id` must be string, number, or null
   - `method` must be non-empty string
   - `params` must be object or array (if present)
3. Normalize to Intent schema:
   - Extract `type` from params or method
   - Extract `operation` from params or method
   - Extract `params.params` as operation parameters
   - Extract `extensionId` from params
4. Validate Intent schema:
   - `type` in ['filesystem', 'network', 'git', 'process']
   - `operation` valid for type
   - `params` contains required fields for operation
   - `extensionId` is non-empty string

**Output (Success):**
```javascript
Intent {
  type: string,
  operation: string,
  params: object,
  extensionId: string,
  timestamp: number,
  requestId: string
}
```

**Output (Failure):**
```javascript
{
  success: false,
  stage: 'INTERCEPT',
  error: string,
  code: 'PIPELINE_INTERCEPT_ERROR'
}
```

**Failure Modes:**
- **JSON Parse Error:** Invalid JSON syntax
- **JSON-RPC Validation:** Missing/invalid jsonrpc, id, method fields
- **Intent Schema Validation:** Invalid type, operation, params, or extensionId
- **Parameter Validation:** Missing required params for operation type

**Stream Processing:**
The interceptor also supports streaming intents via `processStream()`:
```javascript
interceptor.processStream(stream, onIntent, onError);
// Buffers input, parses newline-delimited JSON-RPC messages
// Calls onIntent(intent) for each valid message
// Calls onError(error) for parsing/validation failures
```

### Layer 2: Authorization (Authorization Layer)

**Responsibility:** Enforce manifest permissions and rate limiting.

**Input:**
```javascript
Intent {
  type: string,
  operation: string,
  params: object,
  extensionId: string,
  requestId: string
}
```

**Processing:**
1. Lookup extension manifest by `extensionId`
2. Route to capability checker based on `intent.type`:
   - `filesystem` → Check glob patterns against `params.path`
   - `network` → Check URL against allowlist + rate limits
   - `git` → Check read/write permission for operation
   - `process` → Check `process:spawn` permission
3. For network intents:
   - Check traffic policer (trTCM)
   - Check token bucket rate limiter
4. Return authorization result

**Output (Success):**
```javascript
{
  authorized: true,
  metadata: {
    matchedPattern?: string,
    matchedUrl?: string
  }
}
```

**Output (Failure):**
```javascript
{
  authorized: false,
  reason: string,
  code: string,
  state?: object,
  qos?: {
    classification: string,
    color: string,
    state: object
  }
}
```

**Failure Modes:**
- **AUTH_NOT_REGISTERED:** Extension not registered in pipeline
- **AUTH_PERMISSION_DENIED:** Capability check failed
  - Filesystem: Path doesn't match any pattern
  - Network: URL not in allowlist
  - Git: Read/write permission not granted
  - Process: process:spawn permission not granted
- **AUTH_RATE_LIMIT:** Token bucket exhausted
- **QOS_RATE_LIMIT_EXCEEDED:** Traffic policer classified request as RED
- **AUTH_UNKNOWN_TYPE:** Invalid intent type

**State Management:**
- **Per-Extension Token Buckets:** Track CIR/Bc consumption
- **Traffic Policers:** Track Bc/Be token consumption with three-color marking
- **State Queries:** `getRateLimitState()`, `getTrafficPolicerState()`
- **State Reset:** `resetRateLimit()`, `resetTrafficPolicer()`

### Layer 3: Audit (Audit Layer)

**Responsibility:** NIST SI-10 input validation and immutable audit logging.

**Input:**
```javascript
Intent {
  type: string,
  operation: string,
  params: object,
  extensionId: string,
  requestId: string
}

AuthResult {
  authorized: boolean,
  reason?: string,
  code?: string
}
```

**Processing:**
1. Run NIST SI-10 validation on intent:
   - **SI-10-PATH-TRAVERSAL:** Detect `../`, URL encoding, null bytes
   - **SI-10-COMMAND-INJECTION:** Detect `&&`, `||`, `;`, `|`, `$()`, backticks
   - **SI-10-SSRF-*:** Detect localhost, private IPs, metadata endpoints
   - **SI-10-SECRET-DETECTION:** Entropy analysis + pattern matching
2. Log validation result to audit.log (immutable, ISO 8601 timestamp)
3. Return pass/fail decision

**Output (Success):**
```javascript
{
  passed: true,
  warnings?: Array<{
    rule: string,
    message: string
  }>
}
```

**Output (Failure):**
```javascript
{
  passed: false,
  reason: 'NIST SI-10 validation failed',
  code: 'AUDIT_VALIDATION_FAILED',
  violations: Array<{
    rule: string,
    message: string,
    detail?: string
  }>
}
```

**Failure Modes:**
- **SI-10-PATH-TRAVERSAL:** Path contains `../`, `..\\`, `%2e%2e`, null bytes
- **SI-10-COMMAND-INJECTION:** Command contains shell metacharacters
- **SI-10-SSRF-LOCALHOST:** URL targets localhost/127.0.0.1/::1
- **SI-10-SSRF-PRIVATE-IP:** URL targets private IP ranges (10.0.0.0/8, 192.168.0.0/16, etc.)
- **SI-10-SSRF-METADATA:** URL targets cloud metadata endpoints (169.254.169.254)
- **SI-10-SECRET-DETECTION:** High entropy strings or secret patterns detected

**Audit Log Format:**
```json
{
  "timestamp": "2024-01-15T10:30:45.123Z",
  "type": "INTENT",
  "requestId": "my-ext-123456",
  "extensionId": "my-extension",
  "intentType": "filesystem",
  "operation": "read",
  "authorized": true,
  "authCode": null,
  "validated": true,
  "violations": [],
  "warnings": [],
  "params": {"path": "./file.txt"}
}
```

**Warnings vs Violations:**
- **Warnings:** Allow execution but log concern (e.g., absolute paths, non-standard file extensions)
- **Violations:** Block execution (fail-closed security model)

### Layer 4: Execute (Execution Layer)

**Responsibility:** Perform I/O operations with circuit breaker resilience.

**Input:**
```javascript
Intent {
  type: string,
  operation: string,
  params: object,
  extensionId: string,
  requestId: string
}
```

**Processing:**
1. Select executor based on `intent.type`:
   - `filesystem` → FilesystemExecutor
   - `network` → NetworkExecutor
   - `git` → GitExecutor
   - `process` → ProcessExecutor
2. Check circuit breaker state:
   - **CLOSED:** Execute normally
   - **OPEN:** Reject if within reset timeout
   - **HALF_OPEN:** Allow one test request
3. Execute operation with timeout management
4. Update circuit breaker on success/failure
5. Return result

**Output (Success):**
```javascript
// Filesystem read
{
  success: true,
  content: string
}

// Network request
{
  success: true,
  statusCode: number,
  headers: object,
  body: string
}

// Git command
{
  success: true,
  stdout: string,
  stderr: string
}
```

**Output (Failure):**
```javascript
ExecutionError {
  message: string,
  code: string,
  details?: object
}
```

**Failure Modes:**

**Filesystem:**
- **EXEC_NOT_FOUND:** File/directory not found (ENOENT)
- **EXEC_PERMISSION_DENIED:** Access denied (EACCES)
- **EXEC_ALREADY_EXISTS:** File exists (EEXIST)
- **EXEC_IS_DIRECTORY:** Expected file, got directory (EISDIR)
- **EXEC_NOT_DIRECTORY:** Expected directory, got file (ENOTDIR)
- **EXEC_NOT_EMPTY:** Directory not empty (ENOTEMPTY)
- **EXEC_TIMEOUT:** Operation exceeded timeout

**Network:**
- **EXEC_HOST_NOT_FOUND:** DNS resolution failed (ENOTFOUND)
- **EXEC_CONNECTION_REFUSED:** Connection refused (ECONNREFUSED)
- **EXEC_TIMEOUT:** Request timeout (ETIMEDOUT)
- **EXEC_CONNECTION_RESET:** Connection reset (ECONNRESET)
- **EXEC_HOST_UNREACHABLE:** Host unreachable (EHOSTUNREACH)

**Git:**
- **EXEC_GIT_ERROR:** Git command failed (non-zero exit code)

**Process:**
- **EXEC_SPAWN_ERROR:** Failed to spawn process
- **EXEC_PROCESS_ERROR:** Process exited with non-zero code
- **EXEC_TIMEOUT:** Process exceeded timeout

**Circuit Breaker:**
- **CIRCUIT_OPEN:** Circuit breaker is open after repeated failures
  - Failure threshold: 5 consecutive failures
  - Reset timeout: 60 seconds
  - Recovery: Automatic on successful test request in HALF_OPEN state

**Circuit Breaker States:**
```
CLOSED (normal operation)
  ↓ 5 failures
OPEN (block all requests)
  ↓ 60s timeout
HALF_OPEN (test single request)
  ↓ success → CLOSED
  ↓ failure → OPEN
```

**Timeout Management:**
- Default timeout: 30 seconds
- Configurable per-operation via `params.timeout`
- Race between operation promise and timeout promise
- Timeout error code: `EXEC_TIMEOUT`

---

## Zero Trust Design Principles

The Ghost CLI extension system implements Zero Trust security principles throughout the architecture.

### 1. Never Trust, Always Verify

**Implementation:**
- **Manifest Validation:** All extensions undergo fail-closed manifest validation at load time
- **Permission Checks:** Every I/O intent is checked against declared capabilities
- **Input Validation:** All user inputs and intent parameters validated before execution
- **NIST SI-10 Compliance:** Input validation layer blocks malicious patterns

**Code Example:**
```javascript
// ExtensionLoader validates BEFORE loading
validateManifest(manifest) {
  const errors = [];
  
  // Fail-closed: ALL required fields must be valid
  if (!manifest.id || !/^[a-z0-9-]+$/.test(manifest.id)) {
    errors.push('Invalid id field');
  }
  
  if (errors.length > 0) {
    throw new Error(`Validation failed: ${errors.join(', ')}`);
  }
}
```

### 2. Assume Breach

**Implementation:**
- **Least Privilege:** Extensions only get explicitly declared capabilities
- **Defense in Depth:** Four-layer pipeline with independent validation
- **Audit Logging:** Immutable audit trail of all operations
- **Circuit Breakers:** Automatic isolation of failing components
- **Secret Detection:** Entropy scanning prevents credential leakage

**Principle Application:**
```
Even if Layer 2 (Authorization) is bypassed:
→ Layer 3 (Audit) detects malicious patterns
→ Layer 4 (Execute) has circuit breakers
→ All operations logged immutably
```

### 3. Verify Explicitly

**Implementation:**
- **Explicit Capability Declaration:** No default permissions, all must be declared
- **Glob Pattern Matching:** Exact pattern matching for filesystem access
- **URL Allowlisting:** Protocol + domain exact match for network access
- **Rate Limiting:** Explicit CIR/Bc/Be configuration required
- **Permission Enumeration:** High-level permissions explicitly listed

**Manifest Requirements:**
```json
{
  "capabilities": {
    // Explicit: no wildcards unless declared
    "filesystem": {
      "read": ["src/**/*.js"],  // Must declare exact patterns
      "write": []                // Empty = no write access
    },
    
    // Explicit: no default allowlist
    "network": {
      "allowlist": [
        "https://api.example.com"  // Must list each domain
      ]
    }
  }
}
```

### 4. Least Privileged Access

**Implementation:**
- **Minimal Capabilities:** Extensions declare only what they need
- **Read/Write Separation:** Filesystem and git separate read/write permissions
- **Operation-Level Control:** Network intents still checked against allowlist
- **No Privilege Escalation:** Extensions cannot request runtime permission changes
- **Narrowest Scope:** Glob patterns should be as specific as possible

**Best Practice Examples:**
```json
// Good: Specific patterns
{
  "filesystem": {
    "read": ["src/**/*.js", "package.json"],
    "write": ["dist/**"]
  }
}

// Bad: Overly broad
{
  "filesystem": {
    "read": ["**/*"],  // Everything!
    "write": ["**/*"]  // Everything!
  }
}
```

### 5. Segment Access

**Implementation:**
- **Extension Isolation:** Each extension has separate token buckets and circuit breakers
- **Per-Type Executors:** Filesystem, network, git, and process executors are independent
- **Circuit Breaker Isolation:** Failures in one type don't affect others
- **Registry Separation:** User extensions and bundled extensions in separate registries
- **Namespace Isolation:** Extension IDs prevent collision

**Isolation Boundaries:**
```
Extension A                    Extension B
    ↓                              ↓
Token Bucket A                Token Bucket B
    ↓                              ↓
Circuit Breakers (FS/Net)     Circuit Breakers (FS/Net)
    ↓                              ↓
Audit Log (tagged)            Audit Log (tagged)
```

### 6. Secure by Default

**Implementation:**
- **Fail-Closed Validation:** Any validation error prevents extension loading
- **Default Deny:** No declared capability = access denied
- **Secure Defaults:** Rate limits default to conservative values if not specified
- **Immutable Intents:** Intent objects are frozen after creation
- **No Dynamic Permissions:** Extensions cannot request new capabilities at runtime

**Fail-Closed Examples:**
```javascript
// Authorization Layer
authorize(intent) {
  const checker = this.permissionCheckers.get(intent.extensionId);
  
  // Fail-closed: no checker = deny
  if (!checker) {
    return { authorized: false, reason: 'Extension not registered' };
  }
  
  // Fail-closed: no match = deny
  if (!matchedPattern) {
    return { authorized: false, reason: 'No matching pattern' };
  }
}
```

### 7. End-to-End Security

**Implementation:**
- **Gateway to Execution:** Every layer validates independently
- **No Bypass:** All intents flow through complete pipeline
- **Audit Trail:** Every operation logged with request ID for tracing
- **Error Propagation:** Failures at any layer stop pipeline execution
- **State Consistency:** Circuit breaker and rate limit state persists across requests

**Pipeline Guarantees:**
```
Intent → Intercept (MUST pass) 
      → Authorization (MUST pass)
      → Audit (MUST pass)
      → Execute (MAY fail, but safely)
      → Result

If ANY layer fails: entire request fails
No layer can be skipped
Failure reason always logged
```

---

## Extension Developer Quickstart

This quickstart guides developers through creating, validating, and installing their first Ghost CLI extension. References deliverables T1.1-T1.8.

### Prerequisites

```bash
# Install Ghost CLI globally
npm install -g atlasia-ghost

# Verify installation
ghost --version
```

### Step 1: Create Extension (T1.1, T1.5)

Use the `ghost extension init` command to scaffold a new extension:

```bash
# Create extension directory and scaffold files
ghost extension init my-first-extension --author "Your Name"

# Navigate to extension directory
cd my-first-extension

# Install dependencies
npm install
```

**Generated Files:**
```
my-first-extension/
├── manifest.json      # Extension metadata and capabilities
├── index.js          # Main extension code with SDK
├── package.json      # NPM configuration
├── README.md         # Documentation template
└── .gitignore        # Git ignore patterns
```

### Step 2: Review Manifest (T1.2, T1.3)

Open `manifest.json` and review the generated capability contract:

```json
{
  "id": "my-first-extension",
  "name": "My First Extension",
  "version": "1.0.0",
  "description": "My First Extension extension for Ghost CLI",
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
        "bc": 100
      }
    },
    "git": {
      "read": true,
      "write": false
    }
  },
  
  "permissions": [
    "filesystem:read",
    "git:read"
  ]
}
```

**Key Fields (see Manifest Schema Reference for complete details):**

- **id:** Unique identifier (lowercase alphanumeric with hyphens)
- **main:** Entry point file (must exist)
- **capabilities:** Zero Trust capability declarations
  - **filesystem:** Glob patterns for read/write access
  - **network:** Allowlist URLs + rate limits (trTCM)
  - **git:** Read/write permission booleans
- **permissions:** High-level permission enumeration

### Step 3: Customize Capabilities (T1.2)

Edit capabilities based on your extension's needs. Follow the principle of least privilege:

```json
{
  "capabilities": {
    "filesystem": {
      "read": [
        "src/**/*.js",      // Only JS files in src/
        "package.json"       // Just package.json
      ],
      "write": [
        "dist/**"            // Only dist/ output directory
      ]
    },
    
    "network": {
      "allowlist": [
        "https://api.github.com"  // Only GitHub API
      ],
      "rateLimit": {
        "cir": 30,            // 30 requests per minute
        "bc": 60,             // Burst to 60
        "be": 20              // Extra 20 for spikes
      }
    },
    
    "git": {
      "read": true,          // Can read git status, log, etc.
      "write": false         // Cannot commit, push, etc.
    }
  }
}
```

**Capability Guidelines:**
- Use specific glob patterns, not `**/*`
- Only allowlist necessary domains
- Set rate limits based on expected usage
- Default to read-only unless write is required

### Step 4: Implement Extension Logic (T1.7)

Open `index.js` and implement your extension using the SDK:

```javascript
const { ExtensionSDK } = require('@ghost/extension-sdk');

class MyFirstExtension {
    constructor() {
        this.sdk = new ExtensionSDK('my-first-extension');
    }

    /**
     * Example command: analyze JavaScript files
     */
    async analyze(params) {
        try {
            // Read package.json
            const packageContent = await this.sdk.requestFileRead({
                path: './package.json'
            });
            const pkg = JSON.parse(packageContent);
            
            // Get git status
            const gitStatus = await this.sdk.requestGitStatus(['--short']);
            
            // Return results
            return {
                success: true,
                output: {
                    projectName: pkg.name,
                    version: pkg.version,
                    gitStatus: gitStatus.stdout
                }
            };
            
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Example command: fetch data from API
     */
    async fetchData(params) {
        try {
            const { url } = params;
            
            // Make network request (must be in allowlist)
            const response = await this.sdk.requestNetworkCall({
                url: url,
                method: 'GET',
                headers: {
                    'User-Agent': 'Ghost-CLI-Extension'
                }
            });
            
            return {
                success: true,
                output: {
                    statusCode: response.statusCode,
                    data: JSON.parse(response.body)
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

module.exports = MyFirstExtension;
```

**SDK Methods Available (see Developer Toolkit docs for complete API):**

**Filesystem:**
- `requestFileRead({path, encoding?})`
- `requestFileWrite({path, content, encoding?})`
- `requestFileReadDir({path})`
- `requestFileStat({path})`

**Network:**
- `requestNetworkCall({url, method?, headers?, body?})`

**Git:**
- `requestGitExec({operation, args?})`
- `requestGitStatus(args?)`
- `requestGitLog(args?)`
- `requestGitDiff(args?)`

### Step 5: Validate Extension (T1.6, T1.8)

Run validation to check manifest and simulate permission requests:

```bash
ghost extension validate
```

**Validation Output:**
```
Validating extension at: /path/to/my-first-extension

✓ Valid JSON syntax
✓ Valid extension id: my-first-extension
✓ Extension name: My First Extension
✓ Valid version: 1.0.0
✓ Main file exists: index.js
✓ Capabilities defined
  - Filesystem read: 2 pattern(s)
  - Filesystem write: 1 pattern(s)
  - Network allowlist: 1 domain(s)
  - Git read: enabled

Simulating permission requests:
✓ filesystem:read src/utils.js - matches pattern "src/**/*.js"
✓ filesystem:write dist/output.js - matches pattern "dist/**"
✓ network:https https://api.github.com/user - in allowlist
✓ git:status - read permission granted

✓ Extension is valid!

Ready to install with: ghost extension install .
```

**Common Validation Errors:**

```
✗ Invalid extension id (must be lowercase with hyphens)
  Fix: Change "MyExtension" to "my-extension"

✗ Main file not found: src/index.js
  Fix: Ensure main file exists or update "main" field

✗ capabilities.network.allowlist: Invalid URL format
  Fix: Include protocol: "https://api.example.com"

✗ capabilities.filesystem.read must be an array
  Fix: Change "read": "**/*" to "read": ["**/*"]
```

### Step 6: Install Extension (T1.4)

Install the validated extension locally:

```bash
# Install from current directory
ghost extension install .

# Or specify path
ghost extension install ./my-first-extension
```

**Installation Process:**
1. Copy extension to `~/.ghost/extensions/my-first-extension`
2. Validate manifest (fail-closed)
3. Register with Gateway
4. Register with IOPipeline
5. Confirm installation

**Installation Output:**
```
Installing extension from: /path/to/my-first-extension

✓ Extension validated
✓ Files copied to ~/.ghost/extensions/my-first-extension
✓ Extension registered with Gateway
✓ Capabilities registered with Pipeline

Extension installed successfully!

Usage:
  ghost analyze
  ghost fetchData --url https://api.github.com/user
```

### Step 7: Test Extension (T1.7)

Test your extension commands:

```bash
# Run analyze command
ghost analyze

# Run fetchData command
ghost fetchData --url https://api.github.com/user

# Use verbose mode to see pipeline execution
ghost analyze --verbose
```

**Verbose Output Example:**
```
[INTERCEPT] Message validated
[INTERCEPT] Intent created: filesystem.read
[AUTH] Checking permission: filesystem:read
[AUTH] Pattern matched: "src/**/*.js"
[AUTH] Authorization granted
[AUDIT] NIST SI-10 validation passed
[AUDIT] No violations detected
[EXECUTE] Filesystem executor: read
[EXECUTE] Operation completed: 1.2ms
[RESULT] Success: true
```

### Step 8: Review Audit Logs

Review the audit log to see all operations:

```bash
# View audit log
cat ~/.ghost/audit.log

# Or use grep to filter
grep "my-first-extension" ~/.ghost/audit.log
```

**Audit Log Entry Example:**
```json
{
  "timestamp": "2024-01-15T10:30:45.123Z",
  "type": "INTENT",
  "requestId": "my-first-extension-123456",
  "extensionId": "my-first-extension",
  "intentType": "filesystem",
  "operation": "read",
  "authorized": true,
  "validated": true,
  "violations": [],
  "warnings": [],
  "params": {"path": "./package.json"}
}
```

### Step 9: Debug Common Issues

**Issue: Permission Denied**
```
Error: AUTH_PERMISSION_DENIED
Reason: Path "./config/secrets.json" does not match any declared patterns
```

**Solution:** Add pattern to manifest:
```json
{
  "filesystem": {
    "read": [
      "src/**/*.js",
      "config/*.json"  // Add this
    ]
  }
}
```

**Issue: Rate Limit Exceeded**
```
Error: AUTH_RATE_LIMIT
Reason: Rate limit exceeded
State: {available: 0, capacity: 100, cir: 60}
```

**Solution:** Increase rate limits:
```json
{
  "network": {
    "rateLimit": {
      "cir": 120,  // Increase from 60
      "bc": 200    // Increase from 100
    }
  }
}
```

**Issue: URL Not in Allowlist**
```
Error: AUTH_PERMISSION_DENIED
Reason: URL "https://api.example.com/data" not in allowlist
```

**Solution:** Add domain to allowlist:
```json
{
  "network": {
    "allowlist": [
      "https://api.github.com",
      "https://api.example.com"  // Add this
    ]
  }
}
```

### Next Steps

1. **Read Full Documentation:**
   - [Extension API Reference](../docs/extension-api.md)
   - [Extension Examples](../docs/extension-examples.md)
   - [Developer Toolkit](../docs/DEVELOPER_TOOLKIT.md)

2. **Explore SDK Features:**
   - Batch operations with `RPCClient.sendBatch()`
   - Low-level intent building with `IntentBuilder`
   - Error handling patterns

3. **Publish Extension:**
   - Update README with usage instructions
   - Add tests
   - Publish to NPM (optional)
   - Share with community

---

## Deliverables Summary

### T1.1: Gateway Implementation
**Status:** ✅ Complete

**File:** `core/gateway.js`

**Features:**
- Pure extension orchestration (zero business logic)
- ExtensionLoader integration for discovery and validation
- Extension registry with Map-based storage
- Deterministic routing (first-registered wins)
- Fail-closed security model
- Graceful cleanup on shutdown

**Key Methods:**
- `initialize()` - Discover and register extensions
- `executeExtension(id, method, ...args)` - Route execution
- `listExtensions()` - Query registered extensions
- `unloadExtension(id)` - Remove extension

### T1.2: Manifest Schema
**Status:** ✅ Complete

**File:** `core/manifest-schema.json`

**Features:**
- JSON Schema Draft-07 compliant
- Required fields: id, name, version, main, capabilities
- Capability definitions for filesystem, network, git, hooks
- Rate limiting configuration (trTCM parameters)
- Comprehensive validation rules
- Extensive examples for each capability

**Capabilities:**
- Filesystem: Glob patterns for read/write
- Network: URL allowlisting + rate limits
- Git: Read/write permissions
- Hooks: Git lifecycle hooks

### T1.3: Manifest Validation
**Status:** ✅ Complete

**File:** `core/extension-loader.js`

**Features:**
- Fail-closed manifest validation
- Required field validation (id, name, version, main, capabilities)
- Format validation (id pattern, semver, URLs)
- Capability structure validation
- Main file existence check
- Comprehensive error reporting

**Validation Rules:**
- ID: `^[a-z0-9-]+$` pattern
- Version: `^\d+\.\d+\.\d+$` semver
- Filesystem: Array validation for read/write
- Network: URL format + rate limit integers
- Git: Boolean validation
- Hooks: Enum validation

### T1.4: Pipeline Integration
**Status:** ✅ Complete

**File:** `core/pipeline/index.js`

**Features:**
- Four-layer pipeline (Intercept → Auth → Audit → Execute)
- Extension registration with manifest
- Message processing with stage-by-stage error handling
- Audit log integration
- Rate limit and circuit breaker state queries
- Stream processing support

**Pipeline Flow:**
```
Raw Message → Intercept → Authorization → Audit → Execute → Result
              (validate)  (permissions)   (NIST)   (operate)
```

### T1.5: Extension Init Command
**Status:** ✅ Complete

**Usage:** `ghost extension init <name> [--author <name>]`

**Features:**
- Scaffolds complete extension project
- Generates manifest.json with sensible defaults
- Creates index.js with SDK integration
- Adds package.json with dependencies
- Includes README.md template
- Creates .gitignore with standard patterns

**Generated Files:**
- `manifest.json` - Minimal capability declarations
- `index.js` - ExtensionSDK boilerplate
- `package.json` - NPM configuration
- `README.md` - Documentation template
- `.gitignore` - Node.js ignore patterns

### T1.6: Extension Validate Command
**Status:** ✅ Complete

**Usage:** `ghost extension validate [path]`

**Features:**
- JSON syntax validation
- Schema validation against manifest-schema.json
- Required field verification
- Format validation (id, version)
- Main file existence check
- Capability syntax validation
- Permission simulation

**Validation Checks:**
1. JSON parse success
2. Schema compliance
3. Required fields present
4. Field formats valid
5. Main file exists
6. Capability structures valid
7. Sample intents authorized

### T1.7: Extension SDK
**Status:** ✅ Complete

**Package:** `@ghost/extension-sdk`

**Features:**
- High-level API methods for I/O operations
- JSON-RPC intent building
- Error handling helpers
- TypeScript definitions
- Batch operation support

**API Classes:**
- `ExtensionSDK` - High-level helper methods
- `IntentBuilder` - Build JSON-RPC intents
- `RPCClient` - Low-level RPC communication

**Methods:**
- Filesystem: `requestFileRead()`, `requestFileWrite()`, `requestFileReadDir()`, `requestFileStat()`
- Network: `requestNetworkCall()`
- Git: `requestGitExec()`, `requestGitStatus()`, `requestGitLog()`, `requestGitDiff()`

### T1.8: Documentation
**Status:** ✅ Complete

**Files:**
- `docs/extension-api.md` - Complete I/O intent schema
- `docs/extension-examples.md` - Working examples
- `docs/DEVELOPER_TOOLKIT.md` - Complete toolkit guide
- `docs/QUICK_REFERENCE.md` - Quick reference card
- `core/SPRINT1_SUMMARY.md` - This document

**Documentation Coverage:**
- Gateway architecture diagrams
- Manifest schema reference
- Pipeline layer contracts
- Zero Trust design principles
- Extension developer quickstart
- Complete API reference
- Working code examples
- Best practices

---

## Testing and Validation

All Sprint 1 deliverables have been tested:

**Test Files:**
- `test/gateway/pipeline.integration.test.js` - Gateway + Pipeline integration
- `test/auth.test.js` - Authorization layer (800+ lines, comprehensive coverage)
- `test/audit.test.js` - NIST SI-10 compliance validation
- `test/pipeline.test.js` - End-to-end pipeline testing
- `test/intercept.test.js` - Intent validation
- `test/circuit-breaker.test.js` - Execution layer resilience

**Coverage Areas:**
- Manifest validation (fail-closed)
- Glob pattern matching
- URL allowlist checking
- Rate limiting (token bucket)
- Traffic policing (trTCM)
- NIST SI-10 validation
- Circuit breaker states
- Intent schema validation

**Run Tests:**
```bash
npm test
```

---

## References

**Core Files:**
- `core/gateway.js` - Gateway orchestrator
- `core/extension-loader.js` - Discovery and validation
- `core/manifest-schema.json` - Capability contract schema
- `core/pipeline/index.js` - Four-layer pipeline
- `core/pipeline/intercept.js` - Message validation
- `core/pipeline/auth.js` - Authorization layer
- `core/pipeline/audit.js` - NIST SI-10 compliance
- `core/pipeline/execute.js` - Execution layer

**Documentation:**
- `docs/DEVELOPER_TOOLKIT.md` - Complete developer guide
- `docs/extension-api.md` - API reference
- `docs/extension-examples.md` - Code examples
- `docs/QUICK_REFERENCE.md` - Quick reference

**Test Coverage:**
- `test/gateway/` - Gateway integration tests
- `test/auth.test.js` - 800+ lines authorization testing
- `test/audit.test.js` - NIST compliance testing
- `test/pipeline.test.js` - End-to-end testing

**Standards:**
- RFC 2698: Two-Rate Three-Color Marker (trTCM)
- NIST SP 800-53 SI-10: Information Input Validation
- JSON-RPC 2.0: Remote procedure call protocol
- JSON Schema Draft-07: Schema validation

---

## Glossary

**Terms:**
- **Gateway:** Pure orchestration layer for extension management
- **IOPipeline:** Four-layer security processing pipeline
- **Intent:** Normalized I/O request with type, operation, params
- **Manifest:** JSON contract defining extension capabilities
- **trTCM:** Two-Rate Three-Color Marker traffic policing algorithm
- **Zero Trust:** Security model requiring explicit verification
- **Fail-Closed:** Security model where validation failures prevent execution
- **Circuit Breaker:** Resilience pattern preventing cascading failures

**Acronyms:**
- **CIR:** Committed Information Rate (requests per minute)
- **Bc:** Burst Committed (maximum burst tokens)
- **Be:** Burst Excess (additional burst capacity)
- **NIST:** National Institute of Standards and Technology
- **SI-10:** System and Information Integrity - Input Validation
- **SSRF:** Server-Side Request Forgery
- **RPC:** Remote Procedure Call
- **SDK:** Software Development Kit
