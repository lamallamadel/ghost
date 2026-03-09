# Ghost Bridge Master

IDE connector and RPC bridge for the Ghost CLI ecosystem.

## Phase 2: Session & Auth Management (Completed)
This phase secured the bridge and added robust lifecycle management for editor connections.

### New Features
- **Token Handshake**: Mandatory authentication for IDEs to prevent unauthorized local access.
- **Session Tracking**: Manages multiple concurrent editor sessions with unique IDs.
- **Heartbeat Monitoring**: (Simulated) Ensures connections are alive and cleans up stale sessions.
- **Security Toggles**: Supports `--no-auth` for local development environments.

### New Commands
- `ghost bridge auth --token <t> --editor <name>`: Internal command for IDE handshake.

## Installation
```bash
ghost extension install extensions/ghost-bridge-extension
```
