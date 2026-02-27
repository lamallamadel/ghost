# Sprint 6 Summary: OpenTelemetry Observability & Telemetry Infrastructure

**Sprint Goal**: Implement comprehensive observability infrastructure with OpenTelemetry tracing, structured logging, metrics collection, HTTP/WebSocket telemetry server, and verbose mode for real-time pipeline visualization.

**Status**: ✅ Complete

---

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [CLI Gateway Launcher Architecture](#cli-gateway-launcher-architecture)
3. [OpenTelemetry Observability](#opentelemetry-observability)
4. [Structured JSON Logging](#structured-json-logging)
5. [Metrics Collection](#metrics-collection)
6. [Telemetry HTTP/WebSocket Server](#telemetry-httpwebsocket-server)
7. [Verbose Mode Implementation](#verbose-mode-implementation)
8. [Developer Quickstart](#developer-quickstart)

---

## Architecture Overview

Sprint 6 delivers a production-grade observability stack built on OpenTelemetry principles, enabling deep visibility into Ghost CLI's pipeline execution flow. The system provides three complementary observability dimensions:

- **Traces (Spans)**: Distributed tracing across the 4-layer pipeline (Intercept → Auth → Audit → Execute)
- **Logs**: Structured JSON logs with severity levels and automatic secret sanitization
- **Metrics**: Per-extension counters, latency percentiles, and QoS statistics

All telemetry is exposed through a dual-protocol server (HTTP REST + WebSocket streaming) with filtering, debouncing, and connection management.

### Key Design Principles

1. **Zero Business Logic in Launcher**: GatewayLauncher orchestrates components without implementing domain logic
2. **Fail-Closed Security**: Manifest validation failures prevent extension loading
3. **Trace Correlation**: Parent-child span hierarchy maintains request context across layers
4. **Secret Sanitization**: Automatic redaction of sensitive fields (api_key, token, password, etc.)
5. **Daily Log Rotation**: Logs stored in `~/.ghost/telemetry/` with ISO date-based filenames
6. **Real-Time Streaming**: WebSocket clients receive debounced span batches with subscription filtering

---

## CLI Gateway Launcher Architecture

### Pure Orchestration Design

**File**: `ghost.js`  
**Class**: `GatewayLauncher`

The launcher implements a strict zero-business-logic principle where all domain operations (file I/O, git commands, API calls) are routed through extension instances via the pipeline. This allows the Intercept→Auth→Audit→Execute layers to apply security, rate limiting, and monitoring consistently.

#### Architectural Principle

```
┌─────────────────────────────────────────────────────────────┐
│  GatewayLauncher (Pure Orchestration Layer)                 │
│  - Component initialization and wiring                      │
│  - Command parsing and routing decisions                    │
│  - Metadata queries (no I/O)                                │
│  - Output formatting and console presentation               │
│  - Lifecycle management (startup, shutdown)                 │
└─────────────────────────────────────────────────────────────┘
         │                     │                    │
         ▼                     ▼                    ▼
   ┌─────────┐          ┌──────────┐        ┌──────────┐
   │ Gateway │          │ Pipeline │        │ Runtime  │
   │         │          │ (4 Layer)│        │          │
   └─────────┘          └──────────┘        └──────────┘
         │                     │                    │
         ▼                     ▼                    ▼
    Extension            Telemetry           Health/State
    Discovery            Instrumentation     Management
```

#### Component Responsibilities

**1. Pure Orchestration Methods (Correct Implementation)**:

- `initialize()`: Instantiate Gateway, Runtime, Pipeline, AuditLogger, Telemetry
- `parseArgs()`: Parse CLI arguments into structured format
- `route()`: Route commands to handlers based on parsed arguments
- `forwardToExtension()`: Delegate domain commands to extension instances (**Golden Example**)
- `handleGatewayCommand()`: Query metadata from Gateway/Runtime/Telemetry
- `handleConsoleCommand()`: Start/stop telemetry server
- `handleAuditLogCommand()`: Query audit logs via AuditLogger
- `showHelp()`: Display help text
- `cleanup()`: Coordinate graceful shutdown

**2. Violations Audit (Business Logic to Refactor)**:

The following methods contain direct file system operations that violate the zero-business-logic principle:

- `initialize()` (Lines 88-105): Direct `fs.mkdirSync`, `fs.existsSync`, `fs.unlinkSync` for directory setup
- `handleExtensionCommand()` (Lines 463-625): Direct fs operations for install/remove/init/validate subcommands
  - `install`: Direct `fs.readFileSync`, `fs.existsSync`, `fs.mkdirSync`
  - `remove`: Direct `fs.existsSync`, `_removeDirectory()`
  - `init`: Delegates to `_scaffoldExtension()` which has extensive fs operations
  - `validate`: Delegates to `_validateExtension()` which has direct fs operations
- `_copyDirectory()` (Lines 1145-1160): Direct `fs.mkdirSync`, `fs.readdirSync`, `fs.copyFileSync`
- `_removeDirectory()` (Lines 1170-1182): Direct `fs.existsSync`, `fs.unlinkSync`, `fs.rmdirSync`
- `_scaffoldExtension()` (Lines 1193-1362): Direct `fs.writeFileSync` for creating manifest, index, package.json, README
- `_validateExtension()` (Lines 1373-1539): Direct `fs.readFileSync` for reading and validating manifest

**Correct Pattern**: All these operations should route through `forwardToExtension()` to a system extension, allowing the pipeline to apply intercept→auth→audit→execute layers consistently.

#### Manifest-Based Command Discovery

The launcher uses **manifest-based command discovery** for deterministic routing:

```javascript
// Extension manifest declares commands
{
  "id": "ghost-git-extension",
  "commands": ["commit", "audit", "version", "merge", "history"],
  ...
}

// Launcher discovers commands from all loaded extensions
_findExtensionForCommand(command) {
  for (const ext of this.gateway.listExtensions()) {
    if (ext.manifest.commands?.includes(command)) {
      return ext;
    }
  }
  return null;
}
```

**Routing Priority**:
1. Built-in commands: `extension`, `gateway`, `audit-log`, `console`
2. Extension-declared commands: Discovered from `manifest.commands` array
3. Capability-based fallback: Dynamic routing based on capabilities

---

## OpenTelemetry Observability

### 4-Layer Span Hierarchy

**File**: `core/telemetry.js`  
**Classes**: `Span`, `InstrumentedPipeline`

Ghost CLI implements distributed tracing with parent-child span relationships that mirror the pipeline's layered architecture:

```
┌─────────────────────────────────────────────────────────────┐
│  Root Span: pipeline.process                                │
│  - traceId: unique per request (correlates all spans)       │
│  - spanId: identifies this span                             │
│  - attributes: { extensionId, requestId, type, operation }  │
└─────────────────────────────────────────────────────────────┘
     │
     ├──► Child Span: pipeline.intercept (Layer 1)
     │    - parentSpanId: root.spanId
     │    - attributes: { type, operation, extensionId }
     │    - duration: time to deserialize and validate intent
     │
     ├──► Child Span: pipeline.auth (Layer 2)
     │    - parentSpanId: root.spanId
     │    - attributes: { authorized, rateLimit.* }
     │    - events: rate_limit_exceeded, rate_limit_warning
     │    - duration: time for permission checks + rate limiting
     │
     ├──► Child Span: pipeline.audit (Layer 3)
     │    - parentSpanId: root.spanId
     │    - attributes: { passed, violations, warnings }
     │    - duration: time for manifest validation
     │
     └──► Child Span: pipeline.execute (Layer 4)
          - parentSpanId: root.spanId
          - attributes: { success, resultSize, circuitBreaker.* }
          - events: circuit_breaker_open, circuit_breaker_closed
          - duration: time for actual operation execution
```

### Span Class API

```javascript
class Span {
  constructor(name, parentSpan = null)
  
  // Span identification
  spanId: string              // Unique 16-char ID
  traceId: string             // Unique trace ID (inherited from parent or generated)
  parentSpanId: string|null   // Parent span ID for hierarchy
  
  // Span metadata
  name: string                // Span name (e.g., "pipeline.auth")
  startTime: number           // Epoch milliseconds
  endTime: number|null        // Epoch milliseconds (null until end() called)
  duration: number            // Computed: endTime - startTime
  
  // Telemetry data
  attributes: object          // Key-value metadata
  events: array               // Timestamped events with attributes
  status: { code, message }   // 'OK', 'ERROR', 'UNSET'
  
  // Methods
  setAttribute(key, value)    // Add single attribute
  setAttributes(attributes)   // Add multiple attributes
  addEvent(name, attributes)  // Add timestamped event
  setStatus(code, message)    // Set span status
  end()                       // Mark span complete
  toJSON()                    // Serialize for storage/transmission
}
```

### Trace Correlation

All spans in a request share the same `traceId`, enabling trace reconstruction:

```javascript
// Request flow generates correlated spans
const rootSpan = telemetry.startSpan('pipeline.process');
rootSpan.traceId = "abc123def456..."; // Generated once

const interceptSpan = telemetry.startSpan('pipeline.intercept', rootSpan);
interceptSpan.traceId = "abc123def456..."; // Inherited from parent
interceptSpan.parentSpanId = rootSpan.spanId;

const authSpan = telemetry.startSpan('pipeline.auth', rootSpan);
authSpan.traceId = "abc123def456..."; // Same trace
authSpan.parentSpanId = rootSpan.spanId;
```

**Query Pattern**: Retrieve all spans for a request using `traceId`:

```javascript
GET /spans?traceId=abc123def456
// Returns: [rootSpan, interceptSpan, authSpan, auditSpan, executeSpan]
```

### Span Attributes

Spans capture rich metadata as attributes (key-value pairs):

**Common Attributes** (all spans):
- `extensionId`: Extension ID making the request
- `requestId`: Unique request identifier
- `type`: Intent type (filesystem, network, git, process)
- `operation`: Intent operation (read, write, status, etc.)

**Auth Layer Attributes**:
- `authorized`: boolean - Authorization result
- `rateLimit.available`: number - Available tokens after request
- `rateLimit.capacity`: number - Total token bucket capacity
- `denial.reason`: string - Reason for denial (if unauthorized)
- `error.code`: string - Error code (AUTH_RATE_LIMIT, AUTH_PERMISSION_DENIED)

**Audit Layer Attributes**:
- `passed`: boolean - Validation result
- `violation.count`: number - Number of violations detected
- `violation.{i}.rule`: string - Specific rule violated
- `violation.{i}.severity`: string - Violation severity
- `violation.{i}.message`: string - Violation description
- `warnings.count`: number - Number of warnings

**Execute Layer Attributes**:
- `success`: boolean - Execution result
- `resultSize`: number - Response payload size in bytes
- `circuitBreaker.state`: string - CLOSED, OPEN, HALF_OPEN
- `circuitBreaker.failures`: number - Consecutive failures
- `error.type`: string - Error class name
- `error.code`: string - Error code
- `error.details`: string - JSON-serialized error details

**Intent-Specific Attributes**:
- `intent.target.path`: string (filesystem operations)
- `intent.target.url`: string (network operations)
- `intent.target.command`: string (process/git operations)
- `intent.request.size`: number - Request payload size
- `intent.http.method`: string - HTTP method for network requests

### Span Events

Events represent point-in-time occurrences within a span:

```javascript
span.addEvent('rate_limit_warning', {
  message: 'Rate limit tokens below 10% of capacity',
  available: 5,
  capacity: 100
});

span.addEvent('rate_limit_exceeded', {
  extensionId: 'ghost-git-extension',
  requestId: 'req-123'
});

span.addEvent('circuit_breaker_opened', {
  message: 'Circuit breaker transitioned to OPEN state',
  state: 'OPEN',
  failures: 5,
  nextAttempt: 1704067200000
});
```

Events appear in span timelines and enable drill-down analysis of specific behaviors.

---

## Structured JSON Logging

### Log Storage Architecture

**Directory**: `~/.ghost/telemetry/`  
**Format**: `telemetry-YYYY-MM-DD.log` (daily rotation)  
**Encoding**: UTF-8 newline-delimited JSON (NDJSON)

Each log entry is a single JSON object followed by newline:

```json
{"timestamp":"2024-01-15T10:30:45.123Z","severity":"INFO","message":"Span completed","extensionId":"ghost-git-extension","requestId":"req-abc123","layer":"Intercept","spanId":"k7x9m2p4","traceId":"def456abc789","duration":5,"attributes":{...}}
{"timestamp":"2024-01-15T10:30:45.130Z","severity":"WARN","message":"Rate limit exceeded","extensionId":"ghost-git-extension","requestId":"req-abc123","layer":"Auth","errorCode":"AUTH_RATE_LIMIT"}
{"timestamp":"2024-01-15T10:30:45.140Z","severity":"SECURITY_ALERT","message":"Authorization denied","extensionId":"suspicious-extension","reason":"Path not in allowlist","code":"AUTH_PERMISSION_DENIED","layer":"Auth"}
```

### Severity Levels

**File**: `core/telemetry.js` (Lines 7-12)  
**Constant**: `SEVERITY_LEVELS`

```javascript
const SEVERITY_LEVELS = {
  INFO: 'INFO',           // Normal operation events
  WARN: 'WARN',           // Warning conditions (e.g., rate limit approaching)
  ERROR: 'ERROR',         // Error conditions (e.g., execution failures)
  SECURITY_ALERT: 'SECURITY_ALERT'  // Security events (e.g., auth denials)
};
```

**Usage Patterns**:

- **INFO**: Span completions, extension registration, normal request flow
- **WARN**: Rate limit warnings, audit validation warnings, deprecated features
- **ERROR**: Execution failures, pipeline errors, system errors
- **SECURITY_ALERT**: Authorization denials, audit violations, suspicious behavior

### StructuredLogger API

**File**: `core/telemetry.js` (Lines 86-263)  
**Class**: `StructuredLogger`

```javascript
const logger = new StructuredLogger('/path/to/telemetry/');

// Log with automatic severity
logger.info('Extension registered', { 
  extensionId: 'my-ext',
  manifest: {...}
});

logger.warn('Rate limit approaching', {
  extensionId: 'my-ext',
  available: 10,
  capacity: 100
});

logger.error('Execution failed', {
  extensionId: 'my-ext',
  error: 'File not found',
  code: 'ENOENT'
});

logger.securityAlert('Authorization denied', {
  extensionId: 'suspicious-ext',
  reason: 'Path not in allowlist',
  code: 'AUTH_PERMISSION_DENIED'
});

// Generic log method
logger.log('INFO', 'Custom message', { custom: 'metadata' });

// Read logs with filtering
const logs = logger.readLogs({
  date: '2024-01-15',          // ISO date string
  severity: 'SECURITY_ALERT',  // Filter by severity
  limit: 100,                  // Max entries to return
  extensionId: 'my-ext',       // Filter by extension
  requestId: 'req-123',        // Filter by request
  layer: 'Auth',               // Filter by pipeline layer
  errorCode: 'AUTH_RATE_LIMIT' // Filter by error code
});
```

### Secret Sanitization

**File**: `core/telemetry.js` (Lines 14, 121-173)  
**Method**: `_sanitizeValue()`, `_sanitizeMetadata()`

All log entries are automatically sanitized before writing to remove sensitive data:

**Secret Field Patterns**:
```javascript
const SECRET_FIELDS = [
  'api_key', 'apiKey',
  'token',
  'password',
  'secret',
  'auth', 'authorization',
  'credentials'
];
```

**Sanitization Behavior**:
- Case-insensitive substring matching on keys
- Recursive sanitization of nested objects and arrays
- Replaces sensitive values with `"[REDACTED]"`

**Example**:
```javascript
// Before sanitization
{
  user: 'alice',
  api_key: 'sk-abc123xyz',
  config: {
    token: 'bearer xyz',
    timeout: 5000
  }
}

// After sanitization
{
  user: 'alice',
  api_key: '[REDACTED]',
  config: {
    token: '[REDACTED]',
    timeout: 5000
  }
}
```

### Daily Log Rotation

**File**: `core/telemetry.js` (Lines 116-119)  
**Method**: `_getLogPath()`

Logs are automatically rotated daily based on ISO date:

```javascript
// 2024-01-15 logs
~/.ghost/telemetry/telemetry-2024-01-15.log

// 2024-01-16 logs (new file)
~/.ghost/telemetry/telemetry-2024-01-16.log
```

**Benefits**:
- Prevents unbounded log file growth
- Simplifies log archival and cleanup
- Enables date-based log queries
- No manual rotation scripts required

**Directory Structure**:
```
~/.ghost/
├── telemetry/
│   ├── telemetry-2024-01-13.log
│   ├── telemetry-2024-01-14.log
│   ├── telemetry-2024-01-15.log  ← Today's logs
│   └── telemetry-2024-01-16.log
├── extensions/
└── audit.log
```

---

## Metrics Collection

### Metrics Architecture

**File**: `core/telemetry.js` (Lines 265-471)  
**Class**: `MetricsCollector`

Metrics are collected in-memory using Map-based data structures, organized by extension ID and stage:

```javascript
class MetricsCollector {
  metrics: {
    requestCount: Map<"extId:stage", count>,
    latencies: Map<"extId:stage", [latency1, latency2, ...]>,
    rateLimitViolations: Map<"extId", count>,
    validationFailures: Map<"extId:reason", count>,
    authFailures: Map<"extId:code", count>,
    intentSizes: Map<"extId", { requests: [], responses: [] }>
  }
}
```

### Per-Extension Request Counters

Track request counts by extension and pipeline stage:

```javascript
metricsCollector.recordRequest('ghost-git-extension', 'intercept', 5);
metricsCollector.recordRequest('ghost-git-extension', 'auth', 7);
metricsCollector.recordRequest('ghost-git-extension', 'audit', 8);
metricsCollector.recordRequest('ghost-git-extension', 'execute', 15);

// Query metrics
const metrics = metricsCollector.getMetrics('ghost-git-extension');
// Returns:
{
  requests: {
    'ghost-git-extension': {
      intercept: 1234,
      auth: 1230,
      audit: 1225,
      execute: 1220
    }
  },
  ...
}
```

### Latency Percentile Tracking

**Implementation**: Sliding window of last 1000 latency samples per extension+stage

**Percentiles**: p50 (median), p95, p99

```javascript
// Record latencies (milliseconds)
metricsCollector.recordRequest('my-ext', 'execute', 15);   // 15ms
metricsCollector.recordRequest('my-ext', 'execute', 23);   // 23ms
metricsCollector.recordRequest('my-ext', 'execute', 157);  // 157ms

// Query percentiles
const percentiles = metricsCollector.getLatencyPercentiles('my-ext', 'execute');
// Returns: { p50: 23, p95: 145, p99: 157 }
```

**Algorithm**:
1. Store raw latencies in array (max 1000 entries)
2. Sort array copy for percentile calculation
3. Calculate indices: p50 = 50% * length, p95 = 95% * length, p99 = 99% * length
4. Return latency values at those indices

**Sliding Window**: When 1000 samples reached, oldest samples are removed (FIFO):

```javascript
if (latencies.length > 1000) {
  latencies.shift();  // Remove oldest
}
```

### Rate Limit Violation Tracking

Track rate limit denials per extension:

```javascript
// Record violation
metricsCollector.recordRateLimitViolation('ghost-git-extension');

// Query violations
const metrics = metricsCollector.getMetrics('ghost-git-extension');
// Returns:
{
  rateLimitViolations: {
    'ghost-git-extension': 42
  },
  ...
}
```

### Validation and Auth Failure Tracking

Track failures by extension, reason/code:

```javascript
// Record failures
metricsCollector.recordValidationFailure('my-ext', 'INVALID_PATH');
metricsCollector.recordAuthFailure('my-ext', 'AUTH_PERMISSION_DENIED');

// Query failures
const metrics = metricsCollector.getMetrics('my-ext');
// Returns:
{
  validationFailures: {
    'my-ext': {
      'INVALID_PATH': 15,
      'SCHEMA_ERROR': 3
    }
  },
  authFailures: {
    'my-ext': {
      'AUTH_PERMISSION_DENIED': 8,
      'AUTH_RATE_LIMIT': 42
    }
  },
  ...
}
```

### Payload Size Tracking

Track request and response sizes (bytes) for extensions:

```javascript
// Record sizes (bytes)
metricsCollector.recordIntentSize('my-ext', 1024, 2048);

// Query average sizes
const metrics = metricsCollector.getMetrics('my-ext');
// Returns:
{
  intentSizes: {
    'my-ext': {
      avgRequestSize: 1024,
      avgResponseSize: 2048,
      totalRequests: 150,
      totalResponses: 150
    }
  },
  ...
}
```

**Sliding Window**: Last 1000 request/response size samples per extension

### Metrics Reset

Reset metrics for specific extension or all extensions:

```javascript
// Reset single extension
metricsCollector.reset('ghost-git-extension');

// Reset all extensions
metricsCollector.reset();
```

---

## Telemetry HTTP/WebSocket Server

### Server Architecture

**File**: `core/telemetry.js` (Lines 474-933)  
**Classes**: `TelemetryServer`, `Telemetry`

The telemetry server provides dual-protocol access to observability data:

- **HTTP REST**: Synchronous queries for metrics, spans, logs
- **WebSocket**: Real-time event streaming with subscription filtering

```
┌─────────────────────────────────────────────────────────┐
│  TelemetryServer (Port 9876)                            │
│                                                          │
│  HTTP Endpoints:                                        │
│  - GET /health              Health check                │
│  - GET /extensions          Extension list with state   │
│  - GET /gateway/status      Gateway statistics          │
│  - GET /metrics             All metrics                 │
│  - GET /metrics/<ext-id>    Extension-specific metrics  │
│  - GET /spans               Recent spans (default 100)  │
│  - GET /logs?severity=...   Filtered logs               │
│                                                          │
│  WebSocket:                                             │
│  - Upgrade: websocket       Real-time event stream      │
│  - Subscribe to events      span, metric, log           │
│  - Heartbeat (ping/pong)    30s interval                │
│  - Span debouncing          100ms batching              │
└─────────────────────────────────────────────────────────┘
```

### Starting the Server

**CLI Command**:
```bash
ghost console start
ghost console start --port 9876
```

**Programmatic API**:
```javascript
const { Telemetry } = require('./core/telemetry');

const telemetry = new Telemetry({ enabled: true });
const server = telemetry.startServer(9876);

// Server is now listening on http://localhost:9876
```

**Output**:
```
✓ Telemetry server started on http://localhost:9876
  Available endpoints:
    - GET  /health
    - GET  /metrics
    - GET  /metrics/<extension-id>
    - GET  /spans
    - GET  /logs?severity=<level>&limit=<n>
    - WebSocket upgrades supported
```

### REST Endpoints

#### GET /health

Health check endpoint returning current timestamp.

**Request**:
```bash
curl http://localhost:9876/health
```

**Response**:
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:45.123Z"
}
```

#### GET /extensions

List all loaded extensions with runtime state.

**Request**:
```bash
curl http://localhost:9876/extensions
```

**Response**:
```json
[
  {
    "id": "ghost-git-extension",
    "name": "Ghost Git Extension",
    "version": "1.0.0",
    "capabilities": {
      "filesystem": { "read": ["**/*"], "write": [".git/**"] },
      "network": { "allowlist": ["https://api.groq.com"] },
      "git": { "read": true, "write": true }
    },
    "runtime": {
      "loaded": true,
      "hasCleanup": true
    }
  }
]
```

#### GET /gateway/status

Gateway statistics and uptime.

**Request**:
```bash
curl http://localhost:9876/gateway/status
```

**Response**:
```json
{
  "version": "1.0.0",
  "uptime": 3600000,
  "uptimeFormatted": "1h 0m",
  "extensionsLoaded": 3,
  "pipeline": {
    "totalRequests": 1500,
    "totalRateLimitViolations": 12,
    "totalValidationFailures": 3,
    "totalAuthFailures": 15
  },
  "telemetry": {
    "spansCollected": 6000,
    "maxSpans": 1000,
    "wsConnections": 2
  }
}
```

#### GET /metrics

All metrics for all extensions.

**Request**:
```bash
curl http://localhost:9876/metrics
```

**Response**:
```json
{
  "requests": {
    "ghost-git-extension": {
      "intercept": 1234,
      "auth": 1230,
      "audit": 1225,
      "execute": 1220
    }
  },
  "latencies": {
    "ghost-git-extension": {
      "intercept": { "p50": 2, "p95": 5, "p99": 8 },
      "auth": { "p50": 3, "p95": 7, "p99": 12 },
      "audit": { "p50": 5, "p95": 15, "p99": 25 },
      "execute": { "p50": 50, "p95": 150, "p99": 300 }
    }
  },
  "rateLimitViolations": {
    "ghost-git-extension": 12
  },
  "authFailures": {
    "ghost-git-extension": {
      "AUTH_PERMISSION_DENIED": 3
    }
  },
  "validationFailures": {
    "ghost-git-extension": {
      "INVALID_PATH": 2
    }
  },
  "intentSizes": {
    "ghost-git-extension": {
      "avgRequestSize": 512,
      "avgResponseSize": 2048,
      "totalRequests": 1220,
      "totalResponses": 1220
    }
  }
}
```

#### GET /metrics/{extension-id}

Extension-specific metrics.

**Request**:
```bash
curl http://localhost:9876/metrics/ghost-git-extension
```

**Response**: Same structure as `/metrics` but filtered to single extension.

#### GET /spans

Recent spans (default 100, configurable via query param).

**Request**:
```bash
curl http://localhost:9876/spans
curl http://localhost:9876/spans?limit=50
```

**Response**:
```json
[
  {
    "spanId": "k7x9m2p4q1s5",
    "traceId": "abc123def456ghi789",
    "parentSpanId": "j4n8p2r6t9",
    "name": "pipeline.auth",
    "startTime": 1705315845123,
    "endTime": 1705315845130,
    "duration": 7,
    "attributes": {
      "extensionId": "ghost-git-extension",
      "requestId": "req-abc123",
      "authorized": true,
      "rateLimit.available": 95,
      "rateLimit.capacity": 100
    },
    "events": [],
    "status": { "code": "OK" }
  }
]
```

#### GET /logs

Filtered log entries.

**Query Parameters**:
- `severity`: Filter by severity (INFO, WARN, ERROR, SECURITY_ALERT)
- `date`: Filter by ISO date (YYYY-MM-DD)
- `extensionId`: Filter by extension ID
- `requestId`: Filter by request ID
- `layer`: Filter by pipeline layer
- `errorCode`: Filter by error code
- `limit`: Max entries to return (default 100)

**Request**:
```bash
curl "http://localhost:9876/logs?severity=SECURITY_ALERT&limit=50"
```

**Response**:
```json
[
  {
    "timestamp": "2024-01-15T10:30:45.123Z",
    "severity": "SECURITY_ALERT",
    "message": "Authorization denied",
    "extensionId": "suspicious-extension",
    "requestId": "req-xyz789",
    "layer": "Auth",
    "errorCode": "AUTH_PERMISSION_DENIED",
    "reason": "Path not in allowlist",
    "code": "AUTH_PERMISSION_DENIED"
  }
]
```

### WebSocket Protocol

#### Connection Establishment

**Client**:
```javascript
const ws = new WebSocket('ws://localhost:9876');

ws.onopen = () => {
  console.log('Connected to telemetry server');
};
```

**Server**: Performs WebSocket handshake:
1. Validates `Sec-WebSocket-Key` header
2. Computes `Sec-WebSocket-Accept` hash
3. Sends upgrade response
4. Adds client to active connections set

#### Event Subscription

Clients subscribe to specific event types:

**Message Format**:
```json
{
  "type": "subscribe",
  "events": ["span", "log", "metric"]
}
```

**Example**:
```javascript
// Subscribe to span events only
ws.send(JSON.stringify({
  type: 'subscribe',
  events: ['span']
}));

// Unsubscribe from log events
ws.send(JSON.stringify({
  type: 'unsubscribe',
  events: ['log']
}));

// Clear all subscriptions
ws.send(JSON.stringify({
  type: 'clear_subscriptions'
}));
```

**Default Behavior**: If no subscriptions set, client receives all events.

#### Event Streaming

Server broadcasts events to subscribed clients:

**Message Format**:
```json
{
  "event": "span",
  "data": { /* span object */ },
  "timestamp": 1705315845123
}
```

**Example (Span Event)**:
```json
{
  "event": "span",
  "data": {
    "spanId": "k7x9m2p4",
    "traceId": "abc123def456",
    "name": "pipeline.execute",
    "duration": 50,
    "attributes": {
      "extensionId": "ghost-git-extension",
      "success": true
    },
    "status": { "code": "OK" }
  },
  "timestamp": 1705315845123
}
```

#### Span Debouncing

**File**: `core/telemetry.js` (Lines 678-715)  
**Method**: `_bufferSpan()`, `_flushSpanBuffer()`

Spans are debounced to reduce WebSocket message frequency:

**Algorithm**:
1. Span events are buffered in `spanBuffer` array
2. Debounce timer (100ms) is reset on each new span
3. When timer expires, all buffered spans are sent in single batch
4. Clients receive either single span or batch of spans

**Benefit**: Reduces WebSocket overhead during high-throughput periods

**Example (Batched Span Event)**:
```json
{
  "event": "span",
  "data": [
    { "spanId": "span1", "name": "pipeline.intercept", ... },
    { "spanId": "span2", "name": "pipeline.auth", ... },
    { "spanId": "span3", "name": "pipeline.audit", ... }
  ],
  "batch": true,
  "count": 3,
  "timestamp": 1705315845123
}
```

#### Heartbeat (Ping/Pong)

**File**: `core/telemetry.js` (Lines 818-850)  
**Methods**: `_startHeartbeat()`, `_sendHeartbeats()`

Server sends periodic ping frames (30s interval) to detect dead connections:

**Algorithm**:
1. Server sends ping frame (opcode 0x89)
2. Client responds with pong frame (opcode 0x0A)
3. Server marks client as alive
4. If client doesn't respond, connection is closed

**Benefits**:
- Detects network failures
- Cleans up stale connections
- Prevents resource leaks

**Client Response** (automatic in browsers):
```javascript
// Browsers automatically respond to ping with pong
// Manual implementation:
ws.addEventListener('ping', (event) => {
  ws.pong();  // Send pong frame
});
```

#### Connection Management

**Client Tracking**:
```javascript
class TelemetryServer {
  wsClients: Set<{
    socket: Socket,
    subscriptions: Set<string>,
    lastPing: number,
    alive: boolean,
    close: () => void
  }>
}
```

**Lifecycle**:
1. **Connection**: Client added to `wsClients` set
2. **Message Handling**: Parse subscription messages
3. **Heartbeat**: Periodic ping/pong checks
4. **Disconnect**: Client removed from set

**Graceful Shutdown**:
```javascript
// Stop heartbeat timer
clearInterval(heartbeatInterval);

// Close all client connections
for (const client of wsClients) {
  client.close();
}

// Clear clients set
wsClients.clear();
```

---

## Verbose Mode Implementation

### Real-Time Pipeline Visualization

**File**: `ghost.js` (Lines 282-445)  
**Methods**: `_setupVerboseTelemetry()`, `_displaySpan()`, `_sanitizeParams()`

Verbose mode provides real-time visualization of pipeline execution with colored output and rate limit status.

### Enabling Verbose Mode

**CLI Flags**:
```bash
# Show all telemetry
ghost commit --verbose

# Filter by extension ID
ghost commit --verbose=ghost-git-extension

# Filter by intent type
ghost commit --verbose=filesystem
ghost commit --verbose=network
```

**Short Form**:
```bash
ghost commit -v
ghost commit -v=ghost-git-extension
```

### Pipeline Flow Display

Verbose mode displays each pipeline layer with status indicators:

**Color-Coded Status**:
- ✓ (green): Success (status = OK)
- ✗ (red): Failure (status = ERROR)

**Example Output**:
```
[Verbose Mode] Real-time telemetry enabled
[Telemetry] ghost-git-extension → Intercept ✓ 5ms
  Intent: filesystem:read
[Telemetry] ghost-git-extension → Auth ✓ 7ms [95/100]
[Telemetry] ghost-git-extension → Audit ✓ 8ms
[Telemetry] ghost-git-extension → Execute ✓ 50ms
```

**With Rate Limit Warning**:
```
[Telemetry] ghost-git-extension → Auth ✓ 7ms [10/100] ⚠ RATE LIMIT
```

**With Denial**:
```
[Telemetry] suspicious-ext → Auth ✗ 3ms DROPPED: Path not in allowlist
```

**With Validation Violations**:
```
[Telemetry] ghost-git-extension → Audit ✗ 8ms
  Violations: 2
    - INVALID_PATH: Path outside declared patterns
    - SCHEMA_ERROR: Missing required field
```

### Status Symbols and Colors

**File**: `ghost.js` (Lines 384-391)  
**Method**: `_displaySpan()`

```javascript
// Status determination
const statusSymbol = status === 'OK' ? '✓' : '✗';
const statusColor = status === 'OK' ? Colors.GREEN : Colors.FAIL;

// Rate limit color coding
let rateLimitColor = Colors.GREEN;
if (percentage < 20) {
  rateLimitColor = Colors.WARNING;  // Yellow when < 20%
}
```

**Color Constants** (`ghost.js` Lines 15-24):
```javascript
const Colors = {
  HEADER: '\x1b[95m',   // Purple
  BLUE: '\x1b[94m',     // Blue
  CYAN: '\x1b[96m',     // Cyan
  GREEN: '\x1b[92m',    // Green (success)
  WARNING: '\x1b[93m',  // Yellow (warnings)
  FAIL: '\x1b[91m',     // Red (errors)
  ENDC: '\x1b[0m',      // Reset
  BOLD: '\x1b[1m',      // Bold
  DIM: '\x1b[2m'        // Dim (metadata)
};
```

### Rate Limit Violation Display

**File**: `ghost.js` (Lines 394-416)  
**Method**: `_displaySpan()`

Rate limit information is displayed for Auth layer spans:

**Available Tokens Display**:
```javascript
const available = span.attributes['rateLimit.available'];
const capacity = span.attributes['rateLimit.capacity'];
const percentage = (available / capacity * 100).toFixed(0);

displayLine += ` ${rateLimitColor}[${available}/${capacity}]${Colors.ENDC}`;
```

**Example**:
- `[95/100]` - Green (95% available)
- `[50/100]` - Green (50% available)
- `[10/100]` - Yellow (10% available, < 20% threshold)
- `⚠ RATE LIMIT` - Yellow warning when limit exceeded

### Sensitive Data Filtering

**File**: `ghost.js` (Lines 333-356)  
**Method**: `_sanitizeParams()`

Intent parameters are sanitized before display to prevent credential leakage:

**Secret Field Detection**:
```javascript
const sensitiveFields = [
  'api_key', 'apiKey',
  'token',
  'password',
  'secret',
  'auth', 'authorization',
  'credentials'
];
```

**Sanitization**:
- Case-insensitive substring matching
- Recursive object traversal
- Replace sensitive values with `[REDACTED]`

**Example**:
```javascript
// Before sanitization
{
  url: 'https://api.github.com',
  headers: {
    Authorization: 'Bearer sk-abc123',
    'Content-Type': 'application/json'
  }
}

// After sanitization (displayed)
{
  url: 'https://api.github.com',
  headers: {
    Authorization: '[REDACTED]',
    'Content-Type': 'application/json'
  }
}
```

### Filtering Options

**Extension ID Filter**:
```bash
ghost commit --verbose=ghost-git-extension
```
Only displays spans where `extensionId` matches filter.

**Intent Type Filter**:
```bash
ghost commit --verbose=filesystem
```
Only displays spans where intent `type` matches filter.

**Implementation** (`ghost.js` Lines 318-329):
```javascript
_shouldDisplaySpan(span) {
  if (!this.verboseFilter) {
    return true;  // No filter, show all
  }

  const extensionId = span.attributes.extensionId;
  const intentType = span.attributes.type;

  // Filter by extension ID or intent type
  return extensionId === this.verboseFilter || 
         intentType === this.verboseFilter;
}
```

---

## Developer Quickstart

### CLI Commands

**Extension Management**:
```bash
# List installed extensions
ghost extension list

# Install extension
ghost extension install /path/to/extension

# Remove extension
ghost extension remove <extension-id>

# Show extension info
ghost extension info <extension-id>

# Scaffold new extension
ghost extension init my-extension

# Validate extension manifest
ghost extension validate
ghost extension validate /path/to/extension
```

**Gateway Monitoring**:
```bash
# Show gateway status
ghost gateway status
ghost gateway status --json

# Show loaded extensions with runtime state
ghost gateway extensions

# Show extension health
ghost gateway health

# View audit logs
ghost gateway logs
ghost gateway logs --limit 100 --extension ghost-git-extension

# Show telemetry metrics
ghost gateway metrics
ghost gateway metrics ghost-git-extension

# Show recent spans
ghost gateway spans
ghost gateway spans 50
```

**Audit Logs**:
```bash
# View audit logs
ghost audit-log view
ghost audit-log view --limit 100
ghost audit-log view --extension ghost-git-extension
ghost audit-log view --type SECURITY_EVENT
ghost audit-log view --since 2024-01-15
```

**Telemetry Server**:
```bash
# Start telemetry server (default port 9876)
ghost console start

# Start with custom port
ghost console start --port 8080

# Stop telemetry server
ghost console stop
```

**Verbose Mode**:
```bash
# Show all telemetry
ghost commit --verbose

# Filter by extension ID
ghost commit --verbose=ghost-git-extension

# Filter by intent type
ghost commit --verbose=filesystem
ghost audit --verbose=network
```

**Extension Commands** (via ghost-git-extension):
```bash
# AI-powered commit generation
ghost commit
ghost commit --dry-run
ghost commit --verbose

# Security audit
ghost audit
ghost audit --verbose

# Version management
ghost version bump major
ghost version bump minor
ghost version bump patch

# Merge conflict resolution
ghost merge resolve

# Commit history
ghost history
```

### Telemetry Integration

**Starting Telemetry**:
```javascript
const { instrumentPipeline, Telemetry } = require('./core/telemetry');
const { IOPipeline } = require('./core/pipeline');

// Create base pipeline
const basePipeline = new IOPipeline({
  auditLogPath: '/path/to/audit.log'
});

// Instrument with telemetry
const instrumented = instrumentPipeline(basePipeline, {
  enabled: true,
  logDir: '~/.ghost/telemetry/',
  maxSpans: 1000
});

const pipeline = instrumented.pipeline;
const telemetry = instrumented.telemetry;
```

**Starting Telemetry Server**:
```javascript
// Start HTTP/WebSocket server
const server = telemetry.startServer(9876);

// Server now listening on http://localhost:9876

// Stop server
telemetry.stopServer();
```

**Recording Spans**:
```javascript
// Create root span
const rootSpan = telemetry.startSpan('my-operation');
rootSpan.setAttribute('extensionId', 'my-extension');
rootSpan.setAttribute('requestId', 'req-123');

// Create child span
const childSpan = telemetry.startSpan('sub-operation', rootSpan);
childSpan.setAttribute('detail', 'processing');

// Add event
childSpan.addEvent('checkpoint', { progress: '50%' });

// Complete spans
childSpan.setStatus('OK');
childSpan.end();
telemetry.recordSpan(childSpan);

rootSpan.setStatus('OK');
rootSpan.end();
telemetry.recordSpan(rootSpan);
```

**Logging**:
```javascript
// Access logger
const logger = telemetry.logger;

// Log at different severities
logger.info('Operation started', {
  extensionId: 'my-ext',
  requestId: 'req-123'
});

logger.warn('Resource usage high', {
  extensionId: 'my-ext',
  cpuPercent: 85
});

logger.error('Operation failed', {
  extensionId: 'my-ext',
  error: 'Connection timeout',
  code: 'ETIMEDOUT'
});

logger.securityAlert('Suspicious activity', {
  extensionId: 'untrusted-ext',
  reason: 'Attempted unauthorized access',
  code: 'AUTH_VIOLATION'
});
```

**Collecting Metrics**:
```javascript
// Access metrics collector
const metrics = telemetry.metrics;

// Record request
metrics.recordRequest('my-ext', 'execute', 50);  // 50ms latency

// Record failures
metrics.recordRateLimitViolation('my-ext');
metrics.recordValidationFailure('my-ext', 'INVALID_PARAMS');
metrics.recordAuthFailure('my-ext', 'AUTH_DENIED');

// Record payload sizes
metrics.recordIntentSize('my-ext', 1024, 2048);  // request, response bytes

// Query metrics
const allMetrics = metrics.getMetrics();
const extMetrics = metrics.getMetrics('my-ext');
const percentiles = metrics.getLatencyPercentiles('my-ext', 'execute');

// Reset metrics
metrics.reset('my-ext');  // Single extension
metrics.reset();          // All extensions
```

**WebSocket Client**:
```javascript
const ws = new WebSocket('ws://localhost:9876');

ws.onopen = () => {
  // Subscribe to span events
  ws.send(JSON.stringify({
    type: 'subscribe',
    events: ['span']
  }));
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  
  if (message.event === 'span') {
    if (message.batch) {
      console.log(`Received ${message.count} spans`);
      message.data.forEach(span => processSpan(span));
    } else {
      processSpan(message.data);
    }
  }
};

ws.onerror = (error) => {
  console.error('WebSocket error:', error);
};

ws.onclose = () => {
  console.log('Connection closed');
};
```

---

## Implementation Files

### Core Files
- `ghost.js` (Lines 1-1748): GatewayLauncher with orchestration, verbose mode, CLI interface
- `core/telemetry.js` (Lines 1-1541): Telemetry, Span, StructuredLogger, MetricsCollector, TelemetryServer, InstrumentedPipeline
- `core/gateway.js` (Lines 1-245): Gateway with extension discovery and routing
- `core/pipeline/index.js` (Lines 1-170): IOPipeline with 4-layer architecture
- `core/pipeline/intercept.js` (Lines 1-323): Intent validation and deserialization
- `core/pipeline/auth.js` (Lines 1-409): Authorization, rate limiting, traffic policing
- `core/manifest-schema.json` (Lines 1-788): Manifest schema with capability declarations

### Related Documentation
- `core/TELEMETRY.md`: Original telemetry design document
- `core/ARCHITECTURE.md`: Overall system architecture
- `core/SPRINT1_SUMMARY.md`: Gateway and manifest foundation
- `core/SPRINT2_SUMMARY.md`: Pipeline layers (Intercept, Auth, Audit, Execute)
- `core/SPRINT3_SUMMARY.md`: Extension runtime and lifecycle
- `core/SPRINT4_SUMMARY.md`: QoS (trTCM, circuit breakers)
- `core/SPRINT5_SUMMARY.md`: Desktop monitoring console

---

## Summary

Sprint 6 delivers production-grade observability infrastructure with:

✅ **OpenTelemetry Tracing**: 4-layer span hierarchy with trace correlation  
✅ **Structured Logging**: Daily-rotated JSON logs with severity levels and secret sanitization  
✅ **Metrics Collection**: Request counters, latency percentiles (p50/p95/p99), rate limit violations  
✅ **HTTP/WebSocket Server**: REST endpoints + real-time event streaming with debouncing  
✅ **Verbose Mode**: Real-time pipeline visualization with color-coded status and rate limit display  
✅ **Developer Tools**: Comprehensive CLI commands and programmatic APIs  

The telemetry system provides deep visibility into Ghost CLI's operation while maintaining security through automatic secret sanitization and fail-closed error handling.
