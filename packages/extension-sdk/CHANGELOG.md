# Changelog

All notable changes to the @ghost/extension-sdk package will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2024-01-15

### Added

- Initial release of @ghost/extension-sdk
- `ExtensionSDK` class with high-level API methods
- `IntentBuilder` for constructing I/O intents
- `RPCClient` for JSON-RPC communication with Ghost pipeline
- TypeScript definitions for all APIs
- Comprehensive documentation and examples

### Features

#### Filesystem Operations
- `requestFileRead()` - Read file contents
- `requestFileWrite()` - Write file contents
- `requestFileReadDir()` - List directory contents
- `requestFileStat()` - Get file statistics

#### Network Operations
- `requestNetworkCall()` - Make HTTP/HTTPS requests with full control

#### Git Operations
- `requestGitExec()` - Execute any git operation
- `requestGitStatus()` - Convenience method for git status
- `requestGitLog()` - Convenience method for git log
- `requestGitDiff()` - Convenience method for git diff

#### Low-Level API
- `emitIntent()` - Send custom intents directly
- `buildIntent()` - Access to intent builder
- Support for batch operations via `RPCClient.sendBatch()`

### Documentation
- Complete API reference in README.md
- TypeScript type definitions
- Integration with Ghost CLI extension system

### Security
- All operations validated by Ghost pipeline
- Capability-based authorization
- Rate limiting support
- Audit logging integration
