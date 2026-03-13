# Ghost Process Supervisor

Headless process supervision and OS lifecycle management for the Ghost CLI ecosystem.

## Phase 3: Background Service Supervision (Completed)
This phase established the process extension as the authority for managed Ghost daemons and detached services.

### New Features
- **Strict Singleton Locks**: Uses PID, lock, and state files under `~/.ghost/run/` to prevent duplicate service starts.
- **Allowlisted Services**: Reads `~/.ghost/config/services.json` and only starts approved background commands.
- **Detached Lifecycle Control**: Starts managed services in the background with persisted stdout/stderr log files.
- **Stale Process Recovery**: Detects dead PID files, removes stale state, and restores a clean supervisor state.

### New Commands
- `ghost process list`: Lists all managed services and their runtime state.
- `ghost process status <service>`: Shows the state of a specific managed service.
- `ghost process start <service>`: Starts an allowlisted service in detached mode.
- `ghost process stop <service>`: Stops a running managed service and cleans up its state.
- `ghost process restart <service>`: Restarts a managed service through the supervisor lifecycle.

## Installation
```bash
ghost extension install extensions/ghost-process-extension
```
