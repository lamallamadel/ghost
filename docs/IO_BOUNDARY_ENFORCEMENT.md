# IO-to-Boundary Enforcement

> **Architectural Law:** Extensions must **never** perform I/O directly. Every filesystem access, process spawn, or network call must be emitted as an intent through the Ghost pipeline.

## The Principle

Ghost is a zero-trust API gateway. The core pipeline is the single enforcement point for all I/O. Extensions run as isolated child processes and communicate with the core exclusively via JSON-RPC over stdio.

```
Extension Process
     │
     │  JSON-RPC intent (e.g. { type: 'filesystem', operation: 'read' })
     ▼
  ┌──────────────────────────────────────────────────────┐
  │  Ghost IO Pipeline                                    │
  │  1. Intercept  →  deserialize + Object.freeze()      │
  │  2. Auth       →  manifest permission check + srTCM  │
  │  3. Audit      →  NIST SI-10 + append-only log chain │
  │  4. Execute    →  actual fs/process/network call      │
  └──────────────────────────────────────────────────────┘
```

This guarantee means:

- An extension **cannot** exfiltrate data without the pipeline detecting it
- An extension **cannot** escalate privileges beyond its declared manifest
- A compromised extension **cannot** destabilise the host system
- Every I/O action produces an irrefutable audit entry

---

## The SDK — Replacing Direct I/O

The `@ghost/extension-sdk` package provides high-level helpers that emit the correct intents. Use them instead of `fs.*` or `child_process.*`.

### Filesystem Operations

| Before (violation) | After (compliant) |
|---|---|
| `fs.existsSync(path)` | `await sdk.requestFileExists(path)` |
| `fs.readFileSync(path, 'utf8')` | `await sdk.requestFileRead({ path })` |
| `JSON.parse(fs.readFileSync(path))` | `await sdk.requestFileReadJSON(path)` |
| `fs.writeFileSync(path, str)` | `await sdk.requestFileWrite({ path, content: str })` |
| `fs.writeFileSync(path, JSON.stringify(obj))` | `await sdk.requestFileWriteJSON(path, obj)` |
| `fs.mkdirSync(path, { recursive: true })` | `await sdk.emitIntent({ type: 'filesystem', operation: 'mkdir', params: { path, recursive: true } })` |
| `fs.unlinkSync(path)` | `await sdk.emitIntent({ type: 'filesystem', operation: 'unlink', params: { path } })` |

### Process Spawning

Background (detached) process spawning requires two changes:

1. **Extension**: emit a `process:spawn-detached` intent — do not call `spawn()` directly.
2. **Pipeline**: the `ExecutionLayer` opens the log FDs and spawns the process.

```js
// ✗ VIOLATION — extension calls spawn() directly
const { spawn } = require('child_process');
const child = spawn('node', ['app.js'], { detached: true, stdio: ['ignore', outFd, errFd] });
child.unref();

// ✓ COMPLIANT — extension emits a spawn-detached intent
const result = await sdk.emitIntent({
    type: 'process',
    operation: 'spawn-detached',
    params: {
        command: 'node',
        args: ['app.js'],
        outLog: '/path/to/app.out.log',   // pipeline opens this FD
        errLog: '/path/to/app.err.log',   // pipeline opens this FD
        cwd: process.cwd()
    }
});
const pid = result.pid;  // returned by the pipeline after spawning
```

The pipeline's `ProcessExecutor._spawnDetached()` handles:
- Opening the log file descriptors (`fsSync.openSync`)
- Calling `spawn()` with `detached: true` and the correct stdio
- Calling `child.unref()` so the parent does not wait
- Closing the FDs after handoff
- Returning `{ pid }` to the extension

---

## Intent Reference

### `filesystem` type

| Operation | Required params | Returns |
|---|---|---|
| `read` | `path`, `encoding?` | `{ result: string }` |
| `write` | `path`, `content`, `encoding?` | `{ success: true }` |
| `stat` | `path` | `{ result: Stats }` |
| `readdir` | `path` | `{ entries: Entry[] }` |
| `mkdir` | `path`, `recursive?` | `{ success: true }` |
| `unlink` | `path` | `{ success: true }` |
| `rmdir` | `path`, `recursive?` | `{ success: true }` |

### `process` type

| Operation | Required params | Returns |
|---|---|---|
| `spawn` | `command`, `args?`, `cwd?`, `env?` | `{ exitCode, stdout, stderr }` |
| `spawn-detached` | `command`, `args?`, `outLog`, `errLog`, `cwd?`, `env?` | `{ pid }` |
| `exec` | `command`, `cwd?` | `{ stdout, stderr }` |

### `network` type

| Operation | Required params | Returns |
|---|---|---|
| `get` | `url`, `headers?` | `{ status, body }` |
| `post` | `url`, `body?`, `headers?` | `{ status, body }` |

### `git` type

| Operation | Required params | Returns |
|---|---|---|
| `exec` | `args[]` | `string` (stdout) |

### `system` type

| Operation | Required params | Returns |
|---|---|---|
| `registry` | — | `Extension[]` |
| `log` | `level`, `message` | — |

---

## Manifest Requirements

Every permission used in intents must be declared in the extension's `manifest.json`:

```json
{
  "id": "my-extension",
  "permissions": ["filesystem:read", "filesystem:write", "system:process"],
  "capabilities": {
    "filesystem": {
      "read": ["~/.ghost/**"],
      "write": ["~/.ghost/run/**", "~/.ghost/config/**"]
    },
    "system": {
      "process": true
    }
  }
}
```

The `AuthorizationLayer` (pipeline stage 2) cross-references every intent against this manifest and drops any request that exceeds declared permissions before it reaches `ExecutionLayer`.

---

## Extensions Fixed in This Session

The following extensions previously violated the IO-to-Boundary principle and have been remediated:

### `ghost-process-extension` — CRITICAL (21 violations)

Previously used `require('fs')` and `require('child_process')` directly throughout. Now fully compliant:

- `initialize()` — mkdir and write via SDK
- `_loadServices()` — made `async`, reads via `sdk.requestFileReadJSON`
- `handleList()` — PID and state files read via `sdk.requestFileRead` / `sdk.requestFileExists`
- `handleStart()` — detached process launched via `sdk.emitIntent({ type:'process', operation:'spawn-detached' })`; PID and state written via SDK
- `handleStop()` — cleanup via `sdk.emitIntent({ type:'filesystem', operation:'unlink' })`

### `ghost-policy-extension` — MEDIUM (8 violations)

Previously used `require('fs')` for matrix and package reads/writes. Now compliant:

- `_loadMatrix()` — made `async`, reads via `sdk.requestFileReadJSON`
- `_loadPackageJson()` — made `async`, reads via `sdk.requestFileReadJSON`
- `handleCompatExport()` — docs dir creation via `emitIntent(mkdir)`, JSON/MD writes via SDK
- `handleVerifyPlan()` — updated to `await this._loadMatrix()`

### `ghost-extflo-extension` — MINOR (2 violations)

Previously used `fs.existsSync + fs.readFileSync` in `_loadLockfile()`. Now compliant:

```js
// Before
if (fs.existsSync(this.lockPath)) {
    return JSON.parse(fs.readFileSync(this.lockPath, 'utf8'));
}

// After
if (await this.sdk.requestFileExists(this.lockPath)) {
    return await this.sdk.requestFileReadJSON(this.lockPath);
}
```

---

## Pipeline Enhancement: `spawn-detached`

A new operation was added to `ProcessExecutor` in `core/pipeline/execute.js` to support detached background process management without exposing `child_process` to extensions:

```js
// core/pipeline/execute.js — ProcessExecutor._spawnDetached()
async _spawnDetached(params) {
    return new Promise((resolve, reject) => {
        try {
            const outFd = fsSync.openSync(params.outLog, 'a');
            const errFd = fsSync.openSync(params.errLog, 'a');

            const child = spawn(params.command, params.args || [], {
                detached: true,
                stdio: ['ignore', outFd, errFd],
                cwd: params.cwd || process.cwd(),
                env: params.env || process.env
            });

            child.unref();
            fsSync.closeSync(outFd);
            fsSync.closeSync(errFd);

            resolve({ success: true, result: { pid: child.pid }, pid: child.pid });
        } catch (error) {
            reject(new ExecutionError(`Failed to spawn detached process: ${error.message}`, 'EXEC_SPAWN_ERROR'));
        }
    });
}
```

This keeps `fsSync.openSync` and `spawn()` exclusively inside the pipeline, never in extension code.

---

## Verification

Run the compliance tests to verify boundary enforcement:

```bash
# Unit tests for each fixed extension
node test/pipeline-spawn-detached.test.js
node test/extensions/process-extension.test.js
node test/extensions/policy-extension.test.js
node test/extensions/extflo-extension.test.js

# E2E compliance scan (static analysis + pipeline smoke tests)
node test/e2e/io-boundary.e2e.test.js

# Full test suite
node test.js
```

The E2E test (`io-boundary.e2e.test.js`) includes a **static analysis scan** that walks all `extensions/*/` JavaScript files and asserts zero occurrences of `require('fs')` or `require('child_process')`. This acts as a regression gate preventing future violations from being introduced.
