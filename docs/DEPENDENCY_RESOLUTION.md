# Extension Dependency Resolution System

## Overview

The Ghost CLI extension dependency resolution system automatically manages extension dependencies, determines load order, detects conflicts, and validates version compatibility across the dependency tree.

## Features

### 1. **Dependency Declaration**
Extensions declare dependencies in their `manifest.json`:

```json
{
  "id": "my-extension",
  "name": "My Extension",
  "version": "1.0.0",
  "dependencies": {
    "ghost-utils": "^1.2.0",
    "ghost-logger": "~2.1.0",
    "ghost-api": ">=3.0.0 <4.0.0"
  }
}
```

### 2. **Version Constraint Syntax**

Supports standard semver constraint syntax:

- **Exact**: `1.2.3` - Exact version match
- **Caret**: `^1.2.3` - Compatible with 1.x.x (>=1.2.3 <2.0.0)
- **Tilde**: `~1.2.3` - Compatible with 1.2.x (>=1.2.3 <1.3.0)
- **Wildcard**: `*` - Any version
- **Comparison**: `>=1.0.0`, `<2.0.0` - Comparison operators
- **Range**: `>=1.0.0 <2.0.0` - Range with multiple operators

### 3. **Topological Sort for Load Order**

Uses **Kahn's algorithm** to determine the correct load order:

```
Extension A depends on B and C
Extension B depends on C
Extension C has no dependencies

Load Order: C → B → A
```

Dependencies are always loaded before their dependents, ensuring proper initialization.

### 4. **Circular Dependency Detection**

Detects circular dependencies using **depth-first search (DFS)**:

```
Extension A depends on B
Extension B depends on C
Extension C depends on A

❌ Circular dependency: A → B → C → A
```

The system prevents loading when circular dependencies are detected and shows the full dependency chain.

### 5. **Version Constraint Validation**

Validates that installed versions satisfy declared constraints:

```
Extension A requires ghost-utils ^1.2.0
Installed: ghost-utils@1.3.5 ✓

Extension B requires ghost-api >=2.0.0 <3.0.0
Installed: ghost-api@3.1.0 ✗ (version mismatch)
```

Warnings are shown for incompatible versions but do not prevent loading.

### 6. **Capability Conflict Detection**

Detects when multiple extensions declare overlapping capabilities:

```
Extension A declares command: "deploy"
Extension B declares command: "deploy"

⚠ Conflict: command "deploy" declared by A, B
Resolution: first-loaded-wins (A wins)
```

Conflict types:
- **filesystem**: Overlapping read/write patterns
- **network**: Same URL in allowlist
- **git**: Same permission level
- **command**: Same command name
- **hook**: Same git hook

Resolution strategies:
- **first-loaded-wins**: First extension in load order gets priority
- **shared**: Both extensions can use the capability
- **chain**: Multiple extensions can hook into the same event

### 7. **Dependency Graph Storage**

The resolved dependency graph is stored in `~/.ghost/extensions/dependency-graph.json`:

```json
{
  "graph": {
    "extension-a": {
      "id": "extension-a",
      "version": "1.0.0",
      "dependencies": {},
      "dependents": ["extension-b"]
    },
    "extension-b": {
      "id": "extension-b",
      "version": "2.0.0",
      "dependencies": {
        "extension-a": "^1.0.0"
      },
      "dependents": []
    }
  },
  "loadOrder": ["extension-a", "extension-b"],
  "conflicts": [],
  "versionIssues": [],
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

## CLI Commands

### View Dependency Tree

Show dependency tree for all extensions:
```bash
ghost extension deps
```

Show dependency tree for specific extension:
```bash
ghost extension deps ghost-utils
```

Output JSON format:
```bash
ghost extension deps --json
```

### Install with Dependencies

Automatically install dependencies from marketplace:
```bash
ghost marketplace install my-extension --with-deps
```

## Load Process

The extension load process with dependency resolution:

1. **Discover** - Find all extension manifests in extensions directory
2. **Build Graph** - Create dependency graph from manifests
3. **Detect Cycles** - Check for circular dependencies (fail if found)
4. **Validate Versions** - Check version constraint satisfaction (warn if issues)
5. **Topological Sort** - Determine load order
6. **Detect Conflicts** - Identify capability overlaps (warn with resolution)
7. **Load Extensions** - Load in dependency order
8. **Save Graph** - Persist resolved graph to disk

## Examples

### Example 1: Simple Dependency Chain

**extension-logger** (v1.0.0) - No dependencies
**extension-api** (v2.0.0) - Depends on extension-logger ^1.0.0
**extension-app** (v1.5.0) - Depends on extension-api ^2.0.0

Load Order: `extension-logger → extension-api → extension-app`

### Example 2: Shared Dependency

**extension-utils** (v1.0.0) - No dependencies
**extension-auth** (v1.0.0) - Depends on extension-utils ^1.0.0
**extension-api** (v1.0.0) - Depends on extension-utils ^1.0.0
**extension-app** (v1.0.0) - Depends on extension-auth ^1.0.0, extension-api ^1.0.0

Load Order: `extension-utils → extension-auth → extension-api → extension-app`

### Example 3: Version Conflict

**extension-base** (v1.5.0) installed
**extension-a** requires extension-base ^1.0.0 ✓
**extension-b** requires extension-base ^2.0.0 ✗

System warns but allows loading:
```
⚠ Version Constraint Issues (1):
  ● extension-b → extension-base
    Requires: ^2.0.0, Found: 1.5.0
```

### Example 4: Circular Dependency

**extension-a** depends on extension-b
**extension-b** depends on extension-c
**extension-c** depends on extension-a

System prevents loading:
```
❌ Circular dependencies detected:
  extension-a → extension-b → extension-c → extension-a
```

## Implementation Details

### Topological Sort Algorithm

Uses Kahn's algorithm:
1. Calculate in-degree (number of dependencies) for each node
2. Add nodes with zero in-degree to queue
3. Process queue: remove node, reduce in-degree of dependents
4. If all nodes processed, return sorted order; else circular dependency exists

### Version Constraint Checking

Implements semver constraint matching:
- **Caret (^)**: Same major version (or 0.x for 0.0.x)
- **Tilde (~)**: Same major and minor version
- **Comparison**: Direct version comparison
- **Range**: Multiple constraint validation

### Conflict Resolution

Processes extensions in load order:
- First extension to declare a capability "wins" for exclusive capabilities
- Subsequent declarations are tracked as conflicts
- Warnings shown but loading continues

## Best Practices

1. **Use Caret Ranges**: `^1.0.0` allows compatible updates
2. **Declare All Dependencies**: Explicitly declare all required extensions
3. **Avoid Circular Dependencies**: Design extensions with clear dependency hierarchy
4. **Version Carefully**: Follow semver for version numbers
5. **Check Conflicts**: Run `ghost extension deps` to see conflicts
6. **Test Load Order**: Verify extensions load in correct order

## Troubleshooting

### Circular Dependency Error
**Problem**: Extensions have circular dependency chain
**Solution**: Refactor extensions to break the cycle (extract shared code, invert dependency)

### Version Mismatch Warning
**Problem**: Installed version doesn't satisfy constraint
**Solution**: Update dependency to compatible version or relax constraint

### Capability Conflict Warning
**Problem**: Multiple extensions declare same capability
**Solution**: Resolve conflict by removing duplicate or adjusting load order

### Missing Dependency Error
**Problem**: Required dependency not installed
**Solution**: Install missing dependency or use `--with-deps` flag

## Future Enhancements

- **Auto-update dependencies**: Automatically update when constraints allow
- **Dependency resolution from registry**: Fetch missing dependencies from marketplace
- **Lock file**: Freeze dependency versions for reproducibility
- **Peer dependencies**: Declare optional dependencies
- **Version ranges in graph**: Show compatible version ranges
