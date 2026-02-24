# Ghost Git Extension API Documentation

## Overview

The Ghost Git Extension provides Git operations through a JSON-RPC 2.0 interface. All file I/O, network requests, and system operations are delegated to the Ghost core through RPC calls, making the extension sandboxed and secure.

## RPC Protocol

All requests follow JSON-RPC 2.0 specification:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "method.name",
  "params": { }
}
```

Responses:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": { }
}
```

Or on error:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32603,
    "message": "Error description"
  }
}
```

## Core RPC Methods (Called by Extension)

These are methods the extension calls on the Ghost core:

### Filesystem Operations

#### `fs.readFile`
Read file contents.
- **Params**: `{ path: string, encoding?: string }`
- **Returns**: `string` (file content)

#### `fs.writeFile`
Write file contents.
- **Params**: `{ path: string, content: string, encoding?: string }`
- **Returns**: `{ success: boolean }`

#### `fs.appendFile`
Append to file.
- **Params**: `{ path: string, content: string, encoding?: string }`
- **Returns**: `{ success: boolean }`

#### `fs.exists`
Check if file exists.
- **Params**: `{ path: string }`
- **Returns**: `boolean`

#### `fs.readDir`
Read directory contents.
- **Params**: `{ path: string, recursive?: boolean }`
- **Returns**: `string[]` (file paths)

#### `fs.lstat`
Get file stats.
- **Params**: `{ path: string }`
- **Returns**: `{ isDirectory: boolean, isFile: boolean, size: number }`

### Git Operations

#### `git.exec`
Execute git command.
- **Params**: `{ args: string[], suppressError?: boolean }`
- **Returns**: `string` (command output)

### Network Operations

#### `https.request`
Make HTTPS request.
- **Params**: `{ options: object, payload: object }`
- **Returns**: `string` (response body)

### Process Operations

#### `exec.sync`
Execute system command.
- **Params**: `{ command: string, options?: object }`
- **Returns**: `string` (command output)

### UI Operations

#### `ui.prompt`
Prompt user for input.
- **Params**: `{ question: string }`
- **Returns**: `string` (user input)

### Logging

#### `log.write`
Write log entry.
- **Params**: `{ level: string, message: string, meta?: object }`
- **Returns**: `{ success: boolean }`

## Extension RPC Methods (Exposed by Extension)

These are methods the core can call on the extension:

### Git Repository

#### `git.checkRepo`
Check if current directory is a Git repository.
- **Params**: `{}`
- **Returns**: `boolean`

#### `git.getStagedDiff`
Get staged changes with file map.
- **Params**: `{}`
- **Returns**: `{ text: string, map: object, files: string[] }`

### AI-Powered Features

#### `git.generateCommit`
Generate AI-powered commit message.
- **Params**:
  ```json
  {
    "diffText": "string",
    "customPrompt": "string (optional)",
    "provider": "groq|openai|anthropic|gemini",
    "apiKey": "string",
    "model": "string"
  }
  ```
- **Returns**: `string` (commit message)

### Security Scanning

#### `git.auditSecurity`
Perform security audit on staged changes.
- **Params**:
  ```json
  {
    "diffMap": "object",
    "provider": "string",
    "apiKey": "string",
    "model": "string",
    "flags": "object"
  }
  ```
- **Returns**: `{ blocked: boolean, reason: string }`

#### `git.performFullAudit`
Full repository security scan.
- **Params**: `{ flags?: object }`
- **Returns**: `{ issues: number, findings: array }`

### Version Management

#### `git.version.bump`
Bump version (major/minor/patch/auto).
- **Params**:
  ```json
  {
    "bumpType": "major|minor|patch|auto",
    "flags": {
      "dryRun": "boolean",
      "tag": "boolean",
      "push": "boolean"
    }
  }
  ```
- **Returns**:
  ```json
  {
    "success": true,
    "currentVersion": "1.2.3",
    "nextVersion": "1.3.0",
    "bump": "minor",
    "tag": "v1.3.0"
  }
  ```

#### `git.version.check`
Check version differences between HEAD and index.
- **Params**: `{}`
- **Returns**:
  ```json
  {
    "headVersion": "1.2.3",
    "indexVersion": "1.2.4",
    "diff": "patch"
  }
  ```

### Merge Resolution

#### `git.merge.getConflicts`
Get list of conflicted files.
- **Params**: `{}`
- **Returns**: `string[]` (file paths)

#### `git.merge.resolve`
Resolve conflicts with strategy.
- **Params**:
  ```json
  {
    "strategy": "ours|theirs|manual",
    "flags": {}
  }
  ```
- **Returns**:
  ```json
  {
    "success": true,
    "resolved": [
      { "file": "path/to/file", "strategy": "ours" }
    ],
    "manual": [],
    "remaining": []
  }
  ```

## Usage Examples

### Example 1: Generate Commit Message

```javascript
const request = {
  jsonrpc: "2.0",
  id: 1,
  method: "git.generateCommit",
  params: {
    diffText: "diff --git a/file.js...",
    provider: "groq",
    apiKey: "gsk_...",
    model: "llama-3.3-70b-versatile"
  }
};

const response = await handleRequest(request);
console.log(response.result); // "feat: add new feature"
```

### Example 2: Security Audit

```javascript
const request = {
  jsonrpc: "2.0",
  id: 2,
  method: "git.auditSecurity",
  params: {
    diffMap: {
      "file.js": "const key = 'secret';"
    },
    provider: "groq",
    apiKey: "gsk_...",
    model: "llama-3.3-70b-versatile"
  }
};

const response = await handleRequest(request);
// { blocked: true, reason: "API key detected" }
```

### Example 3: Version Bump

```javascript
const request = {
  jsonrpc: "2.0",
  id: 3,
  method: "git.version.bump",
  params: {
    bumpType: "minor",
    flags: {
      tag: true,
      push: false
    }
  }
};

const response = await handleRequest(request);
// { success: true, currentVersion: "1.2.3", nextVersion: "1.3.0", bump: "minor", tag: "v1.3.0" }
```

## Error Codes

- `-32700`: Parse error
- `-32600`: Invalid Request
- `-32601`: Method not found
- `-32602`: Invalid params
- `-32603`: Internal error

## Rate Limiting

Network requests are rate-limited:
- **CIR**: 100KB/s (sustained)
- **Bc**: 500KB (committed burst)
- **Be**: 1MB (excess burst)

Exceeding limits results in throttling or rejection.

## Security

- All file operations are restricted by manifest permissions
- Network access limited to declared hostnames
- No direct filesystem or network access from extension
- All I/O goes through audited RPC layer
