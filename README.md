# Atlasia Ghost 👻
### Zero-Trust Git Governance & Sovereign AI Orchestrator

[![npm version](https://img.shields.io/npm/v/atlasia-ghost.svg)](https://www.npmjs.com/package/atlasia-ghost)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![NIST SI-10 Compliant](https://img.shields.io/badge/Security-NIST%20SI--10-blue.svg)](#security-compliance-nist-si-10)
[![Standard Library](https://img.shields.io/badge/Extensions-14%20Native-success)](#standard-library)

**Atlasia Ghost** is a **Zero-Trust Git governance CLI**: it **verifies commits**, enforces **policy gates** (local + CI), and runs a **sandboxed Standard Library of extensions**.

> **Think**: A sovereign alternative to **Husky + Commitlint**, upgraded into a security-grade **Policy Engine** and **Extension Runtime**.

---

## 🏛️ Why Ghost exists?

Most tools solve **format** (commitlint) or **triggering** (husky).
Ghost solves **governance**: *"Is this change allowed? Is this commit explainable? Is this repo policy satisfied?"*

Ghost acts as a governance gateway between your repository/CI and external tools/agents, executing all operations through an audited pipeline.

---

## 📦 Standard Library

Ghost ships with a **native Standard Library** (composed of 14 core modules). 
Depending on your environment, additional extensions may be loaded.

✅ **Runtime truth (Current Inventory)**:
To see exactly which extensions are active on your machine, run:
```bash
ghost extension list
```

### Core Extension Roles (Verified via `ghost --help`)
| Extension | Purpose | Command Example |
| :--- | :--- | :--- |
| **`ghost-git`** | AI Commits & SemVer | `ghost commit --dry-run` |
| **`ghost-security`** | NIST SI-10 Compliance | `ghost compliance` |
| **`ghost-docs`** | AI Documentation | `ghost initialize` |
| **`ghost-ai`** | LLM Orchestration | `ghost setup` |
| **`ghost-desktop`** | Visual Monitoring | `ghost console start` |
| **`ghost-policy`** | Policy Enforcement | `ghost verify` |

---

## 🚀 Quick Start (Replayable)

```bash
npm install -g atlasia-ghost

# 1. Health check & inventory
ghost doctor
ghost extension list

# 2. Setup AI (Claude 4.6, GPT-4o, etc.)
ghost setup

# 3. View Gateway status & telemetry
ghost gateway status --verbose --json

# 4. Execute a governance check
ghost verify --help
```

---

## 🛡️ Security Compliance (NIST SI-10)

Ghost CLI's architecture is designed to satisfy **NIST SP 800-53 SI-10** (Information Input Validation).

**Replayable Evidence**:
- **Telemetry Spans**: Visible via `ghost gateway spans`.
- **PII Scrubbing**: Emails, IPs, and home paths are automatically redacted in logs.
- **Auditability**: Use `ghost gateway logs` and `ghost logs info` to inspect governance trails.
- **Config Lockdown**: Centralized configuration at `~/.ghost/config/ghostrc.json`.
- **Log Isolation**: All telemetry and audit logs are stored under `~/.ghost/telemetry/`.

For a full mapping of NIST controls to Ghost's implementation, see [SECURITY.md](./SECURITY.md).

---

## 🛡️ Security & Privacy (Zero-Trust)

### Does Ghost send my code to the internet?
- **Default**: Ghost is **local-first**. No code exfiltration happens by default.
- **AI Usage**: Remote providers (Anthropic, OpenAI) are only contacted if **explicitly configured** and scoped.
- **Secret Protection**: The core's Audit Layer masks keys and tokens before they reach logs or telemetry.

---

## 📂 Project Structure & Artifacts

- **`docs/`**: Official, versioned documentation and architecture guides.
- **`ext_mise_en_route/`**: Execution sandbox used for integration testing and feature demonstration.
  - *Note*: Files generated here are ignored by Git. See [README.note.md](./ext_mise_en_route/README.note.md) for reproduction steps.

---

## 📊 Performance
- **Latency**: < 30ms p95 overhead.
- **Throughput**: > 1,200 req/s via asynchronous RPC bus.

---

## 📄 License
MIT © [Adel Lamallam](https://github.com/lamallamadel)
