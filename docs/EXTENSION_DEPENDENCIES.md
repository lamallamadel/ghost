# Extension Dependency Resolution System

## Overview

The Ghost CLI extension system supports inter-extension dependencies with automatic resolution, version constraint validation, topological sorting for load order, conflict detection, and circular dependency prevention.

## Features

- **Inter-Extension Dependencies**: Extensions can depend on other extensions via `extensionDependencies` in manifest
- **Topological Sorting**: Automatic determination of correct load order (dependencies loaded before dependents)
- **Semver Version Constraints**: Full semver range support (^, ~, >, <, >=, <=, -, x, *)
- **Conflict Detection**: Detects when multiple extensions provide the same capability
- **Circular Dependency Prevention**: Fails fast when circular dependencies are detected
- **Missing Dependency Detection**: Validates all dependencies exist before loading
- **Dependency Graph Visualization**: ASCII and DOT format export for dependency graphs

## Manifest Declaration

### extensionDependencies

Declare dependencies in your extension's `manifest.json`:

```json
{
  "id": "my-extension",
  "name": "My Extension",
  "version": "1.0.0",
  "main": "index.js",
  "extensionDependencies": {
    "core-utils": "^1.0.0",
    "auth-provider": "~2.1.0",
    "logging-extension": ">=1.0.0"
  },
  "capabilities": { ... }
}
```

### provides

Declare capabilities your extension provides to enable conflict detection:

```json
{
  "id": "auth-extension",
  "name": "Auth Extension",
  "version": "1.0.0",
  "provides": ["auth", "oauth2"],
  "capabilities": { ... }
}
```

Commands and hooks are automatically treated as capabilities.

## Version Constraint Formats

### Exact Version
```json
"my-dep": "1.0.0"
```
Matches only version 1.0.0

### Caret (^) - Compatible Versions
```json
"my-dep": "^1.0.0"
```
- `^1.2.3` := `>=1.2.3 <2.0.0` (compatible with 1.x.x)
- `^0.2.3` := `>=0.2.3 <0.3.0` (compatible with 0.2.x for 0.x versions)
- `^0.0.3` := `>=0.0.3 <0.0.4` (exact match for 0.0.x)

### Tilde (~) - Patch-level Changes
```json
"my-dep": "~1.2.3"
```
- `~1.2.3` := `>=1.2.3 <1.3.0` (allows patch-level changes)

### Greater Than / Less Than
```json
"my-dep": ">1.0.0"
"my-dep": ">=1.0.0"
"my-dep": "<2.0.0"
"my-dep": "<=2.0.0"
```

### Wildcard (x, X, *)
```json
"my-dep": "1.x"      // Any 1.x.x version
"my-dep": "1.2.x"    // Any 1.2.x version
"my-dep": "*"        // Any version
```

### Range
```json
"my-dep": "1.0.0 - 2.0.0"  // Between 1.0.0 and 2.0.0 inclusive
```

## Load Order Determination

Extensions are loaded in topological order based on dependencies:

```
Extension A depends on B and C
Extension B depends on C
Extension C has no dependencies

Load order: C → B → A
```

The dependency resolver uses DFS-based topological sorting to determine the correct load order.

## Conflict Detection

### Command Conflicts
Multiple extensions cannot provide the same command:

```json
// Extension 1
{ "commands": ["deploy"] }

// Extension 2 - CONFLICT
{ "commands": ["deploy"] }
```

**Result**: Load failure with error `Capability conflicts detected: command:deploy`

### Hook Conflicts
Multiple extensions cannot register the same hook:

```json
// Extension 1
{ "capabilities": { "hooks": ["pre-commit"] } }

// Extension 2 - CONFLICT
{ "capabilities": { "hooks": ["pre-commit"] } }
```

**Result**: Load failure with error `Capability conflicts detected: hook:pre-commit`

### Explicit Capability Conflicts
Multiple extensions cannot provide the same explicit capability:

```json
// Extension 1
{ "provides": ["auth"] }

// Extension 2 - CONFLICT
{ "provides": ["auth"] }
```

**Result**: Load failure with error `Capability conflicts detected: auth`

## Circular Dependency Detection

Circular dependencies are detected and cause load failure:

```json
// Extension A
{ "extensionDependencies": { "ext-b": "^1.0.0" } }

// Extension B
{ "extensionDependencies": { "ext-a": "^1.0.0" } }
```

**Result**: Load failure with error `Circular dependency: ext-a -> ext-b -> ext-a`

Longer cycles (A → B → C → A) are also detected.

## Missing Dependency Detection

If a dependency is not available, load fails:

```json
// Extension A
{ "extensionDependencies": { "missing-ext": "^1.0.0" } }
```

**Result**: Load failure with error `Extension ext-a depends on missing-ext@^1.0.0, but missing-ext is not available`

## Version Constraint Validation

If a dependency version doesn't satisfy the constraint, load fails:

```json
// Extension A requires core-utils ^1.0.0
{ "extensionDependencies": { "core-utils": "^1.0.0" } }

// But core-utils 2.0.0 is installed
```

**Result**: Load failure with error `Extension ext-a requires core-utils@^1.0.0, but 2.0.0 is available`

## API Usage

### ExtensionDependencyResolver

```javascript
const ExtensionDependencyResolver = require('./core/extension-dependency-resolver');

const resolver = new ExtensionDependencyResolver();

// Register extensions
resolver.register(extension1);
resolver.register(extension2);
resolver.register(extension3);

// Resolve dependencies and get load order
const orderedExtensions = resolver.resolve();

// Get dependency graph
const graph = resolver.getDependencyGraph();
// { 'ext-a': ['ext-b', 'ext-c'], 'ext-b': ['ext-c'], 'ext-c': [] }

// Get reverse dependencies (who depends on each extension)
const reverseDeps = resolver.getReverseDependencyGraph();
// { 'ext-a': [], 'ext-b': ['ext-a'], 'ext-c': ['ext-a', 'ext-b'] }

// Visualize dependencies
const ascii = resolver.visualizeDependencies();
console.log(ascii);

// Export to DOT format for Graphviz
const dot = resolver.exportToDot();
fs.writeFileSync('dependencies.dot', dot);
```

### ExtensionLoader Integration

The `ExtensionLoader` automatically uses the dependency resolver:

```javascript
const ExtensionLoader = require('./core/extension-loader');

const loader = new ExtensionLoader('./extensions', { verbose: true });

// Automatically resolves dependencies and loads in correct order
const extensions = await loader.discoverAndLoad();

// Get dependency graph
const graph = loader.getDependencyGraph();

// Get extension dependencies
const deps = loader.getExtensionDependencies('my-extension');

// Check if extension can be safely unloaded
const { canUnload, dependents } = loader.canUnload('my-extension');
if (!canUnload) {
  console.log(`Cannot unload: ${dependents.join(', ')} depend on it`);
}
```

## Dependency Graph Visualization

### ASCII Format

```
Extension Dependency Graph:

  ext-c@1.0.0 (no dependencies)

  ext-b@1.0.0
    └── ext-c@1.0.0

  ext-a@1.0.0
    ├── ext-b@1.0.0
    └── ext-c@1.0.0
```

### DOT Format

Generate Graphviz DOT format for visual rendering:

```javascript
const dot = resolver.exportToDot();
fs.writeFileSync('dependencies.dot', dot);
```

Then render with Graphviz:
```bash
dot -Tpng dependencies.dot -o dependencies.png
```

## Example Extension Manifests

### Base Extension (No Dependencies)

```json
{
  "id": "base-utils",
  "name": "Base Utilities",
  "version": "1.0.0",
  "description": "Core utility functions",
  "main": "index.js",
  "provides": ["utils", "helpers"],
  "capabilities": {
    "filesystem": {
      "read": ["**/*.js"],
      "write": []
    }
  }
}
```

### Extension with Dependencies

```json
{
  "id": "advanced-formatter",
  "name": "Advanced Formatter",
  "version": "2.0.0",
  "description": "Advanced code formatting with linting",
  "main": "index.js",
  "extensionDependencies": {
    "base-utils": "^1.0.0",
    "syntax-parser": "~1.5.0"
  },
  "commands": ["format", "lint"],
  "capabilities": {
    "filesystem": {
      "read": ["**/*.{js,ts,jsx,tsx}"],
      "write": ["**/*.{js,ts,jsx,tsx}"]
    }
  }
}
```

### Extension with Multiple Dependencies

```json
{
  "id": "deploy-manager",
  "name": "Deploy Manager",
  "version": "3.0.0",
  "description": "Deployment orchestration",
  "main": "index.js",
  "extensionDependencies": {
    "base-utils": "^1.0.0",
    "auth-provider": "^2.0.0",
    "config-loader": ">=1.0.0 <3.0.0",
    "logger": "*"
  },
  "commands": ["deploy", "rollback"],
  "capabilities": {
    "filesystem": {
      "read": ["**/*"],
      "write": ["dist/**", ".deploy/**"]
    },
    "network": {
      "allowlist": ["https://api.deploy-service.com"],
      "rateLimit": { "cir": 60, "bc": 100 }
    },
    "git": {
      "read": true,
      "write": true
    }
  }
}
```

## Best Practices

### 1. Minimize Dependencies
Only depend on extensions you actually need. Each dependency adds complexity and potential failure points.

### 2. Use Semantic Versioning
Follow semver for your extension versions to enable safe dependency ranges.

### 3. Specify Appropriate Ranges
- Use `^` for most dependencies (allows minor/patch updates)
- Use `~` for conservative updates (patch-level only)
- Use exact versions sparingly (for critical dependencies)

### 4. Document Dependencies
Clearly document why each dependency is needed in your extension's README.

### 5. Avoid Circular Dependencies
Design extension boundaries to prevent circular dependencies. Consider:
- Extracting common functionality into a shared base extension
- Using event-based communication instead of direct dependencies
- Splitting extensions into smaller, focused modules

### 6. Declare Capabilities
Always declare what your extension provides using the `provides` field to enable conflict detection.

### 7. Test Dependency Scenarios
Test your extension with:
- Minimum required versions of dependencies
- Latest compatible versions
- Missing dependencies (ensure graceful error messages)

## Error Handling

All dependency resolution errors are fail-closed and prevent extension loading:

### Missing Dependency
```
Error: Dependency resolution failed:
  - Extension advanced-formatter depends on base-utils@^1.0.0, but base-utils is not available
```

### Version Mismatch
```
Error: Version constraint validation failed:
  - Extension advanced-formatter requires base-utils@^1.0.0, but 2.0.0 is available
```

### Circular Dependency
```
Error: Circular dependency detected:
  - Circular dependency: ext-a -> ext-b -> ext-c -> ext-a
```

### Capability Conflict
```
Error: Capability conflicts detected:
  - command:deploy provided by [deploy-ext, alt-deploy-ext]
  - hook:pre-commit provided by [formatter, linter]
```

## Integration with Runtime

The dependency resolver integrates seamlessly with the extension runtime:

1. **Discovery Phase**: All extensions are discovered and their manifests are validated
2. **Registration Phase**: Extensions are registered with the dependency resolver
3. **Resolution Phase**: Dependencies are resolved, and load order is determined
4. **Loading Phase**: Extensions are loaded in dependency order
5. **Runtime Phase**: Extensions execute with guaranteed dependency availability

This ensures that when an extension's code runs, all its dependencies are already loaded and available.

## Related Documentation

- [Extension Loader](./extension-loader.md) - Extension discovery and loading
- [Manifest Reference](./MANIFEST_REFERENCE.md) - Complete manifest schema
- [Extension API](./extension-api.md) - Extension development API
- [Extension Examples](./extension-examples.md) - Working examples
