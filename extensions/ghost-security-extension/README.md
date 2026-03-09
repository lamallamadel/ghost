# Ghost Security Master Extension

Centralized security hub for the Ghost CLI ecosystem.

## Phase 3: Inter-Op & Hardening (Completed)
This phase established the extension as the central security authority for Ghost.

### New Features
- **Cross-Extension RPC**: Now serves as the backend scanner for the Ghost Git Extension.
- **NIST SI-10 Reporting**: Automated generation of System and Information Integrity compliance reports.
- **Secure Staging Integration**: Proactive secret detection for Git workflows via intent-based calls.

### New Commands
- `ghost security compliance`: Generates a NIST SI-10 markdown report in `security-reports/`.
- `ghost security status`: Now reports baseline health for Inter-Op status.

## Installation
```bash
ghost extension install extensions/ghost-security-extension
```
