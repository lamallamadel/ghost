# Ghost Mesh Master

Service discovery and dependency management layer for the Ghost CLI ecosystem.

## Phase 2: Dependency Graph & Priority Engine (Completed)
This phase added intelligence to understand and optimize the extension network.

### New Features
- **Dependency Graphing**: Builds a full topological map of all extension relationships.
- **Circular Dependency Detection**: Advanced DFS algorithm to identify and alert on critical cycles.
- **Load Order Optimization**: Calculates the optimal priority order for extension initialization.
- **Graph Metadata**: Exposes the raw graph and load order via RPC for core-level introspection.

### New Commands
- `ghost mesh map`: Displays the global dependency graph and detects architectural issues.

## Installation
```bash
ghost extension install extensions/ghost-mesh-extension
```
