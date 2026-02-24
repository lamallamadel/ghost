# 4-Layer I/O Control Pipeline

A security-focused I/O pipeline for extension systems with JSON-RPC message processing, authorization, NIST SI-10 compliance auditing, and controlled execution.

## Architecture

The pipeline consists of 4 sequential layers:

```
┌─────────────────────────────────────────────────────────────┐
│ 1. INTERCEPT (intercept.js)                                 │
│    - JSON-RPC deserialization from extension stdio          │
│    - Normalization into immutable Intent objects            │
│    - Schema validation                                      │
└───────────────────────┬─────────────────────────────────────┘
                        ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. AUTHORIZATION (auth.js)                                  │
│    - Manifest permission checks                             │
│    - Path/URL validation against declared capabilities      │
│    - Per-extension rate limiting (Token Bucket)             │
└───────────────────────┬─────────────────────────────────────┘
                        ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. AUDIT (audit.js)                                         │
│    - NIST SI-10 allowlist validation                        │
│    - Entropy scanning for secrets                           │
│    - Immutable JSON audit log writes                        │
└───────────────────────┬─────────────────────────────────────┘
                        ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. EXECUTE (execute.js)                                     │
│    - Actual fs/network/git/process I/O                      │
│    - Circuit breaker pattern                                │
│    - Timeout enforcement                                    │
│    - Deterministic error codes                              │
└─────────────────────────────────────────────────────────────┘
```

## Quick Start

```javascript
const { IOPipeline } = require('./core/pipeline');

const pipeline = new IOPipeline({
    auditLogPath: '/path/to/audit.log'
});

pipeline.registerExtension('my-extension', {
    id: 'my-extension',
    capabilities: {
        filesystem: {
            read: ['src/**/*.js']
        }
    },
    permissions: ['filesystem:read']
});

const result = await pipeline.process({
    type: 'filesystem',
    operation: 'read',
    params: { path: 'src/index.js' },
    extensionId: 'my-extension'
});

console.log(result);
```

## Layer 1: Intercept

### MessageInterceptor

Handles JSON-RPC message deserialization and normalization.

```javascript
const { MessageInterceptor } = require('./core/pipeline');

const interceptor = new MessageInterceptor();

const intent = interceptor.intercept({
    type: 'filesystem',
    operation: 'read',
    params: { path: 'config.json' },
    extensionId: 'my-ext'
});
```

### Stream Processing

Process continuous streams of JSON-RPC messages:

```javascript
interceptor.processStream(
    process.stdin,
    (intent) => {
        console.log('Intent received:', intent);
    },
    (error) => {
        console.error('Error:', error);
    }
);
```

### Intent Object

Immutable object representing validated I/O intent:

```javascript
{
    type: 'filesystem',           // filesystem, network, git, process
    operation: 'read',            // Operation name
    params: { path: '...' },      // Operation parameters
    extensionId: 'my-ext',        // Extension identifier
    timestamp: 1234567890,        // Unix timestamp
    requestId: 'unique-id'        // Unique request ID
}
```

### Schema Validation

Validates intent structure and parameters:

```javascript
const { IntentSchema } = require('./core/pipeline');

const validation = IntentSchema.validate(intentData);
if (!validation.valid) {
    console.error(validation.errors);
}
```

## Layer 2: Authorization

### AuthorizationLayer

Enforces manifest permissions and rate limits.

```javascript
const { AuthorizationLayer } = require('./core/pipeline');

const auth = new AuthorizationLayer();

auth.registerExtension('my-ext', manifest);

const result = auth.authorize(intent);
if (!result.authorized) {
    console.error(result.reason, result.code);
}
```

### Permission Checks

**Filesystem:**
- Validates paths against glob patterns
- Separate read/write pattern lists
- Path traversal prevention

```javascript
{
    filesystem: {
        read: ['src/**/*.js', '**/*.json'],
        write: ['.ghost/cache/*.json']
    }
}
```

**Network:**
- URL allowlist validation
- Protocol and domain matching
- Rate limiting via Token Bucket

```javascript
{
    network: {
        allowlist: ['https://api.github.com'],
        rateLimit: {
            cir: 60,    // Committed Information Rate (req/min)
            bc: 10      // Burst Committed (max burst)
        }
    }
}
```

**Git:**
- Read/write operation separation
- Operation-level permissions

```javascript
{
    git: {
        read: true,
        write: false
    }
}
```

**Process:**
- Permission-based access control

```javascript
{
    permissions: ['process:spawn']
}
```

### Rate Limiting

Token Bucket algorithm implementation:

```javascript
const state = auth.getRateLimitState('my-ext');
console.log(state);
// { available: 8, capacity: 10, cir: 60, lastRefill: ... }

auth.resetRateLimit('my-ext');
```

## Layer 3: Audit

### AuditLayer

NIST SI-10 compliance and security auditing.

```javascript
const { AuditLayer } = require('./core/pipeline');

const audit = new AuditLayer('/path/to/audit.log');

const result = audit.audit(intent, authResult);
if (!result.passed) {
    console.error(result.violations);
}
```

### NIST SI-10 Validation

**Filesystem:**
- Extension allowlist validation
- Path traversal detection
- Secret scanning in write content

**Network:**
- Protocol allowlist (http/https)
- Localhost access warnings
- URL format validation

**Process:**
- Command allowlist validation
- Command injection detection (&&, ||, ;, |)
- Shell metacharacter filtering

### Entropy Scanning

Detects high-entropy strings and common secret patterns:

```javascript
const { EntropyScanner } = require('./core/pipeline');

const scan = EntropyScanner.scanForSecrets(content);
if (scan.hasSecrets) {
    console.log(scan.findings);
}

const sanitized = EntropyScanner.sanitize(content);
```

**Detected Patterns:**
- AWS keys (AKIA...)
- Private keys (PEM format)
- API keys
- Tokens
- Passwords
- High-entropy strings (> 4.5 bits)

### Audit Logs

Immutable JSON log entries:

```javascript
const logs = audit.getLogs({
    limit: 100,
    filter: {
        extensionId: 'my-ext',
        type: 'SECURITY_EVENT',
        since: '2024-01-01T00:00:00Z'
    }
});
```

**Log Types:**
- `INTENT`: Every intent processed
- `EXECUTION`: Execution results
- `SECURITY_EVENT`: Security violations

## Layer 4: Execute

### ExecutionLayer

Controlled I/O execution with circuit breakers and timeouts.

```javascript
const { ExecutionLayer } = require('./core/pipeline');

const executor = new ExecutionLayer();

try {
    const result = await executor.execute(intent);
    console.log(result);
} catch (error) {
    console.error(error.code, error.message);
}
```

### Filesystem Operations

```javascript
// Read
{ type: 'filesystem', operation: 'read', params: { path: 'file.txt' } }

// Write
{ type: 'filesystem', operation: 'write', params: { path: 'file.txt', content: '...' } }

// Stat
{ type: 'filesystem', operation: 'stat', params: { path: 'file.txt' } }

// Readdir
{ type: 'filesystem', operation: 'readdir', params: { path: 'dir/' } }

// Mkdir
{ type: 'filesystem', operation: 'mkdir', params: { path: 'dir/', recursive: true } }

// Unlink
{ type: 'filesystem', operation: 'unlink', params: { path: 'file.txt' } }

// Rmdir
{ type: 'filesystem', operation: 'rmdir', params: { path: 'dir/', recursive: true } }
```

### Network Operations

```javascript
{
    type: 'network',
    operation: 'https',
    params: {
        url: 'https://api.example.com/data',
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        body: '...',
        timeout: 10000
    }
}
```

### Git Operations

```javascript
{
    type: 'git',
    operation: 'status',
    params: {
        args: ['--short'],
        cwd: '/path/to/repo',
        timeout: 5000
    }
}
```

### Process Operations

```javascript
// Spawn
{
    type: 'process',
    operation: 'spawn',
    params: {
        command: 'git',
        args: ['status'],
        cwd: '/path/to/repo',
        timeout: 5000
    }
}

// Exec
{
    type: 'process',
    operation: 'exec',
    params: {
        command: 'git status',
        cwd: '/path/to/repo',
        timeout: 5000
    }
}
```

### Circuit Breaker

Automatic fault protection:

```javascript
const state = executor.getCircuitBreakerState('network');
console.log(state);
// { state: 'CLOSED', failures: 0, nextAttempt: ... }

executor.resetCircuitBreaker('network');
```

**States:**
- `CLOSED`: Normal operation
- `OPEN`: Too many failures, blocking requests
- `HALF_OPEN`: Testing recovery

**Configuration:**
- Failure threshold: 5 consecutive failures
- Reset timeout: 60 seconds

### Timeout Enforcement

Default timeouts per operation type:
- Filesystem: 30s
- Network: 30s
- Git: 30s
- Process: No default (must specify)

### Error Codes

Deterministic error codes for predictable error handling:

**Intercept:**
- `PIPELINE_INTERCEPT_ERROR`: Deserialization/validation failed

**Authorization:**
- `AUTH_NOT_REGISTERED`: Extension not registered
- `AUTH_PERMISSION_DENIED`: Permission check failed
- `AUTH_RATE_LIMIT`: Rate limit exceeded
- `AUTH_UNKNOWN_TYPE`: Unknown intent type

**Audit:**
- `AUDIT_VALIDATION_FAILED`: NIST SI-10 violation

**Execution - Filesystem:**
- `EXEC_NOT_FOUND`: File/directory not found
- `EXEC_PERMISSION_DENIED`: Access denied
- `EXEC_ALREADY_EXISTS`: File/directory exists
- `EXEC_IS_DIRECTORY`: Expected file, got directory
- `EXEC_NOT_DIRECTORY`: Expected directory, got file
- `EXEC_NOT_EMPTY`: Directory not empty
- `EXEC_FS_ERROR`: General filesystem error

**Execution - Network:**
- `EXEC_HOST_NOT_FOUND`: DNS resolution failed
- `EXEC_CONNECTION_REFUSED`: Connection refused
- `EXEC_TIMEOUT`: Request timeout
- `EXEC_CONNECTION_RESET`: Connection reset
- `EXEC_HOST_UNREACHABLE`: Host unreachable
- `EXEC_NETWORK_ERROR`: General network error

**Execution - Git/Process:**
- `EXEC_GIT_ERROR`: Git command failed
- `EXEC_PROCESS_ERROR`: Process exited with non-zero
- `EXEC_SPAWN_ERROR`: Failed to spawn process
- `EXEC_COMMAND_ERROR`: Command execution failed

**Execution - General:**
- `EXEC_UNKNOWN_OP`: Unknown operation
- `EXEC_NO_EXECUTOR`: No executor for type
- `EXEC_UNKNOWN_ERROR`: Unexpected error
- `CIRCUIT_OPEN`: Circuit breaker is open

## Complete Example

```javascript
const { IOPipeline } = require('./core/pipeline');

const pipeline = new IOPipeline({
    auditLogPath: './audit.log'
});

pipeline.registerExtension('code-analyzer', {
    id: 'code-analyzer',
    capabilities: {
        filesystem: {
            read: ['src/**/*.js', '**/*.json']
        },
        network: {
            allowlist: ['https://api.github.com'],
            rateLimit: { cir: 60, bc: 10 }
        }
    },
    permissions: ['filesystem:read', 'network:https']
});

const requests = [
    {
        type: 'filesystem',
        operation: 'read',
        params: { path: 'src/index.js' },
        extensionId: 'code-analyzer'
    },
    {
        type: 'network',
        operation: 'https',
        params: { url: 'https://api.github.com/repos/user/repo' },
        extensionId: 'code-analyzer'
    }
];

for (const request of requests) {
    const result = await pipeline.process(request);
    
    if (result.success) {
        console.log('Success:', result.result);
    } else {
        console.error(`Failed at ${result.stage}:`, result.error, result.code);
    }
}

const logs = pipeline.getAuditLogs({ limit: 10 });
console.log('Audit logs:', logs);
```

## Security Features

1. **Defense in Depth**: 4 independent validation layers
2. **Least Privilege**: Manifest-declared capabilities only
3. **Rate Limiting**: Token bucket algorithm prevents abuse
4. **Secret Detection**: Entropy scanning and pattern matching
5. **Audit Trail**: Immutable logs for compliance
6. **Circuit Breaker**: Automatic fault isolation
7. **Timeout Enforcement**: Prevents resource exhaustion
8. **Path Traversal Prevention**: Normalized path validation
9. **Command Injection Prevention**: Shell metacharacter detection
10. **Immutable Intents**: Tamper-proof intent objects

## Performance

- **Intercept**: O(1) parsing, O(n) validation
- **Authorization**: O(1) permission lookup, O(n) pattern matching
- **Audit**: O(n) entropy scanning, O(1) log append
- **Execute**: Depends on I/O operation

Memory overhead per extension: ~1KB for state tracking

## Best Practices

1. **Register extensions once** at startup
2. **Reuse pipeline instance** across requests
3. **Set appropriate timeouts** for long operations
4. **Monitor audit logs** for security events
5. **Handle error codes** explicitly in client code
6. **Reset circuit breakers** only when issues resolved
7. **Review rate limit states** during high load
8. **Sanitize sensitive data** before logging
9. **Use specific patterns** in allowlists
10. **Test permissions** before deployment

## Testing

Each layer can be tested independently:

```javascript
const { MessageInterceptor, AuthorizationLayer, AuditLayer, ExecutionLayer } = require('./core/pipeline');

const interceptor = new MessageInterceptor();
const intent = interceptor.intercept(rawMessage);

const auth = new AuthorizationLayer();
auth.registerExtension('test', manifest);
const authResult = auth.authorize(intent);

const audit = new AuditLayer();
const auditResult = audit.audit(intent, authResult);

const executor = new ExecutionLayer();
const execResult = await executor.execute(intent);
```
