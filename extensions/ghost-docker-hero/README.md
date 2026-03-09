# Ghost Docker-Hero

Container optimization and security assistant for the Ghost CLI ecosystem.

## Phase 2: Size Optimization (Completed)
This phase added intelligence to shrink Docker images and optimize layer usage.

### New Features
- **Size Analysis**: Identifies heavy base images and suggests lighter alternatives (Alpine, Slim).
- **Multi-stage Detection**: Recommends multi-stage build patterns to separate build-time and run-time dependencies.
- **Cache Hygiene**: Detects missing package manager cleanup commands.
- **Dependency Pruning**: Suggests production-only flags for language package managers (NPM, Yarn).

### New Commands
- `ghost docker shrink [path]`: Analyzes a Dockerfile and provides specific instructions to reduce the final image size.

## Installation
```bash
ghost marketplace install ghost-docker-hero
```
