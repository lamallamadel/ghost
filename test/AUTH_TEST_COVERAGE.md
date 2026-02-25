# Authorization Layer Test Coverage

This document outlines the comprehensive test coverage for `core/pipeline/auth.js`, validating authorization and rate limiting separation with edge cases.

## Test File
- **Location**: `test/auth.test.js`
- **Total Tests**: 66 comprehensive tests across 8 test suites

## Implementation Enhancements

### 1. GlobMatcher Improvements
- **Normalized path separators**: Windows (`\`) and Unix (`/`) paths handled consistently
- **Escaped special characters**: Brackets `[` and `]` properly escaped in regex
- **Cross-platform compatibility**: Works identically on Windows and Unix systems

### 2. PermissionChecker.checkNetworkAccess Improvements
- **Exact origin matching**: Protocol, domain, and port must match exactly
- **Invalid allowlist entries**: Skipped gracefully without breaking validation
- **Origin construction**: Uses `protocol + '//' + host` for precise matching
- **No prefix matching**: Subdomains are isolated (e.g., `api.example.com` ≠ `example.com`)

### 3. TokenBucket Verification
- **CIR-based refill**: Correctly implements `tokensToAdd = Math.floor((elapsed * cir) / 60)`
- **60 tokens/min**: Refills 1 token/second, 30 tokens/30sec, 60 tokens/minute
- **Capacity capping**: Never exceeds `bc` even with long elapsed time
- **Sub-second handling**: Correctly floors partial tokens (no premature refills)

### 4. TrafficPolicer Integration
- **Drops Violating requests**: Red traffic (exceeds CIR + Be) rejected with `QOS_VIOLATING`
- **Before audit**: Policing happens in authorization layer, preventing violating requests from reaching audit
- **Three-color classification**: Green (within CIR), Yellow (within Be), Red (exceeds both)
- **State persistence**: Token state saved to disk for crash recovery

## Test Suite Breakdown

### Test Suite 1: PermissionChecker - Filesystem Glob Matching (10 tests)
✅ **Validates manifest-declared filesystem capabilities using glob matching**

1. Exact path matching (`package.json`, `README.md`)
2. Single asterisk wildcard (`*.js`, `src/*.ts`)
3. Double asterisk globstar (`**/*.js`, `src/**`)
4. Question mark wildcard (`file?.txt`, `test??.js`)
5. Path normalization (Windows `\` vs Unix `/`)
6. Special characters (dots, dashes)
7. Empty patterns (deny all)
8. Missing filesystem capabilities
9. Read vs write separation
10. Very long paths (50+ directories deep)

**Key Validations**:
- Glob patterns match exactly per minimatch semantics
- `**` matches across directory boundaries
- `*` matches within single directory level
- `?` matches exactly one character
- Windows and Unix paths normalized to forward slashes

### Test Suite 2: PermissionChecker - Network URL Origin Matching (10 tests)
✅ **Validates URL origin matching for network access**

1. Exact origin matching (`https://api.github.com`)
2. Protocol matching (http vs https isolation)
3. Port matching (`:3000`, `:8080` explicit ports)
4. Default port handling (implicit vs explicit)
5. Invalid URLs rejected
6. Empty allowlist (deny all)
7. Missing network capabilities
8. Query parameters and fragments ignored
9. Subdomain isolation (`api.example.com` ≠ `example.com`)
10. Invalid allowlist entries skipped

**Key Validations**:
- Origin = `protocol + '//' + host` (includes port if non-default)
- Exact match required (no prefix matching)
- `https://api.github.com` does NOT match `https://github.com`
- Invalid URLs fail with clear error messages
- Subdomains are isolated (no wildcard matching)

### Test Suite 3: PermissionChecker - Git & Process Access (8 tests)
✅ **Validates git and process capabilities**

1. Git read permissions (status, log, diff, show)
2. Git write permissions (commit, branch, tag, push, reset)
3. Git write denied when not permitted
4. Git read denied when not permitted
5. Missing git capabilities handled
6. Process spawn permissions
7. Process spawn denied without permission
8. Generic permission checking

**Key Validations**:
- Read operations: status, log, diff, show
- Write operations: commit, branch, tag, push, reset
- Fail-closed: defaults to false if not declared
- `process:spawn` permission required for process execution

### Test Suite 4: TokenBucket - CIR-based Refill (10 tests)
✅ **Validates Committed Information Rate (CIR) based token refill**

1. Initial token state (starts at `bc`)
2. Token consumption (decrement by consumed amount)
3. Consumption failure (insufficient tokens)
4. CIR-based refill calculation (60 tokens/min = 1 token/sec)
5. Different CIR rates (100 tokens/min)
6. Sub-second intervals (< 1 second = 0 tokens)
7. Zero tokens boundary
8. Exactly bc tokens boundary
9. State reporting accuracy
10. Very high CIR values (10,000 tokens/min)

**Key Validations**:
- Formula: `tokensToAdd = Math.floor((elapsed * cir) / 60)`
- 60 tokens/min: 1 token/sec, 30 tokens/30sec, 60 tokens/60sec
- Capped at `bc`: never exceeds burst committed
- Sub-second intervals floored to 0 (no partial tokens)
- `lastRefill` only updated when tokens actually added

### Test Suite 5: RateLimitManager (7 tests)
✅ **Validates rate limit management per extension**

1. Bucket initialization
2. Multiple extensions isolated
3. Rate limit check success (within limit)
4. Rate limit check failure (over limit)
5. Bucket reset
6. Bucket cleanup
7. Unregistered extension handling

**Key Validations**:
- Each extension has isolated token bucket
- Extensions don't affect each other's limits
- Reset restores to full capacity
- Cleanup removes bucket state
- Unregistered extensions denied with clear message

### Test Suite 6: TrafficPolicer Integration & Violating Request Dropping (7 tests)
✅ **Validates TrafficPolicer drops Violating requests BEFORE audit**

1. TrafficPolicer drops violating requests with `QOS_VIOLATING` code
2. Green traffic (within CIR) passes authorization
3. Yellow traffic (within Be) passes authorization
4. TrafficPolicer state accessible
5. All states retrievable
6. Extensions without rate limit rejected with `QOS_NOT_CONFIGURED`
7. Cleanup removes all rate limiting state

**Key Validations**:
- **RED traffic (Violating)**: Rejected with `QOS_VIOLATING` before reaching audit
- **GREEN traffic (Conforming)**: Within CIR, uses committed tokens
- **YELLOW traffic (Exceeding)**: Exceeds CIR but within Be, uses excess tokens
- Two-Rate Three-Color Marker (trTCM RFC 2698) correctly implemented
- `dropViolating` flag enforces rejection of red traffic
- State persisted to `~/.ghost/rate-limits.json`

### Test Suite 7: AuthorizationLayer Integration - End-to-End (6 tests)
✅ **Validates complete authorization flow**

1. Complete filesystem intent authorization
2. Complete network intent authorization with rate limiting
3. Complete git intent authorization
4. Complete process intent authorization
5. Unknown intent type rejected
6. Unregistered extension rejected

**Key Validations**:
- Filesystem: glob matching, read/write separation
- Network: origin matching + TrafficPolicer + RateLimitManager (dual layer)
- Git: read/write separation
- Process: permission-based
- Error codes: `AUTH_NOT_REGISTERED`, `AUTH_UNKNOWN_TYPE`, `AUTH_PERMISSION_DENIED`, `QOS_VIOLATING`, `QOS_NOT_CONFIGURED`

### Test Suite 8: Edge Cases & Boundary Conditions (8 tests)
✅ **Validates edge cases and boundary conditions**

1. Empty manifest capabilities
2. Null/undefined manifest fields
3. Very long URLs (5000+ character paths)
4. Concurrent token consumption
5. Zero CIR edge case (no refill)
6. Very small bc values (bc=1)
7. Multiple filesystem operation types (read, write, mkdir, unlink, rmdir)
8. Rate limit exactly at boundary (consume all 100 tokens)

**Key Validations**:
- Empty/null manifests fail-closed (deny all)
- Long URLs handled without errors
- Concurrent requests handled correctly
- Zero CIR = no token refills
- bc=1 works (minimum viable bucket)
- All filesystem operations mapped to read/write
- Exact boundary conditions (100/100 tokens) handled

## Authorization Flow

```
Intent → PermissionChecker
         ├─ Filesystem: Glob pattern matching
         ├─ Network: URL origin matching
         │   └─ If allowed → TrafficPolicer (drops RED)
         │       └─ If allowed → RateLimitManager
         ├─ Git: Read/write permissions
         └─ Process: Permission check

Result: { authorized, reason, code, metadata?, qos? }
```

## Key Findings

### ✅ PermissionChecker Validation
- **Filesystem**: Glob matching works correctly with `**`, `*`, `?` patterns
- **Network**: Exact origin matching enforced (no prefix/wildcard matching)
- **Git**: Read/write separation enforced
- **Process**: Permission-based access control

### ✅ TokenBucket CIR Validation
- **Refill formula**: `Math.floor((elapsed * cir) / 60)` correctly implements CIR
- **Rate**: 60 CIR = 1 token/second sustained rate
- **Capping**: Never exceeds `bc` capacity
- **Precision**: Sub-second intervals correctly floored to 0

### ✅ TrafficPolicer Integration Validation
- **Placement**: Policing occurs BEFORE audit (in authorization layer)
- **Dropping**: Violating (RED) requests rejected with `QOS_VIOLATING` code
- **Three-color**: Green/Yellow pass, Red fails
- **Dual-layer**: TrafficPolicer (trTCM) + RateLimitManager (simple token bucket)

## Error Codes

| Code | Reason | Source |
|------|--------|--------|
| `AUTH_NOT_REGISTERED` | Extension not registered | AuthorizationLayer |
| `AUTH_UNKNOWN_TYPE` | Unknown intent type | AuthorizationLayer |
| `AUTH_PERMISSION_DENIED` | Permission check failed | PermissionChecker |
| `AUTH_RATE_LIMIT` | Rate limit exceeded | RateLimitManager |
| `QOS_VIOLATING` | Traffic violating rate limits (RED) | TrafficPolicer |
| `QOS_NOT_CONFIGURED` | No traffic policing config | TrafficPolicer |

## Conclusion

The implementation correctly enforces:

1. ✅ **Authorization and rate limiting separation**: Two distinct mechanisms with clear responsibilities
2. ✅ **PermissionChecker**: Manifest-declared capabilities enforced via glob matching (filesystem) and origin matching (network)
3. ✅ **TokenBucket**: CIR-based refill correctly implemented per RFC 2698
4. ✅ **TrafficPolicer**: Violating requests dropped BEFORE audit with proper error codes
5. ✅ **Edge cases**: All boundary conditions, null values, and extreme inputs handled safely
6. ✅ **Fail-closed security**: Undeclared permissions denied by default

All 66 tests pass, validating correct implementation of Zero Trust authorization model.
