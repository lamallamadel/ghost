# 👻 Ghost CLI
### Sovereign AI-Powered Git Orchestrator & Security Gateway

[![npm version](https://img.shields.io/npm/v/atlasia-ghost.svg)](https://www.npmjs.com/package/atlasia-ghost)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![NIST SI-10 Compliant](https://img.shields.io/badge/Security-NIST%20SI--10-blue.svg)](#security)
[![Standard Library](https://img.shields.io/badge/Extensions-14%20Native-success)](#standard-library)

Ghost CLI is a high-performance **Pure Gateway Orchestrator** designed for secure, AI-augmented development workflows. Unlike traditional Git assistants, Ghost operates on a **Zero-Trust Capability Model**, executing all operations through an audited security pipeline.

---

## 🏛️ Architecture: The Pure Gateway

Ghost CLI acts as a secure air-gap between your environment and AI models. It implements a **JSON-RPC 2.0 over IPC** architecture where:

1.  **Orchestration Only**: The core (`ghost.js`) contains zero business logic—it only routes intents.
2.  **Isolated Extensions**: Every feature runs in a sandboxed subprocess with restricted permissions.
3.  **Security Pipeline**: Every I/O request (Filesystem, Network, Process) must pass through:
    *   **Interceptor**: JSON-RPC schema validation.
    *   **Authorization**: Capability-based permission checks (NIST SI-10).
    *   **Audit**: High-entropy secret detection and immutable logging.
    *   **Execution**: Resource-limited execution with per-type Circuit Breakers.

---

## 📦 Standard Library (14 Native Extensions)

Ghost ships with a robust suite of native extensions, providing out-of-the-box power for modern teams:

| Extension | Purpose | Capabilities |
| :--- | :--- | :--- |
| **`ghost-git`** | AI-Powered Git | Auto-commits, SemVer management, Merge resolution |
| **`ghost-security`** | Security Audit | NIST SI-10 scanning, Secret detection, Entropy analysis |
| **`ghost-ai`** | AI Orchestration | Multi-provider support (Anthropic, OpenAI, Groq, Gemini) |
| **`ghost-docs`** | AI Documentation | Automated README generation, API doc extraction |
| **`ghost-agent`** | Task Autonomy | Autonomous planning and multi-step execution |
| **`ghost-test`** | AI Testing | Unit test generation and coverage optimization |
| **`ghost-ci`** | Pipeline Guard | Conventional commit enforcement, CI gating |
| **`ghost-mesh`** | Peer Networking | Agent-to-agent telemetry and distributed logging |
| **`ghost-policy`** | Governance | Global security policy enforcement and compliance |
| **`ghost-author`** | Publication | Release notes automation and semantic versioning |
| **`ghost-deps`** | Dependency Guard | Conflict resolution and vulnerability mapping |
| **`ghost-desktop`** | Visual Console | Real-time monitoring and telemetry dashboard |
| **`ghost-system`** | Core Services | Centralized telemetry and configuration management |
| **`ghost-marketplace`** | Ecosystem | Discovery and installation of 3rd party extensions |

---

## 🚀 Quick Start

### Installation
```bash
npm install -g atlasia-ghost
```

### Setup AI (Anthropic/Claude, OpenAI, etc.)
```bash
ghost setup
```

### Common Workflows
```bash
# Generate a professional AI commit message
ghost commit

# Analyze project and generate AI documentation
ghost initialize

# Run a full security audit with NIST compliance check
ghost audit --verbose

# Start the visual telemetry console
ghost console
```

---

## 🛡️ Security & Privacy (Zero-Trust)

Ghost CLI is built for environments where data sovereignty is non-negotiable.

*   **Secret Masking**: The Extension SDK automatically masks API keys and tokens before they ever leave the subprocess.
*   **Path Traversal Protection**: Extensions are locked to specific glob patterns declared in their `manifest.json`.
*   **Audit Trail**: Every intent is recorded in an immutable log (`~/.ghost/audit.log`) for forensic review.
*   **Rate Limiting**: Integrated Traffic Policer using Two-Rate Three-Color Token Bucket (RFC 2698).

---

## 🛠️ Extension Development

Building for Ghost is simple with our **Extension SDK**.

```javascript
const { ExtensionSDK, ExtensionRunner } = require('@ghost/extension-sdk');

class MyExtension {
    constructor() {
        this.sdk = new ExtensionSDK('my-ext');
    }
    
    async scan(params) {
        // Safe I/O via intents
        const files = await this.sdk.emitIntent({ 
            type: 'filesystem', 
            operation: 'readdir', 
            params: { path: '.' } 
        });
        return { result: files };
    }
}

// Standalone bootstrapper
if (require.main === module) {
    new ExtensionRunner(new MyExtension()).start();
}
```

---

## 📊 Performance

Optimized for Sprint 9 high-throughput targets:
- **Latency**: < 30ms p95 overhead.
- **Throughput**: > 1,200 requests/second via async RPC bus.
- **Efficiency**: Hash-based validation with > 95% memoization hit rate.

---

## 📄 License

MIT © [Atlasia](https://github.com/lamallamadel)
