# Changelog

All notable changes to Ghost CLI will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] - 2024-01-15

### 🎉 Major Release: Production-Ready Enterprise Platform

Ghost CLI v1.0.0 represents a complete transformation from a simple Git CLI tool to an enterprise-grade, extensible gateway platform with comprehensive security, analytics, and operational maturity features.

---

## 🚨 BREAKING CHANGES FROM v0.4.0

### 1. ExtensionWrapper Pattern Required

**What Changed:** Extensions must use `ExtensionWrapper` pattern instead of direct `module.exports`.

**Migration:**

v0.4.0 (OLD):
```javascript
class MyExtension {
    async myCommand(params) {
        return { success: true };
    }
}
module.exports = MyExtension;
```

v1.0.0 (NEW - Required):
```javascript
const ExtensionWrapper = require('./wrapper');

class MyExtension {
    async init(config) {
        this.config = config;
        return { success: true };
    }

    async myCommand(params) {
        return { success: true };
    }

    async cleanup() {
        // Clean up resources
        return { success: true };
    }
}

const wrapper = new ExtensionWrapper(new MyExtension());
wrapper.start();
module.exports = MyExtension;
```

**Why:** Standardized lifecycle, process isolation, graceful shutdown, better error handling.

**Reference:** `extensions/ghost-git-extension/index.js`

---

### 2. Manifest Schema Changes

**What Changed:** `commands` array and `dependencies` field now required.

**Migration:**

v0.4.0 (OLD):
```json
{
  "id": "my-extension",
  "name": "My Extension",
  "version": "1.0.0",
  "main": "index.js",
  "capabilities": {
    "filesystem": { "read": ["**/*.js"] }
  }
}
```

v1.0.0 (NEW - Required):
```json
{
  "id": "my-extension",
  "name": "My Extension",
  "version": "1.0.0",
  "main": "index.js",
  "commands": ["mycommand", "status"],
  "capabilities": {
    "filesystem": {
      "read": ["**/*.js"],
      "write": ["output/**/*"]
    },
    "network": {
      "allowlist": ["https://api.example.com"],
      "rateLimit": { "cir": 60, "bc": 100 }
    }
  },
  "dependencies": {
    "@ghost/extension-sdk": "^1.0.0"
  },
  "permissions": ["filesystem:read", "network:https"]
}
```

**New Required Fields:**
- `commands`: Array of command names handled by extension
- `dependencies`: NPM dependencies (package.json format)

**Reference:** `core/manifest-schema.json`, `extensions/ghost-git-extension/manifest.json`

---

### 3. Extension SDK Required

**What Changed:** Direct intent creation deprecated. Use `@ghost/extension-sdk`.

**Installation:**
```bash
npm install @ghost/extension-sdk
```

**Migration:**

v0.4.0 (OLD - Manual Intents):
```javascript
const intent = {
    type: 'filesystem',
    operation: 'read',
    params: { path: './file.txt' },
    extensionId: 'my-extension'
};
process.stdout.write(JSON.stringify(intent) + '\n');
```

v1.0.0 (NEW - SDK):
```javascript
const { ExtensionSDK } = require('@ghost/extension-sdk');

class MyExtension {
    constructor() {
        this.sdk = new ExtensionSDK('my-extension');
    }

    async myCommand(params) {
        const content = await this.sdk.requestFileRead({ path: './file.txt' });
        const response = await this.sdk.requestNetworkCall({
            url: 'https://api.example.com/data',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: 'value' })
        });
        return { success: true, content, response };
    }
}
```

**Benefits:** Type safety, error handling, batch operations, timeout management, rate limit handling.

**Reference:** `packages/extension-sdk/README.md`, `docs/extension-api.md`

---

### 4. RPC Protocol Updates

**What Changed:** Standardized error response format with new error codes.

**New Error Response:**
```javascript
{
    success: false,
    error: "Human-readable message",
    code: "MACHINE_READABLE_CODE",
    stage: "AUTHORIZATION",
    requestId: "unique-id",
    data: { /* context */ }
}
```

**New Error Codes:**
- Authorization: `AUTH_NOT_REGISTERED`, `AUTH_PERMISSION_DENIED`, `AUTH_RATE_LIMIT`, `PATH_NOT_ALLOWED`, `URL_NOT_ALLOWED`
- Audit: `AUDIT_VALIDATION_FAILED`, `SI-10-PATH-TRAVERSAL`, `SI-10-COMMAND-INJECTION`, `SI-10-SSRF-LOCALHOST`, `SI-10-CONTENT-SECRETS`
- Execution: `PIPELINE_EXECUTION_ERROR`, `TIMEOUT_EXCEEDED`, `CIRCUIT_BREAKER_OPEN`

---

### 5. Configuration Location Changed

**What Changed:** Config moved from `~/.ghostrc` to `~/.ghost/config/ghostrc.json`.

**Migration:**

v0.4.0: `~/.ghostrc`
```json
{
  "prompt": "Custom prompt",
  "provider": "anthropic"
}
```

v1.0.0: `~/.ghost/config/ghostrc.json`
```json
{
  "prompt": "Custom prompt",
  "provider": "anthropic",
  "model": "claude-3-5-sonnet-20240620",
  "security": {
    "telemetryAuth": { "enabled": true },
    "codeSigning": { "requireSigned": false }
  }
}
```

**Auto-migration:** Runs automatically on first execution.

**Environment Variables:**
- v0.4.0: `GIT_COMMIT_PROMPT`, `ANTHROPIC_API_KEY`
- v1.0.0: `GHOST_PROMPT`, `GHOST_ANTHROPIC_API_KEY`, `GHOST_PROVIDER`

---

### 6. Telemetry Authentication Required

**What Changed:** Telemetry server requires JWT/API key authentication.

**Migration:**

v0.4.0:
```bash
curl http://localhost:9876/api/metrics
```

v1.0.0:
```bash
# Generate token
ghost telemetry generate-token --user admin

# Use token
curl -H "Authorization: Bearer <token>" http://localhost:9876/api/metrics
```

**Commands:**
```bash
ghost telemetry generate-token --user <username>
ghost telemetry generate-apikey --name <name> --permissions read
ghost telemetry list-apikeys
ghost telemetry revoke-apikey <key-id>
```

---

## 📋 VERSION COMPATIBILITY MATRIX

### Extension Compatibility
| Extension | Ghost CLI | SDK | Status |
|-----------|-----------|-----|--------|
| 0.x.x | 0.4.0 | N/A | ❌ Not Compatible |
| 1.0.0+ | 1.0.0+ | ^1.0.0 | ✅ Compatible |

### Node.js Compatibility
| Node.js | v0.4.0 | v1.0.0 |
|---------|--------|--------|
| 12.x | ⚠️ Deprecated | ❌ Not Supported |
| 14.x | ✅ Supported | ✅ Supported |
| 16.x | ✅ Supported | ✅ Supported |
| 18.x | ✅ Supported | ✅ Recommended |
| 20.x | N/A | ✅ Recommended |

### Platform Compatibility
| Platform | v0.4.0 | v1.0.0 |
|----------|--------|--------|
| Linux | ✅ | ✅ |
| macOS | ✅ | ✅ |
| Windows | ⚠️ Partial | ✅ Full |
| WSL2 | ✅ | ✅ |

---

## 🔄 MIGRATION GUIDE

### Step 1: Update Ghost CLI
```bash
npm update -g atlasia-ghost
ghost --version  # Verify 1.0.0+
```

### Step 2: Update Extension Code
```bash
cd your-extension
npm install @ghost/extension-sdk --save
```

Update `index.js`:
```javascript
const { ExtensionSDK } = require('@ghost/extension-sdk');

class YourExtension {
    constructor() {
        this.sdk = new ExtensionSDK('your-extension-id');
    }
    async init(config) { return { success: true }; }
    async yourCommand(params) { /* ... */ }
    async cleanup() { return { success: true }; }
}
module.exports = YourExtension;
```

### Step 3: Update Manifest
Add required fields:
```json
{
  "commands": ["yourcommand"],
  "dependencies": { "@ghost/extension-sdk": "^1.0.0" },
  "permissions": ["filesystem:read"]
}
```

### Step 4: Validate & Reinstall
```bash
ghost extension validate ./your-extension
ghost extension remove your-extension-id
ghost extension install ./your-extension
```

---

## ✨ NEW FEATURES

### 🔐 Security Hardening (6 Subsystems)

#### 1. Telemetry Authentication
- JWT token-based authentication
- API key support with permissions
- Token revocation and refresh
**Impl:** `core/telemetry-auth.js`

#### 2. Extension Code Signing
- RSA 4096-bit signatures
- Certificate management
- Tamper detection
- CRL support
```bash
ghost sign init --developer email@example.com
ghost sign extension ./ext --cert ./cert.key
ghost sign verify ./ext
```
**Impl:** `core/code-signing.js`

#### 3. Security Policy Engine
- NIST SI-10 validation
- Custom policy definitions
- Request size limits
- Network whitelisting
```bash
ghost policy list
ghost policy add --file policy.json
```
**Impl:** `core/security-policy-engine.js`

#### 4. Intrusion Detection (IDS)
- Behavioral baseline learning
- Anomaly detection
- MITRE ATT&CK mapping
- Threat scoring (0-10)
```bash
ghost ids status
ghost ids alerts --extension <id>
```
**Impl:** `core/intrusion-detection.js`

#### 5. Secrets Management
- AES-256-GCM encryption
- Vault/AWS/Azure integration
- Per-extension isolation
- Automatic rotation
```bash
ghost secrets set <key> --value <val> --extension <id>
ghost secrets get <key>
```
**Impl:** `core/secrets-manager.js`

#### 6. Security Dashboard
- Real-time threat indicators
- MITRE ATT&CK visualization
- Security metrics
```bash
ghost security dashboard
ghost security metrics
```
**Impl:** `core/security-dashboard.js`

**Doc:** `SECURITY_HARDENING_IMPLEMENTATION.md`

---

### 📊 Analytics Platform (6 Subsystems)

#### 1. Extension Analytics Collector
- Invocation tracking
- Resource monitoring (CPU, memory, I/O, network)
- Success/failure rates
- Duration percentiles (p50, p95, p99)
- 30-day retention
**Impl:** `core/analytics/collector.js`

#### 2. Behavior Analytics
- Command sequence tracking
- Usage patterns
- Workflow detection
- Next command prediction
**Impl:** `core/analytics/behavior-analytics.js`

#### 3. Cost Attribution
- Multi-resource cost tracking
- Billing models (per-invocation, tiered, subscription)
- Cost projections
- Marketplace integration
**Impl:** `core/analytics/cost-attribution.js`

#### 4. Performance Regression Detection
- Version-based tracking
- Automated regression detection (20% threshold)
- Baseline comparison
- Alert generation
**Impl:** `core/analytics/performance-regression.js`

#### 5. Distributed Tracing
- Trace/span hierarchy
- Cross-extension tracking
- Call graph generation
- Mermaid/DOT/JSON export
**Impl:** `core/analytics/distributed-tracing.js`

#### 6. Recommendation Engine
- Repository analysis
- Language/framework detection
- Multi-factor scoring
- Smart extension suggestions
**Impl:** `core/analytics/recommendation-engine.js`

**Doc:** `ANALYTICS_IMPLEMENTATION.md`

---

### 🏭 Operational Maturity (7 Subsystems)

#### 1. SLA Monitoring
- SLA objectives (99.9% availability, <200ms p95, <1% error)
- Error budget tracking
- Burn rate monitoring
- Prometheus export
```bash
ghost sla status
ghost sla alerts
```
**Impl:** `core/sla-monitoring.js`

#### 2. Runbook Automation
- Pre-configured runbooks
- Auto-execution/manual approval
- PagerDuty/Opsgenie integration
```bash
ghost runbook execute <id>
ghost runbook history
```
**Impl:** `core/runbook-automation.js`

#### 3. Chaos Engineering
- 6 failure types (crash, latency, resource exhaustion, errors, circuit breaker, rate limit)
- Experiment tracking
- Resilience reports
```bash
ghost chaos create --type extension_crash --probability 0.05
ghost chaos start <id>
ghost chaos report
```
**Impl:** `core/chaos-engineering.js`

#### 4. Capacity Forecasting
- Time-series prediction (24-step ahead)
- Exhaustion warnings
- Growth rate analysis
```bash
ghost capacity forecasts
ghost capacity warnings
```
**Impl:** `core/capacity-forecasting.js`

#### 5. Compliance Evidence
- SOC 2 Type II (5 controls)
- ISO 27001:2013 (4 controls)
- Evidence collection (SHA-256)
```bash
ghost compliance report soc2 --start 30d
ghost compliance status
```
**Impl:** `core/compliance-evidence.js`

#### 6. Grafana Dashboard
- 11-panel SLO dashboard
- Prometheus integration
**Impl:** `core/grafana-dashboard-slo.json`

#### 7. Maturity Scoring
- 0-100 score (SLA 25%, Capacity 20%, Resilience 20%, Automation 20%, Compliance 15%)
- Readiness levels (Production Ready, Near Production, Development, Early Stage, Initial)
```bash
ghost operational-maturity status
ghost operational-maturity report
```
**Impl:** `core/operational-maturity.js`

**Doc:** `OPERATIONAL_MATURITY_IMPLEMENTATION.md`

---

### 🛒 Marketplace Infrastructure
- Extension discovery/installation
- Version management
- Rating/review system
- Statistics tracking
```bash
ghost marketplace search <query>
ghost marketplace install <id>
ghost marketplace rate <id> --rating 5
```
**Impl:** `core/marketplace.js` | **Doc:** `MARKETPLACE_IMPLEMENTATION.md`

---

### 📦 Sandbox Execution
- Process-level isolation
- Resource limits (CPU, memory)
- Filesystem/network sandboxing
- Docker/VM support
**Impl:** `core/sandbox.js` | **Doc:** `SANDBOX_IMPLEMENTATION.md`

---

### 🌐 Distributed Mesh Collaboration
- Multi-node extension mesh
- Load balancing
- Health monitoring/failover
- gRPC communication
- Consistent hash routing
```bash
ghost mesh join --node <address>
ghost mesh status
```
**Impl:** `core/mesh/` | **Doc:** `MESH_IMPLEMENTATION.md`

---

### 🔔 Webhook Automation
- Event-driven webhooks
- HTTP/HTTPS delivery with retry
- HMAC-SHA256 signatures
- Event filtering
**Events:** extension.installed, extension.uninstalled, extension.updated, extension.failed, extension.metrics
```bash
ghost webhook register --url https://example.com/hook
ghost webhook list
```
**Impl:** `core/webhooks/` | **Doc:** `WEBHOOK_IMPLEMENTATION.md`

---

### 🛠️ Developer Experience

#### 1. Hot Module Reloading
- Auto-detect manifest/code changes
- Graceful restart
**Impl:** `core/dev-mode.js`

#### 2. Extension Debugger
- Node.js debugger attachment
- Chrome DevTools integration
**Impl:** `core/debugger-adapter.js` | **UI:** `desktop/src/components/ExtensionDebugger.tsx`

#### 3. Intent Playground
- Interactive intent builder
- Real-time validation
- Template library
**UI:** `desktop/src/components/IntentPlayground.tsx`

#### 4. Profiling Dashboard
- CPU/memory profiling
- Bottleneck detection
- Flamegraph generation
**Impl:** `core/profiler.js` | **UI:** `desktop/src/components/ProfilingDashboard.tsx`

#### 5. Developer Mode
- Disable rate limiting
- Relax validation
- Debug logging
```bash
ghost devmode enable
ghost devmode status
```
**Impl:** `core/dev-mode.js`

#### 6. Template Wizard
- Interactive scaffolding
- 3 templates (Basic, TypeScript, Advanced)
```bash
ghost extension init
```
**Impl:** `core/template-wizard.js`

**Doc:** `DEVELOPER_EXPERIENCE_IMPLEMENTATION.md`

---

## 🔧 IMPROVEMENTS

### Performance (Sprint 9)
- **Throughput:** 1,247 req/s (+59%)
- **P95 Latency:** 28ms (<50ms target)
- **CPU:** 78% (-17%)
- **Memory Growth:** 39% over 60s (<50%)

**Optimizations:**
- O(1) Set lookups
- Memoization (>95% hit rate)
- Object pooling (60% GC reduction)
- Regex caching
- Pre-computed rate constants

**Doc:** `PERFORMANCE.md`, `core/SPRINT9_PERFORMANCE.md`

### Extension Runtime
- Circuit breaker with half-open state
- RFC 2698 trTCM rate limiting
- Heartbeat monitoring
- Auto-restart on crash

### Pipeline Architecture
- NIST SI-10 validation
- Capability caching
- Entropy scanning
- Timeout/circuit breaker integration

### Desktop Console
- React 18
- TypeScript strict mode
- TailwindCSS 3.x
- Zustand state management

---

## 🐛 BUG FIXES
- Subprocess cleanup on crash
- Telemetry collector memory leak
- Circuit breaker race condition
- Network validation bypass
- Audit log rotation
- Windows extension discovery
- JSON-RPC error consistency
- Rate limiter edge cases
- Hot reload watcher leaks
- Distributed tracing correlation

---

## 🔒 SECURITY

### Fixed Advisories
- **GHSA-2024-001:** Rate limit bypass
- **GHSA-2024-002:** Command injection
- **GHSA-2024-003:** SSRF vulnerability
- **GHSA-2024-004:** Secrets exposure

### Enhancements
- JWT authentication
- RSA 4096-bit signing
- NIST SI-10 validation
- AES-256-GCM encryption
- HMAC-SHA256 signatures
- MITRE ATT&CK mapping
- Behavioral IDS
- Real-time dashboard

**Doc:** `SECURITY_HARDENING_IMPLEMENTATION.md`

---

## 📦 PACKAGES

### Ghost CLI
- 0.4.0 → 1.0.0
- Node.js >=14.0.0
- Zero dependencies

### @ghost/extension-sdk (NEW)
- v1.0.0
- npm: `@ghost/extension-sdk`
- TypeScript definitions

### Desktop
- Electron: Latest
- React 18
- TypeScript 5.x
- Vite 5.x
- TailwindCSS 3.x

---

## 🧪 TESTING

**New Suites:** Security, Analytics, Operational, DevEx, SDK, Performance, E2E

**Commands:**
```bash
npm test                              # Root
cd desktop && npm test                # Desktop
cd packages/extension-sdk && npm test # SDK
node test.js                          # Integration
node scripts/profile-load-test.js    # Performance
cd desktop && npm run test:e2e        # E2E
```

---

## 📊 METRICS

**Prometheus:**
- `ghost_requests_total`
- `ghost_request_latency_milliseconds`
- `ghost_rate_limit_violations_total`
- `ghost_validation_failures_total`
- `ghost_auth_failures_total`
- `ghost_error_budget_consumed`
- `ghost_error_budget_total`

**Integration:** `core/exporters/prometheus-exporter.js`

---

## 📚 DOCUMENTATION

**New:**
- `SECURITY_HARDENING_IMPLEMENTATION.md`
- `ANALYTICS_IMPLEMENTATION.md`
- `OPERATIONAL_MATURITY_IMPLEMENTATION.md`
- `DEVELOPER_EXPERIENCE_IMPLEMENTATION.md`
- `WEBHOOK_IMPLEMENTATION.md`
- `MESH_IMPLEMENTATION.md`
- `SANDBOX_IMPLEMENTATION.md`
- `MARKETPLACE_IMPLEMENTATION.md`
- `PERFORMANCE.md`
- `docs/DEVELOPER_TOOLKIT.md`
- `docs/extension-api.md`
- `docs/extension-examples.md`
- `docs/QUICK_REFERENCE.md`
- `core/MANIFEST_REFERENCE.md`
- `packages/extension-sdk/README.md`

**Updated:**
- `README.md`
- `AGENTS.md`
- `INSTALL.md`

---

## 🎯 DEPRECATIONS

**Deprecated in v1.0.0 (Removed in v2.0.0):**
1. Direct stdio JSON-RPC → Use ExtensionWrapper
2. Manual intent creation → Use @ghost/extension-sdk
3. `~/.ghostrc` → Use `~/.ghost/config/ghostrc.json`
4. Old env vars → Use `GHOST_*` prefix
5. Anonymous telemetry → Authentication required
6. WebSocket telemetry → Use HTTP/2

**Timeline:**
- v1.0.0: Deprecated (warnings)
- v1.5.0 (Q2 2024): Errors
- v2.0.0 (Q4 2024): Removed

---

## 🎯 ROADMAP

### v1.1.0 (Q1 2024)
- MFA for telemetry
- HSM integration
- Certificate transparency
- ML anomaly detection
- SIEM integration
- Blockchain audit trails

### v1.2.0 (Q2 2024)
- Streaming analytics
- Multi-repo aggregation
- Team collaboration
- Advanced visualizations
- Auto-optimization
- VSCode extension

### v2.0.0 (Q4 2024)
- GraphQL API
- Marketplace payments
- Enterprise licensing
- Multi-tenancy
- Kubernetes operator
- Cloud-native deployment

---

## 🔗 LINKS

- **Repo:** https://github.com/lamallamadel/ghost
- **Docs:** https://github.com/lamallamadel/ghost/tree/main/docs
- **SDK:** https://www.npmjs.com/package/@ghost/extension-sdk
- **Issues:** https://github.com/lamallamadel/ghost/issues

---

## [0.4.0] - 2023-12-15

### Added
- Gateway architecture with JSON-RPC
- Extension discovery/lifecycle
- Security pipeline (intercept, auth, audit, execute)
- ghost-git-extension
- AI commit generation
- Version management
- Merge conflict resolution
- Monitoring console
- Audit logging
- Circuit breaker
- Rate limiting

### Changed
- Monolithic → Gateway architecture
- Git ops → Extension
- Improved subprocess management

### Fixed
- Memory leaks in subprocess
- Race conditions in startup
- Audit log corruption

---

[1.0.0]: https://github.com/lamallamadel/ghost/compare/v0.4.0...v1.0.0
[0.4.0]: https://github.com/lamallamadel/ghost/releases/tag/v0.4.0
