# Ghost Mesh Master

Service discovery and dependency management layer for the Ghost CLI ecosystem.

## Phase 1: Service Registry & Discovery (Completed)
This phase established the infrastructure for dynamic service mapping across extensions.

### Features
- **Dynamic Routing Table**: Scans all installed extensions to build a virtual service map.
- **Service Abstraction**: Maps extension commands to virtual service endpoints (e.g., `git:commit` → `ghost-git-extension`).
- **Inter-op Foundation**: Provides the registry needed for extensions to find and call each other without hardcoding IDs.

### Commands
- `ghost mesh routes`: Displays the active service routing table and providers.

## Installation
```bash
ghost extension install extensions/ghost-mesh-extension
```
