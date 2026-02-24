# Ghost CLI Gateway Architecture

## Overview

Ghost CLI has been refactored from a monolithic Git assistant into a pure **gateway launcher** that provides:

1. **Extension Discovery & Loading**: Dynamically discovers extensions from `~/.ghost/extensions/`
2. **Command Routing**: Routes CLI commands to appropriate extensions via JSON-RPC
3. **Lifecycle Management**: Manages extension processes (start, stop, restart, health monitoring)
4. **Security Pipeline**: Enforces capability-based authorization and audit logging
5. **Real-Time Telemetry**: Displays pipeline execution details with `--verbose` flag

## Architecture Components

```
┌─────────────────────────────────────────────────────────────┐
│                         Ghost CLI                            │
│                    (Gateway Launcher)                        │
└────────────────────┬────────────────────────────────────────┘
                     │
         ┌───────────┼───────────┐
         ▼           ▼           ▼
    ┌────────┐  ┌────────┐  ┌────────┐
    │Extension│  │Extension│  │Extension│
    │    1    │  │    2    │  │    3    │
    └────────┘  └────────┘  └────────┘
         │           │           │
         └───────────┴───────────┘
                     │
           ┌─────────▼─────────┐
           │   I/O Pipeline     │
           │ (Auth/Audit/Exec)  │
           └────────────────────┘
```

### 1. Gateway Launcher (`ghost.js`)

**Responsibilities:**
- Parse CLI arguments
- Initialize Gateway, Runtime, and Pipeline
- Route commands to extensions
- Handle core gateway commands (extension/gateway/audit-log)
- Display telemetry when `--verbose` is enabled

**Key Methods:**
- `initialize()` - Loads extensions and starts subprocesses
- `route(parsedArgs)` - Routes commands to handlers
- `forwardToExtension(parsedArgs)` - Finds and invokes target extension

### 2. Gateway (`core/gateway.js`)

**Responsibilities:**
- Discover extensions from filesystem
- Load and validate manifests
- Maintain registry of loaded extensions
- Provide extension lookup and listing

**Key Methods:**
- `initialize()` - Discovers and loads all extensions
- `getExtension(id)` - Retrieves extension by ID
- `listExtensions()` - Returns all loaded extensions
- `unloadExtension(id)` - Unloads extension from registry

### 3. Extension Runtime (`core/runtime.js`)

**Responsibilities:**
- Start extensions as isolated subprocesses
- Monitor health via heartbeats
- Auto-restart on crashes (with limits)
- Handle JSON-RPC communication over stdin/stdout

**Key Classes:**
- `ExtensionProcess` - Manages single extension subprocess
- `ExtensionRuntime` - Manages all extension processes

**Features:**
- Heartbeat monitoring (configurable timeout)
- Crash recovery with exponential backoff
- Request timeout handling
- State tracking (RUNNING, STOPPED, FAILED, etc.)

### 4. I/O Pipeline (`core/pipeline/index.js`)

**Responsibilities:**
- Validate and intercept all I/O requests
- Enforce authorization based on capabilities
- Audit all operations (NIST SI-10 compliance)
- Execute sandboxed operations with circuit breakers

**Pipeline Stages:**

```
Request → Intercept → Authorize → Audit → Execute → Response
```

1. **Intercept** (`core/pipeline/intercept.js`):
   - Validates JSON-RPC message structure
   - Extracts intent (type, operation, params)
   - Assigns unique request ID

2. **Authorization** (`core/pipeline/auth.js`):
   - Checks extension capabilities against requested operation
   - Enforces path allowlists, network allowlists
   - Applies rate limiting (Two-Rate Three-Color Token Bucket)

3. **Audit** (`core/pipeline/audit.js`):
   - NIST SI-10 validation (path traversal, command injection)
   - Entropy-based secret detection
   - Logs all intents to immutable audit trail

4. **Execution** (`core/pipeline/execute.js`):
   - Executes allowed operations (filesystem, network, git, process)
   - Circuit breaker pattern for failure isolation
   - Timeout management for all operations

## Extension Structure

### Manifest (`manifest.json`)

```json
{
  "id": "my-extension",
  "name": "My Extension",
  "version": "1.0.0",
  "main": "index.js",
  "capabilities": {
    "filesystem": {
      "read": ["src/**/*.js"],
      "write": [".myext/**"]
    },
    "network": {
      "allowlist": ["https://api.example.com"],
      "rateLimit": {
        "cir": 100000,
        "bc": 500000
      }
    },
    "git": {
      "read": true,
      "write": false
    },
    "hooks": ["pre-commit"]
  }
}
```

### Entry Point (`index.js`)

**In-Process Mode:**
```javascript
class MyExtension {
  async myCommand(params) {
    return { success: true, output: "Hello from extension!" };
  }

  cleanup() {
    // Called on unload
  }
}

module.exports = MyExtension;
```

**Subprocess Mode:**
```javascript
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.on('line', async (line) => {
  const request = JSON.parse(line);
  
  let response;
  if (request.method === 'init') {
    response = { jsonrpc: '2.0', id: request.id, result: { initialized: true } };
  } else if (request.method === 'myCommand') {
    response = { jsonrpc: '2.0', id: request.id, result: { output: "Hello!" } };
  } else {
    response = { 
      jsonrpc: '2.0', 
      id: request.id, 
      error: { code: -32601, message: 'Method not found' }
    };
  }
  
  process.stdout.write(JSON.stringify(response) + '\n');
});
```

## JSON-RPC Protocol

### Request Format

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "commit",
  "params": {
    "subcommand": null,
    "args": [],
    "flags": {
      "dry-run": true,
      "verbose": true
    }
  }
}
```

### Response Format

**Success:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "success": true,
    "output": "Commit message generated"
  }
}
```

**Error:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32603,
    "message": "Internal error"
  }
}
```

## Command Routing

The gateway maintains a command map for routing:

```javascript
const commandMap = {
  'commit': 'ghost-git-extension',
  'audit': 'ghost-git-extension',
  'version': 'ghost-git-extension',
  'merge': 'ghost-git-extension',
  'console': 'ghost-git-extension',
  'history': 'ghost-git-extension'
};
```

If no direct mapping exists, the gateway searches extension capabilities:

```javascript
for (const ext of extensions) {
  if (ext.capabilities && ext.capabilities[command]) {
    return ext;
  }
}
```

## Telemetry Output

With `--verbose` flag enabled:

```
[Gateway] Routing 'commit' to extension 'ghost-git-extension'
[Runtime] Extension ghost-git-extension: STARTING
[Runtime] Extension ghost-git-extension: RUNNING
[Telemetry] ROUTE: {"command":"commit","extension":"ghost-git-extension"}
[Runtime] Extension ghost-git-extension restarted (count: 1)
[Telemetry] SUCCESS: {"command":"commit","extension":"ghost-git-extension"}
```

## Security Model

### Capability Declaration

Extensions declare required capabilities in `manifest.json`. The gateway enforces these at runtime.

**Example:**
- Extension requests filesystem write to `/etc/passwd`
- Manifest only allows write to `.myext/**`
- Authorization layer **DENIES** request
- Audit layer logs the violation

### Rate Limiting

Implements RFC 2698 Two-Rate Three-Color Token Bucket:
- **CIR**: Committed Information Rate (sustained rate)
- **Bc**: Burst Committed (allowed burst size)
- **Be**: Burst Excess (excess burst size)

Packets are colored:
- **Green**: Within committed rate
- **Yellow**: Within excess burst
- **Red**: Exceeds limits (dropped)

### Audit Trail

All operations are logged to `~/.ghost/audit.log`:

```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "type": "INTENT",
  "requestId": "req_12345",
  "extensionId": "ghost-git-extension",
  "intentType": "filesystem",
  "operation": "read",
  "authorized": true,
  "validated": true,
  "violations": []
}
```

## Extension Lifecycle

### States

- **STOPPED**: Not running
- **STARTING**: Initialization in progress
- **RUNNING**: Active and healthy
- **STOPPING**: Graceful shutdown in progress
- **FAILED**: Exceeded restart limits or fatal error

### State Transitions

```
STOPPED → STARTING → RUNNING
              ↓          ↓
           FAILED   → STOPPED
```

### Health Monitoring

- Extensions send heartbeats every N seconds
- Gateway monitors last heartbeat timestamp
- If heartbeat exceeds timeout, extension is marked unresponsive
- Auto-restart triggered (up to max restart count)

### Restart Policy

```javascript
{
  maxRestarts: 3,           // Maximum restarts within window
  restartWindow: 60000,     // Window duration in ms
  heartbeatTimeout: 30000   // Heartbeat timeout in ms
}
```

## Development Workflow

### 1. Create Extension

```bash
mkdir my-extension
cd my-extension
```

### 2. Write Manifest

```json
{
  "id": "my-extension",
  "name": "My Extension",
  "version": "1.0.0",
  "main": "index.js",
  "capabilities": {}
}
```

### 3. Implement Handler

```javascript
class MyExtension {
  async greet(params) {
    return { message: `Hello, ${params.name}!` };
  }
}

module.exports = MyExtension;
```

### 4. Install & Test

```bash
ghost extension install .
ghost extension info my-extension
ghost greet --name World --verbose
```

## Best Practices

### Extension Development

1. **Minimize Capabilities**: Only request necessary permissions
2. **Validate Inputs**: Always validate params before use
3. **Handle Errors**: Return structured error responses
4. **Support Cleanup**: Implement `cleanup()` method
5. **Document Commands**: Provide help text for all commands

### Gateway Integration

1. **Use --verbose**: Debug routing and execution
2. **Check Audit Logs**: Monitor security violations
3. **Monitor Health**: Use `ghost gateway health` regularly
4. **Review Manifests**: Audit extension capabilities periodically

## Migration Guide

### From Monolithic to Gateway

The original `ghost.js` contained all business logic. Now:

**Before:**
- All commands implemented in `ghost.js`
- Direct filesystem/network access
- No sandboxing or isolation

**After:**
- Commands implemented in extensions
- All I/O goes through pipeline
- Full authorization and audit trail

### Porting Existing Code

1. Extract command handlers to extension methods
2. Replace direct I/O with RPC calls
3. Declare capabilities in manifest
4. Test with `--verbose` to verify routing

## Troubleshooting

### Extension Not Found

```bash
ghost extension list
# Check if extension is loaded

ghost extension install ./path/to/extension
# Reinstall if needed
```

### Permission Denied

Check manifest capabilities match requested operations:

```bash
ghost extension info <extension-id>
ghost audit-log view --extension <extension-id> --type SECURITY_EVENT
```

### Subprocess Crashes

View health status and restart history:

```bash
ghost gateway health
# Shows restart counts and states
```

### Audit Failures

Review violations:

```bash
ghost audit-log view --limit 100
# Look for type: SECURITY_EVENT or violations
```

## Future Enhancements

- Hot-reload extensions without restart
- Remote extension registry
- Extension marketplace
- WebSocket transport for extensions
- Distributed extension execution
- Plugin sandboxing via VM2 or isolated-vm
