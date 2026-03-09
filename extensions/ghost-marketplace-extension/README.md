# Ghost Marketplace Extension

The official engine for extension discovery and management in the Ghost CLI ecosystem.

## Phase 1: Native Marketplace Foundation (Completed)
This phase migrated the marketplace logic from the core into a specialized native extension.

### Features
- **Decentralized Management**: Complete separation of marketplace logic from the Gateway.
- **Service Integration**: Direct RPC link with `ghost-security-extension` for pre-installation safety audits.
- **Intent-Based I/O**: Uses standard Ghost intents for all registry communication and file management.

### Commands
- `ghost marketplace browse [category]`: Lists available extensions from the registry.
- `ghost marketplace install <id>`: Securely installs an extension after a security audit.

## Installation
The marketplace extension is bundled with Ghost CLI.
```bash
ghost extension install extensions/ghost-marketplace-extension
```
