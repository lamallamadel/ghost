# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Root (CLI)
```bash
npm install          # Install root dependencies
npm test             # Run test.js smoke tests + all integration tests in test/
npm start            # Run the CLI (node ghost.js)
```

### Desktop App
```bash
cd desktop && npm install
npm run desktop:dev  # Electron + Vite with HMR (port 5173)
npm run build        # TypeScript compile + Vite production build
npm run lint         # ESLint on all TS/TSX files
npm run check        # TypeScript type-check only (no emit)
npm test             # Vitest unit tests
npm run test:e2e     # Playwright E2E tests
```

### Single test (root)
```bash
node test/<test-file>.test.js
```

## Known Test Failure (Pre-existing)

`test/audit-nist-compliance.test.js` line 122 fails — the entropy validator does not detect `AKIA1234567890ABCDEF` as a secret. This predates any recent work and is in `core/validators/entropy-validator.js`.

## Architecture

**Ghost CLI** (`atlasia-ghost`) is an extensible, gateway-based Git CLI with AI-powered operations (Groq/Anthropic/Gemini). The core design principle: the CLI is a pure orchestration layer — all commands are routed through extensions via a structured JSON-RPC pipeline.

### Entry Point
`ghost.js` — `GatewayLauncher` class. Parses CLI args, initializes infrastructure, routes to extensions. Contains documented architecture violations (direct `fs` operations) awaiting refactoring.

### Pipeline (`core/pipeline/`)
Every command flows through 4 stages, **fail-closed** (any failure denies execution):
```
Raw message → INTERCEPT → AUTH → AUDIT → EXECUTE → Response
```
- `intercept.js` — Parse/validate raw JSON-RPC → Intent
- `auth.js` — Capability-based authorization + rate limiting
- `audit.js` — NIST-compliant audit logging
- `execute.js` — Execution + CircuitBreaker + TimeoutManager

### Core Infrastructure (`core/`)
- `gateway.js` — Extension registry: discovers, registers, and routes to extensions
- `extension-loader.js` — Filesystem discovery + manifest validation (fail-closed); uses `DependencyResolver` to determine load order
- `runtime.js` — `ExtensionProcess`: subprocess lifecycle over JSON-RPC with state machine (`STOPPED → STARTING → RUNNING → STOPPING`), heartbeat monitoring, exponential backoff restarts
- `telemetry.js` — Metrics; wires OTLP/Prometheus exporters (`core/exporters/`)
- `qos/` — Rate limiting suite: `token-bucket.js` (CIR/BC), `advanced-rate-limiter.js`, `enhanced-circuit-breaker.js`, `fair-queuing.js`, `global-rate-limiter.js`

### Additional Core Systems
- `dependency-resolver.js` — Topological sort (Kahn's algorithm) + cycle detection (Tarjan's SCC) + semver version constraint validation for extension load ordering
- `hot-reload.js` + `dev-mode.js` — File watching with debounce, graceful shutdown, state preservation (`serialize`/`deserialize` hooks), request queuing, rollback on failure. CLI: `ghost dev enable|disable|status`, `ghost gateway reload <id>`
- `marketplace.js` — Extension registry client (`GHOST_MARKETPLACE_URL` env var); caches responses in `~/.ghost/marketplace-cache/`; signature verification via public key
- `marketplace-backend/` — Standalone Express server for hosting a private registry (separate `package.json`, not bundled in CLI)
- `webhooks/` — Event delivery system with routing, transform pipeline, delivery queue, and event store
- `sandbox.js` — Extension process isolation
- `analytics/` — `AnalyticsPlatform` aggregating behavior analytics, cost attribution, performance regression detection, distributed tracing, and recommendation engine; WebSocket server on port 9877 for real-time streaming to desktop
- `mesh/` — Multi-agent mesh network: `AgentMeshNetwork`, `AgentDiscoveryService`, `CRDTStateSync`, `WorkflowOrchestrator`, `DistributedTelemetryCollector`
- `template-wizard.js` — Interactive gallery for scaffolding extensions from pre-built templates (`templates/` directory)
- `validators/` — Input validators: `path-validator.js`, `command-validator.js`, `network-validator.js`, `entropy-validator.js`
- Security: `security-hardening.js`, `security-policy-engine.js`, `intrusion-detection.js`, `code-signing.js`, `secrets-manager.js`

### Extensions
Extensions are Node.js subprocesses communicating via JSON-RPC over stdio. Extension discovery order:
1. `~/.ghost/extensions/` (user extensions, take precedence on ID collision)
2. `extensions/` (bundled, e.g. `ghost-git-extension`)

Each extension has a `manifest.json` validated against `core/manifest-schema.json` declaring capabilities (`filesystem`, `network`, `git`, `hooks`). Manifests may declare `dependencies` (resolved by `DependencyResolver` before loading).

New extensions: `ghost extension init <name>` | Validate: `ghost extension validate [path]`

### Extension SDK (`packages/extension-sdk/` → `@ghost/extension-sdk`)
For third-party extension authors. Key classes: `ExtensionSDK` (high-level API), `IntentBuilder`, `RPCClient`. Full TypeScript definitions included. Documentation in `docs/`.

### Desktop App (`desktop/`)
Electron monitoring console — **not published to NPM, dev tooling only**. React 18 SPA, Zustand state, React Router, Vite build. Connects to the analytics WebSocket (port 9877) for real-time metrics. References the local CLI via `"atlasia-ghost": "file:.."`.

## Code Style
- **Root/Core:** CommonJS modules, minimal comments, ANSI color output
- **Desktop:** ESLint flat config, strict TypeScript, functional React components with hooks
- **SDK:** CommonJS with TypeScript `.d.ts` definitions alongside JS files
