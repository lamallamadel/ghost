# Ghost CLI v1.0.0 Gateway Architecture

This directory contains the core Ghost gateway architecture for extension management.

## Components

### 1. `gateway.js` - Pure Orchestration Entry Point

The Gateway class provides zero-business-logic orchestration for extension lifecycle:

- **Initialization**: Discovers and loads extensions from `~/.ghost/extensions/`
- **Extension Management**: Register, retrieve, and unload extensions
- **Execution**: Route method calls to loaded extensions
- **Cleanup**: Handle graceful shutdown

**Usage:**
```javascript
const Gateway = require('./core/gateway');

const gateway = new Gateway();
await gateway.initialize();

const extensions = gateway.listExtensions();
await gateway.executeExtension('my-extension', 'someMethod', arg1, arg2);

gateway.shutdown();
```

### 2. `manifest-schema.json` - Extension Capability Contract

JSON Schema defining the extension manifest structure with:

**Required Fields:**
- `id`: Unique identifier (lowercase, alphanumeric with hyphens)
- `name`: Human-readable name
- `version`: Semantic version (major.minor.patch)
- `main`: Entry point file path
- `capabilities`: Declared resource requirements

**Capabilities:**
- **Filesystem**: Read/write glob patterns
  - `read`: Array of glob patterns for read-only access
  - `write`: Array of glob patterns for write access

- **Network**: Allowlist and rate limiting
  - `allowlist`: Array of allowed URLs (protocol + domain only)
  - `rateLimit`: 
    - `cir`: Committed Information Rate (requests/minute)
    - `bc`: Burst Committed (max burst size)

- **Git**: Repository access permissions
  - `read`: Boolean for read-only access
  - `write`: Boolean for modification access

- **Hooks**: Git hooks to register
  - Supported: pre-commit, post-commit, pre-push, post-checkout, commit-msg, pre-rebase

**Permissions:**
- Granular system permissions (filesystem:read, network:https, git:write, etc.)

**Example Manifest:**
```json
{
  "id": "code-analyzer",
  "name": "Code Quality Analyzer",
  "version": "1.0.0",
  "description": "Analyzes code quality on commit",
  "author": "Ghost Team",
  "main": "index.js",
  "capabilities": {
    "filesystem": {
      "read": ["src/**/*.js", "**/*.json"]
    },
    "network": {
      "allowlist": ["https://api.example.com"],
      "rateLimit": {
        "cir": 60,
        "bc": 10
      }
    },
    "git": {
      "read": true,
      "write": false
    },
    "hooks": ["pre-commit"]
  },
  "permissions": [
    "filesystem:read",
    "network:https",
    "git:read"
  ]
}
```

### 3. `extension-loader.js` - Discovery, Loading, and Validation

Handles extension lifecycle management:

**Discovery:**
- Scans `~/.ghost/extensions/` directory
- Identifies valid extension directories with `manifest.json`
- Creates extensions directory if it doesn't exist

**Loading:**
- Reads and parses manifest files
- Validates against schema
- Requires and instantiates extension modules
- Handles errors gracefully with warnings

**Validation:**
- Enforces manifest schema compliance
- Validates capability declarations
- Checks URL formats for network allowlists
- Ensures rate limits are positive integers
- Verifies git hook names against supported list

**API:**
```javascript
const ExtensionLoader = require('./core/extension-loader');

const loader = new ExtensionLoader('~/.ghost/extensions');
const extensions = await loader.discoverAndLoad();

const loaded = loader.getLoadedExtensions();
loader.unload('extension-id');
```

## Extension Directory Structure

```
~/.ghost/extensions/
├── my-extension/
│   ├── manifest.json      # Extension manifest
│   ├── index.js          # Entry point
│   ├── package.json      # Optional npm dependencies
│   └── ...
└── another-extension/
    ├── manifest.json
    ├── main.js
    └── ...
```

## Extension Module Interface

Extension modules should export a class or object with optional lifecycle methods:

```javascript
class MyExtension {
    constructor() {
        // Initialize
    }

    async someMethod(arg1, arg2) {
        // Extension logic
        return result;
    }

    cleanup() {
        // Cleanup resources before unload
    }
}

module.exports = MyExtension;
```

## Rate Limiting

The rate limit capability uses traffic shaping concepts:

- **CIR (Committed Information Rate)**: Sustained rate in requests per minute
- **Bc (Burst Committed)**: Maximum burst size in number of requests

Example: `{ "cir": 60, "bc": 10 }` allows 60 requests/minute sustained with bursts up to 10 requests.

## Security Model

Extensions declare capabilities in their manifest, which the gateway uses to enforce:

1. **Filesystem Access**: Only allowed glob patterns
2. **Network Access**: Only allowlisted domains
3. **Git Operations**: Read-only or read-write
4. **Rate Limiting**: Prevent resource exhaustion
5. **Permissions**: Explicit system permission requirements

## Integration

To integrate the gateway into Ghost CLI:

```javascript
// In ghost.js
const Gateway = require('./core/gateway');

async function initExtensions() {
    const gateway = new Gateway();
    const result = await gateway.initialize();
    
    console.log(`Loaded ${result.loaded} extensions`);
    return gateway;
}

// Use in commands
const gateway = await initExtensions();
const extensions = gateway.listExtensions();
```
