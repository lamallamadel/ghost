# Security Remediation Checklist - Sprint 9 Audit

**Audit Date:** 2024-01-XX  
**Target Completion:** Sprint 12  
**Last Updated:** 2024-01-XX

---

## Sprint 10: High-Priority Fixes (9 hours)

### ⬜ EXEC-001: Fix Command Injection in GitExecutor

**Priority:** 🔴 HIGH | **Effort:** 3 hours | **Assignee:** _____________

**Checklist:**
- [ ] Replace `execAsync` with `execFileAsync` in `core/pipeline/execute.js`
- [ ] Explicitly set `shell: false` option
- [ ] Add maxBuffer limit (10MB)
- [ ] Update error handling for execFile differences
- [ ] Add unit test with shell metacharacters
- [ ] Add integration test with real Git operations
- [ ] Update documentation if API changed
- [ ] Code review completed
- [ ] Merged to main

**Verification:**
```bash
# Test with malicious input
node -e "const exec = require('./core/pipeline/execute'); exec.GitExecutor.execute('status', {args: ['; whoami']});"
# Should fail safely without executing whoami
```

---

### ⬜ NET-001: Fix DNS Rebinding TOCTOU Race

**Priority:** 🔴 HIGH | **Effort:** 6 hours | **Assignee:** _____________

**Checklist:**
- [ ] Add `resolvedIP`, `resolvedAt`, `ttl` to validation result in `core/validators/network-validator.js`
- [ ] Update `NetworkExecutor._request()` to use resolved IP
- [ ] Set `Host` header to original hostname for virtual hosting
- [ ] Add TTL expiration check before execution
- [ ] Add unit tests for DNS resolution caching
- [ ] Add integration test simulating DNS rebinding
- [ ] Add test for TTL expiration handling
- [ ] Update pipeline to pass validation result to executor
- [ ] Code review completed
- [ ] Merged to main

**Verification:**
```bash
# Test TOCTOU prevention
# 1. Start mock DNS server that changes resolution
# 2. Make request through Ghost
# 3. Verify resolved IP is used, not re-resolved hostname
```

---

## Sprint 11: Medium-Priority Fixes (17 hours)

### ⬜ AUDIT-001: Implement Audit Log Protection

**Priority:** 🟡 MEDIUM | **Effort:** 6 hours | **Assignee:** _____________

**Checklist:**
- [ ] Add `_setRestrictivePermissions()` method to AuditLogger
- [ ] Set file permissions to 0600 on log file
- [ ] Set directory permissions to 0700 on log directory
- [ ] Implement `_initializeLogRotation()` method
- [ ] Implement `_rotateLog()` method (max 10MB, 5 files)
- [ ] Update `log()` method to check size before write
- [ ] Preserve permissions after rotation
- [ ] Add tests for permission setting
- [ ] Add tests for log rotation
- [ ] Add tests for concurrent write safety
- [ ] Code review completed
- [ ] Merged to main

**Verification:**
```bash
# Check file permissions
ls -la ~/.ghost/audit.log
# Should show: -rw------- (600)

# Test rotation
dd if=/dev/zero of=~/.ghost/audit.log bs=1M count=11
ghost audit-log view  # Should trigger rotation
ls -la ~/.ghost/audit.log*
# Should show: audit.log, audit.log.1, audit.log.2, etc.
```

---

### ⬜ EXEC-002: Sanitize Environment Variables

**Priority:** 🟡 MEDIUM | **Effort:** 4 hours | **Assignee:** _____________

**Checklist:**
- [ ] Create `_sanitizeEnvironment()` method in ProcessExecutor
- [ ] Define allowed environment variables whitelist
- [ ] Define blocked environment variables blacklist
- [ ] Throw error on blocked variable detection
- [ ] Update `_spawn()` to use sanitized environment
- [ ] Add unit tests for sanitization logic
- [ ] Add test for blocked variable rejection
- [ ] Add test for allowed variable passthrough
- [ ] Update documentation
- [ ] Code review completed
- [ ] Merged to main

**Verification:**
```bash
# Test blocked variable
LD_PRELOAD=/tmp/evil.so ghost process spawn ls
# Should fail with "Blocked environment variable: LD_PRELOAD"
```

---

### ⬜ RUNTIME-001: Use Clean Environment for Extensions

**Priority:** 🟡 MEDIUM | **Effort:** 3 hours | **Assignee:** _____________

**Checklist:**
- [ ] Create `_buildCleanEnvironment()` method in ExtensionProcess
- [ ] Define minimal allowed environment variables
- [ ] Update `_spawnProcess()` to use clean environment
- [ ] Add tests for environment isolation
- [ ] Verify sensitive variables not inherited
- [ ] Add documentation on extension environment
- [ ] Code review completed
- [ ] Merged to main

**Verification:**
```bash
# Create test extension that prints environment
# Verify API keys, tokens not visible in extension process
```

---

### ⬜ AUTH-002: Add Glob Pattern Complexity Limits

**Priority:** 🟡 MEDIUM | **Effort:** 4 hours | **Assignee:** _____________

**Checklist:**
- [ ] Create `validateGlobComplexity()` static method in GlobMatcher
- [ ] Set max wildcards limit (10)
- [ ] Set max depth limit (5)
- [ ] Update `match()` to validate complexity first
- [ ] Add tests for complexity limits
- [ ] Add test for ReDoS pattern rejection
- [ ] Update manifest validation to check glob complexity
- [ ] Code review completed
- [ ] Merged to main

**Verification:**
```bash
# Test with complex pattern
ghost extension validate ./malicious-extension
# manifest.json contains: "read": ["**/**/**/**/**/**/**/**/**/**/**/*"]
# Should fail: "Glob pattern exceeds maximum depth"
```

---

## Sprint 12: Security Testing (20 hours)

### ⬜ Create Security Test Suite

**Priority:** 🟡 MEDIUM | **Effort:** 20 hours | **Assignee:** _____________

**Checklist:**
- [ ] Create `test/security/` directory
- [ ] Implement `injection-tests.js`
  - [ ] Command injection tests
  - [ ] Path traversal tests
  - [ ] Null-byte injection tests
- [ ] Implement `ssrf-tests.js`
  - [ ] Private IP access tests
  - [ ] Localhost bypass tests
  - [ ] DNS rebinding simulation
  - [ ] URL obfuscation tests
- [ ] Implement `auth-tests.js`
  - [ ] Rate limit bypass tests
  - [ ] Permission escalation tests
  - [ ] Capability boundary tests
- [ ] Implement `fuzzing-tests.js`
  - [ ] Malformed JSON-RPC tests
  - [ ] Extreme-length input tests
  - [ ] Unicode handling tests
- [ ] Integrate with CI/CD pipeline
- [ ] Document test suite usage
- [ ] Code review completed
- [ ] Merged to main

**Verification:**
```bash
npm run test:security
# All security tests should pass
```

---

## Backlog: Low-Priority Items (9 hours)

### ⬜ AUTH-001: Rate Limit State Access Control

**Priority:** 🟢 LOW | **Effort:** 2 hours

**Checklist:**
- [ ] Add `requestingExtensionId` parameter to `getRateLimitState()`
- [ ] Validate requesting extension can only query own state
- [ ] Add tests for access control
- [ ] Update callers to pass requesting extension ID
- [ ] Code review and merge

---

### ⬜ AUDIT-002: Generic Redaction Messages

**Priority:** 🟢 LOW | **Effort:** 1 hour

**Checklist:**
- [ ] Update `_sanitizeParams()` to use generic "[REDACTED]" message
- [ ] Remove detection method from redaction message
- [ ] Add tests
- [ ] Code review and merge

---

### ⬜ RUNTIME-002: JSON-RPC Message Size Limits

**Priority:** 🟢 LOW | **Effort:** 2 hours

**Checklist:**
- [ ] Add MAX_MESSAGE_SIZE constant (1MB)
- [ ] Add size check in `_handleMessage()`
- [ ] Emit error event for oversized messages
- [ ] Add tests
- [ ] Code review and merge

---

### ⬜ ENTROPY-001: Improve Secret Detection

**Priority:** 🟢 LOW | **Effort:** 4 hours

**Checklist:**
- [ ] Add context-aware validation for AWS keys
- [ ] Improve regex patterns with surrounding keywords
- [ ] Add more known non-secrets
- [ ] Tune entropy thresholds
- [ ] Measure false positive rate improvement
- [ ] Code review and merge

---

## Future Enhancements (78+ hours)

### ⬜ GATEWAY-001: Refactor Launcher Pipeline Bypasses

**Priority:** 🔵 INFO | **Effort:** 16 hours

**Status:** Architecture discussion needed

**Checklist:**
- [ ] Design system extension for installer operations
- [ ] Implement ghost-installer-extension
- [ ] Refactor `handleExtensionCommand()` to use pipeline
- [ ] Update tests
- [ ] Performance impact assessment
- [ ] Code review and merge

---

### ⬜ Process Isolation Hardening

**Priority:** 🔵 INFO | **Effort:** 40 hours

**Status:** Feature planning phase

**Checklist:**
- [ ] Research Node.js container integration
- [ ] Design namespace isolation approach
- [ ] Implement user namespace support
- [ ] Implement network namespace support
- [ ] Implement seccomp-bpf filters
- [ ] Add resource limits (cgroups)
- [ ] Comprehensive testing
- [ ] Documentation
- [ ] Code review and merge

---

### ⬜ Manifest Signature Verification

**Priority:** 🔵 INFO | **Effort:** 20 hours

**Status:** Specification needed

**Checklist:**
- [ ] Design signature scheme (RSA, Ed25519?)
- [ ] Create signing tool
- [ ] Update manifest schema with signature fields
- [ ] Implement signature verification in loader
- [ ] Handle key distribution/trust
- [ ] Update documentation
- [ ] Code review and merge

---

### ⬜ Global Telemetry Sanitization

**Priority:** 🔵 INFO | **Effort:** 2 hours

**Checklist:**
- [ ] Apply `_sanitizeParams()` to all telemetry
- [ ] Update `_logTelemetry()` method
- [ ] Add tests
- [ ] Code review and merge

---

## Progress Tracking

### Overall Status

| Sprint | Planned Hours | Completed Hours | % Complete |
|--------|---------------|-----------------|------------|
| Sprint 10 | 9 | 0 | 0% |
| Sprint 11 | 17 | 0 | 0% |
| Sprint 12 | 20 | 0 | 0% |
| Backlog | 9 | 0 | 0% |
| **Total Critical Path** | **46** | **0** | **0%** |

### By Priority

| Priority | Total Issues | Completed | % Complete |
|----------|--------------|-----------|------------|
| 🔴 HIGH | 2 | 0 | 0% |
| 🟡 MEDIUM | 4 | 0 | 0% |
| 🟢 LOW | 4 | 0 | 0% |
| 🔵 INFO | 4 | 0 | 0% |

---

## Sprint Planning Notes

### Sprint 10 (Current)

**Team Capacity:** 2 developers × 4 hours each = 8 hours  
**Planned Work:** 9 hours (slightly over capacity)  
**Overflow:** Consider moving NET-001 partially to Sprint 11 if needed

**Key Deliverables:**
- Command injection fixed
- DNS rebinding TOCTOU addressed (or in progress)
- Security test cases for both fixes

---

### Sprint 11

**Team Capacity:** 2 developers × 8 hours each = 16 hours  
**Planned Work:** 17 hours + 3 hours overflow from Sprint 10 = 20 hours  
**Recommendation:** Add one more developer or extend timeline

**Key Deliverables:**
- Audit log protection
- Environment variable sanitization
- Glob pattern complexity limits
- Clean extension environment

---

### Sprint 12

**Team Capacity:** 1 developer × 20 hours = 20 hours  
**Planned Work:** 20 hours (perfect fit)  
**Focus:** Security test suite development

**Key Deliverables:**
- Complete security test suite
- CI/CD integration
- Security documentation updated

---

## Sign-off

### Sprint 10 Completion

- [ ] All high-priority fixes implemented
- [ ] Tests passing
- [ ] Code reviewed
- [ ] Merged to main
- [ ] Deployed to staging
- [ ] Security regression tests pass

**Sign-off by:** _________________ Date: _________

---

### Sprint 11 Completion

- [ ] All medium-priority fixes implemented
- [ ] Tests passing
- [ ] Code reviewed
- [ ] Merged to main
- [ ] Deployed to staging
- [ ] Security regression tests pass

**Sign-off by:** _________________ Date: _________

---

### Sprint 12 Completion

- [ ] Security test suite complete
- [ ] CI/CD integration working
- [ ] All tests green
- [ ] Documentation updated
- [ ] Final security assessment pass

**Sign-off by:** _________________ Date: _________

---

## Notes and Blockers

### Sprint 10

**Blockers:**
- None identified

**Notes:**
- 

---

### Sprint 11

**Blockers:**
- Depends on Sprint 10 completion

**Notes:**
-

---

### Sprint 12

**Blockers:**
- None identified

**Notes:**
-
