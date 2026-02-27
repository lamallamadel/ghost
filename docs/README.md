# Ghost CLI v1.0.0 Documentation

Complete documentation for Ghost CLI and extension development.

## 📚 Documentation Index

### Getting Started

- [Main README](../README.md) - Overview and quick start
- [Quick Reference](./QUICK_REFERENCE.md) - Quick reference card for developers

### Extension Development

- [Developer Toolkit Guide](./DEVELOPER_TOOLKIT.md) - Complete guide to building extensions
- [Extension API Reference](./extension-api.md) - I/O intent schema and pipeline architecture
- [Extension Examples](./extension-examples.md) - Working examples for common patterns

### SDK & Packages

- [@ghost/extension-sdk](../packages/extension-sdk/README.md) - Official SDK for building extensions
- [SDK Changelog](../packages/extension-sdk/CHANGELOG.md) - Version history

### Core Documentation

- [Architecture](../core/ARCHITECTURE.md) - System architecture overview
- [Extension Guide](../core/EXTENSION_GUIDE.md) - Core extension concepts
- [Manifest Reference](../core/MANIFEST_REFERENCE.md) - Manifest schema reference
- [Runtime](../core/RUNTIME.md) - Extension runtime documentation
- [Telemetry](../core/TELEMETRY.md) - Observability and monitoring

## 🚀 Quick Start

### For Extension Users

```bash
# Install Ghost CLI
npm install -g atlasia-ghost

# List available extensions
ghost extension list

# Use bundled Git extension
ghost commit
ghost audit
ghost version bump
```

### For Extension Developers

```bash
# Create new extension
ghost extension init my-extension
cd my-extension

# Install dependencies
npm install

# Validate extension
ghost extension validate

# Install locally
ghost extension install .

# Test your extension
ghost myCommand
```

## 📖 Learning Path

### 1. Understand the Basics

Start here to understand Ghost CLI's architecture:

1. Read [Main README](../README.md) for overview
2. Review [Architecture](../core/ARCHITECTURE.md) for system design
3. Read [Extension Guide](../core/EXTENSION_GUIDE.md) for core concepts

### 2. Build Your First Extension

Follow this path to create your first extension:

1. Read [Developer Toolkit Guide](./DEVELOPER_TOOLKIT.md)
2. Run `ghost extension init hello-world`
3. Review [Extension Examples](./extension-examples.md)
4. Study [Extension API Reference](./extension-api.md)

### 3. Master Extension Development

Dive deeper into advanced topics:

1. Study the [I/O Intent Schema](./extension-api.md#io-intent-schema)
2. Learn about [Pipeline Architecture](./extension-api.md#pipeline-architecture)
3. Review [Security Model](./extension-api.md#security-model)
4. Read [Best Practices](./extension-api.md#best-practices)

### 4. Advanced Topics

Explore advanced features:

1. [Runtime Management](../core/RUNTIME.md) - Extension lifecycle
2. [Telemetry](../core/TELEMETRY.md) - Observability
3. [QoS & Rate Limiting](../core/qos/README.md) - Quality of service

## 🛠️ CLI Command Reference

### Extension Management

```bash
ghost extension init <name>           # Create new extension
ghost extension validate [path]       # Validate manifest
ghost extension install <path>        # Install extension
ghost extension list                  # List extensions
ghost extension info <id>             # Show extension details
ghost extension remove <id>           # Remove extension
```

### Gateway Management

```bash
ghost gateway status                  # Show gateway status
ghost gateway health                  # Show extension health
ghost gateway metrics [ext-id]        # Show telemetry metrics
ghost gateway spans [limit]           # Show recent spans
```

### Audit & Monitoring

```bash
ghost audit-log view                  # View audit logs
ghost console start                   # Start telemetry server
ghost console stop                    # Stop telemetry server
```

### Extension Commands

Commands are routed to installed extensions:

```bash
ghost commit                          # AI-powered commit (git extension)
ghost audit                           # Security audit (git extension)
ghost version bump                    # Version management (git extension)
ghost merge resolve                   # Merge resolution (git extension)
```

## 📦 Package Structure

```
ghost/
├── ghost.js                          # Main CLI entry point
├── core/                             # Core gateway functionality
│   ├── gateway.js                    # Extension discovery & routing
│   ├── runtime.js                    # Extension lifecycle management
│   ├── pipeline/                     # I/O pipeline layers
│   ├── qos/                          # Quality of service
│   └── validators/                   # Security validators
├── extensions/                       # Bundled extensions
│   └── ghost-git-extension/         # Git operations extension
├── packages/                         # NPM packages
│   └── extension-sdk/               # @ghost/extension-sdk
└── docs/                            # Documentation
    ├── extension-api.md             # API reference
    ├── extension-examples.md        # Examples
    ├── DEVELOPER_TOOLKIT.md         # Toolkit guide
    └── QUICK_REFERENCE.md           # Quick reference
```

## 🔒 Security

Ghost CLI implements a comprehensive security model:

### Capability-Based Authorization

Extensions declare required capabilities in `manifest.json`:

```json
{
  "capabilities": {
    "filesystem": {
      "read": ["src/**/*.js"],
      "write": ["dist/**"]
    },
    "network": {
      "allowlist": ["https://api.example.com"]
    },
    "git": {
      "read": true,
      "write": false
    }
  }
}
```

### Pipeline Security

All operations pass through a 4-layer pipeline:

1. **Intercept** - Schema validation
2. **Authorization** - Permission checking
3. **Audit** - Security scanning (NIST, entropy)
4. **Execute** - Safe operation with circuit breakers

### Rate Limiting

Network operations use Two-Rate Three-Color (trTCM) token bucket:

```json
{
  "rateLimit": {
    "cir": 60,    // Committed Information Rate (requests/min)
    "bc": 100     // Burst Committed (max burst)
  }
}
```

### Audit Logging

All operations are logged immutably to `~/.ghost/audit.log`:

```bash
ghost audit-log view --limit 50 --extension my-extension
```

## 🤝 Contributing

### Report Issues

- GitHub Issues: https://github.com/lamallamadel/ghost/issues

### Contribute Code

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests: `npm test`
5. Submit a pull request

### Share Extensions

Share your extensions with the community:

1. Publish to NPM
2. Add to extension registry (coming soon)
3. Share on GitHub

## 📝 License

MIT © Adel Lamallam

## 🔗 Links

- [GitHub Repository](https://github.com/lamallamadel/ghost)
- [NPM Package](https://www.npmjs.com/package/atlasia-ghost)
- [@ghost/extension-sdk](https://www.npmjs.com/package/@ghost/extension-sdk)
- [Issue Tracker](https://github.com/lamallamadel/ghost/issues)

## 📮 Support

Need help? Check these resources:

1. [Quick Reference](./QUICK_REFERENCE.md) - Common tasks
2. [Extension Examples](./extension-examples.md) - Working code
3. [API Reference](./extension-api.md) - Complete API docs
4. [GitHub Issues](https://github.com/lamallamadel/ghost/issues) - Report bugs
