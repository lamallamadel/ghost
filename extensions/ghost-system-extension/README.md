# Ghost System Helper

System utility and environment management extension for the Ghost CLI ecosystem.

## Phase 2: Environment Hardening (Completed)
This phase added proactive environment management and health checks.

### New Features
- **Environment Sanitization**: Cleans up temporary files and stale locks in `~/.ghost/temp/`.
- **System Doctor**: Verifies the existence and accessibility of critical Ghost system files and configurations.
- **Improved RPC Error Handling**: Better management of RPC errors during system-level operations.

### New Commands
- `ghost env sanitize`: Cleans up temporary Ghost artifacts.
- `ghost sys doctor`: Runs a comprehensive health check on system files.

## Installation
```bash
ghost extension install extensions/ghost-system-extension
```
