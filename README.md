# 👻 Ghost CLI - Gateway Launcher [![ghost audit passed](https://img.shields.io/badge/ghost%20audit-passed-success)](https://github.com/atlasia/ghost)

> Extensible Git assistant with AI-powered operations via JSON-RPC gateway architecture

## Architecture Overview

Ghost CLI is a **pure gateway launcher** that:
- Discovers and loads extensions dynamically
- Routes commands to appropriate extensions via JSON-RPC
- Manages extension lifecycles (start, stop, restart)
- Provides real-time telemetry with `--verbose` flag
- Enforces security through capability-based authorization

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
