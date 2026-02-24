# Integration Guide: Ghost Git Extension

## Overview

The Ghost Git Extension is designed to be loaded and executed by Ghost CLI core. It operates in a sandboxed environment where all I/O operations are mediated through JSON-RPC calls to the core.

## Architecture

```
┌─────────────────────────────────────────┐
│          Ghost CLI Core                 │
│  ┌─────────────────────────────────┐   │
│  │   RPC Handler                   │   │
│  │  - File System Operations       │   │
│  │  - Git Command Execution        │   │
│  │  - HTTPS Requests               │   │
│  │  - User Prompts                 │   │
│  │  - Logging                      │   │
│  └──────────┬──────────────────────┘   │
│             │ JSON-RPC 2.0              │
│             ├───────────────────────────┤
│  ┌──────────▼──────────────────────┐   │
│  │   Git Extension                 │   │
│  │  - Commit Generation            │   │
│  │  - Security Scanning            │   │
│  │  - Version Management           │   │
│  │  - Merge Resolution             │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

## Loading the Extension

### Step 1: Load Extension Module

```javascript
const { createExtension } = require('./extensions/ghost-git-extension/extension.js');
```

### Step 2: Create Core RPC Handler

The core must implement an RPC handler that the extension can call:

```javascript
class GhostCoreRPC {
    async handle(request) {
        const { method, params = {} } = request;
        
        // Route to appropriate handler
        if (method.startsWith('fs.')) {
            return await this.handleFilesystem(method, params);
        } else if (method.startsWith('git.')) {
            return await this.handleGit(method, params);
        } else if (method.startsWith('https.')) {
            return await this.handleNetwork(method, params);
        }
        // ... etc
    }
    
    async handleFilesystem(method, params) {
        // Check permissions from manifest
        if (!this.checkPermission('filesystem', params.path, method)) {
            throw new Error('Permission denied');
        }
        
        // Execute filesystem operation
        // Return JSON-RPC response
    }
}
```

### Step 3: Initialize Extension

```javascript
const coreRPC = new GhostCoreRPC();
const { handleRequest, extension } = createExtension(
    (request) => coreRPC.handle(request)
);
```

## Permission Enforcement

The core must enforce permissions declared in `manifest.json`:

### Filesystem Permissions

```javascript
function checkFilesystemPermission(operation, path) {
    const manifest = loadManifest();
    const perms = manifest.permissions.filesystem;
    
    if (operation === 'read') {
        // Check if path matches any read pattern
        return perms.read.some(pattern => 
            matchGlob(path, pattern)
        );
    } else if (operation === 'write') {
        // Check if path matches any write pattern
        return perms.write.some(pattern => 
            matchGlob(path, pattern)
        );
    }
    
    return false;
}
```

### Network Permissions

```javascript
function checkNetworkPermission(hostname, protocol) {
    const manifest = loadManifest();
    const perms = manifest.permissions.network;
    
    if (!perms.protocols.includes(protocol)) {
        return false;
    }
    
    return perms.allowed_hosts.includes(hostname);
}
```

### Rate Limiting

```javascript
class RateLimiter {
    constructor(manifest) {
        this.CIR = parseRate(manifest.permissions.rateLimits.CIR); // 100KB/s
        this.Bc = parseSize(manifest.permissions.rateLimits.Bc);   // 500KB
        this.Be = parseSize(manifest.permissions.rateLimits.Be);   // 1MB
        this.tokens = this.Bc;
        this.lastUpdate = Date.now();
    }
    
    async request(size) {
        const now = Date.now();
        const elapsed = (now - this.lastUpdate) / 1000;
        
        // Token bucket algorithm
        this.tokens = Math.min(
            this.Bc + this.Be,
            this.tokens + (elapsed * this.CIR)
        );
        
        if (this.tokens < size) {
            throw new Error('Rate limit exceeded');
        }
        
        this.tokens -= size;
        this.lastUpdate = now;
    }
}
```

## RPC Call Flow

### Example: Generate Commit Message

```
User Command: ghost
     │
     ▼
Ghost Core
     │
     ├─► Load Git Extension
     │
     ├─► Call: git.getStagedDiff
     │         │
     │         ├─► Extension needs git diff
     │         │
     │         └─► RPC Call: git.exec(['diff', '--cached'])
     │                   │
     │                   └─► Core executes git command
     │                         │
     │                         └─► Returns output
     │
     ├─► Call: git.generateCommit
     │         │
     │         ├─► Extension needs AI completion
     │         │
     │         └─► RPC Call: https.request(groq.com, {...})
     │                   │
     │                   ├─► Core checks network permission
     │                   │
     │                   ├─► Core checks rate limit
     │                   │
     │                   └─► Core makes HTTPS request
     │                         │
     │                         └─► Returns AI response
     │
     └─► Present commit message to user
```

## Integration Points

### 1. CLI Command Handling

```javascript
async function handleGhostCommand(args) {
    const flags = parseArgs(args);
    
    // Initialize extension
    const { handleRequest } = createExtension(coreRPCHandler);
    
    // Check if in git repo
    const repoCheck = await handleRequest({
        jsonrpc: "2.0",
        id: 1,
        method: "git.checkRepo",
        params: {}
    });
    
    if (!repoCheck.result) {
        console.error('Not a git repository');
        return;
    }
    
    // Get staged diff
    const diff = await handleRequest({
        jsonrpc: "2.0",
        id: 2,
        method: "git.getStagedDiff",
        params: {}
    });
    
    // Audit security
    const audit = await handleRequest({
        jsonrpc: "2.0",
        id: 3,
        method: "git.auditSecurity",
        params: {
            diffMap: diff.result.map,
            provider: 'groq',
            apiKey: getApiKey(),
            model: 'llama-3.3-70b-versatile'
        }
    });
    
    if (audit.result.blocked) {
        console.error('Security issue:', audit.result.reason);
        return;
    }
    
    // Generate commit
    const commit = await handleRequest({
        jsonrpc: "2.0",
        id: 4,
        method: "git.generateCommit",
        params: {
            diffText: diff.result.text,
            provider: 'groq',
            apiKey: getApiKey(),
            model: 'llama-3.3-70b-versatile'
        }
    });
    
    console.log('Suggested commit:', commit.result);
}
```

### 2. Version Management Integration

```javascript
async function handleVersionBump(type) {
    const { handleRequest } = createExtension(coreRPCHandler);
    
    const result = await handleRequest({
        jsonrpc: "2.0",
        id: 1,
        method: "git.version.bump",
        params: {
            bumpType: type,
            flags: {
                tag: true,
                push: false
            }
        }
    });
    
    console.log(`Version bumped: ${result.result.currentVersion} → ${result.result.nextVersion}`);
}
```

### 3. Security Audit Integration

```javascript
async function handleSecurityAudit() {
    const { handleRequest } = createExtension(coreRPCHandler);
    
    const result = await handleRequest({
        jsonrpc: "2.0",
        id: 1,
        method: "git.performFullAudit",
        params: { flags: { verbose: true } }
    });
    
    if (result.result.issues > 0) {
        console.error(`Found ${result.result.issues} security issues`);
        result.result.findings.forEach(finding => {
            console.error(`${finding.file}:`);
            finding.suspects.forEach(s => console.error(`  - ${s}`));
        });
    } else {
        console.log('No security issues found');
    }
}
```

## Error Handling

The core should handle extension errors gracefully:

```javascript
try {
    const response = await handleRequest(request);
    
    if (response.error) {
        console.error(`Extension error: ${response.error.message}`);
        // Log error, show user-friendly message
        return;
    }
    
    // Process result
} catch (error) {
    console.error(`Core error: ${error.message}`);
    // Fatal error, may need to unload extension
}
```

## Extension Lifecycle

1. **Load**: Core loads extension module
2. **Initialize**: Core creates extension instance with RPC handler
3. **Execute**: Core calls extension methods via RPC
4. **Unload**: Core can unload extension if needed

## Best Practices

1. **Always validate permissions** before executing RPC calls
2. **Enforce rate limits** on network operations
3. **Log all extension activity** for auditing
4. **Handle errors gracefully** to prevent extension crashes
5. **Sanitize inputs** from extension before executing system calls
6. **Monitor resource usage** (CPU, memory, network)
7. **Implement timeouts** for long-running operations

## Security Considerations

- Extensions have no direct access to filesystem or network
- All I/O is mediated through core RPC handler
- Core enforces manifest permissions
- Rate limiting prevents abuse
- HTTPS-only for network requests
- No execution of arbitrary code from extension

## Testing Integration

```javascript
// Mock core RPC handler for testing
class MockCore {
    constructor() {
        this.responses = new Map();
    }
    
    setResponse(method, result) {
        this.responses.set(method, result);
    }
    
    async handle(request) {
        const result = this.responses.get(request.method);
        return {
            jsonrpc: "2.0",
            id: request.id,
            result: result || null
        };
    }
}

// Test extension
const mockCore = new MockCore();
mockCore.setResponse('git.exec', 'mock output');

const { handleRequest } = createExtension(
    (req) => mockCore.handle(req)
);

const response = await handleRequest({
    jsonrpc: "2.0",
    id: 1,
    method: "git.checkRepo",
    params: {}
});

assert(response.result === true);
```
