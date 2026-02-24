# Getting Started with Ghost Gateway

## Overview

The Ghost Gateway is an extension system for Ghost CLI that allows you to add custom functionality through modular plugins. This guide will help you get started quickly.

## Quick Start (5 Minutes)

### 1. Run the Demo

```bash
node core/examples/demo-gateway.js
```

This demonstrates the gateway loading extensions from `~/.ghost/extensions/`.

### 2. Create Your First Extension

Create the extensions directory:
```bash
mkdir -p ~/.ghost/extensions/hello-world
cd ~/.ghost/extensions/hello-world
```

Create `manifest.json`:
```json
{
  "id": "hello-world",
  "name": "Hello World Extension",
  "version": "1.0.0",
  "description": "A simple example extension",
  "main": "index.js",
  "capabilities": {},
  "permissions": []
}
```

Create `index.js`:
```javascript
class HelloWorld {
    async sayHello(name) {
        return `Hello, ${name}! 👻`;
    }
}

module.exports = HelloWorld;
```

### 3. Test Your Extension

Run the demo again:
```bash
node core/examples/demo-gateway.js
```

You should see your extension loaded!

## Understanding the Components

### Gateway (`gateway.js`)
The main orchestration layer - loads, manages, and executes extensions.

### Extension Loader (`extension-loader.js`)
Discovers extensions, validates manifests, and loads extension code.

### Manifest Schema (`manifest-schema.json`)
Defines the contract that all extension manifests must follow.

## Common Use Cases

### 1. Pre-Commit Code Analyzer

Create an extension that analyzes code before commits:

**manifest.json:**
```json
{
  "id": "code-analyzer",
  "name": "Code Analyzer",
  "version": "1.0.0",
  "main": "index.js",
  "capabilities": {
    "filesystem": {
      "read": ["src/**/*.js"]
    },
    "git": {
      "read": true
    },
    "hooks": ["pre-commit"]
  },
  "permissions": ["filesystem:read", "git:read"]
}
```

**index.js:**
```javascript
class CodeAnalyzer {
    async onPreCommit(stagedFiles) {
        const jsFiles = stagedFiles.filter(f => f.endsWith('.js'));
        
        console.log(`Analyzing ${jsFiles.length} JavaScript files...`);
        
        // Your analysis logic here
        
        return {
            success: true,
            message: 'All checks passed!'
        };
    }
}

module.exports = CodeAnalyzer;
```

### 2. Commit Message Validator

**manifest.json:**
```json
{
  "id": "commit-validator",
  "name": "Commit Message Validator",
  "version": "1.0.0",
  "main": "index.js",
  "capabilities": {
    "hooks": ["commit-msg"]
  },
  "permissions": []
}
```

**index.js:**
```javascript
class CommitValidator {
    async onCommitMsg(message) {
        const pattern = /^(feat|fix|docs|style|refactor|test|chore): .+/;
        
        if (!pattern.test(message)) {
            return {
                success: false,
                message: 'Commit message must follow format: type: description'
            };
        }
        
        return { success: true };
    }
}

module.exports = CommitValidator;
```

### 3. External API Integration

**manifest.json:**
```json
{
  "id": "api-notifier",
  "name": "API Notifier",
  "version": "1.0.0",
  "main": "index.js",
  "capabilities": {
    "network": {
      "allowlist": ["https://api.slack.com"],
      "rateLimit": {
        "cir": 30,
        "bc": 5
      }
    },
    "hooks": ["post-commit"]
  },
  "permissions": ["network:https"],
  "dependencies": {
    "axios": "^1.6.0"
  }
}
```

**index.js:**
```javascript
const axios = require('axios');

class ApiNotifier {
    async onPostCommit(commitHash) {
        try {
            await axios.post('https://api.slack.com/webhook', {
                text: `New commit: ${commitHash}`
            });
            
            return { success: true };
        } catch (error) {
            console.error('Failed to notify:', error.message);
            return { success: false };
        }
    }
}

module.exports = ApiNotifier;
```

## Directory Structure

```
~/.ghost/extensions/
├── hello-world/
│   ├── manifest.json
│   └── index.js
├── code-analyzer/
│   ├── manifest.json
│   ├── index.js
│   └── package.json
└── api-notifier/
    ├── manifest.json
    ├── index.js
    ├── package.json
    └── node_modules/
```

## Extension Development Workflow

1. **Design**: Plan capabilities needed
2. **Create**: Make extension directory
3. **Manifest**: Write manifest.json
4. **Code**: Implement extension logic
5. **Test**: Run demo or integration tests
6. **Install**: Move to ~/.ghost/extensions/
7. **Use**: Extension loads automatically

## Testing Extensions Locally

### Method 1: Demo Script

```bash
node core/examples/demo-gateway.js
```

### Method 2: Custom Test Script

```javascript
const { Gateway } = require('./core');

async function test() {
    const gateway = new Gateway();
    await gateway.initialize();
    
    const result = await gateway.executeExtension(
        'my-extension',
        'myMethod',
        'arg1', 'arg2'
    );
    
    console.log('Result:', result);
}

test();
```

### Method 3: Integration with Ghost CLI

Modify `ghost.js` to initialize gateway at startup:

```javascript
const { Gateway } = require('./core');

async function main() {
    const gateway = new Gateway();
    await gateway.initialize();
    
    // Your existing Ghost CLI logic
    // Now with extension support!
}
```

## Troubleshooting

### Extension Not Loading

**Problem**: Extension doesn't appear in loaded list

**Solutions**:
1. Check manifest.json syntax (valid JSON)
2. Verify extension is in `~/.ghost/extensions/`
3. Ensure `id` field follows pattern: `^[a-z0-9-]+$`
4. Check `main` file exists and is correct path
5. Look for error messages in console

### Validation Errors

**Problem**: Manifest validation fails

**Solutions**:
1. Check all required fields present (id, name, version, main, capabilities)
2. Verify version follows semver: `1.0.0`
3. Ensure capabilities object exists (can be empty)
4. Check network allowlist URLs are `protocol://domain` only
5. Verify rate limit values are positive integers

### Module Not Found

**Problem**: Extension code fails to load

**Solutions**:
1. Check `main` file path in manifest
2. Ensure file has `.js` extension
3. Verify file is in extension directory
4. Check for syntax errors in extension code

### Dependencies Missing

**Problem**: Extension requires npm packages

**Solutions**:
1. Add `package.json` to extension directory
2. Run `npm install` in extension directory
3. Declare dependencies in manifest
4. Check node_modules exists

## Best Practices

### 1. Start Simple
Begin with minimal capabilities and expand as needed.

### 2. Document Everything
Add clear descriptions and comments.

### 3. Handle Errors
Always use try-catch and return meaningful error messages.

### 4. Test Thoroughly
Test with various inputs and edge cases.

### 5. Follow Conventions
Match the patterns in example extensions.

### 6. Version Carefully
Bump version on every change.

### 7. Secure by Default
Request minimum permissions needed.

## Next Steps

### Learn More

- **[README.md](README.md)**: Architecture overview
- **[EXTENSION_GUIDE.md](EXTENSION_GUIDE.md)**: Comprehensive development guide
- **[MANIFEST_REFERENCE.md](MANIFEST_REFERENCE.md)**: Complete manifest field reference
- **[ARCHITECTURE.md](ARCHITECTURE.md)**: Deep dive into architecture

### Examples

- Check `core/examples/` for sample extensions
- Study `sample-extension.js` for patterns
- Review `sample-extension-manifest.json` for configuration

### Build Something

Ideas for extensions:
- Test runner integration
- Linting enforcement
- Documentation generator
- Changelog automation
- Branch naming validator
- File size checker
- Security scanner
- Performance profiler
- Database migration validator
- API versioning checker

## Getting Help

### Check Documentation

1. Start with this guide (GETTING_STARTED.md)
2. Read the extension guide (EXTENSION_GUIDE.md)
3. Check manifest reference (MANIFEST_REFERENCE.md)
4. Review architecture (ARCHITECTURE.md)

### Debug Issues

1. Run demo with your extension
2. Check console for error messages
3. Verify manifest against schema
4. Test extension code independently
5. Review example extensions

### Common Questions

**Q: Where do extensions live?**
A: `~/.ghost/extensions/` directory

**Q: Can extensions talk to each other?**
A: No, extensions are isolated for security

**Q: How do I update an extension?**
A: Modify files and bump version in manifest

**Q: Can I use TypeScript?**
A: Yes, compile to JavaScript and set `main` to output file

**Q: How do I distribute extensions?**
A: Share directory or publish to npm, users copy to ~/.ghost/extensions/

**Q: Are extensions sandboxed?**
A: Capability-based security, but not VM-isolated (future enhancement)

## Summary

You've learned:
- ✅ How to create a basic extension
- ✅ Extension directory structure
- ✅ Manifest requirements
- ✅ Common use cases
- ✅ Testing approaches
- ✅ Troubleshooting tips

Start building your extension today! 🚀
