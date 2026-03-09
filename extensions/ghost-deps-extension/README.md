# Ghost Dependency Master

Dependency management and visualization extension for the Ghost CLI ecosystem.

## Phase 3: Conflict Resolution (Completed)
This final phase enabled automated detection and resolution of dependency version conflicts.

### New Features
- **Version Conflict Solver**: Identifies mismatches between extension requirements and actual installed versions.
- **Smart Recommendations**: Suggests specific `ghost marketplace` commands to resolve peer dependency issues.
- **RPC Introspection**: Queries the core's resolver to provide accurate, real-time resolution paths.

### New Commands
- `ghost deps solve`: Analyzes conflicts and provides actionable recommendations for fixes.

## Installation
```bash
ghost extension install extensions/ghost-deps-extension
```
