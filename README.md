# Atlasia Ghost 👻
### Zero-Trust Git Governance & Sovereign AI Orchestrator

[![npm version](https://img.shields.io/npm/v/atlasia-ghost.svg)](https://www.npmjs.com/package/atlasia-ghost)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![NIST SI-10 Compliant](https://img.shields.io/badge/Security-NIST%20SI--10-blue.svg)](#security)
[![Standard Library](https://img.shields.io/badge/Extensions-14%20Native-success)](#standard-library)

**Atlasia Ghost** is a **Zero-Trust Git governance CLI**: it **verifies commits**, enforces **policy gates** (local + CI), and runs a **sandboxed Standard Library of extensions**.

> **Think**: A sovereign alternative to **Husky + Commitlint**, upgraded into a security-grade **Policy Engine** and **Extension Runtime**.

---

## 🏛️ Why Ghost exists?

Most tools solve **format** (commitlint) or **triggering** (husky).
Ghost solves **governance**: *“Is this change allowed? Is this commit explainable? Is this repo policy satisfied?”*

Ghost acts as a secure air-gap between your environment and AI models, executing all operations through an audited **NIST SI-10 compliant** pipeline.

---

## 📦 Standard Library (14 Native Extensions)

Ghost ships with a robust suite of native, sandboxed extensions:

| Extension | Category | Purpose |
| :--- | :--- | :--- |
| **`ghost-git`** | Git | AI commits, SemVer, Conventional Commits validation |
| **`ghost-security`** | Security | NIST SI-10 scanning, Secret detection, Entropy analysis |
| **`ghost-ai`** | AI | Multi-provider orchestration (Anthropic, OpenAI, Groq, Gemini) |
| **`ghost-docs`** | Docs | AI-powered README and technical documentation generation |
| **`ghost-agent`** | Agent | Autonomous planning and multi-step task execution |
| **`ghost-test`** | QA | AI unit test generation and coverage optimization |
| **`ghost-ci`** | CI/CD | Pipeline guarding and commit message enforcement |
| **`ghost-mesh`** | Mesh | Agent-to-agent networking and distributed telemetry |
| **`ghost-policy`** | Governance | Global security policy enforcement (Policy-as-Code) |
| **`ghost-author`** | Release | Release notes automation and semantic versioning |
| **`ghost-deps`** | Deps | Dependency conflict resolution and vulnerability mapping |
| **`ghost-desktop`** | Visual | Real-time monitoring and visual telemetry console |
| **`ghost-system`** | Core | Centralized telemetry and configuration management |
| **`ghost-market`** | Platform | Extension discovery and installation (Standard & 3rd party) |

---

## 🏛️ Architecture (Mental Model)

Ghost is built around a **Gateway** that routes requests into **isolated extensions**.

```
┌─────────────┐     ┌───────────────┐     ┌──────────────────────────┐
│ Git / CI    │ ──▶ │ Ghost Gateway │ ──▶ │ Extensions (Sandboxed)   │
└─────────────┘     └───────────────┘     └──────────────────────────┘
                           │
                           └── Policy Store (NIST SI-10 / Policy-as-Code)
```

### Zero-Trust Principles
- **Explicit Permissions**: Extensions have zero implicit access to your filesystem or network.
- **Deterministic Gates**: Clear exit codes and stable results, optimized for high-performance CI.
- **Auditability**: Immutable logs (`~/.ghost/audit.log`) record every intent and decision.

---

## 🚀 Quick Start

```bash
npm install -g atlasia-ghost

# Setup AI (Claude 4.6, GPT-4o, etc.)
ghost setup

# Generate a professional AI commit
ghost commit

# Run security audit with NIST compliance check
ghost audit --verbose
```

---

## 🛡️ Security Compliance (NIST SI-10 Mapping)

Ghost CLI's architecture is mapped directly to **NIST SP 800-53 SI-10** controls:

| NIST Control | Ghost Mechanism | Technical Implementation |
| :--- | :--- | :--- |
| **Input Validation** | JSON-RPC Schema Enforcement | `core/pipeline/intercept.js` |
| **Path Sanitization** | Glob-based Root Isolation | `core/validators/path-validator.js` |
| **Data Scruubing** | High-Entropy Secret Masking | `core/pipeline/audit.js` |
| **Integrity Checks** | Immutable Audit Logging | `core/pipeline/audit.js` |
| **Fault Isolation** | Process-level Sandboxing | `core/runtime.js` |

---

## 🛡️ Security & Privacy (Zero-Trust)

### Does Ghost send my code to the internet?
- **Default**: Ghost is **local-first**. No code exfiltration happens by default.
- **AI Usage**: Remote providers (Anthropic, OpenAI) are only contacted if **explicitly configured**.
- **Secret Protection**: The core's Audit Layer automatically masks keys and tokens before they are recorded in any logs or telemetry.

### Verifiable Security
All security logic is located in the `core/pipeline/` and `core/validators/` directories for transparent public audit.

---

## 📊 Performance
- **Latency**: < 30ms p95 overhead.
- **Throughput**: > 1,200 req/s via asynchronous RPC bus.

---

## 📄 License
MIT © [Adel Lamallam](https://github.com/lamallamadel)
