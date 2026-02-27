# Ghost Extension Developer Toolkit

Complete guide to the Ghost CLI extension developer toolkit.

## Overview

The Ghost Extension Developer Toolkit provides everything you need to build, validate, and publish extensions for Ghost CLI. It includes:

1. **CLI Commands** - Scaffolding, validation, and installation tools
2. **Extension SDK** - Typed JSON-RPC helpers for I/O operations
3. **Documentation** - Complete API reference and examples
4. **Templates** - Production-ready boilerplate code

## Table of Contents

- [Installation](#installation)
- [CLI Commands](#cli-commands)
- [Extension SDK](#extension-sdk)
- [Migration Tool](#migration-tool)
- [Workflow](#workflow)
- [Architecture](#architecture)
- [Publishing](#publishing)

## Installation

### Global Installation

```bash
npm install -g atlasia-ghost
```

### SDK Installation (in your extension)

```bash
npm install @ghost/extension-sdk
```

## CLI Commands

### `ghost extension init <name>`

Scaffolds a new extension project with:
- `manifest.json` - Extension metadata and capabilities
- `index.js` - Main extension code with SDK integration
- `package.json` - NPM configuration
- `README.md` - Documentation template
- `.gitignore` - Standard ignore patterns

**Usage:**

```bash
ghost extension init my-extension
ghost extension init my-extension --author "Your Name"
```

**Generated Structure:**

```
my-extension/
├── manifest.json       # Extension manifest
├── index.js           # Main extension code
├── package.json       # NPM dependencies
├── README.md          # Documentation
└── .gitignore         # Git ignore patterns
```

**Generated manifest.json:**

```json
{
  "id": "my-extension",
  "name": "My Extension",
  "version": "1.0.0",
  "description": "My Extension extension for Ghost CLI",
  "author": "Your Name",
  "main": "index.js",
  "capabilities": {
    "filesystem": {
      "read": ["**/*"],
      "write": []
    },
    "network": {
      "allowlist": [],
      "rateLimit": {
        "cir": 60,
        "bc": 100
      }
    },
    "git": {
      "read": true,
      "write": false
    }
  },
  "permissions": [
    "filesystem:read",
    "git:read"
  ]
}
```

### `ghost extension validate [path]`

Validates extension manifest and simulates permission requests.

**Checks:**

1. **JSON Syntax** - Verifies manifest is valid JSON
2. **Schema Validation** - Validates against manifest schema
3. **Required Fields** - Checks id, name, version, main, capabilities
4. **Field Formats** - Validates id pattern, semantic versioning
5. **File Existence** - Verifies main entry point exists
6. **Capability Syntax** - Validates filesystem patterns, network URLs
7. **Permission Simulation** - Tests sample intents against pipeline

**Usage:**

```bash
# Validate current directory
ghost extension validate

# Validate specific path
ghost extension validate ./my-extension
```

**Output Example:**

```
Validating extension at: /path/to/my-extension

✓ Valid JSON syntax
✓ Valid extension id: my-extension
✓ Extension name: My Extension
✓ Valid version: 1.0.0
✓ Main file exists: index.js
✓ Capabilities defined
  - Filesystem read: 1 pattern(s)
  - Git read: enabled

Simulating permission requests:
✓ filesystem:read - valid intent
✓ git:status - valid intent

✓ Extension is valid!

Ready to install with: ghost extension install ./my-extension
```

### `ghost extension migrate [path]`

Migrates v0.x extensions to v1.0.0 SDK.

**What it does:**

1. **Analyzes** - Detects legacy code patterns (module.exports, direct I/O)
2. **Validates** - Checks manifest compatibility with v1.0.0
3. **Generates** - Creates ExtensionWrapper boilerplate with ExtensionSDK
4. **Updates** - Modifies manifest.json and package.json
5. **Documents** - Creates detailed MIGRATION_GUIDE.md

**Usage:**

```bash
# Analyze without changes
ghost extension migrate

# Analyze specific path
ghost extension migrate ./my-extension

# Apply migration changes
ghost extension migrate --apply

# Apply without backup
ghost extension migrate --apply --no-backup
```

**Output Example:**

```
Ghost Extension Migration Tool v1.0.0
────────────────────────────────────────────────────────

Analyzing extension at: /path/to/my-extension

✓ Loaded manifest for: My Extension
✓ Loaded main file: index.js

Step 1: Analyzing code patterns
Code Pattern Analysis:
  • Export pattern: class
  • Uses ExtensionRPCClient (legacy)
  ⚠ Missing coreHandler injection
  ⚠ Direct fs module usage detected

Step 2: Validating manifest compatibility
  ✓ Manifest is v1.0.0 compatible

Required upgrades:
  1. capabilities.network.rateLimit.be
     Current: undefined
     Suggested: 50
     Reason: v1.0.0 requires "be" (excess burst) parameter

Step 3: Generating migration plan
Migration steps:
  1. ● Add @ghost/extension-sdk dependency to package.json
  2. ● Update manifest.json for v1.0.0 compatibility
  3. ● Generate ExtensionWrapper with ExtensionSDK
  4. ● Update RPC client to accept coreHandler injection

Manual changes required: 2
  1. [critical] index.js: RPC client without coreHandler injection
  2. [high] index.js: Direct I/O operations detected

Run with --apply flag to apply migration changes
```

See [EXTENSION_MIGRATION.md](./EXTENSION_MIGRATION.md) for complete migration guide.

### Other Commands

```bash
# List installed extensions
ghost extension list

# Show extension details
ghost extension info my-extension

# Install extension locally
ghost extension install ./my-extension

# Remove extension
ghost extension remove my-extension
```

## Extension SDK

The `@ghost/extension-sdk` package provides high-level helpers for building extensions.

### Installation

```bash
npm install @ghost/extension-sdk
```

### Basic Usage

```javascript
const { ExtensionSDK } = require('@ghost/extension-sdk');

class MyExtension {
    constructor() {
        this.sdk = new ExtensionSDK('my-extension-id');
    }

    async myCommand(params) {
        try {
            // Your logic here
            const content = await this.sdk.requestFileRead({
                path: './file.txt'
            });

            return { success: true, output: content };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
}

module.exports = MyExtension;
```

### API Methods

#### Filesystem Operations

```javascript
// Read file
const content = await sdk.requestFileRead({
    path: './file.txt',
    encoding: 'utf8'  // optional
});

// Write file
await sdk.requestFileWrite({
    path: './output.txt',
    content: 'Hello, world!',
    encoding: 'utf8'  // optional
});

// List directory
const files = await sdk.requestFileReadDir({
    path: './src'
});

// Get file stats
const stats = await sdk.requestFileStat({
    path: './file.txt'
});
```

#### Network Operations

```javascript
const response = await sdk.requestNetworkCall({
    url: 'https://api.example.com/data',
    method: 'POST',  // optional, defaults to GET
    headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer token'
    },
    body: JSON.stringify({ key: 'value' })
});
```

#### Git Operations

```javascript
// Execute git operation
const result = await sdk.requestGitExec({
    operation: 'status',
    args: ['--short']
});

// Convenience methods
const status = await sdk.requestGitStatus(['--short']);
const log = await sdk.requestGitLog(['--oneline', '-10']);
const diff = await sdk.requestGitDiff(['HEAD~1', 'HEAD']);
```

#### Low-Level API

```javascript
// Build custom intent
const builder = sdk.buildIntent();
const intent = builder.filesystem('read', { path: './file.txt' });

// Send intent
const response = await sdk.emitIntent(intent);

if (response.success) {
    console.log('Result:', response.result);
} else {
    console.error('Error:', response.error);
}
```

#### Batch Operations

```javascript
const { RPCClient } = require('@ghost/extension-sdk');

const client = new RPCClient('my-extension');
const builder = sdk.buildIntent();

const intents = [
    builder.filesystem('read', { path: './file1.txt' }),
    builder.filesystem('read', { path: './file2.txt' }),
    builder.filesystem('read', { path: './file3.txt' })
];

const responses = await client.sendBatch(intents);
```

## Workflow

### 1. Create Extension

```bash
ghost extension init my-extension
cd my-extension
npm install
```

### 2. Edit Manifest

Update `manifest.json` with required capabilities:

```json
{
  "capabilities": {
    "filesystem": {
      "read": ["src/**/*.js"],
      "write": ["dist/**"]
    },
    "network": {
      "allowlist": ["https://api.example.com"]
    }
  }
}
```

### 3. Implement Logic

Edit `index.js`:

```javascript
const { ExtensionSDK } = require('@ghost/extension-sdk');

class MyExtension {
    constructor() {
        this.sdk = new ExtensionSDK('my-extension');
    }

    async myCommand(params) {
        const { args, flags } = params;
        
        // Implementation here
        
        return { success: true, output: 'Done!' };
    }
}

module.exports = MyExtension;
```

### 4. Validate

```bash
ghost extension validate
```

### 5. Install Locally

```bash
ghost extension install .
```

### 6. Test

```bash
ghost myCommand arg1 arg2 --flag
```

### 7. Debug

Use `--verbose` flag to see pipeline execution:

```bash
ghost myCommand --verbose
```

## Architecture

### Extension Execution Flow

```
User Command → Ghost CLI → Gateway
    ↓
Extension Discovery & Routing
    ↓
JSON-RPC Intent → Pipeline
    ↓
[Intercept → Auth → Audit → Execute]
    ↓
Extension → SDK → RPC Client
    ↓
Response → User
```

### I/O Intent Schema

All operations use the Intent schema:

```javascript
{
    type: 'filesystem' | 'network' | 'git' | 'process',
    operation: string,
    params: object,
    extensionId: string,
    requestId: string
}
```

### Response Schema

```javascript
{
    success: boolean,
    result?: any,
    error?: string,
    code?: string,
    stage?: string,
    requestId?: string,
    warnings?: string[]
}
```

### Pipeline Stages

1. **Intercept** - Validates intent schema
2. **Authorization** - Checks permissions and rate limits
3. **Audit** - Security scanning (NIST, entropy)
4. **Execute** - Performs operation with circuit breakers

## Publishing

### 1. Prepare for Publishing

```bash
# Update version
npm version patch

# Update README with usage instructions

# Test locally
ghost extension validate
ghost extension install .
```

### 2. Publish to NPM (Optional)

```bash
npm publish
```

### 3. Share Extension

Users can install from:

- Local path: `ghost extension install ./my-extension`
- NPM: `npm install -g my-extension && ghost extension install $(npm root -g)/my-extension`
- Git: `git clone repo && ghost extension install ./repo`

### 4. Document

Include in your README:

- Installation instructions
- Required environment variables
- Capability requirements
- Usage examples
- Configuration options

## Best Practices

### 1. Minimal Permissions

Only request capabilities you need:

```json
{
  "capabilities": {
    "filesystem": {
      "read": ["src/**/*.js"],  // Specific patterns
      "write": []               // Don't request if not needed
    }
  }
}
```

### 2. Error Handling

Always handle errors gracefully:

```javascript
try {
    const result = await sdk.requestFileRead({ path: './file.txt' });
} catch (error) {
    return { success: false, error: error.message };
}
```

### 3. Input Validation

Validate user inputs:

```javascript
async myCommand(params) {
    const { args } = params;
    
    if (!args || args.length === 0) {
        return { success: false, error: 'Missing required arguments' };
    }
    
    // Process...
}
```

### 4. Rate Limiting

Set appropriate rate limits:

```json
{
  "network": {
    "rateLimit": {
      "cir": 60,   // 60 requests per minute sustained
      "bc": 100    // Burst up to 100 requests
    }
  }
}
```

### 5. Documentation

Document your extension thoroughly:

- Usage examples
- Configuration options
- Error codes
- Capability requirements

## Resources

- [Extension API Documentation](./extension-api.md)
- [Extension Examples](./extension-examples.md)
- [@ghost/extension-sdk Package](../packages/extension-sdk/README.md)
- [Manifest Reference](../core/MANIFEST_REFERENCE.md)

## Support

- GitHub Issues: https://github.com/lamallamadel/ghost/issues
- Documentation: https://github.com/lamallamadel/ghost
