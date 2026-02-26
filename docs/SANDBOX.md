# Sandboxed Plugin Execution Environment

## Overview

The Ghost CLI implements a sandboxed plugin execution environment using Node.js VM contexts to provide secure, isolated execution of extensions with controlled resource access and comprehensive security monitoring.

## Architecture

### Core Components

#### 1. PluginSandbox

The `PluginSandbox` class creates isolated VM contexts for extension execution with the following features:

- **Isolated Context**: Each extension runs in a separate `vm.Context` with no access to host process globals
- **Restricted Globals**: Extensions only have access to safe built-in objects (Math, JSON, Promise, etc.)
- **Capability-Based API Injection**: Only declared manifest permissions are available as sandbox globals
- **Resource Quotas**: CPU, memory, and operation limits prevent resource exhaustion
- **Security Monitoring**: Automatic detection of sandbox escape attempts

#### 2. SandboxedExtension

The `SandboxedExtension` class wraps extension code execution in sandboxes:

- Loads extension code from filesystem
- Creates sandbox with appropriate host API bindings
- Executes extension methods within the sandbox context
- Manages extension lifecycle (init, call, cleanup)

#### 3. ResourceMonitor

Tracks and enforces resource quotas:

- **Operation Count**: Maximum number of API calls
- **Execution Time**: Total CPU time consumed
- **Memory Usage**: Peak heap usage tracking
- **Timeout Enforcement**: Per-operation timeouts via `Promise.race`

#### 4. SandboxEscapeDetector

Monitors for security violations:

- **Prototype Pollution**: Checks for modifications to Object.prototype
- **Context Breakout**: Detects access to restricted globals (require, process, fs)
- **Violation Events**: Emits security events for monitoring and alerting

## Security Model

### Restricted Globals

Extensions have **NO** access to:

```javascript
// Completely undefined in sandbox
require    // Cannot load arbitrary modules
process    // Cannot access process information
fs         // Cannot directly access filesystem
module     // Cannot access Node.js module system
global     // Cannot access host global object
__filename // Cannot access file paths
__dirname  // Cannot access directory paths
```

### Capability-Based API Injection

Extensions only receive APIs for declared capabilities:

```javascript
// manifest.json
{
  "capabilities": {
    "filesystem": {
      "read": ["**/*.js"],
      "write": ["dist/**"]
    },
    "network": {
      "allowlist": ["https://api.example.com"]
    },
    "git": {
      "read": true,
      "write": false
    }
  }
}
```

Sandbox provides:

```javascript
// Available in sandbox context
fs.readFile()   // Only if filesystem.read declared
fs.writeFile()  // Only if filesystem.write declared
http.get()      // Only if network capability declared
git.status()    // Only if git.read declared
git.commit()    // Only if git.write declared
```

### Resource Quotas

#### CPU Limits

Implemented via `setTimeout` wrapper and operation timeouts:

```javascript
// Maximum execution time per operation
const sandbox = new PluginSandbox(extensionId, manifest, {
  timeout: 30000  // 30 second default timeout
});

// Enforced via Promise.race
const result = await Promise.race([
  sandbox.executeCode(code),
  timeoutPromise
]);
```

#### Memory Limits

Configured per sandbox instance:

```javascript
const sandbox = new PluginSandbox(extensionId, manifest, {
  memoryLimit: 128 * 1024 * 1024  // 128MB default
});
```

> Note: Node.js VM contexts share the same V8 heap. Use `--max-old-space-size` flag for process-level memory limits.

#### Operation Limits

Maximum number of API calls:

```javascript
const sandbox = new PluginSandbox(extensionId, manifest, {
  maxOperations: 10000  // Default limit
});

// Enforced on every API call
resourceMonitor.checkOperationLimit();
```

## Sandbox Escape Detection

### Prototype Pollution

Checks for modifications to dangerous properties:

```javascript
const dangerous = ['__proto__', 'constructor', 'prototype'];

for (const prop of dangerous) {
  if (context.global[prop] !== Object.prototype[prop]) {
    // VIOLATION DETECTED
  }
}
```

### Context Breakout

Monitors for access to restricted globals:

```javascript
const suspicious = ['require', 'process', 'module', 'exports'];

for (const key of suspicious) {
  if (context[key] !== undefined && !context._allowedGlobals.includes(key)) {
    // VIOLATION DETECTED
  }
}
```

### Violation Events

Security violations emit events for monitoring:

```javascript
sandbox.on('security-violation', (info) => {
  console.error('Security violation:', info);
  // Log to SIEM, terminate extension, etc.
});
```

## Usage

### Starting Extension in Sandbox Mode

```javascript
const { ExtensionRuntime } = require('./core');

const runtime = new ExtensionRuntime({
  executionMode: 'sandbox'  // Use sandboxes instead of child processes
});

await runtime.startExtension(
  'my-extension',
  '/path/to/extension',
  manifest,
  {
    timeout: 30000,           // 30 second timeout
    maxOperations: 10000,     // 10k operation limit
    memoryLimit: 128 * 1024 * 1024  // 128MB limit
  }
);
```

### Direct Sandbox Usage

```javascript
const { PluginSandbox } = require('./core/sandbox');

const sandbox = new PluginSandbox(extensionId, manifest, {
  timeout: 30000,
  maxOperations: 10000
});

// Initialize with host APIs
const context = sandbox.initialize({
  filesystem: fsAPI,
  network: networkAPI,
  git: gitAPI
});

// Execute code
const result = await sandbox.executeCode(`
  (async () => {
    const data = await fs.readFile('package.json');
    return JSON.parse(data);
  })()
`);

// Clean up
sandbox.terminate();
```

### Creating Sandbox-Compatible Extensions

```javascript
// extension.js
class MyExtension {
  async init(config) {
    console.log('Extension initialized');
    return { success: true };
  }

  async myMethod(params) {
    // Use injected APIs
    const data = await fs.readFile(params.path);
    const response = await http.get(params.url);
    
    return { data, response };
  }

  async cleanup() {
    console.log('Extension cleanup');
  }
}

module.exports = MyExtension;
```

## Performance Comparison

### Sandbox vs. Process Execution

| Metric | Sandbox | Process | Advantage |
|--------|---------|---------|-----------|
| Startup Time | ~5ms | ~50-100ms | **Sandbox 10-20x faster** |
| Memory Overhead | Shared heap | Separate process | **Sandbox lower** |
| API Call Latency | Direct | IPC serialization | **Sandbox lower** |
| Isolation | VM context | OS process | **Process stronger** |
| Crash Recovery | Immediate | Restart needed | **Sandbox faster** |

### When to Use Each Mode

**Use Sandbox Mode for:**
- Fast startup required
- Frequent method calls
- Trusted extensions
- Low-latency requirements
- Resource-constrained environments

**Use Process Mode for:**
- Maximum isolation needed
- Untrusted code
- Long-running operations
- Extensions that need native modules
- Production deployments with high security requirements

## Security Considerations

### VM Context Limitations

Node.js VM contexts provide **code isolation** but not **full security sandboxing**:

- ✅ Prevents access to host globals
- ✅ Isolates variable scope
- ✅ Restricts module loading
- ❌ Shares same V8 heap (memory not isolated)
- ❌ Shares same event loop (CPU not isolated)
- ❌ Cannot prevent all DoS attacks

### Defense in Depth

Sandboxes are one layer in a defense-in-depth strategy:

1. **Manifest Validation**: Fail-closed permission model
2. **Authorization Layer**: Validates all API calls against manifest
3. **Sandbox Isolation**: VM context restrictions
4. **Resource Quotas**: Prevents resource exhaustion
5. **Escape Detection**: Monitors for violations
6. **Audit Logging**: Records all operations

### Threat Model

**Mitigated Threats:**
- ✅ Unauthorized filesystem access
- ✅ Unauthorized network requests
- ✅ Unauthorized git operations
- ✅ Resource exhaustion (with quotas)
- ✅ Code injection (isolated context)

**Residual Risks:**
- ⚠️ Memory exhaustion (shared heap)
- ⚠️ CPU starvation (shared event loop)
- ⚠️ Timing attacks (shared process)
- ⚠️ VM escape vulnerabilities (rare but possible)

## Monitoring and Metrics

### Resource Metrics

```javascript
const metrics = sandbox.getMetrics();

console.log({
  operationCount: metrics.resourceMetrics.operationCount,
  executionTime: metrics.resourceMetrics.cpuTime,
  memoryPeak: metrics.resourceMetrics.memoryPeakUsage,
  uptime: metrics.resourceMetrics.uptime
});
```

### Security Violations

```javascript
sandbox.on('security-violation', (info) => {
  log.error('Security violation detected', {
    extensionId: info.extensionId,
    violations: info.violations,
    timestamp: info.timestamp
  });
});
```

### State Tracking

```javascript
const state = sandbox.getState();

console.log({
  state: state.state,  // UNINITIALIZED, INITIALIZED, EXECUTING, ERROR, TERMINATED
  initialized: state.initialized,
  executing: state.executing,
  hasViolations: state.hasViolations
});
```

## Best Practices

### Extension Development

1. **Declare All Capabilities**: Always declare required permissions in manifest
2. **Handle Timeouts**: Implement retry logic for timeout errors
3. **Avoid Infinite Loops**: Use bounded iterations
4. **Clean Up Resources**: Implement cleanup method
5. **Use Async/Await**: Proper async handling prevents blocking

### Runtime Configuration

1. **Set Appropriate Timeouts**: Balance responsiveness vs. operation complexity
2. **Configure Operation Limits**: Based on expected API usage
3. **Monitor Violations**: Set up alerting for security events
4. **Regular Audits**: Review sandbox metrics and logs
5. **Update Dependencies**: Keep Node.js and dependencies current

## Future Enhancements

Planned improvements:

- [ ] Per-sandbox memory limits using Worker Threads
- [ ] CPU time accounting and limits
- [ ] Enhanced escape detection using static analysis
- [ ] Sandbox pooling for improved performance
- [ ] WebAssembly sandbox support
- [ ] Deno-style permission prompts

## References

- [Node.js VM Module](https://nodejs.org/api/vm.html)
- [V8 Context Isolation](https://v8.dev/docs/embed)
- [OWASP Secure Coding Practices](https://owasp.org/www-project-secure-coding-practices-quick-reference-guide/)
- [Ghost Extension SDK](../packages/extension-sdk/)
