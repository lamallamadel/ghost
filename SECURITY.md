# Security Policy & Threat Model

## Sovereign Security Posture

Ghost CLI is designed with a **Zero-Trust** mindset. We assume that any extension—even native ones—could potentially be compromised or behave unexpectedly.

## Threat Model

| Threat | Ghost Mitigation Mechanism | Implementation |
| :--- | :--- | :--- |
| **Credential Theft** | Automated Secret Masking in SDK and Core Audit Layer. | `core/pipeline/audit.js` |
| **Path Traversal** | Glob-based filesystem allowlisting per extension. | `core/validators/path-validator.js` |
| **Network Exfiltration** | Domain allowlisting and protocol restriction (HTTPS only). | `core/validators/network-validator.js` |
| **Command Injection** | Strict command/argument allowlisting. | `core/validators/command-validator.js` |
| **Resource Exhaustion** | Process-level isolation and timeout management. | `core/runtime.js` |
| **Supply Chain Attack** | Capability-based security: an extension can ONLY do what is in its manifest. | `core/pipeline/auth.js` |

## Reporting a Vulnerability

Please report security vulnerabilities to **security@atlasia.ma**. We aim to respond within 48 hours.

## Compliance: NIST SI-10

Ghost CLI implements **NIST SP 800-53 SI-10 (Information Input Validation)**. Every interaction between an extension and your system is treated as an untrusted input that must be:
1. **Intercepted** (JSON-RPC Schema Check)
2. **Authorized** (Manifest Capability Check)
3. **Audited** (Secret & Entropy Check)
4. **Executed** (Sandboxed Wrapper)
