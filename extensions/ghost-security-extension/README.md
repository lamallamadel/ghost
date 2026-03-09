# Ghost Security Master Extension

Centralized security hub for the Ghost CLI ecosystem.

## Phase 1: The "Brain" Migration (Completed)
In this phase, we extracted the security logic from individual extensions into this specialized master module.

### Features
- **SecretScanner**: High-performance regex engine for detecting API keys, tokens, and private keys.
- **Shannon Entropy Analysis**: Advanced detection of high-entropy strings (passwords, compressed secrets).
- **OWASP Top 10 Patterns**: Initial support for detecting common vulnerabilities (eval, insecure command execution, XSS vectors).
- **Standardized RPC**: Built on `@ghost/extension-sdk` for secure, audited I/O.

### Initial Commands
- `ghost scan [path]`: Scans a specific file or the current directory for secrets.
- `ghost security status`: Quick security health check.

## Installation
```bash
ghost extension install extensions/ghost-security-extension
```
