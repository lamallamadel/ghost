# 👻 Ghost CLI v1.0.0 - Gateway Launcher [![ghost audit passed](https://img.shields.io/badge/ghost%20audit-passed-success)](https://github.com/atlasia/ghost)

> Extensible Git assistant with AI-powered operations via JSON-RPC gateway architecture

## Architecture Overview

Ghost CLI is a **pure gateway launcher** that:
- Discovers and loads extensions dynamically
- Routes commands to appropriate extensions via JSON-RPC
- Manages extension lifecycles (start, stop, restart)
- Provides real-time telemetry with `--verbose` flag
- Enforces strict security through capability-based authorization

## 🚀 Installation

```bash
npm install -g atlasia-ghost
```

## Quick Start

### Basic Commands

```bash
# List installed extensions
ghost extension list

# View gateway status
ghost gateway status --verbose

# Execute commands (routed to extensions)
ghost commit
ghost audit
ghost version bump --bump patch

# View audit logs
ghost audit-log view --limit 50
```

## Extension Management

### Installing Extensions

```bash
ghost extension install ./path/to/extension
```

### Removing Extensions

```bash
ghost extension remove <extension-id>
```

### Extension Information

```bash
ghost extension info ghost-git-extension
```

## Gateway Commands

- **`ghost extension list`** - List all installed extensions
- **`ghost extension install <path>`** - Install extension from path
- **`ghost extension remove <id>`** - Remove extension by ID
- **`ghost extension info <id>`** - Show extension details
- **`ghost gateway status`** - Show gateway status and telemetry
- **`ghost gateway health`** - Show extension runtime health
- **`ghost audit-log view`** - View security audit logs

## Telemetry & Debugging

Use the `--verbose` flag to see real-time pipeline telemetry:

```bash
ghost commit --verbose
```

This shows:
- Extension discovery and routing
- JSON-RPC request/response flows
- Pipeline stage execution (intercept → auth → audit → execute)
- Authorization decisions
- Audit validation results
- Extension subprocess state changes

## Extension Developer Toolkit 🛠️

Ghost includes a complete toolkit for building custom extensions:

### CLI Commands

- **`ghost extension init <name>`** - Scaffold a new extension project with boilerplate
- **`ghost extension validate [path]`** - Validate manifest syntax and simulate permissions
- **`ghost extension migrate [path]`** - Migrate v0.x extensions to v1.0.0 SDK
- **`ghost extension install <path>`** - Install extension locally
- **`ghost extension list`** - List installed extensions
- **`ghost extension info <id>`** - Show extension details

### Extension SDK

Install the official SDK in your extension:

```bash
npm install @ghost/extension-sdk
```

```javascript
const { ExtensionSDK } = require('@ghost/extension-sdk');

class MyExtension {
    constructor() {
        this.sdk = new ExtensionSDK('my-extension-id');
    }

    async myCommand(params) {
        // Read files
        const content = await this.sdk.requestFileRead({ path: './file.txt' });
        
        // Make HTTP requests
        const data = await this.sdk.requestNetworkCall({
            url: 'https://api.example.com/data'
        });
        
        // Execute git commands
        const status = await this.sdk.requestGitStatus();
        
        return { success: true, output: 'Done!' };
    }
}

module.exports = MyExtension;
```

### Documentation

- 🛠️ [Developer Toolkit Guide](./docs/DEVELOPER_TOOLKIT.md) - Complete guide to extension development
- 🔄 [Extension Migration Guide](./docs/EXTENSION_MIGRATION.md) - Migrate v0.x to v1.0.0
- 📖 [Extension API Reference](./docs/extension-api.md) - I/O intent schema and examples
- 💡 [Extension Examples](./docs/extension-examples.md) - Working examples for common patterns
- 📦 [Extension SDK Package](./packages/extension-sdk/README.md) - SDK documentation

### Quick Start

```bash
# Create a new extension
ghost extension init my-awesome-extension
cd my-awesome-extension

# Install dependencies
npm install

# Validate the extension
ghost extension validate

# Install locally
ghost extension install .

# Use your extension
ghost myCommand
```

## Core Features

### 1. Extension Discovery & Routing
- Automatic extension discovery from `~/.ghost/extensions/`
- Command routing based on capabilities declared in `manifest.json`
- JSON-RPC protocol for extension communication

### 2. Security Pipeline
- **Interception Layer**: Validates JSON-RPC messages
- **Authorization Layer**: Enforces capability-based permissions
- **Audit Layer**: NIST SI-10 validation, entropy scanning
- **Execution Layer**: Sandboxed I/O operations with circuit breakers

### 3. Extension Lifecycle Management
- Subprocess isolation for extensions
- Auto-restart on crashes (configurable limits)
- Heartbeat monitoring and health checks
- Graceful shutdown handling

### 4. Audit Logging
- Immutable audit trail at `~/.ghost/audit.log`
- Tracks all intent requests, authorization decisions, and executions
- Filter by extension, type, date range
- JSON output support

## Bundled Extension: ghost-git-extension

The CLI ships with a Git operations extension that provides:

- **AI-powered commit generation** (Groq, OpenAI, Anthropic, Gemini)
- **Security scanning** (secret detection, entropy analysis)
- **Version management** (semver, conventional commits, git hooks)
- **Merge conflict resolution** (interactive and automated strategies)
- **Monitoring console** (web-based dashboard)

### Usage Examples

```bash
# AI-powered commit (default command)
ghost commit

# Security audit
ghost audit --verbose

# Version bump with auto-detection
ghost version bump --bump auto --tag

# Merge conflict resolution
ghost merge resolve --strategy ours

# Start monitoring console
ghost console
```

## 🧩 Version Management

Ghost can manage semantic versions (SemVer) and enforce version bump rules through Git hooks.

### Quick start

1) Create a shared version config in your repo:
```bash
ghost version init
```

2) Install hooks in the current Git repository:
```bash
ghost version install-hooks
```

3) Bump version (manual) and create an annotated tag:
```bash
ghost version bump --bump minor --tag
```

4) Automatic bump based on Conventional Commits since last tag:
```bash
ghost version bump --from-commits --tag
```

### What the hooks do

- `pre-commit`: blocks commits when merge conflicts are present.
- `commit-msg`: reads the commit message, determines required bump (major/minor/patch) from Conventional Commits, and blocks the commit if the version file in the Git index is not bumped enough.

### CI / builder-friendly output

- Non-interactive mode:
```bash
ghost version bump --from-commits --tag --ci
```
- JSON output (for CI logs parsing):
```bash
ghost version bump --from-commits --tag --output json
```

## Configuration

### Extension Manifest (`manifest.json`)

```json
{
  "id": "my-extension",
  "name": "My Extension",
  "version": "1.0.0",
  "main": "index.js",
  "capabilities": {
    "filesystem": {
      "read": ["**/*.js"],
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
    }
  }
}
```

### Local Configuration (`.ghostrc`)

```json
{
  "prompt": "Custom system prompt for AI",
  "provider": "anthropic",
  "model": "claude-3-5-sonnet-20240620"
}
```

## Development

### Creating Extensions

1. Create extension directory structure:
```
my-extension/
├── manifest.json
├── index.js
└── package.json (optional)
```

2. Implement JSON-RPC handler in `index.js`:
```javascript
class MyExtension {
  async myCommand(params) {
    return { success: true, output: "Hello!" };
  }
}

module.exports = MyExtension;
```

3. Install extension:
```bash
ghost extension install ./my-extension
```

### Subprocess Mode

Extensions can run as subprocesses, communicating via stdin/stdout JSON-RPC:

```javascript
// Receive requests from stdin
process.stdin.on('line', (line) => {
  const request = JSON.parse(line);
  // Handle request...
  const response = { jsonrpc: '2.0', id: request.id, result: {...} };
  process.stdout.write(JSON.stringify(response) + '\n');
});
```

## Performance

Ghost CLI pipeline is optimized for high-throughput scenarios:

### Current Performance (Sprint 9)

- **Throughput**: 1,247 req/s (59% improvement)
- **p95 Latency**: 28ms (<50ms target)
- **CPU Usage**: 78% (17% reduction)
- **Memory Growth**: 39% over 60s (<50% target)

### Key Optimizations

1. **O(1) Set Lookups** - Replaced array scans with hash-based lookups
2. **Memoization** - Cached validation results with >95% hit rate
3. **Object Pooling** - Reduced GC pressure by 60%
4. **Regex Caching** - Pre-compiled patterns for path validation
5. **Pre-computation** - Rate constants computed at initialization

### Profiling Tools

```bash
# Quick performance check (30 seconds)
node scripts/benchmark-hotspots.js

# Full CPU + heap profiling
node scripts/profile-load-test.js both

# Load tests (5 minutes)
node test/gateway/pipeline-load.test.js
```

See [PERFORMANCE.md](PERFORMANCE.md) for complete documentation.

## Security

### Capability-Based Authorization
- Extensions declare required capabilities in manifest
- Gateway enforces allowlists for filesystem, network, git operations
- Rate limiting via Two-Rate Three-Color Token Bucket (RFC 2698)

### Audit Trail
- All operations logged immutably
- Secret detection via entropy analysis
- NIST SI-10 validation (input/output sanitization)

### Circuit Breakers
- Per-resource-type circuit breakers
- Automatic recovery on transient failures
- Prevents cascade failures

## License

MIT © Adel Lamallam
