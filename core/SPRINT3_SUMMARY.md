# Sprint 3: Enhanced Runtime Architecture Summary

## Overview

This document provides a comprehensive reference for Ghost CLI's enhanced runtime architecture, including process lifecycle management, JSON-RPC 2.0 protocol implementation, heartbeat monitoring, restart policies, crash isolation, and extension developer guidance.

---

## 1. Process Lifecycle State Machine

### State Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Extension Process Lifecycle                     │
└─────────────────────────────────────────────────────────────────────┘

                                 ┌─────────┐
                                 │ STOPPED │◄──────────┐
                                 └────┬────┘           │
                                      │                │
                         start()      │                │ shutdown_complete
                                      │                │ shutdown_timeout
                                      ▼                │
                                 ┌──────────┐          │
                     ┌──────────►│ STARTING │──────────┤
                     │           └────┬─────┘          │
                     │                │                │
          restart    │   startup_     │                │
          limit      │   failed       │                │
          exceeded   │                │ startup_       │
                     │                │ success        │
                     │                ▼                │
                ┌────┴────┐      ┌──────────┐    ┌────┴────┐
                │ FAILED  │      │ RUNNING  │    │STOPPING │
                └────┬────┘      └─┬──┬───┬─┘    └────▲────┘
                     │             │  │   │           │
                     │    ┌────────┘  │   └───────────┤
                     │    │           │               │
                     │    │  heart    │  stop()       │
                     │    │  beat     │               │
                     │    │  failure  │               │
          restart    │    │           │               │
          requested  │    │           ▼               │
                     │    │      ┌──────────┐         │
                     └────┼─────►│ DEGRADED │─────────┘
                          │      └────┬─────┘
                          │           │
                          │           │ recovery/
                          └───────────┘ continued failure
```

### State Definitions

| State | Description | Entry Conditions | Exit Conditions |
|-------|-------------|------------------|-----------------|
| **STOPPED** | Extension process is not running | Initial state, clean shutdown, crash recovery failure | User calls `start()` |
| **STARTING** | Process is spawning and initializing | `start()` called from STOPPED or FAILED | Successful init, startup timeout, spawn error |
| **RUNNING** | Process is active and healthy | Successful initialization, recovery from DEGRADED | Shutdown request, crash, heartbeat failures |
| **DEGRADED** | Process responsive but performance degraded | Heartbeat latency exceeds threshold | Recovery to RUNNING, failure to FAILED, stop request |
| **STOPPING** | Graceful shutdown in progress | `stop()` called or restart initiated | Process exits cleanly or forced termination |
| **FAILED** | Process crashed or unrecoverable error | Startup failure, restart limit exceeded, fatal error | Restart attempt (if within limits) |

### Valid State Transitions

```javascript
{
  'STOPPED':   ['STARTING'],
  'STARTING':  ['RUNNING', 'FAILED', 'STOPPED'],
  'RUNNING':   ['STOPPING', 'FAILED', 'DEGRADED'],
  'DEGRADED':  ['RUNNING', 'STOPPING', 'FAILED'],
  'STOPPING':  ['STOPPED', 'FAILED'],
  'FAILED':    ['STARTING', 'STOPPED']
}
```

### Transition Reason Codes

| Reason Code | Description | From State | To State |
|-------------|-------------|------------|----------|
| `USER_REQUESTED` | User explicitly requested action | Any | Various |
| `START_REQUESTED` | Extension start initiated | STOPPED/FAILED | STARTING |
| `STOP_REQUESTED` | Extension stop initiated | RUNNING/DEGRADED | STOPPING |
| `RESTART_REQUESTED` | Extension restart initiated | Any | Various |
| `STARTUP_SUCCESS` | Process initialized successfully | STARTING | RUNNING |
| `STARTUP_FAILED` | Process failed to initialize | STARTING | FAILED |
| `SHUTDOWN_COMPLETE` | Clean shutdown completed | STOPPING | STOPPED |
| `SHUTDOWN_TIMEOUT` | Shutdown exceeded timeout | STOPPING | STOPPED |
| `UNEXPECTED_EXIT` | Process exited unexpectedly | RUNNING/DEGRADED | FAILED |
| `UNRESPONSIVE` | Process not responding | RUNNING/DEGRADED | FAILED |
| `HEARTBEAT_FAILURE` | Heartbeat checks failed | RUNNING | DEGRADED/FAILED |
| `RESTART_LIMIT_EXCEEDED` | Too many restart attempts | Any | FAILED |
| `VALIDATION_ERROR` | Manifest validation failed | STARTING | FAILED |
| `SPAWN_ERROR` | Process spawn failed | STARTING | FAILED |

---

## 2. JSON-RPC 2.0 Protocol Reference

### Message Format

All communication between Ghost CLI runtime and extension processes uses JSON-RPC 2.0 over stdio (newline-delimited JSON).

#### Request

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "methodName",
  "params": {
    "key": "value"
  }
}
```

#### Response (Success)

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "data": "value"
  }
}
```

#### Response (Error)

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32603,
    "message": "Internal error",
    "data": {
      "details": "Additional context"
    }
  }
}
```

#### Notification (No Response Expected)

```json
{
  "jsonrpc": "2.0",
  "method": "notificationName",
  "params": {
    "key": "value"
  }
}
```

### Standard JSON-RPC Error Codes

| Code | Message | Meaning |
|------|---------|---------|
| **-32700** | Parse error | Invalid JSON received |
| **-32600** | Invalid Request | Request doesn't conform to JSON-RPC 2.0 spec |
| **-32601** | Method not found | Requested method doesn't exist |
| **-32602** | Invalid params | Invalid method parameter(s) |
| **-32603** | Internal error | Internal JSON-RPC error |

### Ghost-Specific Error Codes

| Code | Message | Meaning |
|------|---------|---------|
| **-32000** | Extension timeout | Request exceeded timeout limit |
| **-32001** | Extension crashed | Process terminated during request |
| **-32002** | Extension shutdown | Process stopped before response |
| **-32003** | Permission denied | Extension lacks required permission |
| **-32004** | Rate limit exceeded | Too many requests |

### Protocol Examples

#### Extension Initialization

**Runtime → Extension:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "init",
  "params": {
    "config": {
      "apiKey": "...",
      "timeout": 30000
    }
  }
}
```

**Extension → Runtime:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "initialized": true,
    "version": "1.0.0"
  }
}
```

#### Heartbeat Ping/Pong

**Runtime → Extension:**
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "pong",
  "params": {
    "timestamp": 1699564800000
  }
}
```

**Extension → Runtime:**
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "timestamp": 1699564800100
  }
}
```

#### Extension Method Call

**Runtime → Extension:**
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "processFile",
  "params": {
    "path": "/path/to/file.txt",
    "options": {
      "encoding": "utf8"
    }
  }
}
```

**Extension → Runtime (Success):**
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "processed": true,
    "lines": 42
  }
}
```

**Extension → Runtime (Error):**
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "error": {
    "code": -32603,
    "message": "Failed to read file",
    "data": {
      "path": "/path/to/file.txt",
      "errno": "ENOENT"
    }
  }
}
```

#### Graceful Shutdown

**Runtime → Extension:**
```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "shutdown",
  "params": {}
}
```

**Extension → Runtime:**
```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "result": {
    "cleanedUp": true
  }
}
```

#### Extension Notification (Async Event)

**Extension → Runtime:**
```json
{
  "jsonrpc": "2.0",
  "method": "progress",
  "params": {
    "percent": 50,
    "message": "Processing halfway complete"
  }
}
```

### Validation Rules

1. **Required Fields:**
   - All messages must have `jsonrpc: "2.0"`
   - Requests/notifications must have `method` (string)
   - Requests must have `id` (string, number, or null)
   - Responses must have `id` matching the request
   - Responses must have either `result` or `error`, not both

2. **Reserved Methods:**
   - Method names starting with `rpc.` are reserved for JSON-RPC internal use

3. **ID Constraints:**
   - IDs can be string, number, or null
   - IDs should be unique per pending request
   - Notifications must not have an `id` field

4. **Error Object:**
   - Must contain `code` (integer) and `message` (string)
   - `data` field is optional for additional context

---

## 3. Heartbeat Monitoring Algorithm

### Overview

The heartbeat system actively monitors extension health by sending periodic ping requests and measuring response times. This enables early detection of degraded performance and unresponsive processes.

### Configuration Parameters

```javascript
{
  heartbeatPingInterval: 15000,      // Ping frequency (15s)
  heartbeatPongTimeout: 30000,       // Max time to wait for pong (30s)
  degradedThreshold: 2000,           // Response time threshold for DEGRADED state (2s)
  consecutiveFailureLimit: 3,        // Max consecutive failures before restart
  heartbeatTimeout: 30000            // Overall heartbeat timeout
}
```

### Algorithm Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    Heartbeat Monitoring Loop                     │
└─────────────────────────────────────────────────────────────────┘

   Every 15 seconds:

   1. Check if previous ping is still pending
      ├─ YES: Check if timeout exceeded (30s)
      │       ├─ YES: Record timeout failure
      │       │       Increment consecutive failures
      │       │       Check if limit reached (≥3)
      │       │       ├─ YES: Restart extension
      │       │       └─ NO:  Continue monitoring
      │       └─ NO:  Wait for response
      └─ NO:  Send new ping

   2. Send ping with timestamp
      └─ Set pending flag and timeout timer

   3. When pong received:
      ├─ Calculate response time
      ├─ Update metrics (min, max, avg)
      ├─ Reset consecutive failure counter
      └─ Check response time:
          ├─ > 2000ms: Transition to DEGRADED state
          └─ ≤ 2000ms: Remain/return to HEALTHY state

   4. On timeout or error:
      ├─ Increment failure counters
      ├─ Update success rate
      └─ Check consecutive failures ≥ 3:
          ├─ YES: Trigger restart with backoff
          └─ NO:  Continue monitoring
```

### Degraded State Criteria

An extension enters the **DEGRADED** state when:

1. Heartbeat response time exceeds `degradedThreshold` (2000ms)
2. Extension is still responsive but performance is impaired
3. State is recoverable without restart

**Recovery:** Extension returns to **HEALTHY** when response times drop below threshold.

**Escalation:** If heartbeat failures continue (≥3 consecutive), extension is restarted.

### Metrics Collection

The heartbeat system tracks:

```javascript
{
  totalPings: 0,              // Total ping attempts
  totalPongs: 0,              // Successful responses
  totalFailures: 0,           // Failed attempts
  totalTimeouts: 0,           // Timeout-specific failures
  responseTimes: [],          // Last 100 response times
  lastResponseTime: null,     // Most recent latency
  minResponseTime: null,      // Best observed latency
  maxResponseTime: null,      // Worst observed latency
  avgResponseTime: null,      // Rolling average
  successRate: null           // Percentage (0-1)
}
```

### Example Scenarios

#### Scenario 1: Healthy Extension

```
Time  | Action           | Response | State   | Consecutive Failures
------|------------------|----------|---------|---------------------
0s    | Ping sent        | -        | RUNNING | 0
0.05s | Pong received    | 50ms     | RUNNING | 0
15s   | Ping sent        | -        | RUNNING | 0
15.08s| Pong received    | 80ms     | RUNNING | 0
30s   | Ping sent        | -        | RUNNING | 0
30.12s| Pong received    | 120ms    | RUNNING | 0
```

#### Scenario 2: Degraded Performance

```
Time  | Action           | Response | State    | Consecutive Failures
------|------------------|----------|----------|---------------------
0s    | Ping sent        | -        | RUNNING  | 0
0.05s | Pong received    | 50ms     | RUNNING  | 0
15s   | Ping sent        | -        | RUNNING  | 0
17.5s | Pong received    | 2500ms   | DEGRADED | 0
30s   | Ping sent        | -        | DEGRADED | 0
32.1s | Pong received    | 2100ms   | DEGRADED | 0
45s   | Ping sent        | -        | DEGRADED | 0
45.5s | Pong received    | 500ms    | RUNNING  | 0  (recovered)
```

#### Scenario 3: Progressive Failure → Restart

```
Time  | Action                | Response | State   | Consecutive Failures
------|----------------------|----------|---------|---------------------
0s    | Ping sent            | -        | RUNNING | 0
30s   | Ping timeout         | TIMEOUT  | RUNNING | 1
45s   | Ping sent            | -        | RUNNING | 1
75s   | Ping timeout         | TIMEOUT  | RUNNING | 2
90s   | Ping sent            | -        | RUNNING | 2
120s  | Ping timeout         | TIMEOUT  | RUNNING | 3
120s  | Restart triggered    | -        | FAILED  | 3
121s  | Backoff delay (1s)   | -        | STOPPED | -
122s  | Restart initiated    | -        | STARTING| 0
124s  | Extension restarted  | -        | RUNNING | 0
```

---

## 4. Exponential Backoff Restart Policy

### Formula

```
delay = min(baseDelay × backoffFactor^(consecutiveRestarts - 1), maxDelay)
```

### Default Configuration

```javascript
{
  backoffDelay: 1000,         // Base delay: 1 second
  backoffMaxDelay: 30000,     // Maximum delay: 30 seconds
  backoffFactor: 2,           // Exponential factor: 2x
  maxRestarts: 3,             // Max restarts within window
  restartWindow: 60000        // Rolling window: 60 seconds
}
```

### Calculation Examples

| Consecutive Restarts | Calculation | Delay (ms) | Delay (seconds) |
|---------------------|-------------|------------|-----------------|
| 1 | `1000 × 2^0` | 1,000 | 1s |
| 2 | `1000 × 2^1` | 2,000 | 2s |
| 3 | `1000 × 2^2` | 4,000 | 4s |
| 4 | `1000 × 2^3` | 8,000 | 8s |
| 5 | `1000 × 2^4` | 16,000 | 16s |
| 6 | `1000 × 2^5` | 32,000 → 30,000 (capped) | 30s |
| 7+ | `1000 × 2^6+` | 30,000 (capped) | 30s |

### Restart Rate Limiting

The runtime tracks restart history within a sliding time window:

1. **Restart Request:** Check restart history in last 60 seconds
2. **Limit Check:** If `≥ 3` restarts in window → **FAILED** state (restart limit exceeded)
3. **History Update:** Add current timestamp to restart history
4. **Exponential Backoff:** Calculate delay based on consecutive restart count
5. **Delayed Restart:** Wait for backoff period before attempting restart

### Restart Counter Reset

The `consecutiveRestarts` counter resets to 0 when:
- Extension successfully starts and runs without issues
- Sufficient time passes between restarts
- Manual intervention occurs

### Example Timeline

```
Event                           | Time | Consecutive | Backoff | State
-------------------------------|------|-------------|---------|----------
Extension crashes              | 0s   | 0→1         | 1s      | FAILED
Restart initiated              | 1s   | 1           | -       | STARTING
Extension starts successfully  | 2s   | 0 (reset)   | -       | RUNNING
Extension crashes again        | 15s  | 0→1         | 1s      | FAILED
Restart initiated              | 16s  | 1           | -       | STARTING
Extension crashes immediately  | 17s  | 1→2         | 2s      | FAILED
Restart initiated              | 19s  | 2           | -       | STARTING
Extension crashes again        | 20s  | 2→3         | 4s      | FAILED
Restart initiated              | 24s  | 3           | -       | STARTING
Extension crashes (4th time)   | 25s  | 3→4         | LIMIT   | FAILED
Restart blocked - limit hit    | 25s  | -           | -       | FAILED
```

**Note:** In the above example, 4 crashes occurred within 25 seconds (well within the 60-second window), triggering the restart limit.

---

## 5. Crash Isolation & Fault Propagation Boundaries

### Isolation Guarantees

Ghost CLI's runtime architecture ensures **complete isolation** between:

1. **Extension Processes:** Each extension runs in a separate Node.js child process
2. **Runtime Stability:** Extension crashes do not affect the Ghost CLI core runtime
3. **Inter-Extension Isolation:** One extension's failure does not impact other extensions

### Fault Propagation Boundaries

```
┌───────────────────────────────────────────────────────────────────┐
│                        Ghost CLI Main Process                      │
│                                                                    │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │              Extension Runtime Manager                      │  │
│  │                                                             │  │
│  │  ╔═══════════════════════╗  ╔═══════════════════════╗     │  │
│  │  ║   Extension Process A ║  ║   Extension Process B ║     │  │
│  │  ║                       ║  ║                       ║     │  │
│  │  ║   [ISOLATED]          ║  ║   [ISOLATED]          ║     │  │
│  │  ║                       ║  ║                       ║     │  │
│  │  ║   Crash → Contained   ║  ║   Unaffected          ║     │  │
│  │  ╚═══════════════════════╝  ╚═══════════════════════╝     │  │
│  │         │                             │                     │  │
│  │         │ stdio/JSON-RPC              │                     │  │
│  │         │                             │                     │  │
│  │  ┌──────▼─────────────────────────────▼──────────────────┐ │  │
│  │  │      Supervised by ExtensionRuntime                    │ │  │
│  │  │  - Monitors health                                     │ │  │
│  │  │  - Handles crashes                                     │ │  │
│  │  │  - Manages restarts with backoff                       │ │  │
│  │  │  - Rejects pending requests on crash                   │ │  │
│  │  └────────────────────────────────────────────────────────┘ │  │
│  └────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────┘
```

### Crash Handling Workflow

When an extension process crashes:

1. **Detect:** `'exit'` event on child process with non-zero code or signal
2. **Isolate:** Crash is contained within the child process boundary
3. **Record:** Crash telemetry captured (exit code, signal, uptime, stack trace)
4. **Cleanup:** All pending requests for that extension are rejected with error
5. **Notify:** Runtime emits `'crashed'` event with crash details
6. **Recover:** Automatic restart attempted with exponential backoff
7. **Limit:** If restart limit exceeded, extension enters permanent **FAILED** state

### Pending Request Handling

When a crash occurs, all pending requests are immediately rejected:

```javascript
{
  error: {
    code: -32603,
    message: "Extension process terminated by signal SIGTERM (PID: 12345)",
    data: {
      reason: "Extension process crashed",
      extensionId: "my-extension",
      exitCode: 1,
      signal: null,
      pid: 12345,
      uptime: 45000,
      crashType: "general_error",
      timestamp: 1699564800000,
      requestId: 42,
      requestMethod: "processFile",
      requestAge: 1500
    }
  }
}
```

### Crash Types

| Crash Type | Cause | Exit Code/Signal |
|------------|-------|------------------|
| `clean_exit` | Process exited normally | 0 |
| `general_error` | Uncaught exception or error | 1 |
| `misuse_of_shell` | Shell command error | 2 |
| `terminated` | SIGTERM received | SIGTERM |
| `force_killed` | SIGKILL received | SIGKILL |
| `interrupted` | SIGINT received (Ctrl+C) | SIGINT |
| `segmentation_fault` | Memory access violation | SIGSEGV |
| `aborted` | Process aborted | SIGABRT |
| `bus_error` | Hardware bus error | SIGBUS |
| `floating_point_exception` | Division by zero, etc. | SIGFPE |
| `illegal_instruction` | Invalid CPU instruction | SIGILL |

### Telemetry & Observability

All crashes generate structured telemetry events:

```javascript
{
  eventType: "extension_crash",
  timestamp: 1699564800000,
  timestampISO: "2023-11-09T20:00:00.000Z",
  extensionId: "my-extension",
  crash: {
    pid: 12345,
    exitCode: 1,
    signal: null,
    uptime: 45000,
    uptimeFormatted: "45s",
    crashType: "general_error"
  },
  state: {
    previousState: "RUNNING",
    pendingRequestCount: 3,
    restartCount: 1,
    consecutiveRestarts: 1
  },
  metrics: {
    heartbeat: {
      consecutiveFailures: 0,
      totalPings: 10,
      totalPongs: 10,
      totalFailures: 0,
      successRate: 1.0
    },
    healthState: "HEALTHY"
  }
}
```

---

## 6. Extension Developer Guide

### Handling Runtime Events

Extensions can respond to runtime state changes and lifecycle events. Below are the key events and recommended handling strategies.

### Event Types

#### 1. `state-change` Event

Fired whenever the extension's process state transitions.

**Event Payload:**
```javascript
{
  extensionId: "my-extension",
  timestamp: 1699564800000,
  timestampISO: "2023-11-09T20:00:00.000Z",
  previousState: "STARTING",
  newState: "RUNNING",
  reason: "startup_success",
  reasonCode: "STARTUP_SUCCESS",
  metadata: {
    pid: 12345,
    restartCount: 0,
    consecutiveRestarts: 0,
    startupDuration: 1200
  }
}
```

**Extension Handling:**
```javascript
// In your extension's main process
process.on('message', (msg) => {
  if (msg.event === 'state-change') {
    switch (msg.newState) {
      case 'RUNNING':
        console.log('Extension is now running');
        // Initialize resources, start services
        break;
      case 'STOPPING':
        console.log('Extension is shutting down');
        // Begin cleanup, flush buffers
        break;
      case 'DEGRADED':
        console.log('Performance degraded, optimizing...');
        // Reduce load, defer non-critical work
        break;
    }
  }
});
```

#### 2. `crashed` Event

Fired when the extension process terminates unexpectedly.

**Event Payload:**
```javascript
{
  extensionId: "my-extension",
  timestamp: 1699564800000,
  timestampISO: "2023-11-09T20:00:00.000Z",
  pid: 12345,
  exitCode: 1,
  signal: null,
  uptime: 45000,
  uptimeFormatted: "45s",
  crashType: "general_error",
  pendingRequestCount: 3,
  restartCount: 1,
  consecutiveRestarts: 1,
  state: "RUNNING"
}
```

**Recommended Actions:**
- Log crash details for debugging
- Alert monitoring systems
- Review recent operations that may have caused the crash
- Check if crash is reproducible
- Implement graceful degradation if extension is critical

**Example (Runtime Consumer):**
```javascript
runtime.on('extension-crashed', (event) => {
  console.error(`Extension ${event.extensionId} crashed:`, {
    exitCode: event.exitCode,
    signal: event.signal,
    uptime: event.uptimeFormatted,
    crashType: event.crashType
  });

  // Alert monitoring system
  monitoring.sendAlert({
    severity: 'high',
    component: event.extensionId,
    message: `Extension crashed after ${event.uptimeFormatted}`,
    details: event
  });
});
```

#### 3. `unresponsive` Event

Fired when heartbeat checks fail consecutively, indicating the extension is not responding.

**Event Payload:**
```javascript
{
  extensionId: "my-extension",
  timestamp: 1699564800000,
  consecutiveFailures: 3,
  error: "Request timeout for method pong after 30000ms"
}
```

**Recommended Actions:**
- Check for blocking operations (synchronous I/O, infinite loops)
- Review CPU and memory usage
- Verify event loop is not blocked
- Consider implementing operation timeouts
- Profile extension for performance bottlenecks

**Prevention Strategy:**
```javascript
// Avoid blocking the event loop
function heavyOperation() {
  return new Promise((resolve) => {
    // Break work into chunks
    setImmediate(() => {
      // Do work
      resolve(result);
    });
  });
}

// Respond to heartbeat pings promptly
rpc.on('pong', (params, respond) => {
  respond({ timestamp: Date.now() });
});
```

#### 4. `restarted` Event

Fired when the extension successfully restarts after a crash or failure.

**Event Payload:**
```javascript
{
  extensionId: "my-extension",
  timestamp: 1699564805000,
  restartCount: 2,
  consecutiveRestarts: 1
}
```

**Recommended Actions:**
- Re-establish connections (database, external APIs)
- Restore state from persistent storage
- Resume interrupted operations (if idempotent)
- Log restart for audit trail

**Example (Extension Recovery):**
```javascript
// In extension main process
async function handleInit() {
  try {
    // Check if this is a restart
    const restartMarker = await checkForRestartMarker();
    
    if (restartMarker) {
      console.log('Extension restarted, recovering state...');
      await recoverState();
      await resumeOperations();
    } else {
      console.log('Fresh start, initializing...');
      await initialize();
    }
    
    return { initialized: true };
  } catch (error) {
    console.error('Initialization failed:', error);
    throw error;
  }
}
```

### Best Practices for Extension Developers

#### 1. Implement Graceful Shutdown

Always respond to the `shutdown` method and clean up resources:

```javascript
rpc.on('shutdown', async (params, respond) => {
  try {
    // Close connections
    await database.close();
    await apiClient.disconnect();
    
    // Flush buffers
    await flushCache();
    
    // Save state
    await saveState();
    
    respond({ cleanedUp: true });
  } catch (error) {
    console.error('Shutdown error:', error);
    respond({ cleanedUp: false, error: error.message });
  }
});
```

#### 2. Handle Degraded State

Reduce load when performance is impaired:

```javascript
let isPerformanceDegraded = false;

// Monitor for degraded state signals
process.on('message', (msg) => {
  if (msg.event === 'state-change' && msg.newState === 'DEGRADED') {
    isPerformanceDegraded = true;
    // Throttle operations
    reduceWorkload();
  } else if (msg.newState === 'RUNNING') {
    isPerformanceDegraded = false;
    // Resume normal operations
    restoreWorkload();
  }
});

function reduceWorkload() {
  // Increase batch sizes
  // Reduce polling frequency
  // Defer non-critical tasks
}
```

#### 3. Implement Idempotent Operations

Design operations to be safely retryable:

```javascript
async function processFile(filePath) {
  // Check if already processed
  const lockFile = `${filePath}.lock`;
  if (await exists(lockFile)) {
    console.log('File already being processed');
    return { status: 'in_progress' };
  }
  
  try {
    // Create lock
    await createLock(lockFile);
    
    // Process (idempotent)
    const result = await doProcessing(filePath);
    
    // Remove lock
    await removeLock(lockFile);
    
    return result;
  } catch (error) {
    await removeLock(lockFile);
    throw error;
  }
}
```

#### 4. Avoid Blocking Operations

Never block the event loop:

```javascript
// ❌ BAD: Synchronous blocking
const data = fs.readFileSync(largeFile);

// ✅ GOOD: Asynchronous non-blocking
const data = await fs.promises.readFile(largeFile);

// ❌ BAD: Tight loop blocking
for (let i = 0; i < 1000000; i++) {
  process(data[i]);
}

// ✅ GOOD: Chunked processing
async function processInChunks(data, chunkSize = 1000) {
  for (let i = 0; i < data.length; i += chunkSize) {
    const chunk = data.slice(i, i + chunkSize);
    await processChunk(chunk);
    await setImmediate(); // Yield to event loop
  }
}
```

#### 5. Implement Health Checks

Expose internal health status:

```javascript
rpc.on('healthCheck', (params, respond) => {
  const health = {
    status: 'healthy',
    checks: {
      database: databaseConnected,
      cache: cacheAvailable,
      memory: process.memoryUsage(),
      uptime: process.uptime()
    }
  };
  
  // Determine overall status
  if (!health.checks.database || !health.checks.cache) {
    health.status = 'degraded';
  }
  
  respond(health);
});
```

#### 6. Log Structured Errors

Provide context for debugging crashes:

```javascript
process.on('uncaughtException', (error) => {
  console.error(JSON.stringify({
    eventType: 'uncaught_exception',
    timestamp: new Date().toISOString(),
    error: {
      message: error.message,
      stack: error.stack,
      name: error.name
    },
    context: {
      memoryUsage: process.memoryUsage(),
      uptime: process.uptime(),
      pid: process.pid
    }
  }));
  
  // Exit to allow runtime to restart
  process.exit(1);
});
```

### Complete Extension Template

```javascript
const { ExtensionSDK } = require('@ghost/extension-sdk');

class MyExtension {
  constructor() {
    this.sdk = new ExtensionSDK();
    this.isShuttingDown = false;
    this.state = {};
  }

  async init(config) {
    try {
      console.log('Initializing extension...');
      
      // Setup resources
      await this.setupResources(config);
      
      // Register RPC methods
      this.registerMethods();
      
      // Setup graceful shutdown
      this.setupShutdownHandlers();
      
      console.log('Extension initialized successfully');
      return { initialized: true, version: '1.0.0' };
    } catch (error) {
      console.error('Initialization failed:', error);
      throw error;
    }
  }

  async setupResources(config) {
    // Connect to databases, APIs, etc.
    this.config = config;
  }

  registerMethods() {
    // Register extension-specific methods
    this.sdk.on('processData', async (params) => {
      return await this.processData(params);
    });
    
    this.sdk.on('getStatus', async () => {
      return this.getStatus();
    });
  }

  setupShutdownHandlers() {
    this.sdk.on('shutdown', async () => {
      this.isShuttingDown = true;
      await this.cleanup();
      return { cleanedUp: true };
    });

    process.on('SIGTERM', async () => {
      await this.cleanup();
      process.exit(0);
    });
  }

  async processData(params) {
    if (this.isShuttingDown) {
      throw new Error('Extension is shutting down');
    }
    
    // Process data
    return { processed: true };
  }

  getStatus() {
    return {
      state: this.isShuttingDown ? 'shutting_down' : 'running',
      uptime: process.uptime(),
      memory: process.memoryUsage()
    };
  }

  async cleanup() {
    console.log('Cleaning up resources...');
    // Close connections, flush buffers, save state
    await this.saveState();
  }

  async saveState() {
    // Persist state for recovery after restart
    await this.sdk.requestFileWrite('state.json', JSON.stringify(this.state));
  }
}

// Start extension
const extension = new MyExtension();
extension.sdk.start(extension.init.bind(extension));
```

---

## Summary

Ghost CLI's Sprint 3 runtime architecture provides:

✅ **Robust Process Lifecycle:** State machine with validated transitions and comprehensive reason codes  
✅ **Standard Protocol:** JSON-RPC 2.0 for reliable, structured communication  
✅ **Proactive Health Monitoring:** Heartbeat system with degraded state detection  
✅ **Intelligent Recovery:** Exponential backoff restart policy with rate limiting  
✅ **Complete Isolation:** Crash boundaries prevent fault propagation  
✅ **Developer-Friendly Events:** Rich telemetry and lifecycle hooks for extension authors  

This architecture ensures production-grade reliability while maintaining developer productivity.
