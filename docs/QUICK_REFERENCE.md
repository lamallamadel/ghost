# Ghost Extension Quick Reference

Quick reference for common extension development tasks.

## CLI Commands

```bash
# Create new extension
ghost extension init <name>

# Validate extension
ghost extension validate [path]

# Install extension
ghost extension install <path>

# List extensions
ghost extension list

# Show extension info
ghost extension info <id>

# Remove extension
ghost extension remove <id>
```

## SDK Installation

```bash
npm install @ghost/extension-sdk
```

## Basic Extension Template

```javascript
const { ExtensionSDK } = require('@ghost/extension-sdk');

class MyExtension {
    constructor() {
        this.sdk = new ExtensionSDK('extension-id');
    }

    async initialize() {
        // Setup
    }

    async myCommand(params) {
        const { args, flags } = params;
        
        try {
            // Logic here
            return { success: true, output: 'Result' };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async shutdown() {
        // Cleanup
    }
}

module.exports = MyExtension;
```

## Manifest Template

```json
{
  "id": "extension-id",
  "name": "Extension Name",
  "version": "1.0.0",
  "description": "Description",
  "author": "Your Name",
  "main": "index.js",
  "capabilities": {
    "filesystem": {
      "read": ["**/*"],
      "write": []
    },
    "network": {
      "allowlist": [],
      "rateLimit": { "cir": 60, "bc": 100 }
    },
    "git": {
      "read": true,
      "write": false
    }
  },
  "permissions": ["filesystem:read", "git:read"]
}
```

## SDK API Quick Reference

### Filesystem

```javascript
// Read file
const content = await sdk.requestFileRead({ path: './file.txt' });

// Write file
await sdk.requestFileWrite({ path: './file.txt', content: 'data' });

// List directory
const files = await sdk.requestFileReadDir({ path: './src' });

// Get stats
const stats = await sdk.requestFileStat({ path: './file.txt' });
```

### Network

```javascript
const response = await sdk.requestNetworkCall({
    url: 'https://api.example.com/data',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: 'value' })
});
```

### Git

```javascript
// Git status
const status = await sdk.requestGitStatus(['--short']);

// Git log
const log = await sdk.requestGitLog(['--oneline', '-10']);

// Git diff
const diff = await sdk.requestGitDiff();

// Custom git command
const result = await sdk.requestGitExec({
    operation: 'branch',
    args: ['--show-current']
});
```

### Low-Level API

```javascript
// Build intent
const builder = sdk.buildIntent();
const intent = builder.filesystem('read', { path: './file.txt' });

// Send intent
const response = await sdk.emitIntent(intent);

// Batch operations
const { RPCClient } = require('@ghost/extension-sdk');
const client = new RPCClient('extension-id');
const responses = await client.sendBatch([intent1, intent2, intent3]);
```

## Intent Schema

```javascript
{
    type: 'filesystem' | 'network' | 'git' | 'process',
    operation: string,
    params: object,
    extensionId: string,
    requestId: string
}
```

## Response Schema

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

## Common Patterns

### Error Handling

```javascript
try {
    const result = await sdk.requestFileRead({ path: './file.txt' });
    return { success: true, output: result };
} catch (error) {
    return { success: false, error: error.message };
}
```

### Input Validation

```javascript
async myCommand(params) {
    const { args, flags } = params;
    
    if (!args || args.length === 0) {
        return { success: false, error: 'Arguments required' };
    }
    
    // Process...
}
```

### Reading Multiple Files

```javascript
const files = await sdk.requestFileReadDir({ path: './src' });

for (const file of files) {
    const content = await sdk.requestFileRead({
        path: `./src/${file}`
    });
    // Process content...
}
```

### Making API Calls

```javascript
const response = await sdk.requestNetworkCall({
    url: 'https://api.github.com/user/repos',
    headers: {
        'Authorization': `token ${process.env.GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json'
    }
});

const repos = JSON.parse(response);
```

### Git Analysis

```javascript
// Check status
const status = await sdk.requestGitStatus();

if (!status.includes('nothing to commit')) {
    // Get diff
    const diff = await sdk.requestGitDiff();
    
    // Analyze changes
    const lines = diff.split('\n');
    const additions = lines.filter(l => l.startsWith('+')).length;
    const deletions = lines.filter(l => l.startsWith('-')).length;
}
```

## Debugging

```bash
# Use verbose flag to see pipeline execution
ghost myCommand --verbose

# View audit logs
ghost audit-log view --limit 50 --extension my-extension

# Check gateway status
ghost gateway status

# Show extension info
ghost extension info my-extension
```

## Common Error Codes

- `PIPELINE_INTERCEPT_ERROR` - Invalid intent schema
- `PERMISSION_DENIED` - Missing capability
- `PATH_NOT_ALLOWED` - Filesystem path violation
- `URL_NOT_ALLOWED` - Network URL not in allowlist
- `RATE_LIMIT_EXCEEDED` - Too many requests
- `AUDIT_FAILED` - Security violation
- `PIPELINE_EXECUTION_ERROR` - Operation failed
- `CIRCUIT_BREAKER_OPEN` - Too many failures
- `TIMEOUT_EXCEEDED` - Operation timeout

## Environment Variables

```bash
# GitHub token for API calls
export GITHUB_TOKEN=your_token

# Groq API key for AI features
export GROQ_API_KEY=your_key

# OpenAI API key
export OPENAI_API_KEY=your_key

# Anthropic API key
export ANTHROPIC_API_KEY=your_key
```

## Testing

```bash
# Validate manifest
ghost extension validate

# Install locally
ghost extension install .

# Test command
ghost myCommand test args --flag

# View logs
ghost audit-log view --extension my-extension

# Check metrics
ghost gateway metrics my-extension
```

## Publishing Checklist

- [ ] Update version in package.json and manifest.json
- [ ] Test all commands
- [ ] Update README with usage examples
- [ ] Document required environment variables
- [ ] List all capabilities in documentation
- [ ] Add error handling for all operations
- [ ] Validate manifest
- [ ] Test installation from different paths
- [ ] Add .gitignore for node_modules, logs
- [ ] Add LICENSE file
- [ ] Create CHANGELOG

## Resources

- [Developer Toolkit Guide](./DEVELOPER_TOOLKIT.md)
- [Extension API Reference](./extension-api.md)
- [Extension Examples](./extension-examples.md)
- [@ghost/extension-sdk](../packages/extension-sdk/README.md)
