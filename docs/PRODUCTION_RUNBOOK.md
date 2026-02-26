# Ghost CLI Production Runbook

## Overview

This runbook provides operational procedures for deploying, monitoring, troubleshooting, and maintaining Ghost CLI in production environments. It covers deployment prerequisites, alert configuration, dashboard interpretation, troubleshooting workflows, security override procedures, and capacity planning.

**Target Audience**: DevOps engineers, SREs, security operations teams  
**Last Updated**: December 2024  
**Applies To**: Ghost CLI v1.0+ with Sprint 10 observability features

---

## Table of Contents

- [Deployment Checklist](#deployment-checklist)
- [Alert Configuration Guide](#alert-configuration-guide)
- [Dashboard Reading Guide](#dashboard-reading-guide)
- [Extension Crash Troubleshooting](#extension-crash-troubleshooting)
- [SI-10 Override Procedure](#si-10-override-procedure)
- [Capacity Planning](#capacity-planning)
- [Emergency Contacts](#emergency-contacts)

---

## Deployment Checklist

### Pre-Deployment Requirements

#### 1. Node.js Version

**Required Version**: Node.js 18.x or higher

**Verification**:
```bash
node --version
# Expected: v18.0.0 or higher
```

**Installation** (if needed):
```bash
# Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# macOS
brew install node@18

# Windows
# Download from https://nodejs.org/
```

**Critical**: Ghost CLI uses Node.js 18+ features including:
- `crypto.randomUUID()` for request IDs
- `fs.copyFileSync()` for atomic writes
- Native `fetch` API (if enabled)
- Performance improvements for process spawning

#### 2. Directory Permissions

**Required Directories**:

| Directory | Path | Permissions | Owner | Purpose |
|-----------|------|-------------|-------|---------|
| Ghost Home | `~/.ghost/` | `755` | Deploy user | Base configuration |
| Audit Logs | `~/.ghost/audit.log` | `600` | Deploy user | Immutable audit trail |
| Telemetry Logs | `~/.ghost/telemetry/` | `755` | Deploy user | OpenTelemetry logs |
| Rate Limits | `~/.ghost/rate-limits.json` | `600` | Deploy user | QoS state persistence |
| Extensions | `~/.ghost/extensions/` | `755` | Deploy user | Extension runtime |

**Setup Script**:
```bash
#!/bin/bash
# setup-ghost-dirs.sh

GHOST_HOME="${HOME}/.ghost"

# Create directories
mkdir -p "${GHOST_HOME}/telemetry"
mkdir -p "${GHOST_HOME}/extensions"

# Set permissions
chmod 755 "${GHOST_HOME}"
chmod 755 "${GHOST_HOME}/telemetry"
chmod 755 "${GHOST_HOME}/extensions"

# Create files with restricted permissions
touch "${GHOST_HOME}/audit.log"
chmod 600 "${GHOST_HOME}/audit.log"

touch "${GHOST_HOME}/rate-limits.json"
chmod 600 "${GHOST_HOME}/rate-limits.json"

echo "Ghost CLI directories initialized"
ls -la "${GHOST_HOME}"
```

**Verification**:
```bash
ls -la ~/.ghost/
# Expected:
# drwxr-xr-x  .ghost/
# -rw-------  audit.log
# -rw-------  rate-limits.json
# drwxr-xr-x  telemetry/
# drwxr-xr-x  extensions/
```

#### 3. Firewall Ports for Telemetry Server

**Required Ports**:

| Port | Protocol | Service | Access | Purpose |
|------|----------|---------|--------|---------|
| `9876` | TCP | HTTP/WebSocket | Localhost only | Telemetry server (default) |
| Custom | TCP | HTTP/WebSocket | Localhost only | If `--port` specified |

**Firewall Configuration**:

**Ubuntu/Debian (UFW)**:
```bash
# Allow localhost only (default - no rule needed)
# Ghost binds to 127.0.0.1 by default

# If exposing to trusted network (NOT RECOMMENDED)
sudo ufw allow from 10.0.0.0/8 to any port 9876
sudo ufw reload
```

**CentOS/RHEL (firewalld)**:
```bash
# Allow localhost only (default - no rule needed)

# If exposing to trusted network (NOT RECOMMENDED)
sudo firewall-cmd --permanent --add-rich-rule='rule family="ipv4" source address="10.0.0.0/8" port port="9876" protocol="tcp" accept'
sudo firewall-cmd --reload
```

**Docker/Kubernetes**:
```yaml
# Do NOT expose telemetry port outside cluster
apiVersion: v1
kind: Service
metadata:
  name: ghost-telemetry
spec:
  type: ClusterIP  # Internal only
  selector:
    app: ghost-cli
  ports:
    - port: 9876
      targetPort: 9876
      protocol: TCP
```

**Security Note**: The telemetry server does NOT implement authentication. Only bind to `localhost` (127.0.0.1) or use a reverse proxy with authentication for production access.

#### 4. NPM Package Installation

**Global Installation** (recommended):
```bash
npm install -g ghost-cli
ghost --version
```

**Local Installation** (per-project):
```bash
npm install ghost-cli
npx ghost --version
```

**Verification**:
```bash
ghost --help
# Should display CLI help with all commands
```

#### 5. Environment Variables

**Optional Configuration**:

| Variable | Default | Purpose |
|----------|---------|---------|
| `GHOST_AUDIT_LOG` | `~/.ghost/audit.log` | Audit log location |
| `GHOST_TELEMETRY_DIR` | `~/.ghost/telemetry` | Telemetry log directory |
| `GHOST_RATE_LIMITS` | `~/.ghost/rate-limits.json` | Rate limit state file |
| `GHOST_TELEMETRY_PORT` | `9876` | Telemetry server port |
| `NODE_ENV` | `production` | Runtime environment |

**Example `.env` file**:
```bash
NODE_ENV=production
GHOST_AUDIT_LOG=/var/log/ghost/audit.log
GHOST_TELEMETRY_DIR=/var/log/ghost/telemetry
GHOST_RATE_LIMITS=/var/lib/ghost/rate-limits.json
GHOST_TELEMETRY_PORT=9876
```

### Deployment Checklist Summary

- [ ] Node.js 18+ installed and verified
- [ ] `~/.ghost/` directory created with correct permissions (755)
- [ ] `~/.ghost/audit.log` created with restricted permissions (600)
- [ ] `~/.ghost/rate-limits.json` created with restricted permissions (600)
- [ ] `~/.ghost/telemetry/` directory created (755)
- [ ] `~/.ghost/extensions/` directory created (755)
- [ ] Firewall configured (localhost-only binding)
- [ ] Ghost CLI package installed globally or locally
- [ ] `ghost --version` command succeeds
- [ ] Environment variables configured (if needed)
- [ ] Telemetry server can start: `ghost console start`
- [ ] Initial smoke test: `ghost commit` (if git repo available)

---

## Alert Configuration Guide

### Overview

Configure alerting based on telemetry metrics and log severity levels. Alerts should focus on rate limit violations, circuit breaker state changes, and security events.

### Critical Metrics to Monitor

#### 1. Rate Limit Violations

**Metric**: `rateLimitViolations` per extension

**Alert Threshold**: `> 10 violations/minute`

**Query** (via HTTP):
```bash
curl http://localhost:9876/metrics | jq '.rateLimitViolations'
```

**Alert Configuration** (Prometheus format):
```yaml
groups:
  - name: ghost_rate_limits
    interval: 30s
    rules:
      - alert: HighRateLimitViolations
        expr: rate(ghost_rate_limit_violations_total[1m]) > 10
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "Extension {{ $labels.extension_id }} exceeding rate limits"
          description: "{{ $value }} violations/min detected"
```

**Response Action**:
1. Check extension behavior in audit logs
2. Review `~/.ghost/rate-limits.json` for current token state
3. Consider increasing CIR/Bc/Be if traffic is legitimate
4. Investigate extension for potential abuse if malicious

#### 2. Circuit Breaker Opens

**Metric**: Circuit breaker state transitions to `OPEN`

**Alert Threshold**: Any circuit breaker `OPEN` state

**Query** (via logs):
```bash
grep "CIRCUIT_OPEN" ~/.ghost/telemetry/telemetry-*.log
```

**Log Pattern**:
```json
{
  "severity": "ERROR",
  "message": "Circuit breaker opened",
  "executor": "filesystem",
  "failures": 5,
  "timestamp": "2024-12-01T10:30:00.000Z"
}
```

**Alert Configuration** (log-based):
```yaml
# Using Loki/Grafana
groups:
  - name: ghost_circuit_breakers
    rules:
      - alert: CircuitBreakerOpen
        expr: |
          count_over_time({service="ghost"} |= "CIRCUIT_OPEN" [5m]) > 0
        labels:
          severity: critical
        annotations:
          summary: "Circuit breaker opened for {{ $labels.executor }}"
```

**Response Action**:
1. Identify which executor is failing (filesystem, network, git, process)
2. Check system resources (disk space, network connectivity, git repo state)
3. Review recent requests in audit log for patterns
4. Reset circuit breaker manually if issue resolved: see [Extension Crash Troubleshooting](#extension-crash-troubleshooting)

#### 3. SECURITY_ALERT Log Severity

**Metric**: Log entries with `severity: "SECURITY_ALERT"`

**Alert Threshold**: Any `SECURITY_ALERT` event

**Log Patterns to Monitor**:

| Event | Code | Severity | Action |
|-------|------|----------|--------|
| Path traversal | `SI-10-PATH-TRAVERSAL` | SECURITY_ALERT | Block, audit |
| Command injection | `SI-10-COMMAND-INJECTION` | SECURITY_ALERT | Block, audit |
| SSRF attempt | `SI-10-SSRF-*` | SECURITY_ALERT | Block, audit |
| Secret detected | `SI-10-SECRET-DETECTION` | SECURITY_ALERT | Block, audit |
| Authorization denied | `AUTH_DENIED` | SECURITY_ALERT | Log only |

**Query** (grep audit logs):
```bash
grep '"type":"SECURITY_EVENT"' ~/.ghost/audit.log | grep '"severity":"SECURITY_ALERT"'
```

**Alert Configuration**:
```yaml
groups:
  - name: ghost_security
    rules:
      - alert: SecurityViolation
        expr: |
          count_over_time({service="ghost",severity="SECURITY_ALERT"} [5m]) > 0
        labels:
          severity: critical
        annotations:
          summary: "NIST SI-10 violation detected"
          description: "Review audit logs immediately"
```

**Response Action**:
1. Review audit log for full event details
2. Identify extension and request causing violation
3. Determine if attack attempt or legitimate misconfiguration
4. Consider disabling extension if malicious
5. File incident report with details from audit log

#### 4. Extension Crash Rate

**Metric**: Extension crash events per hour

**Alert Threshold**: `> 3 crashes/hour` for any extension

**Log Pattern**:
```json
{
  "eventType": "extension_crash",
  "extensionId": "ghost-git-extension",
  "crash": {
    "exitCode": 1,
    "signal": "SIGSEGV",
    "crashType": "segmentation_fault"
  }
}
```

**Query**:
```bash
grep '"eventType":"extension_crash"' ~/.ghost/telemetry/telemetry-*.log | wc -l
```

**Alert Configuration**:
```yaml
groups:
  - name: ghost_extensions
    rules:
      - alert: HighCrashRate
        expr: |
          rate(ghost_extension_crashes_total[1h]) > 3
        labels:
          severity: warning
        annotations:
          summary: "Extension {{ $labels.extension_id }} crashing frequently"
```

**Response Action**:
1. See [Extension Crash Troubleshooting](#extension-crash-troubleshooting)
2. Check crash telemetry for crash type and patterns
3. Review extension logs for error messages
4. Restart extension manually if needed
5. Escalate to extension maintainer if persistent

#### 5. Audit Log Growth Rate

**Metric**: Audit log file size growth

**Alert Threshold**: `> 100MB/day` (adjust based on traffic)

**Query**:
```bash
# Check current size
ls -lh ~/.ghost/audit.log

# Monitor growth rate (run hourly)
stat --format=%s ~/.ghost/audit.log
```

**Alert Configuration** (node-based):
```javascript
const fs = require('fs');
const auditLogPath = '~/.ghost/audit.log';

setInterval(() => {
  const stats = fs.statSync(auditLogPath);
  const sizeMB = stats.size / (1024 * 1024);
  
  if (sizeMB > 1000) { // 1GB threshold
    console.error(`[ALERT] Audit log exceeds 1GB: ${sizeMB}MB`);
    // Trigger alert
  }
}, 3600000); // Check hourly
```

**Response Action**:
1. Implement log rotation (see [Capacity Planning](#capacity-planning))
2. Archive old logs to cold storage
3. Review for abnormal activity causing high volume
4. Adjust retention policy if needed

### Alert Severity Levels

| Level | Threshold | Response Time | Examples |
|-------|-----------|---------------|----------|
| **Critical** | Immediate | < 15 minutes | SECURITY_ALERT, Circuit breaker OPEN |
| **Warning** | Elevated | < 1 hour | High rate limit violations, crash rate |
| **Info** | Informational | Next business day | Normal operations, metrics |

### Alerting Tools Integration

**Example: Grafana Loki**:
```yaml
# loki-config.yaml
schema_config:
  configs:
    - from: 2024-01-01
      store: boltdb-shipper
      object_store: filesystem
      schema: v11
      index:
        prefix: ghost_
        period: 24h

# Query telemetry logs
{service="ghost"} |= "SECURITY_ALERT"
```

**Example: Datadog**:
```javascript
// Send metrics to Datadog
const StatsD = require('node-statsd');
const dogstatsd = new StatsD();

// On rate limit violation
dogstatsd.increment('ghost.rate_limit.violations', 1, ['extension:' + extensionId]);

// On circuit breaker open
dogstatsd.event('Circuit Breaker Open', `Executor: ${executor}`, {
  alert_type: 'error',
  tags: ['executor:' + executor]
});
```

---

## Dashboard Reading Guide

### Telemetry Server Endpoints

The Ghost CLI telemetry server exposes HTTP and WebSocket endpoints for real-time monitoring.

#### HTTP Endpoints Reference

**Base URL**: `http://localhost:9876` (default)

##### 1. Health Check

**Endpoint**: `GET /health`

**Response**:
```json
{
  "status": "ok",
  "timestamp": "2024-12-01T10:30:00.000Z"
}
```

**Use Case**: Verify telemetry server is running

##### 2. All Metrics

**Endpoint**: `GET /metrics`

**Response**:
```json
{
  "requests": {
    "ghost-git-extension": {
      "pipeline.intercept": 1520,
      "pipeline.auth": 1520,
      "pipeline.audit": 1480,
      "pipeline.execute": 1450
    }
  },
  "latencies": {
    "ghost-git-extension": {
      "pipeline.intercept": { "p50": 5, "p95": 12, "p99": 20 },
      "pipeline.auth": { "p50": 8, "p95": 18, "p99": 35 },
      "pipeline.audit": { "p50": 12, "p95": 28, "p99": 45 },
      "pipeline.execute": { "p50": 45, "p95": 120, "p99": 250 }
    }
  },
  "rateLimitViolations": {
    "ghost-git-extension": 23
  },
  "validationFailures": {
    "ghost-git-extension": {
      "SI-10-PATH-TRAVERSAL": 5,
      "SI-10-COMMAND-INJECTION": 2
    }
  },
  "authFailures": {
    "ghost-git-extension": {
      "AUTH_DENIED": 3
    }
  }
}
```

**Use Case**: Dashboard overview, metrics visualization

##### 3. Extension-Specific Metrics

**Endpoint**: `GET /metrics/:extensionId`

**Example**: `GET /metrics/ghost-git-extension`

**Response**: Same structure as `/metrics` but filtered to single extension

**Use Case**: Drill-down into specific extension behavior

##### 4. Recent Spans

**Endpoint**: `GET /spans?limit=100`

**Query Parameters**:
- `limit` (optional): Number of spans to return (default: 100, max: 1000)

**Response**:
```json
[
  {
    "spanId": "abc123",
    "traceId": "xyz789",
    "name": "pipeline.execute",
    "startTime": 1701432600000,
    "endTime": 1701432600045,
    "duration": 45,
    "status": { "code": "OK" },
    "attributes": {
      "extensionId": "ghost-git-extension",
      "requestId": "req_12345",
      "type": "git",
      "operation": "status"
    }
  }
]
```

**Use Case**: Recent activity monitoring, debugging

##### 5. Query Logs

**Endpoint**: `GET /logs?severity=ERROR&limit=50`

**Query Parameters**:
- `severity` (optional): Filter by severity (INFO, WARN, ERROR, SECURITY_ALERT)
- `limit` (optional): Number of log entries (default: 100, max: 1000)

**Response**:
```json
[
  {
    "timestamp": "2024-12-01T10:30:00.000Z",
    "severity": "ERROR",
    "message": "Circuit breaker opened",
    "executor": "filesystem",
    "failures": 5
  }
]
```

**Use Case**: Error investigation, security event review

#### WebSocket Endpoint

**URL**: `ws://localhost:9876`

**Connection**:
```javascript
const ws = new WebSocket('ws://localhost:9876');

ws.on('message', (data) => {
  const event = JSON.parse(data);
  console.log('Event:', event);
});
```

**Event Format**:
```json
{
  "event": "span",
  "data": {
    "spanId": "abc123",
    "name": "pipeline.execute",
    "duration": 45,
    "status": { "code": "OK" }
  },
  "timestamp": 1701432600000
}
```

**Use Case**: Real-time monitoring, live dashboards

### Desktop GatewayTab Interpretation

The Ghost Desktop app provides a visual dashboard in the **Gateway** tab for monitoring pipeline activity.

#### Dashboard Sections

##### 1. Connection Status

**Indicator**: Top-right corner

| Status | Color | Meaning |
|--------|-------|---------|
| Live | Green | Connected to telemetry WebSocket |
| Reconnecting | Yellow (pulsing) | Attempting to reconnect |
| Disconnected | Red | No telemetry connection |
| Error | Red | Connection error |

**Action**: If disconnected, verify telemetry server is running:
```bash
ghost console start
```

##### 2. Pipeline Visualization

**4-Stage Pipeline**:
```
[Intercept] → [Auth] → [Audit] → [Execute]
```

**Request Flow**:
- Animated dots represent active requests
- Color indicates status:
  - **Blue**: Pending/in-progress
  - **Green**: Approved/successful
  - **Red**: Denied/failed
  - **Yellow**: Warning state

**Interpretation**:
- Requests stuck at **Auth**: Rate limit or permission issue
- Requests stuck at **Audit**: NIST SI-10 validation failure
- Requests stuck at **Execute**: Circuit breaker or execution error
- Requests completing quickly: Normal operation

##### 3. Stage Metrics Cards

**Each stage shows**:
- **Latency**: p95 latency in milliseconds
- **Error Rate**: Percentage of failed requests
- **Throughput**: Requests per second
- **Active Requests**: Currently processing

**Healthy Values**:
| Metric | Intercept | Auth | Audit | Execute |
|--------|-----------|------|-------|---------|
| Latency (p95) | < 15ms | < 30ms | < 50ms | < 200ms |
| Error Rate | < 1% | < 5% | < 10% | < 5% |
| Throughput | N/A | N/A | N/A | N/A |

**Troubleshooting**:
- **High latency**: Check CPU usage, increase resources
- **High error rate**: Review audit logs for patterns
- **Low throughput**: Circuit breaker may be open

##### 4. Request History

**Table Columns**:
- **Request ID**: Unique identifier
- **Extension ID**: Which extension initiated
- **Type**: Intent type (filesystem, network, git, process)
- **Operation**: Specific operation (read, fetch, commit, spawn)
- **Stage**: Last pipeline stage reached
- **Status**: Final status (approved, denied, error)
- **Drop Reason**: Why request was denied (if applicable)
- **Drop Layer**: Which layer denied (auth, audit)

**Click to Expand**: Shows full request details including parameters and error messages

**Interpretation**:
- Many **denied** at **auth**: Rate limiting active
- Many **denied** at **audit**: Input validation failing
- Many **error** at **execute**: System or extension issues

##### 5. Real-time Updates

**Auto-refresh**: When WebSocket connected, dashboard updates in real-time

**Manual Refresh**: Click refresh button if connection lost

**Performance**: Dashboard optimized for 1000+ req/sec throughput

### Key Metrics Explained

#### Request Count Drop-off

**Normal Pattern**:
```
Intercept: 1000
Auth: 1000
Audit: 980  (20 denied by auth)
Execute: 950 (30 denied by audit)
```

**Interpretation**:
- **Auth drop**: Rate limiting working as designed
- **Audit drop**: Input validation catching malicious/malformed requests
- **Execute success rate**: 95% success is healthy

#### Latency Percentiles

**p50 (median)**: Half of requests faster, half slower  
**p95**: 95% of requests faster, 5% slower  
**p99**: 99% of requests faster, 1% slower

**Example**:
```
p50: 15ms  → Typical request time
p95: 45ms  → Slow but acceptable
p99: 120ms → Slowest requests (edge cases)
```

**Alert if**: p95 > 100ms or p99 > 500ms

#### Rate Limit Colors

Based on Three-Color Marker (RFC 2697):

| Color | Meaning | Token Source | Action |
|-------|---------|--------------|--------|
| Green | Conforming | Committed bucket (Bc) | Allow |
| Yellow | Exceeding | Excess bucket (Be) | Allow (warn) |
| Red | Violating | No tokens available | Drop |

**Dashboard Display**:
- Green traffic: Normal operations
- Yellow traffic: Burst capacity being used
- Red traffic: Rate limit violations (dropped)

---

## Extension Crash Troubleshooting

### Crash Detection and Recovery

Extensions run in isolated Node.js child processes. The runtime detects crashes via:
- Non-zero exit codes
- Signal termination (SIGSEGV, SIGABRT, etc.)
- Unexpected process disconnection

### Troubleshooting Flowchart

```
Extension Crash Detected
         ↓
┌────────────────────┐
│ 1. Check Runtime   │
│    State           │
└────────┬───────────┘
         ↓
┌────────────────────┐
│ 2. Check Audit     │
│    Logs            │
└────────┬───────────┘
         ↓
┌────────────────────┐
│ 3. Restart         │
│    Extension       │
└────────┬───────────┘
         ↓
     Success? ──No──> Escalate
         │
        Yes
         ↓
     Resolved
```

### Step 1: Check Runtime State

**Command**:
```bash
ghost gateway metrics --json | jq '.extensions'
```

**Check For**:

1. **Extension State**:
   - `RUNNING`: Normal operation
   - `DEGRADED`: Heartbeat failures detected
   - `FAILED`: Exceeded restart limit
   - `STOPPED`: Intentionally stopped

2. **Restart Count**:
   ```json
   {
     "restartCount": 5,
     "consecutiveRestarts": 3
   }
   ```
   - If `consecutiveRestarts >= 3`: Extension in crash loop

3. **Health State**:
   ```json
   {
     "healthState": "UNHEALTHY",
     "heartbeat": {
       "consecutiveFailures": 5,
       "successRate": 0.2
     }
   }
   ```
   - `UNHEALTHY`: Extension not responding to heartbeats

**Action**: Note state for next steps

### Step 2: Check Audit Logs

**Query Crash Telemetry**:
```bash
# Recent crashes
grep '"eventType":"extension_crash"' ~/.ghost/telemetry/telemetry-$(date +%Y-%m-%d).log | tail -5

# Specific extension
grep '"extensionId":"ghost-git-extension"' ~/.ghost/telemetry/telemetry-$(date +%Y-%m-%d).log | grep crash
```

**Analyze Crash Details**:

```json
{
  "eventType": "extension_crash",
  "timestamp": "2024-12-01T10:30:45.123Z",
  "extensionId": "ghost-git-extension",
  "crash": {
    "pid": 12345,
    "exitCode": 1,
    "signal": null,
    "uptime": 15234,
    "crashType": "general_error"
  },
  "state": {
    "previousState": "RUNNING",
    "pendingRequestCount": 3,
    "restartCount": 2,
    "consecutiveRestarts": 1
  }
}
```

**Crash Type Reference**:

| Crash Type | Exit Code | Signal | Likely Cause |
|------------|-----------|--------|--------------|
| `clean_exit` | 0 | - | Normal shutdown (not a crash) |
| `general_error` | 1 | - | Uncaught exception, validation error |
| `segmentation_fault` | - | SIGSEGV | Memory access violation, native addon crash |
| `aborted` | - | SIGABRT | Assert failure, explicit abort |
| `force_killed` | - | SIGKILL | Process killed forcefully (OOM, timeout) |
| `terminated` | - | SIGTERM | Graceful shutdown request |
| `bus_error` | - | SIGBUS | Hardware memory alignment issue |
| `floating_point_exception` | - | SIGFPE | Division by zero, math error |

**Check Audit Logs for Request Patterns**:
```bash
# Requests before crash
grep '"extensionId":"ghost-git-extension"' ~/.ghost/audit.log | tail -20
```

**Look For**:
- Specific operation causing crash (e.g., always crashes on `git.push`)
- Input validation failures preceding crash
- Pattern of requests (volume, frequency)

### Step 3: Restart Extension

**Manual Restart** (if available):

```bash
# Via Ghost CLI (if command exists)
ghost extension restart ghost-git-extension

# Via Desktop App
# Navigate to Extensions tab → Select extension → Click "Restart"
```

**Automatic Restart**:

The runtime automatically restarts crashed extensions with exponential backoff:

| Attempt | Delay | Total Time |
|---------|-------|------------|
| 1st | 1s | 1s |
| 2nd | 2s | 3s |
| 3rd | 4s | 7s |
| 4th | 8s | 15s |
| 5th | 16s | 31s |
| Max | 30s | - |

**Restart Limit**: Max 3 restarts per 60-second window

**Manual Reset** (if restart limit exceeded):

If extension enters `FAILED` state:

1. **Stop the runtime**:
   ```bash
   # Stop telemetry server if running
   ghost console stop
   ```

2. **Clear rate limit state** (optional):
   ```bash
   # Backup first
   cp ~/.ghost/rate-limits.json ~/.ghost/rate-limits.json.backup
   
   # Edit to remove extension or reset tokens
   nano ~/.ghost/rate-limits.json
   ```

3. **Restart runtime**:
   ```bash
   ghost console start
   ```

### Step 4: Escalation

**Escalate If**:
- Extension crashes persist after 3 restart attempts
- Crash type is `segmentation_fault` or `bus_error` (likely native code issue)
- Crash only occurs with specific input (potential security issue)
- Extension enters `FAILED` state and won't recover

**Escalation Information to Gather**:

1. **Crash Telemetry**:
   ```bash
   grep '"extensionId":"EXTENSION_NAME"' ~/.ghost/telemetry/telemetry-*.log | grep crash > crash-report.json
   ```

2. **Audit Logs** (last 100 requests):
   ```bash
   grep '"extensionId":"EXTENSION_NAME"' ~/.ghost/audit.log | tail -100 > audit-context.json
   ```

3. **System Information**:
   ```bash
   uname -a > system-info.txt
   node --version >> system-info.txt
   npm list -g ghost-cli >> system-info.txt
   ```

4. **Extension Manifest**:
   ```bash
   cat ~/.ghost/extensions/EXTENSION_NAME/manifest.json > manifest.json
   ```

**Submit To**:
- Extension maintainer (GitHub issues)
- Security team (if crash appears exploit-related)
- DevOps team (for infrastructure issues)

### Common Crash Scenarios

#### Scenario 1: Memory Leak Leading to OOM

**Symptoms**:
- Crash type: `force_killed` (SIGKILL)
- Increasing uptime before each crash
- System memory pressure

**Investigation**:
```bash
# Check system memory
free -h

# Monitor extension memory (if process still running)
ps aux | grep EXTENSION_NAME
```

**Resolution**:
- Restart extension regularly (cron job)
- Report to extension maintainer
- Reduce extension workload

#### Scenario 2: Unhandled Promise Rejection

**Symptoms**:
- Crash type: `general_error` (exit code 1)
- Audit logs show async operation before crash
- Crash is intermittent

**Investigation**:
- Check for pending requests in crash telemetry
- Review audit logs for failed async operations

**Resolution**:
- Extension needs proper error handling
- Report to maintainer with request details

#### Scenario 3: Native Addon Crash

**Symptoms**:
- Crash type: `segmentation_fault` (SIGSEGV)
- Crash is deterministic (same input)
- Occurs in extensions using native addons

**Investigation**:
- Identify native addon (check package.json)
- Test with minimal input

**Resolution**:
- Update native addon to latest version
- Report to addon maintainer
- Switch to pure JavaScript alternative

### Circuit Breaker State Check

If extension isn't crashing but not processing requests:

**Check Circuit Breaker State**:
```bash
# Via telemetry logs
grep "circuit_breaker" ~/.ghost/telemetry/telemetry-*.log | tail -10
```

**Circuit Breaker States**:
- `CLOSED`: Normal operation
- `OPEN`: 5+ failures, blocking requests for 60s cooldown
- `HALF_OPEN`: Testing recovery after cooldown

**Manual Reset**:

If circuit breaker stuck OPEN:

1. **Identify executor** (filesystem, network, git, process)
2. **Fix underlying issue** (disk space, network, git repo)
3. **Reset circuit breaker** (requires code access):

```javascript
// Via runtime API (if exposed)
const { IOPipeline } = require('./core/pipeline');
const pipeline = new IOPipeline();
pipeline.executionLayer.resetCircuitBreaker('filesystem'); // or network, git, process
```

**Automatic Recovery**: Circuit breaker auto-recovers after cooldown if underlying issue resolved

---

## SI-10 Override Procedure

### NIST SI-10 Input Validation Overview

Ghost CLI implements NIST SP 800-53 SI-10 controls to prevent:
- **Path Traversal**: `SI-10-PATH-TRAVERSAL`
- **Command Injection**: `SI-10-COMMAND-INJECTION`
- **SSRF Attacks**: `SI-10-SSRF-*`
- **Secret Exposure**: `SI-10-SECRET-DETECTION`

**Default Behavior**: All SI-10 violations **block execution** and log `SECURITY_ALERT` events.

### When to Use Manual Override

**Approved Use Cases**:

1. **False Positives in Path Validation**:
   - Legitimate paths incorrectly flagged as traversal
   - Example: `../configs/valid-config.json` in allowed directory

2. **Intentional Special Characters**:
   - Shell metacharacters needed for legitimate commands
   - Example: Git commands with `--option=value|filter`

3. **Development/Testing**:
   - Testing SI-10 detection mechanisms
   - Validating audit logging

4. **Trusted Internal Traffic**:
   - Internal tools with verified safe inputs
   - Controlled environment with additional security layers

**NEVER Override For**:
- Unknown or untrusted input sources
- Production user-facing services without additional validation
- Suspected attack traffic
- Automated escalation without human review

### Override Methods

Ghost CLI does **NOT** provide built-in SI-10 override flags to prevent accidental security bypasses. Overrides must be implemented via code changes with full audit trail.

#### Method 1: Allowlist Specific Patterns

**Use Case**: Specific paths or patterns known to be safe

**Implementation**:

1. **Edit `core/validators/path-validator.js`**:

```javascript
// Add to PathValidator class
constructor(options = {}) {
    this.allowedPaths = options.allowedPaths || [];
    this.overridePatterns = options.overridePatterns || []; // NEW
}

isPathAllowed(filePath, allowedPatterns) {
    // NEW: Check override patterns first
    for (const pattern of this.overridePatterns) {
        if (filePath.match(pattern)) {
            console.warn(`[SI-10 OVERRIDE] Path allowed via override: ${filePath}`);
            return { allowed: true, reason: 'Override pattern matched' };
        }
    }
    
    // Existing validation logic
    // ...
}
```

2. **Configure in pipeline**:

```javascript
const { IOPipeline } = require('./core/pipeline');

const pipeline = new IOPipeline({
    pathValidatorOptions: {
        overridePatterns: [
            /^\.\.\/configs\/[a-zA-Z0-9\-]+\.json$/, // Allow ../configs/*.json
        ]
    }
});
```

3. **Audit Requirement**:
   - Log all override uses with `SECURITY_ALERT` severity
   - Include pattern matched and actual path
   - Review override logs weekly

#### Method 2: Environment-Specific Validation

**Use Case**: Disable SI-10 validation in development environments only

**Implementation**:

```javascript
// core/pipeline/audit.js

class AuditLayer {
    constructor(options = {}) {
        this.strictValidation = options.strictValidation !== false;
        this.environment = options.environment || process.env.NODE_ENV || 'production';
    }
    
    async validate(intent, manifest) {
        // In development, log violations but don't block
        if (this.environment === 'development' && !this.strictValidation) {
            const result = await this._performValidation(intent, manifest);
            
            if (!result.valid) {
                console.warn('[SI-10 DEVELOPMENT MODE] Validation failed but allowing:', result.violations);
                this.logger.logSecurityEvent(intent.extensionId, 'VALIDATION_OVERRIDE', {
                    severity: 'SECURITY_ALERT',
                    environment: this.environment,
                    violations: result.violations,
                    reason: 'Development mode override'
                });
                
                // Override: allow despite violations
                return { valid: true, violations: result.violations, overridden: true };
            }
            
            return result;
        }
        
        // Production: strict validation (default behavior)
        return this._performValidation(intent, manifest);
    }
}

// Usage
const pipeline = new IOPipeline({
    environment: 'development', // or 'production'
    strictValidation: false // Only in development
});
```

**Safeguards**:
- Only active when `NODE_ENV=development`
- Requires explicit `strictValidation: false` flag
- All overrides logged to audit trail
- Production environment ALWAYS enforces strict validation

#### Method 3: Request-Specific Bypass

**Use Case**: Single request needs SI-10 bypass for emergency fix

**Implementation**:

```javascript
// Add to IOPipeline class
async processWithOverride(intent, overrideReason, approver) {
    // Validate override authorization
    if (!approver || typeof overrideReason !== 'string') {
        throw new Error('SI-10 override requires approver and reason');
    }
    
    // Log override attempt
    this.auditLogger.logSecurityEvent(intent.extensionId, 'SI10_OVERRIDE_REQUESTED', {
        severity: 'SECURITY_ALERT',
        requestId: intent.requestId,
        approver,
        reason: overrideReason,
        timestamp: new Date().toISOString()
    });
    
    // Temporarily disable validation
    const originalValidator = this.auditLayer.validator;
    this.auditLayer.validator = {
        validate: async () => ({ valid: true, overridden: true })
    };
    
    try {
        const result = await this.process(intent);
        
        // Log override success
        this.auditLogger.logSecurityEvent(intent.extensionId, 'SI10_OVERRIDE_COMPLETED', {
            severity: 'SECURITY_ALERT',
            requestId: intent.requestId,
            approver,
            success: true
        });
        
        return result;
    } catch (error) {
        // Log override failure
        this.auditLogger.logSecurityEvent(intent.extensionId, 'SI10_OVERRIDE_FAILED', {
            severity: 'SECURITY_ALERT',
            requestId: intent.requestId,
            approver,
            error: error.message
        });
        throw error;
    } finally {
        // Restore validation
        this.auditLayer.validator = originalValidator;
    }
}

// Usage
const result = await pipeline.processWithOverride(
    intent,
    'Emergency fix for production issue #12345',
    'john.doe@company.com'
);
```

### Audit Requirements

**All SI-10 overrides MUST**:

1. **Log to Audit Trail**:
   ```json
   {
     "type": "SECURITY_EVENT",
     "eventType": "SI10_OVERRIDE_REQUESTED",
     "severity": "SECURITY_ALERT",
     "requestId": "req_12345",
     "extensionId": "ghost-git-extension",
     "approver": "john.doe@company.com",
     "reason": "Emergency fix for production issue #12345",
     "timestamp": "2024-12-01T10:30:00.000Z"
   }
   ```

2. **Require Human Approval**:
   - Approver email/ID in audit log
   - Reason documented
   - Time-limited (expire after 24 hours if not used)

3. **Generate Alert**:
   - Notify security team immediately
   - Include full request details
   - Link to audit log entry

4. **Post-Override Review**:
   - Weekly review of all override events
   - Validate reason was legitimate
   - Update allowlists to prevent future overrides if pattern is safe

### Override Monitoring

**Query Override Events**:
```bash
# All overrides
grep '"eventType":"SI10_OVERRIDE' ~/.ghost/audit.log

# Recent overrides (last 24 hours)
grep '"eventType":"SI10_OVERRIDE' ~/.ghost/audit.log | grep "$(date -d '24 hours ago' --iso-8601)"

# Count by approver
grep '"eventType":"SI10_OVERRIDE' ~/.ghost/audit.log | jq -r '.approver' | sort | uniq -c
```

**Weekly Report Script**:
```bash
#!/bin/bash
# generate-override-report.sh

AUDIT_LOG=~/.ghost/audit.log
REPORT_FILE="override-report-$(date +%Y-%m-%d).txt"

echo "=== SI-10 Override Report ===" > "$REPORT_FILE"
echo "Generated: $(date)" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

echo "Total Overrides:" >> "$REPORT_FILE"
grep '"eventType":"SI10_OVERRIDE_REQUESTED"' "$AUDIT_LOG" | wc -l >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

echo "By Approver:" >> "$REPORT_FILE"
grep '"eventType":"SI10_OVERRIDE_REQUESTED"' "$AUDIT_LOG" | jq -r '.approver' | sort | uniq -c >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

echo "Recent Events (Last 7 Days):" >> "$REPORT_FILE"
grep '"eventType":"SI10_OVERRIDE' "$AUDIT_LOG" | tail -50 >> "$REPORT_FILE"

cat "$REPORT_FILE"
```

### Revoking Overrides

**Immediate Revocation**:

1. **Stop runtime**:
   ```bash
   ghost console stop
   ```

2. **Revert code changes** (if using Method 1 or 2)

3. **Clear override flags** (if using Method 3):
   - Remove override allowlists from configuration
   - Restart with strict validation enabled

4. **Restart runtime**:
   ```bash
   ghost console start
   ```

5. **Verify**:
   ```bash
   # Test that SI-10 validation is active
   # Attempt known violation, should be blocked
   ```

---

## Capacity Planning

### Log Retention Sizing

#### Audit Logs

**Growth Factors**:
- Request rate: Requests per minute
- Extension count: Number of active extensions
- Validation failures: Percentage of requests failing validation

**Size Estimation Formula**:
```
Daily Size (MB) = (Requests/min × 60 × 24 × Entry Size) / (1024 × 1024)

Where Entry Size ≈ 500 bytes per request (2 log entries: INTENT + EXECUTION)
```

**Example Calculations**:

| Requests/Min | Extensions | Daily Size | Weekly Size | Monthly Size |
|--------------|------------|------------|-------------|--------------|
| 10 | 1 | 7 MB | 49 MB | 210 MB |
| 100 | 5 | 70 MB | 490 MB | 2.1 GB |
| 1000 | 10 | 700 MB | 4.9 GB | 21 GB |
| 5000 | 20 | 3.5 GB | 24.5 GB | 105 GB |

**Recommended Retention**:

| Environment | Retention Period | Compression | Archive |
|-------------|------------------|-------------|---------|
| Development | 7 days | None | No |
| Staging | 30 days | gzip | Monthly |
| Production | 90 days | gzip | Quarterly |
| Compliance | 1-7 years | gzip + S3/Glacier | Yearly |

#### Telemetry Logs

**Growth Pattern**:
- Spans: ~1KB per request (4 spans per request × 250 bytes)
- Daily rotation reduces single file size

**Size Estimation**:
```
Daily Size (MB) = (Requests/min × 60 × 24 × 1KB) / 1024

Example: 1000 req/min = ~1.4 GB/day
```

**Retention Strategy**:
```bash
# Keep last 7 days, compress older
find ~/.ghost/telemetry -name "telemetry-*.log" -mtime +7 -exec gzip {} \;

# Delete logs older than 30 days
find ~/.ghost/telemetry -name "telemetry-*.log.gz" -mtime +30 -delete
```

#### Log Rotation Configuration

**Using `logrotate` (Linux)**:

Create `/etc/logrotate.d/ghost-cli`:

```
/home/*/.ghost/audit.log {
    daily
    rotate 90
    compress
    delaycompress
    missingok
    notifempty
    create 0600 user user
    postrotate
        # Optional: notify monitoring system
        /usr/local/bin/notify-log-rotated.sh
    endscript
}

/home/*/.ghost/telemetry/telemetry-*.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    create 0644 user user
}
```

**Manual Rotation Script**:

```bash
#!/bin/bash
# rotate-ghost-logs.sh

GHOST_HOME=~/.ghost
AUDIT_LOG="$GHOST_HOME/audit.log"
TELEMETRY_DIR="$GHOST_HOME/telemetry"
ARCHIVE_DIR="$GHOST_HOME/archive"

# Create archive directory
mkdir -p "$ARCHIVE_DIR"

# Rotate audit log
if [ -f "$AUDIT_LOG" ]; then
    TIMESTAMP=$(date +%Y%m%d-%H%M%S)
    mv "$AUDIT_LOG" "$ARCHIVE_DIR/audit-$TIMESTAMP.log"
    touch "$AUDIT_LOG"
    chmod 600 "$AUDIT_LOG"
    gzip "$ARCHIVE_DIR/audit-$TIMESTAMP.log"
fi

# Rotate telemetry logs older than 1 day
find "$TELEMETRY_DIR" -name "telemetry-*.log" -mtime +1 -exec mv {} "$ARCHIVE_DIR/" \;
find "$ARCHIVE_DIR" -name "telemetry-*.log" -exec gzip {} \;

# Delete archives older than 90 days
find "$ARCHIVE_DIR" -name "*.log.gz" -mtime +90 -delete

echo "Log rotation complete: $(date)"
```

**Cron Job** (run daily at 2 AM):
```bash
crontab -e

# Add:
0 2 * * * /usr/local/bin/rotate-ghost-logs.sh >> /var/log/ghost-rotation.log 2>&1
```

### Rate Limit Tuning for High-Traffic Environments

#### Understanding Rate Limit Parameters

**Three-Color Marker (RFC 2697)**:

| Parameter | Description | Tuning Impact |
|-----------|-------------|---------------|
| **CIR** | Committed Information Rate (tokens/min) | Sustained throughput |
| **Bc** | Committed Burst Size (tokens) | Normal burst capacity |
| **Be** | Excess Burst Size (tokens) | Overflow burst capacity |

**Traffic Classification**:
- **Green**: Tokens from Bc (conforming traffic)
- **Yellow**: Tokens from Be (exceeding traffic)
- **Red**: No tokens (violating traffic - dropped)

#### Tuning Strategies

##### Strategy 1: High Sustained Throughput

**Use Case**: Extension with steady, predictable traffic

**Configuration**:
```json
{
  "capabilities": {
    "network": {
      "rateLimit": {
        "cir": 600,    // 10 req/sec sustained (600/min)
        "bc": 1000,    // 100 seconds of burst
        "be": 500      // 50 seconds overflow
      }
    }
  }
}
```

**Behavior**:
- Sustained rate: 10 req/sec (600/min)
- Burst capacity: 1500 requests total
- Recovery time: ~2.5 minutes to refill from empty

##### Strategy 2: Bursty Traffic

**Use Case**: Extension with periodic spikes (cron jobs, webhooks)

**Configuration**:
```json
{
  "capabilities": {
    "network": {
      "rateLimit": {
        "cir": 60,      // 1 req/sec baseline
        "bc": 5000,     // Large burst capacity
        "be": 10000     // Very large overflow
      }
    }
  }
}
```

**Behavior**:
- Baseline: 1 req/sec
- Can handle 15,000 request burst
- Refills at 60 tokens/min (1 token/sec)

##### Strategy 3: Strict Rate Limiting

**Use Case**: Untrusted or rate-sensitive APIs

**Configuration**:
```json
{
  "capabilities": {
    "network": {
      "rateLimit": {
        "cir": 60,     // 1 req/sec
        "bc": 100,     // Small burst
        "be": 50       // Minimal overflow
      }
    }
  }
}
```

**Behavior**:
- Strict 1 req/sec average
- Limited burst tolerance
- Quick rate limit enforcement

#### Tuning Process

1. **Baseline Measurement**:
   ```bash
   # Monitor current traffic
   ghost gateway metrics ghost-git-extension --json | jq '.requests'
   ```

2. **Analyze Traffic Patterns**:
   ```bash
   # Check rate limit violations
   grep '"color":"red"' ~/.ghost/audit.log | wc -l
   
   # Check yellow (exceeding) traffic
   grep '"color":"yellow"' ~/.ghost/audit.log | wc -l
   ```

3. **Calculate Required CIR**:
   ```
   Target CIR = (Peak Requests/Hour × 1.2) / 60
   
   Example: 10,000 req/hour peak
   CIR = (10,000 × 1.2) / 60 = 200 tokens/min
   ```

4. **Set Burst Capacity**:
   ```
   Bc = CIR × Expected Burst Duration (seconds)
   
   Example: 5-second burst
   Bc = 200 × 5 = 1000 tokens
   ```

5. **Set Overflow Capacity**:
   ```
   Be = Bc × 0.5 to 2.0 (depending on tolerance)
   
   Conservative: Be = Bc × 0.5 = 500
   Permissive: Be = Bc × 2.0 = 2000
   ```

6. **Apply and Monitor**:
   ```bash
   # Update manifest.json
   nano ~/.ghost/extensions/extension-name/manifest.json
   
   # Restart extension
   ghost extension restart extension-name
   
   # Monitor for 24 hours
   watch -n 60 'ghost gateway metrics extension-name'
   ```

7. **Adjust Based on Data**:
   - Too many red violations: Increase CIR or Bc
   - Mostly yellow traffic: Increase Bc (committed capacity)
   - No yellow/red: Can reduce to save tokens

#### Production Sizing Examples

**Small Deployment** (< 100 req/min):
```json
{
  "cir": 120,    // 2 req/sec
  "bc": 200,     // 100 seconds capacity
  "be": 100      // 50 seconds overflow
}
```

**Medium Deployment** (100-1000 req/min):
```json
{
  "cir": 600,    // 10 req/sec
  "bc": 1000,    // 100 seconds capacity
  "be": 500      // 50 seconds overflow
}
```

**Large Deployment** (1000-10000 req/min):
```json
{
  "cir": 6000,   // 100 req/sec
  "bc": 10000,   // 100 seconds capacity
  "be": 5000     // 50 seconds overflow
}
```

**Enterprise Deployment** (10000+ req/min):
```json
{
  "cir": 60000,  // 1000 req/sec
  "bc": 100000,  // 100 seconds capacity
  "be": 50000    // 50 seconds overflow
}
```

### Disk Space Planning

**Total Disk Requirements**:

```
Total = Audit Logs + Telemetry Logs + Rate Limit State + Extensions

Example (1000 req/min, 10 extensions, 30 days retention):
  Audit: 700 MB/day × 30 = 21 GB
  Telemetry: 1.4 GB/day × 30 = 42 GB
  Rate Limits: ~1 MB (negligible)
  Extensions: 10 × 5 MB = 50 MB
  
  Total: ~63 GB + 20% overhead = 76 GB
```

**Monitoring Disk Usage**:
```bash
#!/bin/bash
# monitor-ghost-disk.sh

GHOST_HOME=~/.ghost
THRESHOLD_GB=50

USAGE=$(du -sh "$GHOST_HOME" | cut -f1)
USAGE_GB=$(du -s "$GHOST_HOME" | awk '{print int($1/1024/1024)}')

echo "Ghost Home Usage: $USAGE ($USAGE_GB GB)"

if [ "$USAGE_GB" -gt "$THRESHOLD_GB" ]; then
    echo "[ALERT] Ghost home directory exceeds ${THRESHOLD_GB}GB threshold"
    # Trigger alert
fi
```

### Memory Planning

**Ghost CLI Runtime**:
- Base: 50-100 MB
- Per extension: 20-50 MB
- Telemetry: 10-20 MB (spans in memory)

**Total Estimation**:
```
Total Memory = Base + (Extension Count × 50 MB) + Telemetry

Example: 10 extensions
  = 100 MB + (10 × 50 MB) + 20 MB
  = 620 MB
  
Recommended: 1-2 GB allocated
```

### CPU Planning

**Load Patterns**:
- Intercept layer: 5-10% CPU per 100 req/sec
- Auth layer: 8-15% CPU per 100 req/sec (rate limiting)
- Audit layer: 12-20% CPU per 100 req/sec (validation)
- Execute layer: Variable (depends on operation)

**Recommended CPU**:

| Traffic | vCPUs | Notes |
|---------|-------|-------|
| < 100 req/min | 1-2 | Sufficient for small deployments |
| 100-1000 req/min | 2-4 | Medium deployments |
| 1000-10000 req/min | 4-8 | Large deployments with bursts |
| 10000+ req/min | 8+ | Enterprise, multi-core scaling |

---

## Emergency Contacts

### Escalation Matrix

| Issue Type | Severity | Contact | Response Time |
|------------|----------|---------|---------------|
| Security Incident | Critical | security@company.com | < 15 min |
| System Down | Critical | oncall@company.com | < 30 min |
| Performance Degradation | High | devops@company.com | < 1 hour |
| Extension Crash | Medium | extension-team@company.com | < 4 hours |
| Configuration Issue | Low | support@company.com | Next business day |

### On-Call Procedures

1. **Acknowledge Alert**: Respond within SLA
2. **Assess Impact**: Check dashboard, logs, metrics
3. **Follow Runbook**: Use appropriate troubleshooting section
4. **Escalate if Needed**: Contact next tier if unresolved in 30 min
5. **Document**: Update incident log with resolution

### Useful Commands Quick Reference

```bash
# Check Ghost CLI status
ghost --version

# Start telemetry server
ghost console start

# Stop telemetry server
ghost console stop

# View metrics
ghost gateway metrics

# View recent spans
ghost gateway spans 50

# Check audit logs
tail -f ~/.ghost/audit.log

# Check telemetry logs
tail -f ~/.ghost/telemetry/telemetry-$(date +%Y-%m-%d).log

# Find SECURITY_ALERT events
grep '"severity":"SECURITY_ALERT"' ~/.ghost/audit.log

# Check circuit breaker state
grep "circuit_breaker" ~/.ghost/telemetry/telemetry-*.log

# Monitor disk usage
du -sh ~/.ghost/

# Check rate limit violations
grep '"code":"QOS_VIOLATING"' ~/.ghost/audit.log | wc -l
```

---

**End of Production Runbook**

For additional documentation, see:
- [Telemetry System](../core/TELEMETRY.md)
- [Extension Crash Isolation](./CRASH_ISOLATION.md)
- [QoS Token Bucket](../core/qos/README.md)
- [Sprint 10 Summary](../core/SPRINT10_SUMMARY.md)
