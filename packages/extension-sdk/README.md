# @ghost/extension-sdk

Official SDK for building Ghost CLI extensions with typed JSON-RPC helpers.

## Installation

```bash
npm install @ghost/extension-sdk
```

## Quick Start

```javascript
const { ExtensionSDK } = require('@ghost/extension-sdk');

class MyExtension {
    constructor() {
        this.sdk = new ExtensionSDK('my-extension-id');
    }

    async myCommand(params) {
        const { args, flags } = params;

        try {
            // Read a file
            const content = await this.sdk.requestFileRead({
                path: './package.json'
            });

            // Make a network call
            const data = await this.sdk.requestNetworkCall({
                url: 'https://api.example.com/data',
                method: 'GET'
            });

            // Execute git command
            const status = await this.sdk.requestGitStatus();

            return {
                success: true,
                output: 'Command executed successfully'
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }
}

module.exports = MyExtension;
```

## API Reference

### ExtensionSDK

Main SDK class for building extensions.

```javascript
const sdk = new ExtensionSDK('your-extension-id');
```

### File System Operations

#### requestFileRead(params)

Read a file from the filesystem.

```javascript
const content = await sdk.requestFileRead({
    path: './file.txt',
    encoding: 'utf8' // optional, defaults to 'utf8'
});
```

#### requestFileWrite(params)

Write content to a file.

```javascript
await sdk.requestFileWrite({
    path: './output.txt',
    content: 'Hello, world!',
    encoding: 'utf8' // optional
});
```

#### requestFileReadDir(params)

List directory contents.

```javascript
const files = await sdk.requestFileReadDir({
    path: './src'
});
```

#### requestFileStat(params)

Get file statistics.

```javascript
const stats = await sdk.requestFileStat({
    path: './file.txt'
});
```

### Network Operations

#### requestNetworkCall(params)

Make an HTTP/HTTPS request.

```javascript
const response = await sdk.requestNetworkCall({
    url: 'https://api.example.com/endpoint',
    method: 'POST', // optional, defaults to 'GET'
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({ key: 'value' })
});
```

### Git Operations

#### requestGitExec(params)

Execute a git operation.

```javascript
const result = await sdk.requestGitExec({
    operation: 'status',
    args: ['--short']
});
```

#### Convenience Methods

```javascript
// Git status
const status = await sdk.requestGitStatus(['--short']);

// Git log
const log = await sdk.requestGitLog(['--oneline', '-10']);

// Git diff
const diff = await sdk.requestGitDiff(['HEAD~1', 'HEAD']);
```

### Low-Level API

#### emitIntent(intent)

Send a custom intent directly to the pipeline.

```javascript
const response = await sdk.emitIntent({
    type: 'filesystem',
    operation: 'read',
    params: { path: './file.txt' }
});

if (!response.success) {
    console.error('Error:', response.error);
} else {
    console.log('Result:', response.result);
}
```

#### buildIntent()

Create a custom intent using the builder pattern.

```javascript
const builder = sdk.buildIntent();

const intent = builder.filesystem('read', { path: './file.txt' });
const response = await sdk.emitIntent(intent);
```

## Intent Schema

All operations follow the JSON-RPC intent schema:

```javascript
{
    type: 'filesystem' | 'network' | 'git' | 'process',
    operation: string,
    params: object,
    extensionId: string,
    requestId: string // optional, auto-generated
}
```

## Response Schema

All operations return a response with this structure:

```javascript
{
    success: boolean,
    result?: any,           // Present on success
    error?: string,         // Present on failure
    code?: string,          // Error code
    stage?: string,         // Pipeline stage where error occurred
    requestId?: string,     // Request identifier
    warnings?: string[]     // Optional warnings
}
```

## Error Handling

All SDK methods throw errors when operations fail. Always use try-catch:

```javascript
try {
    const content = await sdk.requestFileRead({ path: './file.txt' });
} catch (error) {
    console.error('Failed to read file:', error.message);
}
```

## TypeScript Support

This SDK includes TypeScript definitions:

```typescript
import { ExtensionSDK, IntentParams, IntentResponse } from '@ghost/extension-sdk';

const sdk = new ExtensionSDK('my-extension');

const content: string = await sdk.requestFileRead({
    path: './file.txt'
});
```

## Examples

### Reading and Processing Files

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
    url: 'https://api.github.com/repos/owner/repo',
    method: 'GET',
    headers: {
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `token ${process.env.GITHUB_TOKEN}`
    }
});

const data = JSON.parse(response);
```

### Git Integration

```javascript
// Check if there are uncommitted changes
const status = await sdk.requestGitStatus();

if (status.includes('nothing to commit')) {
    console.log('Working tree is clean');
} else {
    // Get diff of changes
    const diff = await sdk.requestGitDiff();
    console.log('Changes:', diff);
}
```

### Batch Operations

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

## Security

The SDK respects the permissions and capabilities defined in your extension's `manifest.json`. All operations are validated by the Ghost pipeline:

1. **Intercept Layer**: Validates intent schema
2. **Authorization Layer**: Checks permissions and rate limits
3. **Audit Layer**: Logs security events and validates content
4. **Execution Layer**: Executes the operation with circuit breakers

## Documentation

- [Extension API Documentation](https://github.com/lamallamadel/ghost/blob/main/docs/extension-api.md)
- [Manifest Reference](https://github.com/lamallamadel/ghost/blob/main/core/MANIFEST_REFERENCE.md)
- [Extension Development Guide](https://github.com/lamallamadel/ghost/blob/main/core/EXTENSION_GUIDE.md)

## License

MIT
