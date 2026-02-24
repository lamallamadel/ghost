# Ghost Gateway Architecture Overview

## Introduction

The Ghost Gateway is a pure orchestration layer that enables modular extension of Ghost CLI functionality through a manifest-driven architecture with strict capability contracts.

## Design Principles

1. **Zero Business Logic**: Gateway contains no domain logic, only orchestration
2. **Capability-Based Security**: Extensions declare exactly what they need
3. **Fail-Safe**: Validation happens at load time, not runtime
4. **Isolated Execution**: Extensions run in their own context
5. **Resource Control**: Rate limits and access controls prevent abuse

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        Ghost CLI                             │
│                        (ghost.js)                           │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        │ require('./core/gateway')
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                   Gateway (gateway.js)                       │
│                                                              │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐           │
│  │ initialize │  │ getExtension│  │  execute   │           │
│  └────────────┘  └────────────┘  └────────────┘           │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │        Extension Registry (Map)                     │    │
│  │  - Extension instances                              │    │
│  │  - Manifests                                        │    │
│  │  - Loaded state                                     │    │
│  └────────────────────────────────────────────────────┘    │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        │ uses
                        ▼
┌─────────────────────────────────────────────────────────────┐
│           ExtensionLoader (extension-loader.js)              │
│                                                              │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐           │
│  │  discover  │  │   load     │  │  validate  │           │
│  └────────────┘  └────────────┘  └────────────┘           │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │         Validation Engine                           │    │
│  │  - Manifest schema validation                       │    │
│  │  - Capability contract checking                     │    │
│  │  - Permission verification                          │    │
│  └────────────────────────────────────────────────────┘    │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        │ validates against
                        ▼
┌─────────────────────────────────────────────────────────────┐
│        Manifest Schema (manifest-schema.json)                │
│                                                              │
│  - JSON Schema specification                                │
│  - Capability definitions                                   │
│  - Permission types                                         │
│  - Validation rules                                         │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        │ defines contract for
                        ▼
┌─────────────────────────────────────────────────────────────┐
│              Extensions (~/.ghost/extensions/)               │
│                                                              │
│  ┌───────────────────────────────────────────────────┐     │
│  │  extension-1/                                      │     │
│  │  ├── manifest.json                                │     │
│  │  ├── index.js                                     │     │
│  │  └── package.json (optional)                      │     │
│  └───────────────────────────────────────────────────┘     │
│                                                              │
│  ┌───────────────────────────────────────────────────┐     │
│  │  extension-2/                                      │     │
│  │  ├── manifest.json                                │     │
│  │  ├── main.js                                      │     │
│  │  └── ...                                          │     │
│  └───────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

### Gateway (`gateway.js`)

**Purpose**: Pure orchestration with zero business logic

**Responsibilities**:
- Initialize extension system
- Manage extension registry
- Route method calls to extensions
- Handle lifecycle (load/unload/shutdown)

**Does NOT**:
- Contain domain logic
- Validate data (delegates to loader)
- Execute business rules
- Manage state beyond registry

**API**:
```javascript
const gateway = new Gateway({ extensionsDir: '...' });
await gateway.initialize();                    // Load all extensions
gateway.listExtensions();                      // List loaded extensions
gateway.getExtension(id);                      // Get extension by ID
await gateway.executeExtension(id, method, ...args);  // Execute method
gateway.unloadExtension(id);                   // Unload single extension
gateway.shutdown();                            // Cleanup all extensions
```

### Extension Loader (`extension-loader.js`)

**Purpose**: Discovery, loading, and validation

**Responsibilities**:
- Scan extensions directory
- Read and parse manifests
- Validate manifest structure
- Validate capability declarations
- Load extension modules
- Handle loading errors gracefully

**Validation Checks**:
- Required fields present
- ID format (lowercase alphanumeric with hyphens)
- Version format (semver)
- Capability structure
- Network allowlist URL format
- Rate limit values (positive integers)
- Git hook names (valid hooks only)
- Main file exists

**API**:
```javascript
const loader = new ExtensionLoader(extensionsDir);
const extensions = await loader.discoverAndLoad();  // Discover and load all
loader.getLoadedExtensions();                       // Get loaded list
loader.unload(extensionId);                         // Unload extension
```

### Manifest Schema (`manifest-schema.json`)

**Purpose**: Define extension capability contract

**Responsibilities**:
- Specify required/optional fields
- Define capability structure
- Enumerate permission types
- Document validation rules
- Provide JSON Schema for tooling

**Key Sections**:
- **Structure**: Required vs optional fields
- **Capabilities**: Filesystem, network, git, hooks
- **Permissions**: System-level permissions
- **Configuration**: Default settings
- **Dependencies**: NPM packages

## Data Flow

### Extension Loading Flow

```
1. Gateway.initialize()
   │
   ├─> ExtensionLoader.discoverAndLoad()
   │   │
   │   ├─> Scan ~/.ghost/extensions/
   │   │
   │   ├─> For each directory:
   │   │   │
   │   │   ├─> Read manifest.json
   │   │   │
   │   │   ├─> Validate against schema
   │   │   │
   │   │   ├─> Require main file
   │   │   │
   │   │   └─> Instantiate extension
   │   │
   │   └─> Return loaded extensions
   │
   └─> Register in extension Map
```

### Extension Execution Flow

```
1. Gateway.executeExtension(id, method, ...args)
   │
   ├─> Retrieve extension from registry
   │
   ├─> Check extension exists
   │
   ├─> Check method exists
   │
   ├─> Call extension.method(...args)
   │
   └─> Return result
```

### Extension Unload Flow

```
1. Gateway.unloadExtension(id)
   │
   ├─> Retrieve extension from registry
   │
   ├─> Call extension.cleanup() if exists
   │
   ├─> Remove from registry
   │
   └─> Return success
```

## Capability System

### Filesystem Capabilities

**Purpose**: Control file access with glob patterns

**Structure**:
```json
{
  "filesystem": {
    "read": ["pattern1", "pattern2"],
    "write": ["pattern3"]
  }
}
```

**Enforcement**: Gateway can check patterns before allowing file operations

**Examples**:
- Read source code: `"src/**/*.js"`
- Write reports: `".ghost/reports/*.json"`
- Read config: `"config/*.json"`

### Network Capabilities

**Purpose**: Control network access and rate limiting

**Structure**:
```json
{
  "network": {
    "allowlist": ["https://api.example.com"],
    "rateLimit": {
      "cir": 60,    // Sustained rate (req/min)
      "bc": 10      // Burst size
    }
  }
}
```

**Enforcement**:
- Gateway validates URLs before requests
- Token bucket algorithm for rate limiting
  - CIR: Tokens added per minute
  - Bc: Maximum tokens in bucket

### Git Capabilities

**Purpose**: Control git repository access

**Structure**:
```json
{
  "git": {
    "read": true,   // Read repo state
    "write": false  // Modify repo
  }
}
```

**Enforcement**: Gateway checks before allowing git operations

**Operations**:
- Read: status, log, diff, show, ls-files
- Write: commit, branch, tag, push, reset

### Hook Capabilities

**Purpose**: Register for git lifecycle events

**Structure**:
```json
{
  "hooks": ["pre-commit", "commit-msg", "post-commit"]
}
```

**Enforcement**: Gateway only calls extension for declared hooks

**Hook Lifecycle**:
1. Git triggers hook
2. Gateway checks extension manifest
3. Calls extension method if registered
4. Collects result
5. Returns to git (success/failure)

## Permission Model

### Permission Types

| Permission | Description | Scope |
|------------|-------------|-------|
| `filesystem:read` | Read files | System files |
| `filesystem:write` | Write files | System files |
| `network:http` | HTTP requests | External |
| `network:https` | HTTPS requests | External |
| `git:read` | Read git data | Repository |
| `git:write` | Modify repository | Repository |
| `process:spawn` | Spawn processes | System |
| `env:read` | Read env vars | Environment |

### Permission Checking

```javascript
function hasPermission(extension, permission) {
    return extension.manifest.permissions.includes(permission);
}
```

### Best Practices

1. **Least Privilege**: Request minimum permissions needed
2. **Explicit Declaration**: Always declare in manifest
3. **Justification**: Document why each permission is needed
4. **Review**: Audit permissions before deployment

## Security Model

### Threat Model

**Protected Against**:
- Unauthorized file access
- Uncontrolled network requests
- Rate limiting bypass
- Malicious git operations
- Resource exhaustion

**Attack Vectors**:
- Malicious extensions
- Compromised extension code
- Resource exhaustion attacks
- Data exfiltration
- Repository corruption

### Security Measures

1. **Manifest Validation**: Strict schema enforcement
2. **Capability Declaration**: Explicit resource requirements
3. **Permission Model**: Granular access control
4. **Rate Limiting**: Prevent resource abuse
5. **URL Allowlist**: Control network access
6. **Glob Patterns**: Restrict file access
7. **Isolated Execution**: Extensions don't interact

### Defense in Depth

```
Layer 1: Manifest Validation (Load Time)
   └─> Validates structure, format, rules

Layer 2: Capability Checking (Runtime)
   └─> Checks declared capabilities

Layer 3: Permission Verification (Runtime)
   └─> Verifies required permissions

Layer 4: Resource Limits (Runtime)
   └─> Enforces rate limits, timeouts

Layer 5: Isolation (Runtime)
   └─> Separate extension contexts
```

## Extension Lifecycle

### Load Lifecycle

```
1. Discovery
   ├─> Scan extensions directory
   └─> Find manifest.json files

2. Validation
   ├─> Parse manifest
   ├─> Validate structure
   └─> Check capabilities

3. Loading
   ├─> Require main file
   └─> Instantiate extension

4. Registration
   ├─> Add to registry
   └─> Mark as loaded

5. Initialization (Optional)
   └─> Call extension.init(config)
```

### Runtime Lifecycle

```
1. Execution Request
   ├─> Gateway.executeExtension(id, method, args)
   └─> Retrieve from registry

2. Validation
   ├─> Check extension exists
   ├─> Check method exists
   └─> Verify permissions

3. Execution
   ├─> Call extension method
   └─> Capture result

4. Return
   └─> Return result to caller
```

### Unload Lifecycle

```
1. Unload Request
   ├─> Gateway.unloadExtension(id)
   └─> Retrieve from registry

2. Cleanup
   ├─> Call extension.cleanup()
   └─> Handle cleanup errors

3. Removal
   ├─> Remove from registry
   └─> Clear references

4. Confirmation
   └─> Return success/failure
```

## Integration with Ghost CLI

### Basic Integration

```javascript
// In ghost.js
const { Gateway } = require('./core');

let gateway = null;

async function initExtensions() {
    gateway = new Gateway();
    const result = await gateway.initialize();
    console.log(`Loaded ${result.loaded} extensions`);
    return gateway;
}

// At startup
await initExtensions();

// In commands
if (gateway) {
    const extensions = gateway.listExtensions();
    // Use extensions
}
```

### Hook Integration

```javascript
// Pre-commit hook
async function runPreCommitHooks(stagedFiles) {
    const extensions = gateway.listExtensions();
    
    for (const ext of extensions) {
        if (ext.capabilities.hooks?.includes('pre-commit')) {
            const result = await gateway.executeExtension(
                ext.id,
                'onPreCommit',
                stagedFiles
            );
            
            if (!result.success) {
                console.error(`Hook failed: ${result.message}`);
                return false;
            }
        }
    }
    
    return true;
}
```

### Command Integration

```javascript
// New 'ghost extensions' command
if (args[0] === 'extensions') {
    const subcommand = args[1];
    
    if (subcommand === 'list') {
        const extensions = gateway.listExtensions();
        extensions.forEach(ext => {
            console.log(`${ext.name} (${ext.id}@${ext.version})`);
        });
    } else if (subcommand === 'reload') {
        gateway.shutdown();
        await initExtensions();
        console.log('Extensions reloaded');
    }
}
```

## Performance Considerations

### Load Time

- **Discovery**: O(n) where n = number of directories
- **Validation**: O(m) where m = manifest fields
- **Loading**: O(k) where k = extension code size

**Optimization**:
- Lazy loading of extensions
- Parallel loading for independent extensions
- Caching of validated manifests

### Runtime

- **Lookup**: O(1) - Map-based registry
- **Execution**: Depends on extension
- **Validation**: O(1) - Pre-validated at load

**Optimization**:
- Pre-compute permission checks
- Cache capability lookups
- Minimize validation at runtime

### Memory

- **Registry**: O(n) - One entry per extension
- **Instances**: O(n) - One instance per extension
- **Manifests**: O(n) - Stored with extension

**Optimization**:
- Unload unused extensions
- Implement LRU cache for large deployments
- Use weak references where appropriate

## Extensibility

### Adding New Capabilities

1. Update `manifest-schema.json`:
```json
{
  "capabilities": {
    "database": {
      "type": "object",
      "properties": {
        "allowedTables": { "type": "array" }
      }
    }
  }
}
```

2. Add validation in `extension-loader.js`:
```javascript
if (capabilities.database) {
    // Validate database capabilities
}
```

3. Implement enforcement in gateway or consumers

### Adding New Permissions

1. Update schema enum:
```json
{
  "permissions": {
    "enum": ["database:read", "database:write"]
  }
}
```

2. Document in guides

3. Implement checking logic

### Adding New Hooks

1. Update schema enum:
```json
{
  "hooks": {
    "enum": ["pre-merge", "post-merge"]
  }
}
```

2. Update validation

3. Integrate with Ghost CLI

## Testing Strategy

### Unit Tests

- Test each component in isolation
- Mock dependencies
- Cover edge cases

### Integration Tests

- Test Gateway + Loader integration
- Test extension loading end-to-end
- Test hook execution flow

### Validation Tests

- Test manifest validation rules
- Test capability validation
- Test error handling

### Example Test

```javascript
describe('Gateway', () => {
    it('should load valid extension', async () => {
        const gateway = new Gateway({ extensionsDir: './test/fixtures' });
        const result = await gateway.initialize();
        
        expect(result.loaded).toBe(1);
        expect(result.extensions).toContain('test-extension');
    });
    
    it('should reject invalid manifest', async () => {
        const gateway = new Gateway({ extensionsDir: './test/invalid' });
        const result = await gateway.initialize();
        
        expect(result.loaded).toBe(0);
    });
});
```

## Future Enhancements

### Potential Features

1. **Hot Reload**: Reload extensions without restart
2. **Dependency Management**: Auto-install dependencies
3. **Sandboxing**: VM-based isolation
4. **Extension Marketplace**: Discover and install extensions
5. **Versioning**: Support multiple extension versions
6. **Metrics**: Track extension usage and performance
7. **Audit Log**: Log all extension operations
8. **Configuration UI**: Web-based extension management

### Compatibility

- Maintain backward compatibility
- Version manifest schema
- Provide migration tools
- Document breaking changes

## Conclusion

The Ghost Gateway architecture provides a robust, secure, and extensible foundation for modular CLI functionality. By separating concerns, enforcing capabilities, and maintaining zero business logic in the orchestration layer, it enables safe and flexible extension development.
