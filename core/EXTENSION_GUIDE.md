# Ghost Extension Development Guide

## Overview

Ghost extensions are modular plugins that extend the functionality of Ghost CLI. They follow a manifest-driven architecture with strict capability contracts.

## Quick Start

### 1. Create Extension Directory

```bash
mkdir -p ~/.ghost/extensions/my-extension
cd ~/.ghost/extensions/my-extension
```

### 2. Create Manifest

Create `manifest.json`:

```json
{
  "id": "my-extension",
  "name": "My Extension",
  "version": "1.0.0",
  "description": "Description of what this extension does",
  "author": "Your Name",
  "main": "index.js",
  "capabilities": {
    "filesystem": {
      "read": ["**/*.js"]
    },
    "git": {
      "read": true
    }
  },
  "permissions": [
    "filesystem:read",
    "git:read"
  ]
}
```

### 3. Create Entry Point

Create `index.js`:

```javascript
class MyExtension {
    constructor() {
        this.name = 'My Extension';
    }

    async init(config) {
        console.log('Extension initialized with config:', config);
    }

    async doSomething(arg) {
        return `Processed: ${arg}`;
    }

    cleanup() {
        console.log('Cleaning up...');
    }
}

module.exports = MyExtension;
```

### 4. Test Your Extension

```bash
node core/examples/demo-gateway.js
```

## Manifest Reference

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier (lowercase, alphanumeric with hyphens) |
| `name` | string | Human-readable name |
| `version` | string | Semantic version (major.minor.patch) |
| `main` | string | Entry point file (relative path) |
| `capabilities` | object | Declared capabilities |

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `description` | string | Brief description |
| `author` | string | Author name or organization |
| `permissions` | array | Required system permissions |
| `dependencies` | object | NPM dependencies |
| `config` | object | Default configuration |

## Capabilities

### Filesystem Access

Control file system access with glob patterns:

```json
{
  "capabilities": {
    "filesystem": {
      "read": [
        "src/**/*.js",
        "**/*.json",
        "README.md"
      ],
      "write": [
        ".ghost/reports/*.json",
        "logs/*.log"
      ]
    }
  }
}
```

**Best Practices:**
- Use specific patterns instead of wildcards
- Separate read and write permissions
- Document why each pattern is needed

### Network Access

Declare allowed domains and rate limits:

```json
{
  "capabilities": {
    "network": {
      "allowlist": [
        "https://api.github.com",
        "https://registry.npmjs.org"
      ],
      "rateLimit": {
        "cir": 60,
        "bc": 10
      }
    }
  }
}
```

**Rate Limit Parameters:**
- `cir` (Committed Information Rate): Sustained requests per minute
- `bc` (Burst Committed): Maximum burst size in requests

**Examples:**
- `{ "cir": 60, "bc": 10 }`: 60 req/min, bursts up to 10
- `{ "cir": 30, "bc": 5 }`: 30 req/min, bursts up to 5
- `{ "cir": 120, "bc": 20 }`: 120 req/min, bursts up to 20

### Git Operations

Control git repository access:

```json
{
  "capabilities": {
    "git": {
      "read": true,
      "write": false
    }
  }
}
```

**Permissions:**
- `read`: Read repository state, commits, branches
- `write`: Modify repository (commits, branches, tags)

### Git Hooks

Register for git lifecycle events:

```json
{
  "capabilities": {
    "hooks": [
      "pre-commit",
      "commit-msg",
      "post-commit"
    ]
  }
}
```

**Supported Hooks:**
- `pre-commit`: Before commit is created
- `post-commit`: After commit is created
- `pre-push`: Before push to remote
- `post-checkout`: After checkout
- `commit-msg`: Validate/modify commit message
- `pre-rebase`: Before rebase operation

## Extension API

### Lifecycle Methods

Extensions can implement these optional methods:

```javascript
class MyExtension {
    // Called when extension is loaded
    constructor() {
        this.name = 'My Extension';
        this.state = {};
    }

    // Called during initialization with config
    async init(config) {
        this.config = config;
        // Setup resources
    }

    // Called when extension is unloaded
    cleanup() {
        // Clean up resources
    }
}
```

### Hook Handlers

Implement hook methods to respond to git events:

```javascript
class MyExtension {
    // Called on pre-commit hook
    async onPreCommit(stagedFiles) {
        // Analyze staged files
        return {
            success: true,
            message: 'Pre-commit checks passed'
        };
    }

    // Called on commit-msg hook
    async onCommitMsg(message) {
        // Validate commit message
        return {
            success: true,
            message: 'Commit message is valid'
        };
    }

    // Called on post-commit hook
    async onPostCommit(commitHash) {
        // Post-commit actions
    }

    // Called on pre-push hook
    async onPrePush(remote, branch) {
        // Pre-push checks
    }

    // Called on post-checkout hook
    async onPostCheckout(branch) {
        // Post-checkout actions
    }

    // Called on pre-rebase hook
    async onPreRebase(upstream, branch) {
        // Pre-rebase checks
    }
}
```

### Hook Response Format

Hooks should return an object with:

```javascript
{
    success: boolean,     // Whether the hook passed
    message?: string,     // Optional message
    data?: any           // Optional additional data
}
```

If `success` is `false`, the git operation will be blocked.

## Permissions

Declare required system permissions:

```json
{
  "permissions": [
    "filesystem:read",
    "filesystem:write",
    "network:http",
    "network:https",
    "git:read",
    "git:write",
    "process:spawn",
    "env:read"
  ]
}
```

**Available Permissions:**
- `filesystem:read`: Read files
- `filesystem:write`: Write files
- `network:http`: HTTP requests
- `network:https`: HTTPS requests
- `git:read`: Read git data
- `git:write`: Modify git repository
- `process:spawn`: Spawn child processes
- `env:read`: Read environment variables

## Dependencies

Declare NPM dependencies in manifest:

```json
{
  "dependencies": {
    "axios": "^1.6.0",
    "chalk": "^4.1.2"
  }
}
```

Install them in your extension directory:

```bash
npm install
```

## Configuration

Provide default configuration:

```json
{
  "config": {
    "enabled": true,
    "severity": "warning",
    "rules": {
      "maxComplexity": 10,
      "maxLineLength": 120
    }
  }
}
```

Access config in your extension:

```javascript
async init(config) {
    this.config = config;
    const maxLength = this.config?.rules?.maxLineLength || 80;
}
```

## Examples

### 1. Code Quality Analyzer

Analyzes code quality on pre-commit:

```javascript
class CodeAnalyzer {
    async onPreCommit(stagedFiles) {
        const issues = [];
        
        for (const file of stagedFiles) {
            if (file.endsWith('.js')) {
                const content = require('fs').readFileSync(file, 'utf8');
                const lines = content.split('\n');
                
                lines.forEach((line, i) => {
                    if (line.length > 120) {
                        issues.push({
                            file,
                            line: i + 1,
                            message: 'Line too long'
                        });
                    }
                });
            }
        }
        
        return {
            success: issues.length === 0,
            message: issues.length ? 
                `Found ${issues.length} issues` : 
                'All checks passed',
            data: { issues }
        };
    }
}
```

### 2. Commit Message Validator

Validates conventional commit format:

```javascript
class CommitValidator {
    async onCommitMsg(message) {
        const pattern = /^(feat|fix|docs|style|refactor|test|chore)(\(.+\))?: .+/;
        
        if (!pattern.test(message)) {
            return {
                success: false,
                message: 'Commit message must follow Conventional Commits format'
            };
        }
        
        return {
            success: true,
            message: 'Commit message is valid'
        };
    }
}
```

### 3. Dependency Checker

Checks for security vulnerabilities:

```javascript
class DependencyChecker {
    async onPreCommit(stagedFiles) {
        const packageFiles = stagedFiles.filter(f => 
            f.endsWith('package.json') || f.endsWith('package-lock.json')
        );
        
        if (packageFiles.length > 0) {
            // Check dependencies
            const { execSync } = require('child_process');
            
            try {
                execSync('npm audit --audit-level=high', { 
                    stdio: 'pipe' 
                });
                
                return {
                    success: true,
                    message: 'No high-severity vulnerabilities found'
                };
            } catch (error) {
                return {
                    success: false,
                    message: 'Security vulnerabilities detected. Run npm audit fix.'
                };
            }
        }
        
        return { success: true };
    }
}
```

## Testing

Test your extension locally:

```javascript
// test-extension.js
const Gateway = require('./core/gateway');

async function test() {
    const gateway = new Gateway();
    await gateway.initialize();
    
    const result = await gateway.executeExtension(
        'my-extension',
        'doSomething',
        'test argument'
    );
    
    console.log('Result:', result);
    gateway.shutdown();
}

test();
```

## Publishing

1. Test your extension thoroughly
2. Document capabilities and permissions
3. Version according to semver
4. Share manifest and code
5. Consider publishing to NPM for easy installation

## Best Practices

1. **Minimal Capabilities**: Request only what you need
2. **Error Handling**: Handle errors gracefully
3. **Performance**: Avoid blocking operations
4. **Documentation**: Document all public methods
5. **Testing**: Test edge cases and failures
6. **Security**: Never expose secrets or keys
7. **Cleanup**: Always cleanup resources

## Troubleshooting

### Extension Not Loading

- Check manifest.json syntax
- Verify id follows pattern: `^[a-z0-9-]+$`
- Ensure version is semver format
- Confirm main file exists

### Validation Errors

- Review capabilities structure
- Check URL format in allowlist
- Verify rate limits are positive integers
- Ensure hook names are valid

### Runtime Errors

- Check file paths are correct
- Verify dependencies are installed
- Review permission requirements
- Check Node.js version compatibility

## Support

For issues and questions:
- Check examples in `core/examples/`
- Review manifest schema in `core/manifest-schema.json`
- Read architecture docs in `core/README.md`
