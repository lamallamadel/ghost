# Release Notes - Ghost Git Extension v1.1.0

This release marks a significant architectural upgrade for the Ghost Git Extension, focusing on robustness, security, and developer experience.

## Key Changes

### 🚀 SDK Migration & Standardized RPC
The extension has been fully migrated to the official `@ghost/extension-sdk`. This ensures:
- **Standardized Intent Handling**: All I/O operations (filesystem, network, git) now use the official intent schema.
- **Improved Reliability**: Better handling of timeouts, circuit breakers, and core communication.
- **Typed JSON-RPC**: More robust and future-proof communication with the Ghost core.

### 🛠️ Robust Git Wrapper
A new `GitWrapper` class has been introduced to encapsulate common Git operations.
- **Safe Command Execution**: Uses argument arrays instead of shell strings, mitigating command injection risks.
- **Consistent Error Handling**: Unified logging and error reporting for all Git subcommands.
- **Enhanced APIs**: Exposes clean methods for staging, committing, tagging, and conflict resolution.

### 🛡️ Security & NIST SI-10 Compliance
Security is a first-class citizen in this release:
- **Payload Secret Stripping**: Automatically masks potential secrets in diffs and prompts before sending them to AI providers, preventing NIST SI-10 blocks on outbound calls.
- **RPC Sanitization**: Added a sanitization layer to the RPC client to mask sensitive fields in logs.
- **Refined Scanning**: Improved Shannon entropy analysis and secret regexes to reduce false positives while maintaining high detection rates.

### 💡 Better Developer Experience
- **AI Guidance**: When AI calls fail (e.g., due to invalid API keys), the extension now provides clear "Pro-tips" directing users to run `ghost setup`.
- **Informative Logging**: More granular debug and info logs for better observability of the extension's behavior.

## Installation

```bash
ghost extension install extensions/ghost-git-extension
```

## Contributors
- Adel Lamallam
- Ghost CLI Team
