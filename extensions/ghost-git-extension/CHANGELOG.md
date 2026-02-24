# Changelog

All notable changes to the Ghost Git Extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2024-01-XX

### Added

#### Core Features
- JSON-RPC 2.0 interface for communication with Ghost core
- Sandboxed execution with manifest-based permissions
- Rate-limited network access (CIR: 100KB/s, Bc: 500KB, Be: 1MB)

#### Git Operations
- `git.checkRepo` - Repository validation
- `git.getStagedDiff` - Staged changes with file mapping
- `git.generateCommit` - AI-powered commit message generation
- Multi-provider AI support (Groq, OpenAI, Anthropic, Gemini)

#### Security Features
- Secret detection with pattern matching
- Shannon entropy analysis for high-entropy strings
- AI-powered validation to reduce false positives
- `.ghostignore` support for excluding files from scans
- Full repository audit capabilities
- Known non-secret filtering (model names, class names, etc.)

#### Version Management
- Semantic versioning (semver) support
- Version parsing, comparison, and bumping
- Conventional commit analysis
- Automatic version bump detection from commit history
- Git tag creation and management
- Git hooks (pre-commit, commit-msg) support
- Version configuration via `.ghost-versionrc`

#### Merge Resolution
- Conflict detection
- Strategy-based resolution (ours/theirs/manual)
- Interactive and non-interactive modes
- Batch conflict resolution

#### AI Integration
- Groq API support (llama-3.3-70b-versatile, llama-3.1-8b-instant)
- OpenAI API support
- Anthropic Claude API support (claude-3-5-sonnet)
- Google Gemini API support (gemini-1.5-flash, gemini-1.5-pro)
- Temperature control for generation
- JSON mode for structured responses

### Security
- Filesystem access restricted to read: `**/*`, write: `.git/**`, `package.json`, etc.
- Network access restricted to AI provider domains only
- HTTPS-only communication
- No direct system access - all I/O through RPC

### Testing
- Comprehensive test suite for all major features
- RPC client tests
- Semver function tests
- Conventional commit tests
- Security scanning tests
- Example integration for demonstration

### Documentation
- Complete API documentation
- README with usage examples
- Manifest specification
- Example integration code

## [Unreleased]

### Planned
- Git blame integration
- Interactive rebase support
- Branch management operations
- Stash operations
- Remote repository operations
- Enhanced merge conflict visualization
- Multi-file secret correlation
- Custom security rules
- Webhook notifications for version events
- CI/CD integration helpers
