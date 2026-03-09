# Ghost Security Master Extension

Centralized security hub for the Ghost CLI ecosystem.

## Phase 2: Advanced Auditing (Completed)
This phase introduced deep repository inspection and intelligence.

### New Features
- **Recursive Auditing**: Deep scan of the entire project tree using Ghost filesystem intents.
- **Config Audit**: Automatic detection of misconfigured or exposed environment files.
- **AI Validation Engine**: Integration with major AI providers to analyze and confirm security threats, reducing noise from false positives.
- **Enhanced Reporting**: Detailed console reports with severity-based color coding.

### New Commands
- `ghost audit [--ai]`: Performs a full repository audit with optional AI validation.
- `ghost scan [path]`: Now supports recursive scanning if a directory is provided.

## Installation
```bash
ghost extension install extensions/ghost-security-extension
```
