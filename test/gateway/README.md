# Gateway and Security Test Suite

This directory contains comprehensive integration and security tests for the Ghost CLI Gateway.

## Test Files

### pipeline.integration.test.js
Full pipeline integration tests with mock extensions issuing valid and invalid I/O intents.

**Tests:**
1. Valid filesystem read through full pipeline
2. Invalid intent schema (missing type) rejection at intercept
3. Unauthorized filesystem write blocked at authorization
4. Path traversal attempt blocked at audit (NIST SI-10)
5. Network request with rate limiting
6. Command injection attempt blocked at audit
7. Secret detection in write content
8. Multiple valid intents from same extension
9. Audit log verification
10. Pipeline state inspection

**Coverage:**
- All 4 pipeline layers (Intercept → Auth → Audit → Execute)
- Valid and invalid intent processing
- Authorization enforcement
- NIST SI-10 validation
- Audit logging
- Rate limiting integration

### rate-limiter.test.js
Token bucket math validation, burst handling, and violation dropping tests.

**Tests:**
1. TokenBucket initialization
2. Token consumption
3. Insufficient tokens rejection
4. Token refill over time (simulated)
5. Token cap at capacity
6. RateLimitManager initialization and checking
7. RateLimitManager exceeding limits
8. RateLimitManager reset
9. Two-Rate Three-Color Token Bucket (trTCM) - green traffic
10. Yellow (exceeding) traffic classification
11. Red (violating) traffic classification
12. TrafficPolicer integration with drop policy
13. TrafficPolicer burst handling
14. TrafficPolicer violation dropping
15. Token bucket refill math validation
16. Burst size enforcement
17. Multiple extensions rate limit isolation

**Coverage:**
- Single-rate token bucket (CIR + BC)
- Two-rate three-color token bucket (CIR + BC + BE)
- Token refill algorithms
- Burst capacity handling
- Traffic classification (green/yellow/red)
- Violation dropping
- Rate limit isolation between extensions

### nist-si10.test.js
NIST SI-10 input validation tests - path traversal, command injection, SSRF attempts.

**Tests:**
1. Path traversal attack detection (..)
2. Complex path traversal patterns
3. Command injection detection (shell operators)
4. SSRF attempt detection (localhost)
5. SSRF attempt with 127.0.0.1
6. Invalid protocol blocking (file://, ftp://, gopher://)
7. AWS key detection in parameters
8. Private key detection in write content
9. Entropy scanner for high-entropy data
10. Shannon entropy calculation validation
11. Valid filesystem operations pass validation
12. Valid network request passes validation
13. Valid process command passes validation
14. Secret sanitization
15. Multiple violations detection
16. Edge cases (empty/null inputs)
17. File extension and path allowlist warnings
18. Git operations validation
19. Invalid URL detection
20. Non-standard command warnings

**Coverage:**
- Path traversal attacks (SI-10-PATH-TRAVERSAL)
- Command injection (SI-10-COMMAND-INJECTION)
- SSRF attempts (SI-10-LOCALHOST-ACCESS)
- Invalid protocols (SI-10-PROTOCOL-ALLOWLIST)
- Secret detection (SI-10-SECRET-DETECTION)
- Content secrets (SI-10-CONTENT-SECRETS)
- URL validation (SI-10-URL-VALIDATION)
- Command allowlist (SI-10-COMMAND-ALLOWLIST)
- Path allowlist (SI-10-PATH-ALLOWLIST)
- Shannon entropy calculation
- Secret sanitization

## Running Tests

Run individual test files:
```bash
node test/gateway/pipeline.integration.test.js
node test/gateway/rate-limiter.test.js
node test/gateway/nist-si10.test.js
```

Run all gateway tests:
```bash
npm test
```

## Security Guarantees Proven

These tests prove:
1. ✅ Gateway isolates extensions from system resources
2. ✅ All I/O operations go through 4-layer validation pipeline
3. ✅ NIST SI-10 input validation blocks common attacks
4. ✅ Rate limiting enforces QoS and prevents abuse
5. ✅ Secret detection prevents credential leaks
6. ✅ Audit logging tracks all security events
7. ✅ Authorization layer enforces manifest permissions
8. ✅ Violations are logged and blocked before execution
