# Extension Dependency Resolution System - Implementation Complete

## Summary

Implemented a comprehensive extension dependency resolution system for Ghost CLI that automatically manages dependencies, determines load order, and detects conflicts.

## Files Created/Modified

### New Files Created

1. **core/dependency-resolver.js** - Core dependency resolution engine
   - Topological sort using Kahn's algorithm
   - Circular dependency detection with DFS
   - Semver version constraint validation
   - Capability conflict detection
   - Dependency tree visualization

2. **core/extension-deps-commands.js** - CLI command handler for dependency management
   - `ghost extension deps` command implementation
   - Tree visualization
   - Conflict and version issue reporting

3. **docs/DEPENDENCY_RESOLUTION.md** - Complete documentation
   - Feature overview
   - Usage examples
   - Troubleshooting guide
   - Best practices

### Modified Files

1. **core/extension-loader.js**
   - Added DependencyResolver integration
   - 8-phase load process with dependency resolution
   - Graph storage and loading (dependency-graph.json)
   - Version constraint validation
   - Manifest validation for dependencies field

2. **core/manifest-schema.json**
   - Updated dependencies field documentation
   - Added semver constraint examples
   - Documented dependency resolution behavior

3. **core/marketplace.js**
   - Added automatic dependency installation
   - `autoInstallDeps` option for `installExtension()`
   - Recursive dependency installation

4. **ghost.js**
   - Added `ghost extension deps` command
   - Integrated ExtensionDepsCommands handler
   - Updated marketplace install with `--with-deps` flag
   - Updated help text and command completion
   - Added 'deps' to valid subcommands list

## Features Implemented

### 1. Dependency Declaration
- Extensions declare dependencies in manifest.json
- Supports semver version constraints: ^, ~, *, >, <, >=, <=, ranges

### 2. Topological Sort
- Kahn's algorithm determines correct load order
- Dependencies always load before dependents
- Handles complex dependency graphs

### 3. Circular Dependency Detection
- DFS-based cycle detection
- Full dependency chain visualization
- Prevents loading when cycles detected

### 4. Version Constraint Validation
- Validates installed versions satisfy constraints
- Warnings for mismatches (non-fatal)
- Supports all semver constraint syntaxes

### 5. Capability Conflict Detection
- Detects overlapping capability declarations
- Resolution strategies: first-loaded-wins, shared, chain
- Warns about conflicts with winner information

### 6. Dependency Installation
- `ghost marketplace install --with-deps` auto-installs dependencies
- Recursive dependency resolution
- Marketplace integration

### 7. Dependency Tree Visualization
- `ghost extension deps` shows full tree
- Per-extension or all extensions
- Conflict and version issue reporting
- JSON output support

### 8. Dependency Graph Storage
- Stored in `~/.ghost/extensions/dependency-graph.json`
- Contains graph, load order, conflicts, version issues
- Timestamped for tracking

## Usage Examples

### View all dependencies
```bash
ghost extension deps
```

### View specific extension dependencies
```bash
ghost extension deps ghost-utils
```

### Install with automatic dependency resolution
```bash
ghost marketplace install my-extension --with-deps
```

### Example manifest with dependencies
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

## Load Process

1. **Discover** - Find all extension manifests
2. **Build Graph** - Create dependency graph
3. **Detect Cycles** - Check for circular dependencies (fail-fast)
4. **Validate Versions** - Check version constraints (warn)
5. **Topological Sort** - Determine load order
6. **Detect Conflicts** - Find capability overlaps (warn)
7. **Load Extensions** - Load in dependency order
8. **Save Graph** - Persist to disk

## Algorithm Details

### Topological Sort (Kahn's Algorithm)
1. Calculate in-degree for each node
2. Queue nodes with zero in-degree
3. Process queue, reducing in-degree of dependents
4. If all nodes processed, return order; else cycle exists

### Circular Detection (DFS)
1. Maintain visited set and recursion stack
2. For each unvisited node, perform DFS
3. If node in recursion stack, cycle found
4. Extract cycle path for visualization

### Version Matching (Semver)
- **Caret (^1.2.3)**: >=1.2.3 <2.0.0 (compatible major)
- **Tilde (~1.2.3)**: >=1.2.3 <1.3.0 (compatible minor)
- **Exact (1.2.3)**: Exact match
- **Comparison (>=1.0.0)**: Direct comparison
- **Range (>=1.0.0 <2.0.0)**: Multiple constraints

### Conflict Detection
- Process extensions in load order
- Track capability declarations by type
- First-loaded wins for exclusive capabilities
- Warn about conflicts with resolution strategy

## Testing Recommendations

1. Test simple dependency chains (A→B→C)
2. Test shared dependencies (A→C, B→C)
3. Test circular dependencies (should fail)
4. Test version mismatches (should warn)
5. Test capability conflicts (should warn)
6. Test missing dependencies (should warn)
7. Test complex graphs with multiple levels

## Future Enhancements

- Lock file for reproducible builds
- Peer dependencies (optional dependencies)
- Auto-update when constraints allow
- Fetch missing dependencies from marketplace
- Dependency visualization in desktop app
- Dependency pruning (remove unused)
- Version range optimization

## Integration Points

- **ExtensionLoader**: Integrates DependencyResolver
- **Gateway**: Uses resolved load order
- **Marketplace**: Auto-installs dependencies
- **CLI**: Provides deps command
- **Manifest**: Validates dependencies field

## Error Handling

- **Circular Dependencies**: Fail-fast, show chain
- **Version Mismatches**: Warn, continue loading
- **Missing Dependencies**: Warn, continue loading
- **Capability Conflicts**: Warn with resolution
- **Invalid Constraints**: Fail validation

## Documentation

- Full documentation in `docs/DEPENDENCY_RESOLUTION.md`
- Manifest schema updated with dependency examples
- Help text includes deps command
- Command completion includes deps subcommand
