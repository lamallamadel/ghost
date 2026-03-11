# Ghost Process Supervision (Headless)

## Architecture

Ghost uses a decentralized, headless process supervision model designed for zero-trust environments. The core responsibility of spawning, monitoring, and killing OS processes is delegated entirely to the `ghost-process-extension`. 

Other extensions (like the Desktop UI) **do not** possess the `process:spawn` capability. Instead, they must issue requests to the `ghost-process-extension` to manage services.

## The Semaphore Model

To guarantee idempotence, prevent race conditions, and track process state across reboots without requiring root-level daemons (like `systemd` or Windows Services), Ghost uses a strict **Semaphore Model** based in `~/.ghost/run/`.

For a given service (e.g., `telemetry`), the following files are maintained:
1. **`<service>.pid`**: Contains the OS Process ID of the detached background process. Used to verify existence via signal 0 (`process.kill(pid, 0)`).
2. **`<service>.lock`**: A temporary mutex created during the `start` or `stop` operation to prevent concurrent lifecycle commands.
3. **`<service>.json`**: State metadata (startTime, restarts, exit codes).
4. **`<service>.out.log` / `<service>.err.log`**: Standard output and error streams for the detached daemon.

## Security & Allowlist

To prevent the CLI from acting as an arbitrary execution vector, the `ghost-process-extension` strictly enforces an allowlist. 
Only services explicitly defined in `~/.ghost/config/services.json` can be managed.

**Example `services.json`:**
```json
{
  "telemetry": { 
    "cmd": "node", 
    "args": ["/path/to/ghost.js", "console", "start"] 
  },
  "webhook": { 
    "cmd": "node", 
    "args": ["/path/to/ghost.js", "webhook", "start"] 
  }
}
```

## CLI Commands

The `ghost-process-extension` exposes the following commands via the Gateway:

- `ghost process list`: View all managed services, their PID, and uptime.
- `ghost process status <service>`: Check the exact status of a specific service.
- `ghost process start <service>`: Start a service as a detached background daemon.
- `ghost process stop <service>`: Gracefully terminate a service (SIGTERM followed by SIGKILL if necessary).
- `ghost process restart <service>`: Stop and start the service cleanly.

## Client Integration

Extensions needing to manage a process (e.g., a Desktop UI button) must dispatch an intent:

```javascript
await this.sdk.emitIntent({
    type: 'extension',
    operation: 'call',
    params: {
        extensionId: 'ghost-process-extension',
        method: 'start',
        params: { args: ['telemetry'] }
    }
});
```
