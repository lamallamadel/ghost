# Circuit Breaker and Execution Layer Test Documentation

## Overview

This document details the comprehensive test suite for the execution layer's circuit breaker implementation, timeout management, and I/O executor isolation in `core/pipeline/execute.js`.

**File:** `test/circuit-breaker.test.js`  
**Tests:** 29  
**Lines:** ~550

## Test Categories

### 1. Circuit Breaker State Transitions (9 tests)

Tests the complete circuit breaker state machine implementation following the standard pattern:

```
CLOSED --[5 failures]--> OPEN --[60s timeout]--> HALF_OPEN
                                                      |
                                   [success]----------+----------[failure]
                                        |                            |
                                        v                            v
                                     CLOSED                         OPEN
```

#### Test 1: CircuitBreaker initialization
- Verifies default state is `CLOSED`
- Confirms failure count starts at `0`
- Validates `failureThreshold` defaults to `5`
- Validates `resetTimeout` defaults to `60000ms` (60 seconds)

#### Test 2: CircuitBreaker with custom options
- Tests constructor accepts custom `failureThreshold`
- Tests constructor accepts custom `resetTimeout`
- Ensures options override defaults correctly

#### Test 3: CircuitBreaker CLOSED → OPEN transition after 5 failures
- Simulates 5 consecutive failures
- Verifies state remains `CLOSED` for failures 1-4
- Confirms transition to `OPEN` at exactly 5 failures
- Validates failure counter increments correctly

#### Test 4: CircuitBreaker rejects requests when OPEN
- Sets circuit to `OPEN` state with future `nextAttempt` time
- Attempts to execute function
- Verifies `ExecutionError` thrown with code `CIRCUIT_OPEN`
- Confirms error message mentions circuit is OPEN

#### Test 5: CircuitBreaker OPEN → HALF_OPEN after reset timeout (60s)
- Sets circuit to `OPEN` state
- Sets `nextAttempt` to past time (simulating 60s elapsed)
- Executes successful function
- Verifies function executes (proving HALF_OPEN transition)
- Confirms transition to `CLOSED` on success
- Validates failures reset to `0`

#### Test 6: CircuitBreaker HALF_OPEN → CLOSED on success
- Simulates HALF_OPEN state (OPEN with expired timeout)
- Executes successful function
- Verifies return value passed through
- Confirms state transitions to `CLOSED`
- Validates failures counter reset

#### Test 7: CircuitBreaker HALF_OPEN → OPEN on failure
- Simulates HALF_OPEN state
- Executes failing function
- Verifies state returns to `OPEN`
- Confirms failures increment (5 → 6)

#### Test 8: CircuitBreaker getState() returns current state
- Tests state inspection API
- Verifies returns `{ state, failures, nextAttempt }`
- Confirms values match internal state

#### Test 9: CircuitBreaker reset() clears state
- Sets circuit to OPEN with failures
- Calls `reset()` method
- Verifies state returns to `CLOSED`
- Confirms failures reset to `0`
- Validates `nextAttempt` reset

### 2. Timeout Management (3 tests)

Tests the `TimeoutManager` class enforces operation timeouts.

#### Test 10: TimeoutManager enforces 30s default timeout
- Starts promise that would take 35s
- Calls `withTimeout()` with no custom timeout
- Verifies timeout occurs around 30s (30000ms)
- Confirms `ExecutionError` thrown with code `EXEC_TIMEOUT`
- Validates error message mentions timeout duration

#### Test 11: TimeoutManager respects custom timeout
- Starts promise that would take 3s
- Calls `withTimeout()` with 1s timeout
- Verifies timeout occurs around 1s
- Confirms error mentions custom timeout value

#### Test 12: TimeoutManager allows completion before timeout
- Calls `withTimeout()` with fast-completing promise
- Verifies result returned successfully
- Confirms no timeout error thrown

### 3. Deterministic Error Codes (1 test)

Tests that `ExecutionError` provides consistent, machine-readable error codes.

#### Test 13: ExecutionError has deterministic error codes
- Creates various `ExecutionError` instances
- Verifies inheritance from `Error`
- Confirms `name` property set to `'ExecutionError'`
- Validates error codes are deterministic:
  - `EXEC_TIMEOUT` - Operation timed out
  - `EXEC_NOT_FOUND` - Resource not found
  - `EXEC_PERMISSION_DENIED` - Access denied
  - `EXEC_ALREADY_EXISTS` - Resource already exists
  - `CIRCUIT_OPEN` - Circuit breaker open
- Tests details object storage

### 4. Filesystem Executor I/O Isolation (4 tests)

Tests that `FilesystemExecutor` is a pure I/O shim without validation or authorization logic.

#### Test 14: FilesystemExecutor only performs I/O without validation
- Verifies executor has circuit breaker
- Confirms presence of I/O methods (`_read`, `_write`, etc.)
- Tests actual file read operation
- Validates no authorization/validation logic present

#### Test 15: FilesystemExecutor maps error codes correctly
- Tests error code mapping from Node.js to execution codes:
  - `ENOENT` → `EXEC_NOT_FOUND`
  - `EACCES` → `EXEC_PERMISSION_DENIED`
  - `EEXIST` → `EXEC_ALREADY_EXISTS`
  - `EISDIR` → `EXEC_IS_DIRECTORY`
  - `ENOTDIR` → `EXEC_NOT_DIRECTORY`
  - `ENOTEMPTY` → `EXEC_NOT_EMPTY`
  - Unknown → `EXEC_FS_ERROR`

#### Test 25: FilesystemExecutor rejects unknown operations
- Attempts invalid operation
- Verifies `ExecutionError` thrown
- Confirms error code is `EXEC_UNKNOWN_OP`

#### Test 28: FilesystemExecutor respects timeout parameter
- Tests timeout parameter is honored
- Verifies `ExecutionError` on timeout

### 5. Network Executor I/O Isolation (2 tests)

Tests that `NetworkExecutor` is a pure I/O shim.

#### Test 16: NetworkExecutor only performs I/O without validation
- Verifies executor has circuit breaker
- Confirms presence of I/O methods (`_request`)
- Validates no authorization/validation logic present

#### Test 17: NetworkExecutor maps error codes correctly
- Tests error code mapping:
  - `ENOTFOUND` → `EXEC_HOST_NOT_FOUND`
  - `ECONNREFUSED` → `EXEC_CONNECTION_REFUSED`
  - `ETIMEDOUT` → `EXEC_TIMEOUT`
  - `ECONNRESET` → `EXEC_CONNECTION_RESET`
  - `EHOSTUNREACH` → `EXEC_HOST_UNREACHABLE`
  - Unknown → `EXEC_NETWORK_ERROR`

### 6. Git Executor I/O Isolation (1 test)

Tests that `GitExecutor` is a pure I/O shim.

#### Test 18: GitExecutor only performs I/O without validation
- Verifies executor has circuit breaker
- Confirms presence of git command executor
- Validates no authorization/validation logic present

### 7. Process Executor I/O Isolation (2 tests)

Tests that `ProcessExecutor` is a pure I/O shim.

#### Test 19: ProcessExecutor only performs I/O without validation
- Verifies executor has circuit breaker
- Confirms presence of I/O methods (`_spawn`, `_exec`)
- Validates no authorization/validation logic present

#### Test 26: ProcessExecutor rejects unknown operations
- Attempts invalid operation
- Verifies `ExecutionError` thrown
- Confirms error code is `EXEC_UNKNOWN_OP`

### 8. Executor Configuration (2 tests)

Tests that all executors are properly configured with circuit breakers.

#### Test 20: All executors have circuit breakers
- Instantiates all four executor types
- Verifies each has `CircuitBreaker` instance
- Confirms default threshold of `5`
- Confirms default timeout of `60000ms`

#### Test 29: Executors are I/O shims without authorization logic
- Introspects all executor prototypes
- Verifies no methods containing "auth", "authorize", "permission", or "validate"
- Confirms executors are pure I/O shims

### 9. Execution Layer Integration (4 tests)

Tests the `ExecutionLayer` that manages all executors.

#### Test 21: ExecutionLayer manages all executors
- Verifies presence of all executor types:
  - `filesystem` → `FilesystemExecutor`
  - `network` → `NetworkExecutor`
  - `git` → `GitExecutor`
  - `process` → `ProcessExecutor`

#### Test 22: ExecutionLayer provides circuit breaker state inspection
- Tests `getCircuitBreakerState()` method
- Verifies returns state for valid types
- Confirms returns `null` for invalid types

#### Test 23: ExecutionLayer can reset circuit breakers
- Sets executor circuit breaker to OPEN
- Calls `resetCircuitBreaker(type)`
- Verifies circuit breaker reset to CLOSED

#### Test 24: ExecutionLayer wraps unknown errors as ExecutionError
- Attempts to execute with invalid type
- Verifies `ExecutionError` thrown
- Confirms error code is `EXEC_NO_EXECUTOR`

### 10. State Machine Validation (1 test)

Documents the complete circuit breaker state machine.

#### Test 27: Circuit breaker state transitions are complete
- Documents all valid state transitions:
  - `CLOSED → OPEN` (5 failures)
  - `OPEN → HALF_OPEN` (timeout passed)
  - `HALF_OPEN → CLOSED` (success)
  - `HALF_OPEN → OPEN` (failure)

## Verified Properties

### ✅ Circuit Breaker Behavior
1. Opens after exactly 5 failures
2. Resets after 60 seconds
3. Transitions through HALF_OPEN state correctly
4. Rejects requests when OPEN
5. Allows probe request after timeout

### ✅ Timeout Enforcement
1. Default timeout is 30 seconds (30000ms)
2. Custom timeouts are respected
3. Fast operations complete without timeout
4. Timeout errors are deterministic (`EXEC_TIMEOUT`)

### ✅ Error Code Determinism
1. All errors use consistent codes
2. Node.js error codes mapped to execution codes
3. Error codes are machine-readable strings
4. Error details are preserved

### ✅ I/O Executor Isolation
1. **FilesystemExecutor**: Pure I/O, no validation
2. **NetworkExecutor**: Pure I/O, no validation
3. **GitExecutor**: Pure I/O, no validation
4. **ProcessExecutor**: Pure I/O, no validation
5. All executors wrapped in circuit breakers
6. No authorization logic in executors
7. Unknown operations rejected with `EXEC_UNKNOWN_OP`

### ✅ Execution Layer Management
1. Manages all four executor types
2. Provides state inspection API
3. Allows manual circuit breaker reset
4. Wraps unknown errors as `ExecutionError`

## Circuit Breaker Configuration

```javascript
{
  failureThreshold: 5,      // Opens after 5 consecutive failures
  resetTimeout: 60000       // Waits 60s before attempting recovery
}
```

## Timeout Configuration

```javascript
TimeoutManager.DEFAULT_TIMEOUT = 30000;  // 30 seconds
```

## Error Code Reference

### Circuit Breaker Errors
- `CIRCUIT_OPEN` - Circuit breaker is open, rejecting requests

### Timeout Errors
- `EXEC_TIMEOUT` - Operation exceeded timeout limit

### Filesystem Errors
- `EXEC_NOT_FOUND` - File/directory not found (ENOENT)
- `EXEC_PERMISSION_DENIED` - Access denied (EACCES)
- `EXEC_ALREADY_EXISTS` - Resource already exists (EEXIST)
- `EXEC_IS_DIRECTORY` - Expected file, got directory (EISDIR)
- `EXEC_NOT_DIRECTORY` - Expected directory, got file (ENOTDIR)
- `EXEC_NOT_EMPTY` - Directory not empty (ENOTEMPTY)
- `EXEC_FS_ERROR` - Generic filesystem error

### Network Errors
- `EXEC_HOST_NOT_FOUND` - DNS lookup failed (ENOTFOUND)
- `EXEC_CONNECTION_REFUSED` - Connection refused (ECONNREFUSED)
- `EXEC_CONNECTION_RESET` - Connection reset (ECONNRESET)
- `EXEC_HOST_UNREACHABLE` - Host unreachable (EHOSTUNREACH)
- `EXEC_NETWORK_ERROR` - Generic network error

### Git Errors
- `EXEC_GIT_ERROR` - Git command failed

### Process Errors
- `EXEC_PROCESS_ERROR` - Process exited with non-zero code
- `EXEC_SPAWN_ERROR` - Failed to spawn process
- `EXEC_COMMAND_ERROR` - Command execution failed

### Execution Layer Errors
- `EXEC_NO_EXECUTOR` - No executor found for intent type
- `EXEC_UNKNOWN_OP` - Unknown operation for executor
- `EXEC_UNKNOWN_ERROR` - Unexpected error during execution

## Running the Tests

```bash
# Run all tests
npm test

# Run only circuit breaker tests
node test/circuit-breaker.test.js

# Expected runtime: ~30-35 seconds
# (Tests 10 and 11 intentionally wait for timeouts)
```

## Test Output

```
🧪 Testing Circuit Breaker State Transitions and Execution Layer...

▶ Test 1: CircuitBreaker initialization
✅ CircuitBreaker initializes with correct defaults

▶ Test 2: CircuitBreaker with custom options
✅ CircuitBreaker accepts custom options

▶ Test 3: CircuitBreaker CLOSED → OPEN transition after 5 failures
✅ Circuit breaker opens after 5 failures

[... 26 more tests ...]

▶ Test 29: Executors are I/O shims without authorization logic
✅ Executors are pure I/O shims without authorization logic

🎉 All circuit breaker and execution layer tests passed!
```

## Architecture Notes

### Separation of Concerns

The execution layer follows a clear separation of concerns:

1. **Intercept Layer** - JSON-RPC validation (not tested here)
2. **Authorization Layer** - Permission checking (not tested here)
3. **Audit Layer** - NIST SI-10 validation (not tested here)
4. **Execution Layer** - Pure I/O operations (tested here)

The executors in the execution layer:
- **Do NOT** validate inputs
- **Do NOT** check permissions
- **Do NOT** perform security checks
- **ONLY** execute I/O operations and map errors

This design ensures:
- Clean separation between policy and mechanism
- Single responsibility principle
- Easier testing and reasoning
- No bypass paths to system resources

### Circuit Breaker Pattern

The circuit breaker protects the system from cascading failures:

1. **Closed State**: Normal operation, requests pass through
2. **Open State**: Too many failures, requests rejected immediately
3. **Half-Open State**: Testing if system has recovered

Benefits:
- Prevents overwhelming failing services
- Provides fast-fail behavior
- Automatic recovery testing
- System stability under failure

## Security Properties Verified

1. ✅ **I/O Isolation**: Executors only perform I/O, no security logic
2. ✅ **Fault Tolerance**: Circuit breakers protect against cascading failures
3. ✅ **Timeout Enforcement**: All operations have 30s default timeout
4. ✅ **Deterministic Errors**: Machine-readable error codes for monitoring
5. ✅ **State Transparency**: Circuit breaker state inspectable for observability

## Integration with Pipeline

These tests verify the execution layer in isolation. For full pipeline integration tests (including intercept, authorization, and audit layers), see:

- `test/gateway/pipeline.integration.test.js` - Full 4-layer pipeline
- `test/pipeline.test.js` - Basic pipeline tests

## Future Enhancements

Potential areas for expansion:
- [ ] Circuit breaker metrics collection
- [ ] Adaptive timeout based on historical performance
- [ ] Bulkhead pattern for executor isolation
- [ ] Rate limiting per executor type
- [ ] Retry logic with exponential backoff
- [ ] Circuit breaker configuration per executor
