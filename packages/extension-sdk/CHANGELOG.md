# Changelog

All notable changes to the @ghost/extension-sdk package will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
### Changed
### Deprecated
### Removed
### Fixed
### Security

## [1.0.0] - 2024-01-15

### Added

- Initial release of @ghost/extension-sdk
- `ExtensionSDK` class with high-level API methods for Ghost CLI extensions
- `IntentBuilder` for fluent intent construction
- `RPCClient` for JSON-RPC communication with Ghost pipeline
- TypeScript definitions (`.d.ts`) for all APIs
- Comprehensive documentation and examples in README.md
- Publishing workflow and npm package configuration

#### Filesystem Operations
- `requestFileRead()` - Read file contents with configurable encoding
- `requestFileWrite()` - Write file contents with secret scanning
- `requestFileReadDir()` - List directory contents
- `requestFileStat()` - Get file/directory statistics
- `requestFileExists()` - Check if path exists
- `requestFileReadJSON()` - Read and parse JSON files
- `requestFileWriteJSON()` - Stringify and write JSON files
- `requestFileReadBatch()` - Batch read multiple files concurrently

#### Network Operations
- `requestNetworkCall()` - Make HTTP/HTTPS requests with full control
- Support for custom headers, methods (GET, POST, PUT, DELETE, PATCH)
- Built-in SSRF protection and URL allowlist validation
- Rate limiting with token bucket algorithm (CIR/Bc/Be)

#### Git Operations
- `requestGitExec()` - Execute git operations with safety checks
- `requestGitStatus()` - Convenience method for git status
- `requestGitLog()` - Convenience method for git log  
- `requestGitDiff()` - Convenience method for git diff
- `requestGitCurrentBranch()` - Get current branch name
- `requestGitStagedFiles()` - List staged files
- `requestGitCommit()` - Create commits with options (amend, author, etc.)

#### Batch Operations
- `requestBatch()` - Execute multiple intents concurrently
- Parallel I/O for improved performance
- Independent error handling per operation

#### Error Handling
- `IntentError` - Generic operation failure errors
- `ValidationError` - Schema validation errors
- `RateLimitError` - Rate limit exceeded errors
- Detailed error properties: `code`, `stage`, `requestId`

#### Low-Level API
- `emitIntent()` - Send custom intents directly to pipeline
- `buildIntent()` - Access to IntentBuilder for advanced use cases
- Direct RPC client access for custom implementations

### Documentation
- Complete API reference in README.md with examples
- Manifest integration guide
- Migration guide from direct RPC/IPC
- Performance tips and rate limit optimization
- Timeout configuration and retry strategies
- TypeScript support guide
- Error handling patterns

### Security
- All operations validated by Ghost pipeline
- Capability-based authorization with manifest permissions
- Content scanning for secrets before file writes
- SSRF protection for network calls
- Rate limiting enforcement
- Audit logging integration
- Dangerous git argument blocking

[Unreleased]: https://github.com/lamallamadel/ghost/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/lamallamadel/ghost/releases/tag/v1.0.0
