# Changelog

All notable changes to Ghost CLI will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2024-01-15

### 🎉 Major Release: Production-Ready Gateway Architecture

Ghost CLI v1.0.0 represents a complete transformation from a simple Git CLI tool to an enterprise-grade, extensible gateway platform with comprehensive security, analytics, and operational maturity features.

---

## 🚨 Breaking Changes from v0.4.0

### 1. **ExtensionWrapper Pattern Required** (BREAKING)

**What Changed:**
- Extensions must now use the `ExtensionWrapper` pattern for subprocess communication
- Direct stdio JSON-RPC communication is deprecated
- All extensions must implement standard lifecycle methods (`init`, `cleanup`)

**Migration Required:**
Previously (v0.4.0):
```javascript
// Old direct communication
class MyExtension {
    async myCommand(params) {
        return { success: true };
    }
}

module.exports = MyExtension;
```

Now (v1.0.0):
```javascript
const ExtensionWrapper = require('./core/examples/extension-wrapper');

class MyExtension {
    async init(config) {
        // Initialize extension
    }

    async myCommand(params) {
        return { success: true };
    }

    async cleanup() {
        // Cleanup resources
    }
}

const wrapper = new ExtensionWrapper(new MyExtension());
wrapper.start();

module.exports = MyExtension;
```

**Why This Change:**
- Standardizes extension lifecycle management
- Improves process isolation and signal handling
- Enables graceful shutdown and resource cleanup
- Better error handling and JSON-RPC compliance

**Reference:**
- See `core/examples/extension-wrapper.js` for implementation
- See `core/examples/sample-subprocess-extension.js` for complete example

### 2. **Extension SDK v1.0.0** (BREAKING)

**What Changed:**
- `@ghost/extension-sdk` is now required for all extension development
- Direct intent creation is discouraged; use SDK helper methods
- Typed error classes replace generic errors

**Migration Required:**
```bash
# Install SDK in your extension
npm install @ghost/extension-sdk
```

Previously (v0.4.0):
```javascript
// Manual intent creation
const intent = {
    type: 'filesystem',
    operation: 'read',
    params: { path: './file.txt' }
};
```

Now (v1.0.0):
```javascript
const { ExtensionSDK } = require('@ghost/extension-sdk');

class MyExtension {
    constructor() {
        this.sdk = new ExtensionSDK('my-extension-id');
    }

    async myCommand() {
        const content = await this.sdk.requestFileRead({ path: './file.txt' });
        return { success: true, content };
    }
}
```

**Benefits:**
- Type-safe API with TypeScript definitions
- Built-in error handling with typed error classes
- Batch operations support
- Timeout and retry strategies
- Comprehensive documentation

**SDK Documentation:**
- See `packages/extension-sdk/README.md` for complete API reference
- See `docs/extension-api.md` for I/O intent schema reference

### 3. **Manifest Schema Changes** (BREAKING)

**What Changed:**
- `capabilities` field is now strictly enforced
- Rate limiting configuration moved to `capabilities.network.rateLimit`
- New `version` field format validation

**Migration Required:**
Update your `manifest.json`:

```json
{
  "id": "my-extension",
  "name": "My Extension",
  "version": "1.0.0",
  "main": "index.js",
  "capabilities": {
    "filesystem": {
      "read": ["**/*.js", "**/*.json"],
      "write": ["output/**/*"]
    },
    "network": {
      "allowlist": ["https://api.example.com"],
      "rateLimit": {
        "cir": 60,
        "bc": 100
      }
    },
    "git": {
      "read": true,
      "write": false
    }
  }
}
```

**Validation:**
```bash
ghost extension validate ./path/to/extension
```

**Reference:**
- See `core/MANIFEST_REFERENCE.md` for complete schema

### 4. **Configuration File Changes** (BREAKING)

**What Changed:**
- Configuration moved from `~/.ghostrc` to `~/.ghost/config/ghostrc.json`
- New structured configuration with security sections
- Environment variables follow new naming: `GHOST_*` prefix

**Migration Required:**
Old location: `~/.ghostrc`
```json
{
  "prompt": "Custom prompt",
  "provider": "anthropic"
}
```

New location: `~/.ghost/config/ghostrc.json`
```json
{
  "prompt": "Custom prompt",
  "provider": "anthropic",
  "model": "claude-3-5-sonnet-20240620",
  "security": {
    "telemetryAuth": {
      "enabled": true,
      "requireAuth": true
    },
    "codeSigning": {
      "requireSigned": false
    }
  }
}
```

**Automatic Migration:**
Ghost CLI will automatically migrate your old config on first run.

### 5. **API Endpoint Changes** (BREAKING)

**What Changed:**
- Telemetry server now requires authentication by default
- New API endpoints added with versioned paths
- WebSocket support deprecated in favor of HTTP/2

**Migration Required:**
```bash
# Generate authentication token
ghost telemetry generate-token --user admin

# Use token in requests
curl -H "Authorization: Bearer <token>" http://localhost:9876/api/metrics
```

**New Endpoints:**
- `/api/debugger/*` - Extension debugging
- `/api/profiling/*` - Performance profiling
- `/api/playground/*` - Intent testing
- `/api/devmode/*` - Developer mode control
- `/api/operational-maturity/*` - Operational status
- `/api/sla/*` - SLA monitoring
- `/api/chaos/*` - Chaos engineering
- `/api/compliance/*` - Compliance reporting

---

## ✨ New Features

### 🔐 Security Hardening

#### 1. **Telemetry Server Authentication**
- JWT token-based authentication with configurable expiry
- API key authentication with usage tracking
- Refresh token support for session management
- Token revocation capabilities
- Automatic secret generation and secure storage

**Usage:**
```bash
# Generate JWT token
ghost telemetry generate-token --user admin

# Generate API key
ghost telemetry generate-apikey --name monitoring --permissions read,write

# List API keys
ghost telemetry list-apikeys

# Revoke API key
ghost telemetry revoke-apikey <key>
```

**Location:** `core/telemetry-auth.js`

#### 2. **Extension Code Signing**
- RSA 4096-bit digital signatures for extensions
- Certificate trust management
- Certificate revocation list (CRL)
- Extension tampering detection
- Developer certificate lifecycle management

**Usage:**
```bash
# Generate developer certificate
ghost sign init --developer email@example.com

# Sign extension
ghost sign extension ./extension --cert ./cert.key

# Verify extension
ghost sign verify ./extension

# Revoke certificate
ghost sign revoke-cert <certId> --reason compromised
```

**Location:** `core/code-signing.js`

#### 3. **Security Policy Engine**
- Custom policy definition and enforcement
- NIST SI-10 input validation
- Request size limits
- Network destination whitelisting
- File access pattern control
- Command injection prevention

**Default Policies:**
- Max request size: 10MB
- Allowed network destinations (blocks private IPs)
- File access patterns (restricts system directories)
- Rate limit: 100 requests/min per extension
- Concurrent connections: Max 10

**Usage:**
```bash
# List policies
ghost policy list

# Add custom policy
ghost policy add --file policy.json

# Enable/disable policy
ghost policy enable <policyId>
ghost policy disable <policyId>
```

**Location:** `core/security-policy-engine.js`

#### 4. **Intrusion Detection System (IDS)**
- Behavioral baseline learning
- Anomaly detection (CPU spikes, memory spikes, unusual network activity)
- Real-time threat scoring with MITRE ATT&CK mapping
- Pattern recognition
- Alert generation with severity levels

**Monitored Metrics:**
- CPU usage patterns
- Memory consumption
- Network request frequency
- Destination patterns
- Validation failure rates

**Usage:**
```bash
# Check IDS status
ghost ids status

# View alerts
ghost ids alerts --extension <extensionId>

# Reset baseline
ghost ids reset-baseline --extension <extensionId>
```

**Location:** `core/intrusion-detection.js`

#### 5. **Secrets Management**
- AES-256-GCM encryption at rest
- HashiCorp Vault integration
- AWS Secrets Manager support
- Per-extension secret isolation
- Secret rotation with access tracking

**Usage:**
```bash
# Store secret
ghost secrets set <key> --value <value> --extension <extensionId>

# Retrieve secret
ghost secrets get <key> --extension <extensionId>

# Rotate secret
ghost secrets rotate <key> --extension <extensionId>
```

**Location:** `core/secrets-manager.js`

#### 6. **Security Dashboard**
- Real-time threat indicators
- MITRE ATT&CK framework mapping (12 tactics)
- Security metrics aggregation
- Threat timeline visualization
- Extension threat profiling
- Policy violation tracking

**Usage:**
```bash
# View security dashboard
ghost security dashboard

# View security metrics
ghost security metrics

# View extension threats
ghost security threats --extension <extensionId>

# View threat timeline
ghost security timeline --hours 24
```

**Location:** `core/security-dashboard.js`

**Documentation:** See `SECURITY_HARDENING_IMPLEMENTATION.md`

### 📊 Analytics & Observability Platform

#### 1. **Extension Analytics Collector**
- Real-time invocation tracking
- Resource usage monitoring (CPU, memory, I/O, network)
- Success/failure rate calculation
- Duration percentiles (p50, p95, p99)
- Automatic data persistence with configurable retention (30 days default)

**Metrics Collected:**
- Invocation count, success/failure rates
- Duration statistics
- Resource consumption statistics
- Historical trend analysis

**Location:** `core/analytics/collector.js`

#### 2. **Behavior Analytics**
- User behavior pattern analysis
- Command sequence tracking
- Most used commands and extensions
- Workflow pattern detection
- Next command prediction with probability scores

**Insights:**
- Top 10 most used commands
- Extension usage ranking
- Common workflow patterns
- Session-level analytics

**Location:** `core/analytics/behavior-analytics.js`

#### 3. **Cost Attribution System**
- Multi-resource cost tracking (CPU, memory, I/O, network, storage)
- Configurable billing rates per resource type
- Billing period management
- Cost projections based on historical usage
- Cost alerts for threshold violations
- Marketplace billing integration (per-invocation, tiered, subscription, usage-based)

**Location:** `core/analytics/cost-attribution.js`

#### 4. **Performance Regression Detection**
- Version-based metric tracking
- Baseline setting for reference versions
- Automated regression detection (configurable thresholds)
- Version comparison with percentage changes
- Performance trend analysis
- Alert generation for regressions

**Thresholds:**
- Duration regression: 20%
- CPU usage regression: 30%
- Memory usage regression: 30%
- Error rate regression: 10%

**Location:** `core/analytics/performance-regression.js`

#### 5. **Distributed Tracing**
- Full distributed tracing with trace/span hierarchy
- Cross-extension call tracking
- Call graph generation
- Multiple visualization formats (Mermaid, DOT, JSON)
- Span logging and tagging

**Location:** `core/analytics/distributed-tracing.js`

#### 6. **Recommendation Engine**
- Repository analysis (languages, frameworks, commit patterns)
- Intelligent extension recommendations
- Multi-factor scoring system
- User feedback integration
- Category-based filtering

**Analysis Factors:**
- Programming languages used
- Frameworks detected (React, Vue, Express, Django, etc.)
- Commit patterns
- Repository structure
- Team size and activity level

**Location:** `core/analytics/recommendation-engine.js`

**Documentation:** See `ANALYTICS_IMPLEMENTATION.md`

### 🏭 Operational Maturity Framework

#### 1. **SLA Monitoring & Alerting**
- SLA objectives tracking (availability, latency, error rate)
- Error budget monitoring with automatic resets
- Burn rate monitoring (fast/slow windows)
- Alert generation for budget exhaustion
- Prometheus metrics export

**SLA Objectives:**
- Availability: 99.9% (30-day window)
- P95 Latency: <200ms (24-hour window)
- Error Rate: <1% (24-hour window)

**Usage:**
```bash
# View SLA status
ghost sla status

# View SLA alerts
ghost sla alerts

# Acknowledge alert
ghost sla acknowledge <alertId>
```

**Location:** `core/sla-monitoring.js`

#### 2. **Runbook Automation**
- Pre-configured runbooks for common incidents
- Auto-execution for safe operations
- Manual approval for destructive operations
- PagerDuty and Opsgenie integration
- Execution history tracking

**Pre-configured Runbooks:**
- Restart failed extension (auto-execute)
- Clear rate limit state (manual approval)
- Reset circuit breaker (manual approval)
- Scale rate limits (auto-execute)
- Cleanup stuck requests (auto-execute)

**Usage:**
```bash
# Execute runbook
ghost runbook execute <runbookId> --context '{"extensionId":"ext-1"}'

# View execution history
ghost runbook history --limit 10
```

**Location:** `core/runbook-automation.js`

#### 3. **Chaos Engineering**
- 6 pre-defined failure types (crash, network latency, resource exhaustion, random errors, circuit breaker trip, rate limit exceed)
- Pre-defined experiments with configurable probability
- Resilience report generation
- Active experiment tracking

**Usage:**
```bash
# Create chaos experiment
ghost chaos create --type extension_crash --probability 0.05 --duration 5m

# Start experiment
ghost chaos start <experimentId>

# Stop experiment
ghost chaos stop <experimentId>

# Generate resilience report
ghost chaos report
```

**Location:** `core/chaos-engineering.js`

#### 4. **Capacity Forecasting**
- Time-series analysis with trend calculation
- 24-step ahead predictions (24 minutes)
- Exhaustion time predictions
- Growth rate analysis
- Capacity recommendations

**Tracked Metrics:**
- Request rates (requests/min)
- P95 latency (ms)
- Memory usage (%)
- CPU usage (%)
- Error rate (%)

**Usage:**
```bash
# View forecasts
ghost capacity forecasts

# View exhaustion warnings
ghost capacity warnings

# Export time-series data
ghost capacity export --metric requests --start 1h
```

**Location:** `core/capacity-forecasting.js`

#### 5. **Compliance Evidence Collection**
- SOC 2 Type II compliance (5 controls)
- ISO 27001:2013 compliance (4 controls)
- Evidence collection with SHA-256 hashing
- Audit trail generation
- Compliance status tracking

**Supported Frameworks:**
- SOC 2 Type II (CC6.1, CC6.7, CC7.2, CC7.3, CC8.1)
- ISO 27001:2013 (A.5.1.2, A.8.1.1, A.12.1.1, A.12.4.1)
- HIPAA (extensible)
- GDPR (extensible)

**Usage:**
```bash
# Generate SOC 2 report
ghost compliance report soc2 --start 30d

# Generate ISO 27001 report
ghost compliance report iso27001 --start 30d

# View compliance status
ghost compliance status
```

**Location:** `core/compliance-evidence.js`

#### 6. **Grafana Dashboard**
- Pre-configured SLO dashboard
- 11 panels including error budget, burn rates, and alerts
- Prometheus integration
- Real-time metrics visualization

**Location:** `core/grafana-dashboard-slo.json`

#### 7. **Operational Maturity Scoring**
- Automated maturity score calculation (0-100)
- Readiness level assessment (Production Ready, Near Production, Development, Early Stage, Initial)
- Component health tracking
- Recommendations for improvement

**Scoring Factors:**
- SLA Health (25%)
- Capacity Management (20%)
- Resilience (20%)
- Automation (20%)
- Compliance (15%)

**Usage:**
```bash
# View operational status
ghost operational-maturity status

# Generate maturity report
ghost operational-maturity report
```

**Location:** `core/operational-maturity.js`

**Documentation:** See `OPERATIONAL_MATURITY_IMPLEMENTATION.md`

### 🛠️ Developer Experience Enhancements

#### 1. **Hot Module Reloading**
- Automatic detection of manifest.json changes
- Automatic detection of code changes (.js files)
- File system watchers with configurable paths
- Graceful runtime restart
- Excludes node_modules and .git directories

**Location:** `core/dev-mode.js`

#### 2. **Extension Debugger**
- Attach Node.js debugger to running extensions
- Support for breakpoints with conditions
- Chrome DevTools integration
- Debug state tracking per extension
- Graceful detach

**Desktop UI:** `desktop/src/components/ExtensionDebugger.tsx`
**API Endpoints:**
- `POST /api/debugger/:extensionId/attach`
- `POST /api/debugger/:extensionId/detach`
- `POST /api/debugger/:extensionId/breakpoint`

**Location:** `core/debugger-adapter.js`

#### 3. **Intent Playground**
- Interactive intent builder with templates
- Real-time JSON validation
- Execute intents against running extensions
- Template library (filesystem, network, git operations)
- Performance timing measurement

**Desktop UI:** `desktop/src/components/IntentPlayground.tsx`
**API Endpoints:**
- `POST /api/playground/validate`
- `POST /api/playground/execute`

#### 4. **Profiling Dashboard**
- CPU usage tracking
- Memory usage monitoring (heap, RSS, external)
- Execution statistics (duration, calls, max duration)
- Bottleneck detection (>500ms operations)
- Flamegraph generation

**Desktop UI:** `desktop/src/components/ProfilingDashboard.tsx`
**API Endpoints:**
- `GET /api/profiling/metrics`
- `GET /api/profiling/flamegraph/:extensionId`
- `POST /api/profiling/reset`

**Location:** `core/profiler.js`

#### 5. **Developer Mode**
- Disable rate limiting for extensions
- Relax validation rules
- Enable hot reload by default
- Enable debug mode logging
- Configurable per-feature flags

**Usage:**
```bash
# Enable developer mode
ghost devmode enable

# Disable developer mode
ghost devmode disable

# View status
ghost devmode status
```

**API Endpoints:**
- `GET /api/devmode/status`
- `POST /api/devmode/enable`
- `POST /api/devmode/disable`

**Location:** `core/dev-mode.js`

#### 6. **Extension Template Wizard**
- Interactive extension scaffolding
- 3 templates: Basic (JavaScript), TypeScript, Advanced (with tests)
- Generates complete extension structure
- README, .gitignore, and package.json included

**Usage:**
```bash
# Start wizard
ghost extension init

# Follow prompts to create extension
```

**Templates:**
- **Basic:** manifest.json, index.js, README.md
- **TypeScript:** + tsconfig.json, src/index.ts, build scripts
- **Advanced:** + test framework (Mocha), complete structure

**Location:** `core/template-wizard.js`

**Documentation:** See `DEVELOPER_EXPERIENCE_IMPLEMENTATION.md`

### 🌐 Marketplace & Distribution

#### 1. **Marketplace Service**
- Extension discovery and browsing
- Installation from marketplace
- Version management
- Rating and review system
- Extension statistics

**Location:** `core/marketplace.js`

#### 2. **Webhook System**
- Event-driven webhooks for extension lifecycle
- HTTP/HTTPS delivery with retries
- Signature verification (HMAC-SHA256)
- Webhook management API
- Event filtering and routing

**Supported Events:**
- extension.installed
- extension.uninstalled
- extension.updated
- extension.failed
- extension.metrics

**Location:** `core/webhooks/`

**Documentation:** See `WEBHOOK_IMPLEMENTATION.md`

### 🔄 Extension Mesh (Multi-Node)

#### 1. **Distributed Extension Mesh**
- Multi-node extension discovery and routing
- Load balancing across mesh nodes
- Health monitoring and automatic failover
- gRPC-based inter-node communication
- Consistent hash routing

**Location:** `core/mesh/`

**Documentation:** See `MESH_IMPLEMENTATION.md`, `MESH_SUMMARY.md`

---

## 🔧 Improvements

### Performance Optimizations

#### Sprint 9 Performance Enhancements
- **Throughput:** 1,247 req/s (59% improvement from baseline)
- **p95 Latency:** 28ms (<50ms target)
- **CPU Usage:** 78% (17% reduction)
- **Memory Growth:** 39% over 60s (<50% target)

**Key Optimizations:**
1. O(1) Set lookups (replaced array scans)
2. Memoization with >95% hit rate
3. Object pooling (60% GC reduction)
4. Regex caching for path validation
5. Pre-computation of rate constants

**Documentation:** See `PERFORMANCE.md`, `core/SPRINT9_PERFORMANCE.md`

### Extension Runtime Improvements
- Circuit breaker enhancements with half-open state
- Advanced rate limiting with token bucket (RFC 2698)
- Subprocess lifecycle improvements
- Heartbeat monitoring
- Auto-restart on crashes

### Pipeline Architecture Enhancements
- Enhanced validation with NIST SI-10 compliance
- Improved authorization layer with capability caching
- Audit layer with entropy scanning
- Execution layer with circuit breakers and timeouts

### Desktop Console Improvements
- React 18 upgrade with modern hooks
- TypeScript strict mode
- TailwindCSS 3.x styling
- Zustand state management
- Real-time telemetry updates
- Developer tab with debugging tools

---

## 📚 Documentation

### New Documentation Files
- `SECURITY_HARDENING_IMPLEMENTATION.md` - Complete security features guide
- `ANALYTICS_IMPLEMENTATION.md` - Analytics platform documentation
- `OPERATIONAL_MATURITY_IMPLEMENTATION.md` - Operational maturity guide
- `DEVELOPER_EXPERIENCE_IMPLEMENTATION.md` - Developer tools documentation
- `WEBHOOK_IMPLEMENTATION.md` - Webhook system guide
- `MESH_IMPLEMENTATION.md` - Extension mesh architecture
- `PERFORMANCE.md` - Performance optimization guide
- `docs/DEVELOPER_TOOLKIT.md` - Complete extension development guide
- `docs/extension-api.md` - I/O intent schema reference
- `docs/extension-examples.md` - Working extension examples
- `docs/QUICK_REFERENCE.md` - Quick reference card
- `core/MANIFEST_REFERENCE.md` - Manifest schema reference
- `packages/extension-sdk/README.md` - SDK documentation

### Updated Documentation
- `README.md` - Updated with v1.0.0 features
- `AGENTS.md` - Updated build/test/lint commands
- `INSTALL.md` - Updated installation instructions

---

## 🔄 Migration Guide

### Step-by-Step Migration from v0.4.0

#### 1. Update Extension Code

**Install Dependencies:**
```bash
cd your-extension
npm install @ghost/extension-sdk
```

**Update Extension Entry Point:**
```javascript
// Before (v0.4.0)
class MyExtension {
    async myCommand(params) {
        return { success: true };
    }
}
module.exports = MyExtension;

// After (v1.0.0)
const { ExtensionSDK } = require('@ghost/extension-sdk');
const ExtensionWrapper = require('../../core/examples/extension-wrapper');

class MyExtension {
    constructor() {
        this.sdk = new ExtensionSDK('my-extension-id');
    }

    async init(config) {
        // Initialize extension
    }

    async myCommand(params) {
        // Use SDK for I/O operations
        const content = await this.sdk.requestFileRead({ path: './file.txt' });
        return { success: true, content };
    }

    async cleanup() {
        // Cleanup resources
    }
}

// Wrap and start
const wrapper = new ExtensionWrapper(new MyExtension());
wrapper.start();

module.exports = MyExtension;
```

#### 2. Update Manifest

**Validate and update your manifest.json:**
```bash
ghost extension validate ./your-extension
```

**Ensure required fields:**
```json
{
  "id": "my-extension",
  "name": "My Extension",
  "version": "1.0.0",
  "main": "index.js",
  "capabilities": {
    "filesystem": {
      "read": ["**/*.js"],
      "write": ["output/**/*"]
    },
    "network": {
      "allowlist": ["https://api.example.com"],
      "rateLimit": {
        "cir": 60,
        "bc": 100
      }
    },
    "git": {
      "read": true,
      "write": false
    }
  }
}
```

#### 3. Update Configuration

**Backup old config:**
```bash
cp ~/.ghostrc ~/.ghostrc.backup
```

**Ghost CLI will auto-migrate config on first run to:**
```
~/.ghost/config/ghostrc.json
```

**Or manually create:**
```json
{
  "prompt": "Your custom prompt",
  "provider": "anthropic",
  "model": "claude-3-5-sonnet-20240620"
}
```

#### 4. Update Environment Variables

**Rename environment variables with GHOST_ prefix:**
```bash
# Before
export GIT_COMMIT_PROMPT="..."
export ANTHROPIC_API_KEY="..."

# After
export GHOST_PROMPT="..."
export GHOST_ANTHROPIC_API_KEY="..."
```

#### 5. Update API Integrations

**If you integrate with telemetry server, add authentication:**
```bash
# Generate token
ghost telemetry generate-token --user admin

# Use in requests
curl -H "Authorization: Bearer <token>" http://localhost:9876/api/metrics
```

#### 6. Test Extension

```bash
# Validate extension
ghost extension validate ./your-extension

# Install extension
ghost extension install ./your-extension

# Test command
ghost your-command --verbose
```

#### 7. Enable Optional Features

**Enable developer mode (development only):**
```bash
ghost devmode enable
```

**Configure security features (production):**
```bash
# Enable code signing
ghost sign init --developer your@email.com

# Configure policies
ghost policy list
```

---

## 🐛 Bug Fixes

- Fixed subprocess cleanup on extension crash
- Fixed memory leak in telemetry collector
- Fixed race condition in circuit breaker state transitions
- Fixed validation bypass in network operations
- Fixed audit log rotation issues
- Fixed extension discovery on Windows
- Fixed JSON-RPC error code consistency
- Fixed rate limiter token bucket edge cases
- Fixed hot reload file watcher memory leaks
- Fixed distributed tracing span correlation

---

## 🔒 Security

### Security Advisories
- **GHSA-2024-001:** Rate limit bypass via batch operations (Fixed)
- **GHSA-2024-002:** Command injection in git operations (Fixed via policy engine)
- **GHSA-2024-003:** SSRF vulnerability in network validation (Fixed)
- **GHSA-2024-004:** Secrets exposure in audit logs (Fixed via entropy scanning)

### Security Enhancements
- JWT token authentication for telemetry server
- RSA 4096-bit code signing for extensions
- NIST SI-10 input/output validation
- AES-256-GCM encryption for secrets at rest
- HMAC-SHA256 webhook signatures
- MITRE ATT&CK framework threat mapping
- Intrusion detection with behavioral baselines
- Security dashboard with real-time threat indicators

**Documentation:** See `SECURITY_HARDENING_IMPLEMENTATION.md`, `SECURITY_AUDIT_SUMMARY.md`

---

## 📦 Package Updates

### Ghost CLI (Root)
- Version: 0.4.0 → 1.0.0
- Node.js requirement: >=14.0.0 (unchanged)
- Zero dependencies maintained (pure Node.js)

### @ghost/extension-sdk
- Version: 1.0.0 (new package)
- Published to npm: `npm install @ghost/extension-sdk`
- TypeScript definitions included
- Complete API documentation

### Desktop Console
- Electron updated to latest stable
- React 18 with concurrent features
- TypeScript 5.x strict mode
- Vite 5.x for faster builds
- TailwindCSS 3.x for styling

---

## 🧪 Testing

### New Test Suites
- Security hardening tests (code signing, policies, IDS)
- Analytics platform tests (collector, behavior, cost attribution)
- Operational maturity tests (SLA, chaos, capacity forecasting)
- Developer experience tests (hot reload, debugger, profiler)
- Extension SDK tests (all API methods)
- Performance regression tests
- E2E tests with Playwright

### Test Commands
```bash
# Root tests
npm test

# Desktop tests
cd desktop && npm test

# SDK tests
cd packages/extension-sdk && npm test

# Integration tests
node test.js

# Performance tests
node scripts/profile-load-test.js

# E2E tests
cd desktop && npm run test:e2e
```

---

## 📊 Metrics & Telemetry

### New Metrics
- Extension invocation count and success rate
- Resource usage (CPU, memory, I/O, network)
- Duration percentiles (p50, p95, p99)
- Cost attribution per extension
- SLA compliance metrics
- Security threat indicators
- Operational maturity score

### Prometheus Metrics
```
ghost_requests_total
ghost_request_latency_milliseconds
ghost_rate_limit_violations_total
ghost_validation_failures_total
ghost_auth_failures_total
ghost_error_budget_consumed
ghost_error_budget_total
```

**Integration:** See `core/exporters/prometheus-exporter.js`

---

## 🎯 Roadmap (Future Versions)

### Planned for v1.1.0
- Multi-factor authentication (MFA) for telemetry
- Hardware security module (HSM) integration
- Certificate transparency logging
- Machine learning-based anomaly detection
- SIEM integration
- Blockchain-based audit trails

### Planned for v1.2.0
- Real-time streaming analytics
- Multi-repository aggregation
- Team collaboration analytics
- Advanced visualization dashboards
- Automated performance optimization
- VSCode extension integration

### Planned for v2.0.0
- GraphQL API
- Plugin marketplace with payments
- Enterprise license management
- Multi-tenancy support
- Kubernetes operator
- Cloud-native deployment

---

## 🙏 Acknowledgments

Special thanks to all contributors who made this major release possible. This release represents months of development across security, analytics, operational maturity, and developer experience improvements.

---

## 📝 Upgrade Instructions

### For Extension Developers

1. **Read the breaking changes** section above carefully
2. **Install @ghost/extension-sdk** in your extension: `npm install @ghost/extension-sdk`
3. **Update extension code** to use ExtensionWrapper pattern
4. **Validate manifest** with new schema: `ghost extension validate`
5. **Test thoroughly** with `ghost devmode enable` before deploying
6. **Update documentation** to reference SDK instead of raw intents
7. **Review security features** and enable code signing if distributing publicly

### For Ghost CLI Users

1. **Backup configuration:** `cp -r ~/.ghost ~/.ghost.backup`
2. **Update Ghost CLI:** `npm update -g atlasia-ghost`
3. **Verify version:** `ghost --version` (should show 1.0.0)
4. **Run automatic migration:** Ghost will auto-migrate config on first run
5. **Update extensions:** Reinstall extensions to v1.0.0 compatible versions
6. **Test commands:** Run `ghost gateway status` to verify installation

### For Enterprise Deployments

1. **Review security features** in `SECURITY_HARDENING_IMPLEMENTATION.md`
2. **Configure authentication** for telemetry server
3. **Enable code signing** for marketplace extensions
4. **Set up SLA monitoring** with Grafana dashboards
5. **Configure compliance evidence** collection for your framework
6. **Enable chaos engineering** in staging environments first
7. **Review operational maturity** metrics and set baselines

---

## 🔗 Links

- **Repository:** https://github.com/lamallamadel/ghost
- **Documentation:** https://github.com/lamallamadel/ghost/tree/main/docs
- **Extension SDK:** https://www.npmjs.com/package/@ghost/extension-sdk
- **Issues:** https://github.com/lamallamadel/ghost/issues
- **Changelog:** https://github.com/lamallamadel/ghost/blob/main/CHANGELOG.md

---

## [0.4.0] - 2023-12-15

### Added
- Gateway architecture with JSON-RPC protocol
- Extension discovery and lifecycle management
- Security pipeline (intercept, auth, audit, execute layers)
- Bundled ghost-git-extension
- AI-powered commit generation
- Version management with semver
- Merge conflict resolution
- Monitoring console (desktop app)
- Audit logging system
- Circuit breaker implementation
- Rate limiting with token bucket

### Changed
- Refactored from monolithic to gateway architecture
- Moved Git operations to extension
- Improved subprocess management

### Fixed
- Memory leaks in subprocess communication
- Race conditions in extension startup
- Audit log corruption issues

---

[1.0.0]: https://github.com/lamallamadel/ghost/compare/v0.4.0...v1.0.0
[0.4.0]: https://github.com/lamallamadel/ghost/releases/tag/v0.4.0
