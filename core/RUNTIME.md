# Extension Runtime - JSON-RPC Protocol

## Overview

The Extension Runtime provides a robust subprocess-based architecture for running Ghost extensions. Extensions run in isolated Node.js child processes and communicate with the gateway via JSON-RPC 2.0 over stdio.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Extension Runtime                         │
│  ┌────────────────────────────────────────────────────┐     │
│  │  ExtensionRuntime                                   │     │
│  │  - Manages multiple ExtensionProcess instances      │     │
│  │  - Health monitoring                                │     │
│  │  - Global shutdown                                  │     │
│  └────────────────────────────────────────────────────┘     │
│                           │                                  │
│                           │ manages                          │
│                           ▼                                  │
│  ┌────────────────────────────────────────────────────┐     │
│  │  ExtensionProcess (per extension)                   │     │
│  │  - Process lifecycle (start/stop/restart)           │     │
│  │  - JSON-RPC communication                           │     │
│  │  - Heartbeat monitoring                             │     │
│  │  - Crash recovery                                   │     │
│  └────────────────────────────────────────────────────┘     │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        │ stdio (JSON-RPC)
                        ▼
┌─────────────────────────────────────────────────────────────┐
│              Child Process (Node.js)                         │
│  ┌────────────────────────────────────────────────────┐     │
│  │  ExtensionWrapper                                   │     │
│  │  - Handles JSON-RPC protocol                        │     │
│  │  - Dispatches to extension methods                  │     │
│  │  - Error handling                                   │     │
│  └────────────────────────────────────────────────────┘     │
│                           │                                  │
│                           │ calls                            │
│                           ▼                                  │
│  ┌────────────────────────────────────────────────────┐     │
│  │  Extension Instance                                 │     │
│  │  - User code (analyzeCode, onPreCommit, etc.)      │     │
│  │  - Business logic                                   │     │
│  └────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

## JSON-RPC Protocol

### Request Format

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "analyzeCode",
  "params": {
    "filePath": "src/main.js",
    "content": "..."
  }
}
```

### Response Format (Success)

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "file": "src/main.js",
    "issues": [],
    "passed": true
  }
}
```

### Response Format (Error)

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32603,
    "message": "Internal error: File not found",
    "data": {
      "stack": "..."
    }
  }
}
```

### Standard Error Codes

| Code | Message | Description |
|------|---------|-------------|
| -32700 | Parse error | Invalid JSON |
| -32600 | Invalid Request | Missing required fields |
| -32601 | Method not found | Method doesn't exist |
| -32602 | Invalid params | Invalid method parameters |
| -32603 | Internal error | Extension error |

## Extension Lifecycle

### 1. Start

```javascript
const runtime = new ExtensionRuntime();
await runtime.startExtension(
    'my-extension',
    '/path/to/extension',
    manifest
);
```

**Sequence:**
1. Spawn Node.js child process
2. Set up stdio pipes
3. Send `init` request with config
4. Wait for initialization response
5. Start heartbeat monitoring
6. Transition to RUNNING state

### 2. Call Methods

```javascript
const result = await runtime.callExtension(
    'my-extension',
    'analyzeCode',
    { filePath: 'test.js', content: '...' }
);
```

**Sequence:**
1. Generate unique request ID
2. Create pending request entry
3. Send JSON-RPC request via stdin
4. Wait for response (with timeout)
5. Parse and return result

### 3. Stop

```javascript
await runtime.stopExtension('my-extension');
```

**Sequence:**
1. Send `shutdown` request
2. Wait for graceful shutdown (5s timeout)
3. Send SIGTERM if still running
4. Force kill with SIGKILL if necessary
5. Clean up resources
6. Remove from registry

### 4. Restart

```javascript
await runtime.restartExtension('my-extension');
```

**Sequence:**
1. Check restart limits
2. Stop extension
3. Start extension
4. Increment restart counter

## Health Monitoring

### Heartbeat Checks

- **Frequency**: Every `heartbeatTimeout / 2` ms (default: 15s)
- **Timeout**: `heartbeatTimeout` ms (default: 30s)
- **Action on failure**: Automatic restart

**How it works:**
1. Runtime sends `ping` request periodically
2. Extension responds with `pong`
3. Runtime updates `lastHeartbeat` timestamp
4. If no heartbeat for `heartbeatTimeout`, mark as unresponsive
5. Trigger automatic restart

### Health Check

- **Frequency**: `healthCheckFrequency` ms (default: 60s)
- **Checks**: State, heartbeat age, pending requests

```javascript
const health = runtime.getHealthStatus();
// {
//   totalExtensions: 1,
//   running: 1,
//   failed: 0,
//   extensions: {
//     'my-extension': {
//       state: 'RUNNING',
//       pid: 12345,
//       restartCount: 0,
//       lastHeartbeat: 1234567890,
//       pendingRequests: 0
//     }
//   }
// }
```

## Crash Recovery

### Automatic Restart

Extensions are automatically restarted when:
- Process exits unexpectedly
- Process becomes unresponsive
- Process crashes

**Restart Policy:**
- **Max restarts**: `maxRestarts` (default: 3)
- **Time window**: `restartWindow` ms (default: 60s)
- **Behavior**: If restart limit exceeded within window, mark as FAILED

### Example

```javascript
// Extension crashes 3 times in 30 seconds
// 1st crash: restart (count: 1)
// 2nd crash: restart (count: 2)  
// 3rd crash: restart (count: 3)
// 4th crash: FAILED (exceeded limit)

// After 60 seconds from first crash, counter resets
```

## Isolation Benefits

### Process Isolation

Each extension runs in its own process:
- **Memory isolation**: Extension memory issues don't affect gateway
- **CPU isolation**: Heavy computations don't block gateway
- **Crash isolation**: Extension crash doesn't crash gateway
- **Resource limits**: Can set per-process memory/CPU limits

### Communication Isolation

JSON-RPC over stdio:
- **No shared memory**: Extensions can't access gateway memory
- **Type safety**: All data serialized/deserialized
- **Error boundaries**: Errors contained within extension
- **Protocol validation**: Invalid messages rejected

## Extension Implementation

### Basic Structure

```javascript
#!/usr/bin/env node

const ExtensionWrapper = require('./extension-wrapper');

class MyExtension {
    async init(config) {
        this.config = config;
        return { initialized: true };
    }

    async myMethod(params) {
        // Implementation
        return { result: 'data' };
    }

    cleanup() {
        // Cleanup resources
    }
}

if (process.env.GHOST_EXTENSION_MODE === 'subprocess') {
    const extension = new MyExtension();
    const wrapper = new ExtensionWrapper(extension);
    wrapper.start();
} else {
    module.exports = MyExtension;
}
```

### Built-in Methods

Extensions automatically support:

- **`init(config)`**: Called during startup
- **`shutdown()`**: Called before process termination
- **`ping()`**: Responds with `pong` for health checks

Custom methods are dispatched automatically.

## Runtime Options

```javascript
const runtime = new ExtensionRuntime({
    // Heartbeat monitoring
    heartbeatTimeout: 30000,        // 30s - Mark unresponsive
    
    // Request timeouts
    responseTimeout: 30000,          // 30s - Request timeout
    startupTimeout: 10000,           // 10s - Init timeout
    
    // Restart policy
    maxRestarts: 3,                  // Max restarts in window
    restartWindow: 60000,            // 60s - Reset counter after
    
    // Health checks
    healthCheckFrequency: 60000      // 60s - Check frequency
});
```

## Events

### ExtensionRuntime Events

```javascript
runtime.on('extension-state-change', (info) => {
    // { extensionId, state, error? }
});

runtime.on('extension-error', (info) => {
    // { extensionId, error }
});

runtime.on('extension-crashed', (info) => {
    // { extensionId, code, signal }
});

runtime.on('extension-restarted', (info) => {
    // { extensionId, count }
});

runtime.on('extension-unresponsive', (info) => {
    // { extensionId, timeSinceLastHeartbeat }
});

runtime.on('extension-stderr', (info) => {
    // { extensionId, line }
});

runtime.on('health-check-failed', (info) => {
    // { extensionId, reason }
});
```

## Usage Examples

### Basic Usage

```javascript
const { ExtensionRuntime } = require('./core/runtime');

const runtime = new ExtensionRuntime();

// Start extension
await runtime.startExtension(
    'my-ext',
    '/path/to/extension',
    manifest
);

// Call method
const result = await runtime.callExtension(
    'my-ext',
    'doSomething',
    { arg: 'value' }
);

// Stop extension
await runtime.stopExtension('my-ext');
```

### With Event Handling

```javascript
const runtime = new ExtensionRuntime();

runtime.on('extension-error', ({ extensionId, error }) => {
    console.error(`Extension ${extensionId} error:`, error);
});

runtime.on('extension-crashed', async ({ extensionId, code }) => {
    console.error(`Extension ${extensionId} crashed with code ${code}`);
    // Will be automatically restarted
});

await runtime.startExtension('my-ext', path, manifest);
```

### Multiple Extensions

```javascript
const runtime = new ExtensionRuntime();

const extensions = [
    { id: 'ext1', path: '/path/to/ext1', manifest: manifest1 },
    { id: 'ext2', path: '/path/to/ext2', manifest: manifest2 },
    { id: 'ext3', path: '/path/to/ext3', manifest: manifest3 }
];

// Start all extensions
for (const ext of extensions) {
    await runtime.startExtension(ext.id, ext.path, ext.manifest);
}

// Get overall health
const health = runtime.getHealthStatus();
console.log(`Running: ${health.running}/${health.totalExtensions}`);

// Shutdown all
await runtime.shutdown();
```

### Error Handling

```javascript
try {
    const result = await runtime.callExtension(
        'my-ext',
        'analyze',
        { file: 'test.js' }
    );
} catch (error) {
    if (error.message.includes('timeout')) {
        console.error('Extension timed out');
    } else if (error.message.includes('not running')) {
        console.error('Extension is not running');
    } else {
        console.error('Extension error:', error);
    }
}
```

## Performance Considerations

### Startup Time

- **Process spawn**: ~50-100ms
- **Init call**: Depends on extension
- **Total**: ~100-200ms per extension

**Optimization:**
- Start extensions in parallel
- Lazy load unused extensions
- Cache startup state

### Runtime Overhead

- **Per request**: ~1-5ms (serialization + IPC)
- **Memory**: ~10-30MB per extension process
- **CPU**: Minimal (event-driven)

**Optimization:**
- Batch multiple requests
- Use notifications for one-way messages
- Reuse extension processes

### Memory Management

- Each extension: Isolated heap
- No memory leaks affect gateway
- Can set `--max-old-space-size` per extension

```javascript
// Custom spawn with memory limit
const proc = spawn('node', [
    '--max-old-space-size=512',
    mainFile
], options);
```

## Security Benefits

### Isolation

- Extensions can't access gateway memory
- Extensions can't affect other extensions
- Process crashes contained

### Sandboxing

- Can use OS-level process limits
- Can restrict file system access
- Can monitor resource usage

### Audit

- All communication logged
- Request/response pairs tracked
- Stderr captured

## Debugging

### Enable Verbose Logging

```javascript
runtime.on('extension-stderr', ({ extensionId, line }) => {
    console.error(`[${extensionId}]`, line);
});

runtime.on('extension-error', ({ extensionId, error }) => {
    console.error(`[${extensionId}] ERROR:`, error);
});
```

### Inspect Extension State

```javascript
const state = runtime.getExtensionState('my-ext');
console.log(state);
// {
//   extensionId: 'my-ext',
//   state: 'RUNNING',
//   pid: 12345,
//   restartCount: 0,
//   lastHeartbeat: 1234567890,
//   pendingRequests: 0,
//   uptime: 5000
// }
```

### Test Extension Manually

```bash
# Run extension directly
cd /path/to/extension
GHOST_EXTENSION_MODE=subprocess node index.js

# Send JSON-RPC request
echo '{"jsonrpc":"2.0","id":1,"method":"init","params":{"config":{}}}' | node index.js

# Should respond with:
# {"jsonrpc":"2.0","id":1,"result":{"initialized":true}}
```

## Migration from In-Process

### Before (In-Process)

```javascript
const ExtensionClass = require('./extension');
const instance = new ExtensionClass();
await instance.init(config);
const result = await instance.analyze(params);
```

### After (Subprocess)

```javascript
const runtime = new ExtensionRuntime();
await runtime.startExtension('ext', path, manifest);
const result = await runtime.callExtension('ext', 'analyze', params);
```

### Benefits

- **Stability**: Extension crash doesn't crash gateway
- **Isolation**: Memory issues contained
- **Monitoring**: Built-in health checks
- **Recovery**: Automatic restart on failure

## Best Practices

1. **Always handle errors**: Extension errors are isolated but should be logged
2. **Set appropriate timeouts**: Balance responsiveness with long operations
3. **Monitor health status**: Check health periodically in production
4. **Graceful shutdown**: Always call `runtime.shutdown()` on exit
5. **Test restart behavior**: Ensure extensions handle restarts correctly
6. **Log stderr**: Capture extension logs for debugging
7. **Batch operations**: Minimize request count for better performance
8. **Resource limits**: Set memory limits for extensions in production

## Troubleshooting

### Extension won't start

- Check `main` file exists and is executable
- Verify extension doesn't have syntax errors
- Check `init` method completes successfully
- Review `startupTimeout` setting

### Extension marked unresponsive

- Check if extension is blocking event loop
- Verify extension responds to `ping` requests
- Review `heartbeatTimeout` setting
- Check CPU usage

### Restart loop

- Extension crashes repeatedly
- Check extension logs (stderr)
- May exceed `maxRestarts` limit
- Review initialization logic

### High memory usage

- Each extension: separate process
- Set `--max-old-space-size` flag
- Monitor with `process.memoryUsage()`
- Consider cleanup in extension

## Conclusion

The Extension Runtime provides a robust, isolated, and monitored environment for running Ghost extensions. By using subprocess isolation and JSON-RPC communication, it ensures stability, security, and easy recovery from failures.
