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
npm test             # Vitest test runner
```

### Single test (root)
```bash
node test/<test-file>.test.js
```

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
- `extension-loader.js` — Filesystem discovery + manifest validation (fail-closed)
- `runtime.js` — `ExtensionProcess`: subprocess lifecycle over JSON-RPC with state machine (`STOPPED → STARTING → RUNNING → STOPPING`), heartbeat monitoring, exponential backoff restarts
- `telemetry.js` — Metrics; wires OTLP/Prometheus exporters
- `qos/token-bucket.js` — Single-rate three-color token bucket (CIR/BC)

### Extensions
Extensions are Node.js subprocesses communicating via JSON-RPC over stdio. Extension discovery order:
1. `~/.ghost/extensions/` (user extensions, take precedence on ID collision)
2. `extensions/` (bundled, e.g. `ghost-git-extension`)

Each extension has a `manifest.json` validated against `core/manifest-schema.json` declaring capabilities (`filesystem`, `network`, `git`, `hooks`).

New extensions: `ghost extension init <name>` | Validate: `ghost extension validate [path]`

### Extension SDK (`packages/extension-sdk/` → `@ghost/extension-sdk`)
For third-party extension authors. Key classes: `ExtensionSDK` (high-level API), `IntentBuilder`, `RPCClient`. Full TypeScript definitions included. Documentation in `docs/`.

### Desktop App (`desktop/`)
Electron monitoring console — **not published to NPM, dev tooling only**. React 18 SPA, Zustand state, React Router, Vite build. References the local CLI via `"atlasia-ghost": "file:.."`.

## Code Style
- **Root/Core:** CommonJS modules, minimal comments, ANSI color output
- **Desktop:** ESLint flat config, strict TypeScript, functional React components with hooks
- **SDK:** CommonJS with TypeScript `.d.ts` definitions alongside JS files
