# Extension Isolation and Functionality Test Suite

This directory contains tests proving extension isolation and end-to-end functionality.

## Test Files

### isolation.test.js
Tests proving crashing extensions don't affect gateway or other extensions.

**Tests:**
1. Crashing extension does not kill runtime
2. Multiple extensions run in isolation
3. Crash isolation - working extension unaffected by crash
4. Extension auto-restart after crash
5. Extension state isolation verification
6. Runtime continues after extension failure
7. Timeout handling doesn't block other extensions
8. Clean shutdown of all extensions
9. Extension error events propagate correctly
10. Process-level isolation verification

**Coverage:**
- Extension crash handling
- Auto-restart with exponential backoff
- Process-level isolation (separate PIDs)
- Error event propagation
- Timeout isolation
- Runtime stability under extension failures
- State isolation between extensions
- Clean shutdown procedures

### git-extension.test.js
End-to-end tests of Git extension functionality via gateway.

**Tests:**
1. Git extension initialization
2. Check Git repository
3. Get staged diff
4. Shannon entropy calculation
5. Secret scanning
6. Semver parsing and manipulation
7. Conventional commit message parsing
8. RPC request handling
9. RPC error handling
10. Extension factory function
11. Gateway integration - extension registration
12. Gateway - authorized git read operation
13. Gateway - unauthorized git write operation
14. Version file operations (package.json)
15. GhostIgnore pattern loading
16. Security audit through gateway blocks secrets
17. Extension method getStagedDiff via RPC
18. Extension maintains state across calls
19. Concurrent request handling
20. End-to-end git operation through full pipeline

**Coverage:**
- Git extension core functionality
- RPC communication layer
- Semver operations (parse, bump, compare)
- Conventional commit parsing
- Security scanning (entropy, secrets)
- Gateway authorization for git operations
- Read vs write permission enforcement
- Version management features
- Concurrent request handling
- Full pipeline integration (intercept → auth → audit → execute)

## Running Tests

Run individual test files:
```bash
node test/extensions/isolation.test.js
node test/extensions/git-extension.test.js
```

Run all extension tests:
```bash
npm test
```

## Isolation Guarantees Proven

These tests prove:
1. ✅ Extensions run in isolated processes (separate PIDs)
2. ✅ Extension crashes don't affect gateway or other extensions
3. ✅ Failed extensions auto-restart with limits
4. ✅ Extension timeouts don't block gateway
5. ✅ Extension state is isolated (no cross-contamination)
6. ✅ Gateway continues operating when extensions fail
7. ✅ Error events propagate without blocking
8. ✅ Clean shutdown handles all extension states

## Functionality Guarantees Proven

These tests prove:
1. ✅ Git extension functions correctly through gateway
2. ✅ RPC communication works bidirectionally
3. ✅ Authorization enforces manifest permissions
4. ✅ Security scanning detects secrets and high entropy
5. ✅ Semver operations work correctly
6. ✅ Conventional commits parsed for version bumps
7. ✅ Concurrent requests handled properly
8. ✅ Full pipeline validates all operations
9. ✅ Read/write permissions enforced separately
10. ✅ Extension maintains state across calls
