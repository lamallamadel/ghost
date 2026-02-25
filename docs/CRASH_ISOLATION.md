# Extension Crash Isolation

## Overview

The Ghost CLI extension runtime implements comprehensive crash isolation to ensure that extension failures are properly contained, logged, and recovered from without affecting the runtime or sibling extensions.

## Crash Detection Scenarios

The `ExtensionProcess._handleUnexpectedExit()` method handles all crash scenarios:

### 1. Non-Zero Exit Codes
- **Scenario**: Extension process exits with code ≠ 0
- **Examples**: 
  - Exit code 1: General errors
  - Exit code 2: Misuse of shell commands
  - Exit code > 128: Signal-based exits (code - 128 = signal number)
- **Behavior**: Triggers controlled restart with exponential backoff

### 2. Signal Termination
- **Scenario**: Extension process terminated by signal
- **Supported Signals**:
  - `SIGTERM`: Graceful termination request
  - `SIGKILL`: Forced kill (non-catchable)
  - `SIGINT`: Interrupt (Ctrl+C)
  - `SIGSEGV`: Segmentation fault
  - `SIGABRT`: Abort signal
  - `SIGBUS`: Bus error
  - `SIGFPE`: Floating-point exception
  - `SIGILL`: Illegal instruction
- **Behavior**: Triggers controlled restart with exponential backoff

### 3. Unhandled Promise Rejections
- **Scenario**: Uncaught promise rejections in extension code
- **Detection**: Node.js terminates the extension process (exit code 1 or non-zero)
- **Behavior**: Handled as a general crash, triggers restart
- **Note**: Extension processes are isolated Node.js child processes that handle their own unhandled rejections

### 4. Clean Exit (Exit Code 0)
- **Scenario**: Extension exits cleanly with code 0
- **Behavior**: 
  - Does NOT trigger restart
  - Logs telemetry
  - Rejects pending requests with clear error messages
  - Maintains extension state as exited

## Crash Isolation Features

### 1. Controlled Restart with Exponential Backoff

The restart mechanism uses exponential backoff to prevent crash loops:

```javascript
// Default configuration
backoffDelay: 1000,          // Initial delay: 1 second
backoffMaxDelay: 30000,      // Maximum delay: 30 seconds
backoffFactor: 2,            // Exponential factor
maxRestarts: 3,              // Maximum restarts per window
restartWindow: 60000         // Time window: 60 seconds
```

**Backoff Progression**:
- First restart: 1 second delay
- Second restart: 2 seconds delay
- Third restart: 4 seconds delay
- Fourth restart: 8 seconds delay
- And so on, up to 30 seconds maximum

**Restart Limit**:
- If more than 3 restarts occur within 60 seconds, the extension enters FAILED state
- This prevents infinite crash loops from consuming resources

### 2. Pending Request Rejection

All pending requests are rejected with clear, detailed error messages:

```javascript
{
  code: -32603,
  message: "Extension process terminated by signal SIGSEGV (PID: 12345)",
  data: {
    reason: 'Extension process crashed',
    extensionId: 'ghost-git-extension',
    exitCode: null,
    signal: 'SIGSEGV',
    pid: 12345,
    uptime: 15234,
    crashType: 'segmentation_fault',
    timestamp: 1234567890123,
    requestId: 42,
    requestMethod: 'executeGitCommand',
    requestAge: 523
  }
}
```

**Error Properties**:
- Clear error message indicating crash cause
- JSON-RPC error code (-32603 for internal errors)
- Comprehensive data payload with crash context
- Request-specific metadata (method, age, ID)

### 3. ExtensionRuntime Isolation

The `ExtensionRuntime` class ensures that:

1. **Independent Lifecycle**: Each extension runs in its own `ExtensionProcess` instance
2. **Isolated State**: Extension crashes only affect that specific extension
3. **Event-Based Communication**: Crashes are emitted as events, not thrown errors
4. **Sibling Protection**: Other extensions continue running normally
5. **Runtime Stability**: The runtime itself remains stable regardless of extension crashes

**Architecture**:
```
ExtensionRuntime
├── ExtensionProcess (extension-1) ← Crashes independently
├── ExtensionProcess (extension-2) ← Unaffected
└── ExtensionProcess (extension-3) ← Unaffected
```

### 4. Comprehensive Crash Telemetry

Every crash is logged with detailed telemetry:

```javascript
{
  eventType: 'extension_crash',
  timestamp: 1234567890123,
  timestampISO: '2024-01-15T10:30:45.123Z',
  extensionId: 'ghost-git-extension',
  crash: {
    pid: 12345,
    exitCode: 1,
    signal: null,
    uptime: 15234,
    uptimeFormatted: '15s',
    crashType: 'general_error'
  },
  state: {
    previousState: 'RUNNING',
    pendingRequestCount: 3,
    restartCount: 2,
    consecutiveRestarts: 1
  },
  metrics: {
    heartbeat: {
      consecutiveFailures: 0,
      totalPings: 45,
      totalPongs: 45,
      totalFailures: 0,
      successRate: 1.0
    },
    healthState: 'HEALTHY'
  }
}
```

**Telemetry Includes**:
- **Crash Details**: PID, exit code, signal, crash type
- **Timing**: Timestamp, uptime (formatted and raw)
- **State**: Previous state, pending request count
- **Restart History**: Restart count, consecutive restarts
- **Health Metrics**: Heartbeat statistics, health state

## Events Emitted

### Extension-Level Events

1. **`crashed`** - Emitted when extension crashes
   ```javascript
   {
     extensionId, timestamp, timestampISO, pid, exitCode, signal,
     uptime, uptimeFormatted, crashType, pendingRequestCount,
     restartCount, consecutiveRestarts, state
   }
   ```

2. **`crash-telemetry`** - Detailed telemetry data
   ```javascript
   {
     eventType, timestamp, timestampISO, extensionId,
     crash: { pid, exitCode, signal, uptime, uptimeFormatted, crashType },
     state: { previousState, pendingRequestCount, restartCount, consecutiveRestarts },
     metrics: { heartbeat, healthState }
   }
   ```

3. **`pending-requests-rejected`** - When requests are rejected due to crash
   ```javascript
   {
     extensionId, timestamp, rejectedCount,
     requests: [{ requestId, method, requestAge }],
     crashDetails
   }
   ```

4. **`crash-restart-scheduled`** - Before restart begins
   ```javascript
   {
     extensionId, timestamp, crashDetails, backoffDelay,
     restartAttempt, consecutiveRestarts
   }
   ```

5. **`crash-recovery-success`** - After successful restart
   ```javascript
   {
     extensionId, timestamp, originalCrash,
     recoveryDuration, restartCount
   }
   ```

6. **`disconnected`** - When process disconnects unexpectedly
   ```javascript
   { extensionId, timestamp, pid }
   ```

### Runtime-Level Events

All extension events are forwarded to the runtime with `extension-` prefix:
- `extension-crashed`
- `extension-crash-telemetry`
- `extension-pending-requests-rejected`
- `extension-crash-restart-scheduled`
- `extension-crash-recovery-success`
- `extension-disconnected`

## Configuration Options

Control crash behavior via options:

```javascript
const runtime = new ExtensionRuntime({
  maxRestarts: 3,              // Max restarts per window
  restartWindow: 60000,        // Time window in ms
  enableCrashLogging: true,    // Log to console
  backoffDelay: 1000,          // Initial backoff delay
  backoffMaxDelay: 30000,      // Maximum backoff delay
  backoffFactor: 2             // Exponential factor
});
```

## Crash Type Classification

The system classifies crashes into specific types:

| Crash Type | Description |
|------------|-------------|
| `clean_exit` | Exit code 0 (not a crash) |
| `general_error` | Exit code 1 |
| `misuse_of_shell` | Exit code 2 |
| `terminated` | SIGTERM signal |
| `force_killed` | SIGKILL signal |
| `interrupted` | SIGINT signal |
| `segmentation_fault` | SIGSEGV signal |
| `aborted` | SIGABRT signal |
| `bus_error` | SIGBUS signal |
| `floating_point_exception` | SIGFPE signal |
| `illegal_instruction` | SIGILL signal |
| `signal_exit_N` | Exit code > 128 (N = code - 128) |
| `exit_code_N` | Other exit codes |
| `restart_failure` | Failed to restart after crash |
| `unknown` | Unknown crash cause |

## State Transitions During Crashes

```
RUNNING/DEGRADED
    ↓ (unexpected exit detected)
[Crash Handler Executes]
    ↓
STOPPING (via restart())
    ↓
STOPPED
    ↓ (after backoff delay)
STARTING
    ↓
RUNNING (if successful)
    OR
FAILED (if restart fails)
```

## Error Message Format

All pending requests receive errors in this format:

```javascript
new Error("Extension process terminated by signal SIGTERM (PID: 12345)")
// OR
new Error("Extension process exited with code 1 (PID: 12345)")
```

With `error.data` containing:
- `reason`: 'Extension process crashed'
- `extensionId`: Extension identifier
- `exitCode`: Process exit code
- `signal`: Termination signal (if any)
- `pid`: Process ID
- `uptime`: Time since process start (ms)
- `crashType`: Classified crash type
- `timestamp`: Crash timestamp
- `requestId`: Request identifier
- `requestMethod`: Method being called
- `requestAge`: Time since request was sent (ms)

## Best Practices

1. **Monitor Crash Events**: Subscribe to `extension-crashed` events for alerting
2. **Track Restart Patterns**: Use `consecutiveRestarts` to identify problematic extensions
3. **Log Telemetry**: Enable crash logging for production debugging
4. **Adjust Limits**: Tune `maxRestarts` and `restartWindow` based on your use case
5. **Handle Rejections**: Implement retry logic for critical operations
6. **Test Failure Scenarios**: Verify your extensions handle crashes gracefully
7. **Review Crash Types**: Different crash types may require different handling

## Implementation Notes

- Crash handling is **synchronous** for telemetry/rejection, **asynchronous** for restart
- Restart errors are caught and logged but don't propagate
- Clean exits (code 0) are logged but don't trigger restart
- Both RUNNING and DEGRADED states trigger crash handling
- Process `disconnect` events are monitored and logged
- All timeouts are cleared before rejecting pending requests
- Crash isolation works at the OS process level via child processes
