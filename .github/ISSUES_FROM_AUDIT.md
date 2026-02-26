# GitHub Issues to Create from Security Audit

This file contains the issue descriptions to be manually created on GitHub based on the Sprint 9 Security Audit.

---

## Issue 1: [SECURITY] Fix command injection vulnerability in GitExecutor

**Labels:** security, high-priority  
**Milestone:** Sprint 10  
**Priority:** HIGH

### Description

The `GitExecutor._executeGitCommand()` method uses `execAsync` with string concatenation, creating a command injection vulnerability despite upstream validation.

**Location:** `core/pipeline/execute.js:354-374`  
**Finding ID:** EXEC-001

### Risk Assessment

**Impact:** HIGH - Attackers could execute arbitrary commands on the host system if validation is bypassed or has gaps.

**Likelihood:** MEDIUM - Requires validation bypass, but shell expansion is enabled by default.

**Affected Components:**
- [x] Execute Layer
- [ ] Gateway
- [ ] Auth Layer
- [ ] Audit Layer
- [ ] Runtime
- [ ] Validators

### Current Implementation

```javascript
async _executeGitCommand(operation, args, cwd, timeout) {
    const gitArgs = [operation, ...args];
    const result = await execAsync(`git ${gitArgs.join(' ')}`, { cwd });
    // ^^^ VULNERABLE: Shell expansion enabled by default
}
```

### Remediation

Replace `exec` with `execFile` to disable shell expansion:

```javascript
const { execFile } = require('child_process');
const execFileAsync = promisify(execFile);

async _executeGitCommand(operation, args, cwd, timeout) {
    const gitArgs = [operation, ...args];
    
    try {
        const result = await TimeoutManager.withTimeout(
            execFileAsync('git', gitArgs, { 
                cwd,
                shell: false,  // Explicitly disable shell
                maxBuffer: 10 * 1024 * 1024
            }),
            timeout || 30000
        );
        
        return {
            success: true,
            stdout: result.stdout,
            stderr: result.stderr
        };
    } catch (error) {
        throw new ExecutionError(
            `Git command failed: ${error.message}`,
            'EXEC_GIT_ERROR',
            { stderr: error.stderr }
        );
    }
}
```

### Testing Requirements

- [x] Unit tests added for Git command execution
- [x] Security test case with shell metacharacters
- [x] Integration tests with real Git operations
- [x] Manual verification with malicious inputs

**Estimated Effort:** 3 hours

### References

- CWE-78: OS Command Injection
- OWASP A03:2021 - Injection

---

## Issue 2: [SECURITY] Address DNS rebinding TOCTOU race condition

**Labels:** security, high-priority  
**Milestone:** Sprint 10  
**Priority:** HIGH

### Description

Time-of-check-time-of-use race condition between DNS resolution in `NetworkValidator` and actual HTTP request in `NetworkExecutor` allows DNS rebinding attacks.

**Location:** `core/validators/network-validator.js:269-307`  
**Finding ID:** NET-001

### Attack Scenario

1. Extension requests `https://evil.com`
2. Validator resolves `evil.com` → `1.2.3.4` (valid public IP) → **APPROVED**
3. DNS cache expires or attacker controls authoritative DNS
4. Execution layer makes request to `evil.com`
5. DNS now resolves `evil.com` → `169.254.169.254` (metadata service) → **EXPLOITED**

### Risk Assessment

**Impact:** HIGH - Access to cloud metadata endpoints, internal services, localhost

**Likelihood:** MEDIUM - Requires attacker-controlled DNS but is a well-known attack

**Affected Components:**
- [x] Execute Layer
- [x] Validators
- [ ] Gateway
- [ ] Auth Layer
- [ ] Audit Layer
- [ ] Runtime

### Current Implementation

```javascript
async resolveAndValidate(urlString) {
    // ... validation ...
    const lookupResult = await dns.lookup(hostname);
    const resolvedIP = lookupResult.address;
    
    if (this.isPrivateIP(resolvedIP)) {
        return { valid: false, reason: 'Private IP blocked' };
    }
    
    // Later: NetworkExecutor makes request using hostname, not IP
    // TOCTOU race window here!
}
```

### Remediation

1. Cache DNS resolution result and pass to executor
2. Use resolved IP directly in HTTP request
3. Add TTL expiration checks

**In NetworkValidator:**
```javascript
async resolveAndValidate(urlString) {
    // ... validation code ...
    
    const lookupResult = await dns.lookup(hostname);
    const resolvedIP = lookupResult.address;
    
    // Validate resolved IP
    if (this.isLocalhostIP(resolvedIP) && !this.allowLocalhostIPs) {
        return { valid: false, reason: `DNS resolves to localhost` };
    }
    
    return {
        valid: true,
        parsed: parsedURL,
        resolvedIP: resolvedIP,
        resolvedAt: Date.now(),
        ttl: 300000  // 5 minutes
    };
}
```

**In NetworkExecutor:**
```javascript
async _request(protocol, params, validationResult) {
    const url = new URL(params.url);
    
    // Check TTL expiration
    if (validationResult?.resolvedAt) {
        const age = Date.now() - validationResult.resolvedAt;
        if (age > validationResult.ttl) {
            throw new ExecutionError(
                'DNS resolution expired, re-validation required',
                'EXEC_DNS_EXPIRED'
            );
        }
    }
    
    // Use resolved IP to prevent TOCTOU
    const targetHost = validationResult?.resolvedIP || url.hostname;
    
    const options = {
        hostname: targetHost,  // Use resolved IP
        port: url.port || (protocol === https ? 443 : 80),
        path: url.pathname + url.search,
        method: params.method || 'GET',
        headers: {
            ...params.headers,
            'Host': url.hostname  // Set Host header for virtual hosting
        }
    };
    
    // ... rest of request
}
```

### Testing Requirements

- [x] Unit tests for DNS resolution caching
- [x] Security test simulating DNS rebinding
- [x] TTL expiration tests
- [x] Integration tests with real DNS

**Estimated Effort:** 6 hours

### References

- DNS Rebinding Attack: https://en.wikipedia.org/wiki/DNS_rebinding
- CWE-367: Time-of-check Time-of-use (TOCTOU) Race Condition
- OWASP A10:2021 - Server-Side Request Forgery (SSRF)

---

## Issue 3: [SECURITY] Implement audit log file protection

**Labels:** security, medium-priority  
**Milestone:** Sprint 11  
**Priority:** MEDIUM

### Description

Audit log file (`~/.ghost/audit.log`) is created with default permissions and not protected against tampering or deletion.

**Location:** `core/pipeline/audit.js:32-60`  
**Finding ID:** AUDIT-001

### Risk Assessment

**Impact:** MEDIUM - Log tampering, deletion, disk exhaustion

**Likelihood:** MEDIUM - Extension with filesystem write access could exploit

**Affected Components:**
- [x] Audit Layer
- [ ] Gateway
- [ ] Auth Layer
- [ ] Execute Layer
- [ ] Runtime
- [ ] Validators

### Current Implementation

```javascript
constructor(logPath) {
    this.logPath = logPath || path.join(os.homedir(), '.ghost', 'audit.log');
    this._ensureLogDirectory();
    // No permission setting, no rotation, no integrity protection
}
```

### Remediation

```javascript
constructor(logPath) {
    this.logPath = logPath || path.join(os.homedir(), '.ghost', 'audit.log');
    this._ensureLogDirectory();
    this._setRestrictivePermissions();
    this._initializeLogRotation();
}

_setRestrictivePermissions() {
    if (fs.existsSync(this.logPath)) {
        fs.chmodSync(this.logPath, 0o600); // Owner read/write only
    }
    
    const dir = path.dirname(this.logPath);
    fs.chmodSync(dir, 0o700); // Owner only directory access
}

_initializeLogRotation() {
    this.maxLogSize = 10 * 1024 * 1024; // 10MB
    this.maxLogFiles = 5;
}

log(entry) {
    // Check file size before writing
    if (fs.existsSync(this.logPath)) {
        const stats = fs.statSync(this.logPath);
        if (stats.size > this.maxLogSize) {
            this._rotateLog();
        }
    }
    
    const immutableEntry = Object.freeze({
        timestamp: new Date().toISOString(),
        ...entry
    });

    const logLine = JSON.stringify(immutableEntry) + '\n';
    fs.appendFileSync(this.logPath, logLine, { 
        encoding: 'utf8', 
        flag: 'a',
        mode: 0o600 
    });

    return immutableEntry;
}

_rotateLog() {
    // Rotate logs: audit.log -> audit.log.1 -> audit.log.2 -> ...
    for (let i = this.maxLogFiles - 1; i >= 1; i--) {
        const oldPath = `${this.logPath}.${i}`;
        const newPath = `${this.logPath}.${i + 1}`;
        if (fs.existsSync(oldPath)) {
            if (i === this.maxLogFiles - 1) {
                fs.unlinkSync(oldPath); // Delete oldest
            } else {
                fs.renameSync(oldPath, newPath);
            }
        }
    }
    
    if (fs.existsSync(this.logPath)) {
        fs.renameSync(this.logPath, `${this.logPath}.1`);
    }
}
```

### Testing Requirements

- [x] Test log file permissions after creation
- [x] Test log rotation at size limit
- [x] Test concurrent write safety
- [x] Test permission preservation after rotation

**Estimated Effort:** 6 hours

### References

- NIST SP 800-53 AU-9: Protection of Audit Information
- CWE-532: Insertion of Sensitive Information into Log File

---

## Issue 4: [SECURITY] Sanitize environment variables in ProcessExecutor

**Labels:** security, medium-priority  
**Milestone:** Sprint 11  
**Priority:** MEDIUM

### Description

ProcessExecutor's `_spawn()` allows arbitrary environment variable injection, which could enable privilege escalation.

**Location:** `core/pipeline/execute.js:397-448`  
**Finding ID:** EXEC-002

### Risk Assessment

**Impact:** HIGH - Privilege escalation, code execution

**Likelihood:** LOW - Requires process:spawn permission, but dangerous if granted

**Affected Components:**
- [x] Execute Layer
- [ ] Gateway
- [ ] Auth Layer
- [ ] Audit Layer
- [ ] Runtime
- [ ] Validators

### Remediation

```javascript
_sanitizeEnvironment(env) {
    const allowedVars = new Set([
        'HOME', 'USER', 'LANG', 'LC_ALL', 'TZ',
        'GHOST_EXTENSION_ID', 'GHOST_EXTENSION_MODE'
    ]);
    
    const blockedVars = new Set([
        'LD_PRELOAD', 'LD_LIBRARY_PATH', 'DYLD_INSERT_LIBRARIES',
        'PATH', 'BASH_ENV', 'ENV', 'PROMPT_COMMAND'
    ]);
    
    const sanitized = {};
    for (const [key, value] of Object.entries(env || {})) {
        if (blockedVars.has(key)) {
            throw new ExecutionError(
                `Blocked environment variable: ${key}`,
                'EXEC_ENV_BLOCKED'
            );
        }
        if (allowedVars.has(key)) {
            sanitized[key] = value;
        }
    }
    
    return sanitized;
}

async _spawn(params) {
    return new Promise((resolve, reject) => {
        const sanitizedEnv = this._sanitizeEnvironment(params.env);
        
        const proc = spawn(params.command, params.args || [], {
            cwd: params.cwd || process.cwd(),
            env: sanitizedEnv  // Use sanitized environment
        });
        
        // ... rest of spawn logic
    });
}
```

**Estimated Effort:** 4 hours

### References

- CWE-426: Untrusted Search Path
- CWE-427: Uncontrolled Search Path Element

---

## Issue 5: [SECURITY] Use clean environment for extension processes

**Labels:** security, medium-priority  
**Milestone:** Sprint 11  
**Priority:** MEDIUM

### Description

Extension processes inherit full parent environment, potentially exposing sensitive data like API keys.

**Location:** `core/runtime.js:428-436`  
**Finding ID:** RUNTIME-001

### Remediation

```javascript
_buildCleanEnvironment() {
    const allowedKeys = [
        'PATH', 'HOME', 'USER', 'LANG', 'TZ', 'NODE_PATH'
    ];
    
    const cleanEnv = {};
    for (const key of allowedKeys) {
        if (process.env[key]) {
            cleanEnv[key] = process.env[key];
        }
    }
    
    cleanEnv.GHOST_EXTENSION_ID = this.extensionId;
    cleanEnv.GHOST_EXTENSION_MODE = 'subprocess';
    
    return cleanEnv;
}

// In _spawnProcess():
this.process = spawn('node', [mainFile], {
    stdio: ['pipe', 'pipe', 'pipe'],
    cwd: this.extensionPath,
    env: this._buildCleanEnvironment()
});
```

**Estimated Effort:** 3 hours

---

## Issue 6: [SECURITY] Add glob pattern complexity limits

**Labels:** security, medium-priority  
**Milestone:** Sprint 11  
**Priority:** MEDIUM

### Description

Complex glob patterns could cause ReDoS through catastrophic backtracking.

**Location:** `core/pipeline/auth.js:4-34`  
**Finding ID:** AUTH-002

### Remediation

```javascript
static validateGlobComplexity(pattern) {
    const maxWildcards = 10;
    const maxDepth = 5;
    
    const wildcardCount = (pattern.match(/\*/g) || []).length;
    const depth = pattern.split('/').length;
    
    if (wildcardCount > maxWildcards) {
        throw new Error(`Glob pattern exceeds maximum wildcards: ${maxWildcards}`);
    }
    if (depth > maxDepth) {
        throw new Error(`Glob pattern exceeds maximum depth: ${maxDepth}`);
    }
    return true;
}

static match(str, pattern) {
    // Validate complexity first
    this.validateGlobComplexity(pattern);
    
    // ... rest of matching logic
}
```

**Estimated Effort:** 4 hours

---

## Issue 7: [TESTING] Create comprehensive security test suite

**Labels:** testing, security  
**Milestone:** Sprint 12  
**Priority:** MEDIUM

### Description

Create security-focused test suite covering injection attacks, SSRF, auth bypasses, and fuzzing.

**Estimated Effort:** 20 hours

### Test Files to Create

1. `test/security/injection-tests.js`
   - Command injection attempts
   - Path traversal attacks
   - Null-byte injection

2. `test/security/ssrf-tests.js`
   - Private IP access attempts
   - Localhost bypass attempts
   - DNS rebinding simulation
   - URL obfuscation techniques

3. `test/security/auth-tests.js`
   - Rate limit bypass attempts
   - Permission escalation attempts
   - Capability boundary violations

4. `test/security/fuzzing-tests.js`
   - Malformed JSON-RPC messages
   - Extreme-length inputs
   - Unicode/special character handling

---

## Low Priority Issues (Backlog)

### Issue 8: [HARDENING] Add access control to rate limit state queries
- **Finding ID:** AUTH-001
- **Effort:** 2 hours

### Issue 9: [HARDENING] Use generic redaction messages
- **Finding ID:** AUDIT-002
- **Effort:** 1 hour

### Issue 10: [HARDENING] Add JSON-RPC message size limits
- **Finding ID:** RUNTIME-002
- **Effort:** 2 hours

### Issue 11: [HARDENING] Improve secret detection false positive rate
- **Finding ID:** ENTROPY-001
- **Effort:** 4 hours

---

## Informational / Long-term (Future Sprints)

### Issue 12: [ARCHITECTURE] Refactor launcher to eliminate pipeline bypasses
- **Finding ID:** GATEWAY-001
- **Effort:** 16 hours
- **Description:** Move extension install/remove operations through pipeline

### Issue 13: [HARDENING] Implement process isolation hardening
- **Effort:** 40 hours
- **Description:** Add containers, seccomp-bpf, resource limits

### Issue 14: [HARDENING] Add manifest signature verification
- **Effort:** 20 hours
- **Description:** Cryptographic signing for extension manifests

### Issue 15: [HARDENING] Global telemetry data sanitization
- **Effort:** 2 hours
- **Description:** Apply sanitization to all telemetry, not just verbose output
