# Ghost CLI Telemetry System

## Overview

The Ghost CLI telemetry system provides comprehensive OpenTelemetry-based observability for the pipeline architecture. It captures spans, logs, and metrics for all pipeline operations, enabling deep visibility into the Gateway's behavior.

## Architecture

The telemetry system consists of the following components:

```
┌─────────────────────────────────────────────────┐
│             Telemetry System                    │
├─────────────────────────────────────────────────┤
│                                                 │
│  ┌──────────────┐  ┌──────────────┐            │
│  │    Spans     │  │     Logs     │            │
│  │              │  │  (Structured)│            │
│  └──────────────┘  └──────────────┘            │
│                                                 │
│  ┌──────────────┐  ┌──────────────┐            │
│  │   Metrics    │  │  HTTP/WS     │            │
│  │  (Collector) │  │   Server     │            │
│  └──────────────┘  └──────────────┘            │
│                                                 │
└─────────────────────────────────────────────────┘
           ▲                        │
           │                        │
           │    Pipeline Layers     │
           │                        ▼
┌──────────┴────────────────────────────────────┐
│  Intercept → Auth → Audit → Execute          │
└───────────────────────────────────────────────┘
```

## Features

### 1. Distributed Tracing (Spans)

Every pipeline request is traced through all four layers:

- **pipeline.intercept**: Message deserialization and intent extraction
- **pipeline.auth**: Authorization and rate limiting
- **pipeline.audit**: NIST SI-10 validation
- **pipeline.execute**: Operation execution with circuit breakers

Each span captures:
- Extension ID
- Request ID
- Operation type and parameters
- Start time, end time, duration
- Status (OK, ERROR, UNSET)
- Custom attributes and events

### 2. Structured Logging

Logs are written to `~/.ghost/telemetry/telemetry-YYYY-MM-DD.log` in JSON format:

```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "severity": "INFO",
  "message": "Span completed",
  "spanId": "abc123",
  "traceId": "xyz789",
  "name": "pipeline.auth",
  "duration": 15,
  "attributes": {
    "extensionId": "ghost-git-extension",
    "requestId": "req_12345"
  },
  "status": { "code": "OK" }
}
```

#### Severity Levels

- **INFO**: Normal operations (span completion, extension registration)
- **WARN**: Warnings (rate limit warnings, audit warnings)
- **ERROR**: Errors (execution failures, validation errors)
- **SECURITY_ALERT**: Security events (authorization denied, validation failures)

### 3. Metrics Collection

The system collects the following metrics per extension:

#### Request Count
- Total requests per pipeline stage
- Tracked by `extensionId:stage`

#### Latency Percentiles
- p50, p95, p99 latency per stage
- Rolling window of last 1000 requests

#### Rate Limit Violations
- Count of rate limit denials per extension

#### Validation Failures
- Count and breakdown by failure reason

#### Auth Failures
- Count and breakdown by authorization code

### 4. HTTP/WebSocket Server

The telemetry server exposes real-time observability via HTTP and WebSocket endpoints.

#### HTTP Endpoints

**GET /health**
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**GET /metrics**
```json
{
  "requests": {
    "ghost-git-extension": {
      "pipeline.intercept": 100,
      "pipeline.auth": 100,
      "pipeline.audit": 100,
      "pipeline.execute": 95
    }
  },
  "latencies": {
    "ghost-git-extension": {
      "pipeline.intercept": { "p50": 5, "p95": 12, "p99": 20 }
    }
  },
  "rateLimitViolations": {
    "ghost-git-extension": 3
  }
}
```

**GET /metrics/:extensionId**

Get metrics for a specific extension.

**GET /spans**

Returns recent spans (last 100 by default).

**GET /logs?severity=INFO&limit=100**

Query logs by severity and limit.

#### WebSocket Support

Connect to `ws://localhost:9876` to receive real-time span events:

```json
{
  "event": "span",
  "data": {
    "spanId": "abc123",
    "traceId": "xyz789",
    "name": "pipeline.execute",
    "duration": 45,
    "status": { "code": "OK" }
  },
  "timestamp": 1705315800000
}
```

## Usage

### CLI Commands

#### Start Telemetry Server

```bash
ghost console start
ghost console start --port 9876
```

#### Stop Telemetry Server

```bash
ghost console stop
```

#### View Metrics

```bash
# All metrics
ghost gateway metrics

# Extension-specific
ghost gateway metrics ghost-git-extension

# JSON output
ghost gateway metrics --json
```

#### View Spans

```bash
# Last 50 spans
ghost gateway spans

# Last 100 spans
ghost gateway spans 100

# JSON output
ghost gateway spans --json
```

### Programmatic API

```javascript
const { IOPipeline, instrumentPipeline } = require('./core/pipeline');

// Create base pipeline
const basePipeline = new IOPipeline({ auditLogPath: './audit.log' });

// Instrument with telemetry
const { pipeline, telemetry } = instrumentPipeline(basePipeline, {
  enabled: true,
  logDir: './custom-logs',
  maxSpans: 5000
});

// Register extension
pipeline.registerExtension('my-extension', manifest);

// Start HTTP/WebSocket server
telemetry.startServer(9876);

// Process requests (automatic tracing)
const result = await pipeline.process({
  type: 'filesystem',
  operation: 'read',
  params: { path: 'file.txt' },
  extensionId: 'my-extension'
});

// Query metrics
const metrics = telemetry.metrics.getMetrics('my-extension');

// Query spans
const spans = telemetry.getRecentSpans(100);

// Query logs
const logs = telemetry.logger.readLogs({ severity: 'ERROR', limit: 50 });

// Stop server
telemetry.stopServer();
```

## Configuration

### Options

```javascript
instrumentPipeline(pipeline, {
  enabled: true,              // Enable/disable telemetry
  logDir: '~/.ghost/telemetry', // Log directory
  maxSpans: 1000              // Max spans to keep in memory
});
```

### Environment Variables

None required. The system uses zero external dependencies and writes to the local filesystem.

## Storage

### Log Files

Location: `~/.ghost/telemetry/telemetry-YYYY-MM-DD.log`

Logs are rotated daily. Each log entry is a newline-delimited JSON object.

### Retention

The system does not automatically delete old logs. Implement external log rotation if needed.

## Performance

### Overhead

- **Spans**: ~50-100μs per span creation
- **Logging**: Asynchronous file writes (non-blocking)
- **Metrics**: In-memory, O(1) updates
- **Server**: Minimal overhead, handles 1000+ req/sec

### Memory Usage

- Spans: ~500 bytes per span × max spans (default: 1000)
- Metrics: ~1KB per extension
- Logs: Written to disk, not held in memory

## Integration with Desktop Console

The telemetry HTTP/WebSocket server is designed to integrate with the Ghost Desktop monitoring console. The desktop app can:

1. Connect to `ws://localhost:9876`
2. Receive real-time span events
3. Query metrics and logs via HTTP
4. Display dashboards and visualizations

## Security Considerations

### Data Sanitization

Sensitive data in logs is automatically sanitized:
- Secrets are redacted from log output
- Content over 200 chars is truncated
- Full data is never logged, only metadata

### Access Control

The telemetry server binds to `localhost` only and does not implement authentication. For production use:

1. Use a reverse proxy with authentication
2. Firewall the telemetry port
3. Restrict access to trusted networks

### Audit Trail

All telemetry events are also recorded in the main audit log (`~/.ghost/audit.log`), providing an immutable record.

## Troubleshooting

### Server Won't Start

**Error**: Port already in use

**Solution**: Change port or stop conflicting service
```bash
ghost console start --port 9877
```

### No Spans Recorded

**Check**: Telemetry enabled
```javascript
const { pipeline, telemetry } = instrumentPipeline(basePipeline, {
  enabled: true  // Must be true
});
```

### High Memory Usage

**Solution**: Reduce max spans
```javascript
instrumentPipeline(basePipeline, { maxSpans: 500 });
```

### Logs Not Written

**Check**: Directory permissions
```bash
ls -la ~/.ghost/telemetry
chmod 755 ~/.ghost/telemetry
```

## Examples

### Example 1: Basic Usage

```bash
# Start server
ghost console start

# In another terminal, run operations
ghost commit
ghost audit

# View metrics
ghost gateway metrics

# View spans
ghost gateway spans 20
```

### Example 2: Programmatic Integration

See `core/examples/demo-telemetry.js` for a complete example.

### Example 3: Query via HTTP

```bash
# Health check
curl http://localhost:9876/health

# All metrics
curl http://localhost:9876/metrics

# Extension-specific metrics
curl http://localhost:9876/metrics/ghost-git-extension

# Recent spans
curl http://localhost:9876/spans

# Error logs
curl 'http://localhost:9876/logs?severity=ERROR&limit=10'
```

## Future Enhancements

- [ ] OpenTelemetry OTLP exporter support
- [ ] Jaeger/Zipkin integration
- [ ] Prometheus metrics endpoint
- [ ] Custom span attributes configuration
- [ ] Trace sampling configuration
- [ ] Metrics aggregation and retention policies
- [ ] Alert configuration and webhooks
- [ ] Distributed tracing across extensions

## References

- [OpenTelemetry Specification](https://opentelemetry.io/docs/specs/otel/)
- [Ghost CLI Gateway Architecture](../GATEWAY.md)
- [Pipeline Documentation](./pipeline/README.md)
