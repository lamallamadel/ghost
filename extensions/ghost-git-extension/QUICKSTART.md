# Quick Start Guide

## For Extension Users

### Installation

The extension is bundled with Ghost CLI. No separate installation required.

### Usage

Ghost CLI automatically loads the extension when you run git commands:

```bash
# Generate AI-powered commit
ghost

# Full security audit
ghost audit

# Version management
ghost version bump --bump minor --tag

# Merge conflict resolution
ghost merge resolve --strategy ours
```

## For Extension Developers

### Running Tests

```bash
cd extensions/ghost-git-extension
npm test
```

### Validating Manifest

```bash
npm run validate
```

### Running Example Integration

```bash
npm run example
```

### Development Workflow

1. **Make changes** to `extension.js`
2. **Run tests**: `npm test`
3. **Validate manifest**: `npm run validate`
4. **Test integration**: `npm run example`

## For Ghost CLI Core Developers

### Loading the Extension

```javascript
const { createExtension } = require('./extensions/ghost-git-extension');

// Create RPC handler
class CoreRPC {
    async handle(request) {
        // Implement RPC handling
    }
}

const coreRPC = new CoreRPC();
const { handleRequest, extension } = createExtension(
    (req) => coreRPC.handle(req)
);
```

### Calling Extension Methods

```javascript
// Check if in git repo
const response = await handleRequest({
    jsonrpc: "2.0",
    id: 1,
    method: "git.checkRepo",
    params: {}
});

console.log('Is git repo:', response.result);
```

### Implementing RPC Methods

The core must implement these RPC methods:

```javascript
class CoreRPC {
    async handle(request) {
        const { method, params } = request;
        
        switch (method) {
            case 'fs.readFile':
                return this.handleFileRead(params);
            case 'git.exec':
                return this.handleGitExec(params);
            case 'https.request':
                return this.handleHttpsRequest(params);
            // ... etc
        }
    }
    
    async handleFileRead(params) {
        // Check permissions
        if (!this.checkPermission('read', params.path)) {
            throw new Error('Permission denied');
        }
        
        // Read file
        const content = fs.readFileSync(params.path, 'utf8');
        
        return {
            jsonrpc: "2.0",
            id: request.id,
            result: content
        };
    }
}
```

### Permission Checking

```javascript
function checkPermission(operation, path) {
    const manifest = require('./extensions/ghost-git-extension/manifest.json');
    const patterns = manifest.permissions.filesystem[operation];
    
    // Check if path matches any pattern
    return patterns.some(pattern => matchGlob(path, pattern));
}
```

## Common Operations

### Generate Commit Message

```javascript
const response = await handleRequest({
    jsonrpc: "2.0",
    id: 1,
    method: "git.generateCommit",
    params: {
        diffText: "diff --git...",
        provider: "groq",
        apiKey: process.env.GROQ_API_KEY,
        model: "llama-3.3-70b-versatile"
    }
});

console.log('Commit message:', response.result);
```

### Security Audit

```javascript
const response = await handleRequest({
    jsonrpc: "2.0",
    id: 2,
    method: "git.performFullAudit",
    params: { flags: { verbose: true } }
});

console.log('Issues found:', response.result.issues);
```

### Version Bump

```javascript
const response = await handleRequest({
    jsonrpc: "2.0",
    id: 3,
    method: "git.version.bump",
    params: {
        bumpType: "minor",
        flags: { tag: true, push: false }
    }
});

console.log('Bumped to:', response.result.nextVersion);
```

## Troubleshooting

### Extension Not Loading

1. Check manifest.json is valid: `npm run validate`
2. Verify index.js exports are correct
3. Check Node.js version: `node --version` (must be >=14.0.0)

### Permission Errors

1. Check manifest.json permissions section
2. Verify core is enforcing permissions correctly
3. Check file paths match permission patterns

### Network Errors

1. Verify API keys are set correctly
2. Check network.allowed_hosts in manifest
3. Check rate limits haven't been exceeded

### RPC Errors

1. Check request format (must be JSON-RPC 2.0)
2. Verify method exists in extension
3. Check params match method signature

## Resources

- **API Documentation**: See [API.md](./API.md)
- **Integration Guide**: See [INTEGRATION.md](./INTEGRATION.md)
- **Example Code**: See [example-integration.js](./example-integration.js)
- **Tests**: See [test.js](./test.js)

## Support

For issues or questions:
1. Check the documentation files
2. Run the example integration
3. Review the test suite
4. Check the GitHub repository

## License

MIT - See [LICENSE](./LICENSE)
