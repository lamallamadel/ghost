# Ghost System Helper

System utility and environment management extension for the Ghost CLI ecosystem.

## Phase 1: Observability (Completed)
This phase established the foundation for system health monitoring and log management.

### Features
- **System Health Status**: Reports runtime information, platform details, and memory usage.
- **Audit Log Viewer**: Inspects the Ghost audit log directly from the CLI.
- **SDK-Powered Intents**: Uses secure RPC calls for all system-level information.

### Commands
- `ghost sys status`: Displays detailed system and runtime information.
- `ghost sys logs [level]`: Shows the latest audit log entries (defaults to INFO).

## Installation
```bash
ghost extension install extensions/ghost-system-extension
```
