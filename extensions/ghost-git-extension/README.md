# Ghost Git Extension

Standalone extension providing Git operations with AI-powered features for Ghost CLI.

## Features

- **AI-Powered Commit Generation**: Generate conventional commit messages using multiple AI providers (Groq, OpenAI, Anthropic, Gemini)
- **Security Scanning**: Detect secrets and API keys in code with entropy analysis
- **Version Management**: Semver bumping, tagging, and conventional commit validation
- **Merge Resolution**: Intelligent conflict resolution with multiple strategies
- **Rate-Limited Network Access**: Built-in rate limiting for API calls

## Architecture

This extension uses JSON-RPC to communicate with Ghost core for all I/O operations:
- File system operations (read/write)
- Git command execution
- HTTPS requests to AI providers
- User prompts and logging

## Permissions

### Filesystem Access
- **Read**: `**/*` (all files for security scanning)
- **Write**: `.git/**`, `package.json`, `.ghost-versionrc`, `.ghostignore`, `.ghostrc`

### Network Access
- **Allowed Hosts**:
  - `api.groq.com`
  - `api.openai.com`
  - `api.anthropic.com`
  - `generativelanguage.googleapis.com`
- **Protocol**: HTTPS only

### Rate Limits
- **CIR (Committed Information Rate)**: 100KB/s
- **Bc (Committed Burst Size)**: 500KB
- **Be (Excess Burst Size)**: 1MB

## RPC Methods

### Git Operations
- `git.checkRepo` - Check if current directory is a Git repository
- `git.getStagedDiff` - Get staged changes with file map
- `git.generateCommit` - Generate AI-powered commit message
- `git.auditSecurity` - Perform security audit on staged changes
- `git.performFullAudit` - Full repository security scan

### Version Management
- `git.version.bump` - Bump version (major/minor/patch/auto)
- `git.version.check` - Check version differences between HEAD and index

### Merge Resolution
- `git.merge.getConflicts` - Get list of conflicted files
- `git.merge.resolve` - Resolve conflicts with strategy (ours/theirs/manual)

## Usage

This extension is loaded by Ghost CLI core. It cannot run standalone.

```javascript
const { createExtension } = require('./extension.js');

// Core provides RPC handler
const { handleRequest } = createExtension(coreRPCHandler);

// Send RPC request
const response = await handleRequest({
  jsonrpc: "2.0",
  id: 1,
  method: "git.getStagedDiff",
  params: {}
});
```

## Security

- All secret patterns are validated against known non-secrets
- Shannon entropy analysis for detecting random strings
- AI-powered validation reduces false positives
- Supports `.ghostignore` for excluding files from scans

## Version Management

Supports:
- Semantic versioning (major.minor.patch)
- Conventional commits
- Automatic version bumping from commit history
- Git hooks (pre-commit, commit-msg)
- Annotated tags with auto-push

## License

MIT
