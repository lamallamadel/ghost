# Ghost Gateway - Complete Documentation Index

## 🚀 Quick Navigation

### Getting Started
- **[GETTING_STARTED.md](GETTING_STARTED.md)** - Start here! 5-minute quick start guide
- **[README.md](README.md)** - Architecture overview and component descriptions

### Development
- **[EXTENSION_GUIDE.md](EXTENSION_GUIDE.md)** - Complete extension development guide
- **[MANIFEST_REFERENCE.md](MANIFEST_REFERENCE.md)** - Field-by-field manifest reference

### Deep Dive
- **[ARCHITECTURE.md](ARCHITECTURE.md)** - Comprehensive architecture documentation

### Examples
- **[examples/](examples/)** - Working example code
  - `demo-gateway.js` - Demo script
  - `sample-extension.js` - Example extension
  - `sample-extension-manifest.json` - Example manifest

## 📁 Core Files

### Implementation
- **`gateway.js`** - Pure orchestration entry point (zero business logic)
- **`extension-loader.js`** - Discovery, loading, and validation engine
- **`manifest-schema.json`** - JSON Schema for extension manifests
- **`index.js`** - Module exports for easy importing

## 📚 Documentation Guide

### For First-Time Users
1. Read [GETTING_STARTED.md](GETTING_STARTED.md)
2. Try the demo: `node core/examples/demo-gateway.js`
3. Create your first extension following the quick start

### For Extension Developers
1. Review [EXTENSION_GUIDE.md](EXTENSION_GUIDE.md)
2. Check [MANIFEST_REFERENCE.md](MANIFEST_REFERENCE.md) for field details
3. Study examples in `core/examples/`
4. Start with a simple extension and iterate

### For System Architects
1. Read [ARCHITECTURE.md](ARCHITECTURE.md)
2. Understand the component diagram
3. Review security model and capability system
4. Plan integration with Ghost CLI

### For Contributors
1. Understand architecture from [ARCHITECTURE.md](ARCHITECTURE.md)
2. Follow patterns in existing code
3. Add tests for new features
4. Update documentation

## 🎯 Key Concepts

### Gateway Architecture
- **Pure Orchestration**: No business logic in gateway
- **Capability-Based**: Extensions declare what they need
- **Manifest-Driven**: Schema-validated configuration
- **Isolated**: Extensions don't interact directly

### Extension System
- **Discovery**: Automatic scanning of `~/.ghost/extensions/`
- **Validation**: Strict manifest schema enforcement
- **Loading**: Dynamic module loading with error handling
- **Execution**: Method routing through gateway

### Security Model
- **Capabilities**: Filesystem globs, network allowlists, git permissions
- **Rate Limiting**: CIR (sustained) and Bc (burst) controls
- **Permissions**: Granular system access control
- **Validation**: Load-time checking, runtime enforcement

## 📖 Reference by Topic

### Manifests
- Schema: [manifest-schema.json](manifest-schema.json)
- Reference: [MANIFEST_REFERENCE.md](MANIFEST_REFERENCE.md)
- Examples: [examples/sample-extension-manifest.json](examples/sample-extension-manifest.json)

### Capabilities

#### Filesystem
```json
{
  "filesystem": {
    "read": ["src/**/*.js"],
    "write": [".ghost/reports/*.json"]
  }
}
```
- Docs: [MANIFEST_REFERENCE.md#filesystem](MANIFEST_REFERENCE.md)
- Guide: [EXTENSION_GUIDE.md#filesystem-access](EXTENSION_GUIDE.md)

#### Network
```json
{
  "network": {
    "allowlist": ["https://api.example.com"],
    "rateLimit": { "cir": 60, "bc": 10 }
  }
}
```
- Docs: [MANIFEST_REFERENCE.md#network](MANIFEST_REFERENCE.md)
- Guide: [EXTENSION_GUIDE.md#network-access](EXTENSION_GUIDE.md)

#### Git
```json
{
  "git": {
    "read": true,
    "write": false
  }
}
```
- Docs: [MANIFEST_REFERENCE.md#git](MANIFEST_REFERENCE.md)
- Guide: [EXTENSION_GUIDE.md#git-operations](EXTENSION_GUIDE.md)

#### Hooks
```json
{
  "hooks": ["pre-commit", "commit-msg"]
}
```
- Docs: [MANIFEST_REFERENCE.md#hooks](MANIFEST_REFERENCE.md)
- Guide: [EXTENSION_GUIDE.md#git-hooks](EXTENSION_GUIDE.md)

### API Reference

#### Gateway API
```javascript
const gateway = new Gateway(options);
await gateway.initialize();
gateway.listExtensions();
gateway.getExtension(id);
await gateway.executeExtension(id, method, ...args);
gateway.unloadExtension(id);
gateway.shutdown();
```
- Docs: [README.md#gateway](README.md)
- Architecture: [ARCHITECTURE.md#gateway](ARCHITECTURE.md)

#### Extension Loader API
```javascript
const loader = new ExtensionLoader(dir);
await loader.discoverAndLoad();
loader.getLoadedExtensions();
loader.unload(id);
```
- Docs: [README.md#extension-loader](README.md)
- Architecture: [ARCHITECTURE.md#extension-loader](ARCHITECTURE.md)

#### Extension Interface
```javascript
class MyExtension {
    constructor() { }
    async init(config) { }
    async onPreCommit(files) { }
    async onCommitMsg(message) { }
    cleanup() { }
}
```
- Guide: [EXTENSION_GUIDE.md#extension-api](EXTENSION_GUIDE.md)
- Examples: [examples/sample-extension.js](examples/sample-extension.js)

## 🔍 Find Information By Task

### "I want to create an extension"
1. [GETTING_STARTED.md](GETTING_STARTED.md) - Quick start
2. [EXTENSION_GUIDE.md](EXTENSION_GUIDE.md) - Full guide
3. [examples/](examples/) - Working examples

### "I need to understand the manifest format"
1. [MANIFEST_REFERENCE.md](MANIFEST_REFERENCE.md) - Complete reference
2. [manifest-schema.json](manifest-schema.json) - JSON Schema
3. [examples/sample-extension-manifest.json](examples/sample-extension-manifest.json) - Example

### "I want to understand the architecture"
1. [README.md](README.md) - Overview
2. [ARCHITECTURE.md](ARCHITECTURE.md) - Deep dive
3. Component source: [gateway.js](gateway.js), [extension-loader.js](extension-loader.js)

### "I need to debug an extension"
1. [GETTING_STARTED.md#troubleshooting](GETTING_STARTED.md) - Common issues
2. [EXTENSION_GUIDE.md#troubleshooting](EXTENSION_GUIDE.md) - Detailed debugging
3. [examples/demo-gateway.js](examples/demo-gateway.js) - Test harness

### "I want to integrate with Ghost CLI"
1. [ARCHITECTURE.md#integration](ARCHITECTURE.md) - Integration patterns
2. [README.md#integration](README.md) - Basic integration
3. [gateway.js](gateway.js) - Gateway API

### "I need capability examples"
1. [EXTENSION_GUIDE.md#examples](EXTENSION_GUIDE.md) - Real-world examples
2. [MANIFEST_REFERENCE.md#common-patterns](MANIFEST_REFERENCE.md) - Common patterns
3. [examples/sample-extension.js](examples/sample-extension.js) - Working code

## 📊 Documentation Stats

### Files
- **Core Code**: 4 files (gateway.js, extension-loader.js, manifest-schema.json, index.js)
- **Documentation**: 6 markdown files
- **Examples**: 3 example files
- **Total**: 13 files

### Coverage
- ✅ Quick start guide
- ✅ Complete development guide
- ✅ Manifest field reference
- ✅ Architecture documentation
- ✅ Working examples
- ✅ API documentation
- ✅ Troubleshooting guides

### Lines of Code
- **gateway.js**: ~80 LOC
- **extension-loader.js**: ~250 LOC
- **manifest-schema.json**: ~140 lines
- **Examples**: ~200 LOC
- **Documentation**: ~2,500 lines

## 🎓 Learning Path

### Beginner
1. Read [GETTING_STARTED.md](GETTING_STARTED.md)
2. Run demo: `node core/examples/demo-gateway.js`
3. Create hello-world extension
4. Test with demo script

### Intermediate
1. Read [EXTENSION_GUIDE.md](EXTENSION_GUIDE.md)
2. Study [examples/sample-extension.js](examples/sample-extension.js)
3. Build pre-commit hook extension
4. Add network capabilities

### Advanced
1. Read [ARCHITECTURE.md](ARCHITECTURE.md)
2. Understand security model
3. Implement complex capabilities
4. Contribute improvements

## 🔗 External Resources

### JSON Schema
- [JSON Schema Official](https://json-schema.org/)
- [Understanding JSON Schema](https://json-schema.org/understanding-json-schema/)

### Node.js
- [Node.js Modules](https://nodejs.org/api/modules.html)
- [Node.js Best Practices](https://github.com/goldbergyoni/nodebestpractices)

### Git Hooks
- [Git Hooks Documentation](https://git-scm.com/book/en/v2/Customizing-Git-Git-Hooks)
- [githooks.com](https://githooks.com/)

## 📝 Quick Reference

### Create Extension
```bash
mkdir -p ~/.ghost/extensions/my-ext
cd ~/.ghost/extensions/my-ext
# Create manifest.json and index.js
```

### Minimal Manifest
```json
{
  "id": "my-ext",
  "name": "My Extension",
  "version": "1.0.0",
  "main": "index.js",
  "capabilities": {}
}
```

### Test Extension
```bash
node core/examples/demo-gateway.js
```

### Use Gateway
```javascript
const { Gateway } = require('./core');
const gateway = new Gateway();
await gateway.initialize();
```

## 🆘 Getting Help

### Documentation
- Start with the appropriate guide from this index
- Check examples for working code
- Review architecture for design decisions

### Common Issues
- Extension not loading → [GETTING_STARTED.md#troubleshooting](GETTING_STARTED.md)
- Validation errors → [MANIFEST_REFERENCE.md](MANIFEST_REFERENCE.md)
- Architecture questions → [ARCHITECTURE.md](ARCHITECTURE.md)

### Next Steps
Choose your path:
- 🆕 New to extensions? → [GETTING_STARTED.md](GETTING_STARTED.md)
- 👨‍💻 Building extensions? → [EXTENSION_GUIDE.md](EXTENSION_GUIDE.md)
- 🏗️ Designing systems? → [ARCHITECTURE.md](ARCHITECTURE.md)
- 📖 Need reference? → [MANIFEST_REFERENCE.md](MANIFEST_REFERENCE.md)

---

**Last Updated**: 2026-02-24
**Version**: 1.0.0
**Maintainer**: Ghost Team
