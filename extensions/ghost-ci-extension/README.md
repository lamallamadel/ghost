# Ghost Pipeline Orchestrator

CI/CD integration and headless automation engine for the Ghost CLI ecosystem.

## Phase 1: Scaffolding & CI Detection (Completed)
This phase established the foundation for environment awareness and orchestration.

### Features
- **CI Detection**: Automatically identifies common CI environments (GitHub Actions, GitLab CI, CircleCI, etc.).
- **Metadata Extraction**: Captures branch names, commit SHAs, and trigger actors from environment variables.
- **Dependency Orchestration**: Prepares the link between Security, Docs, and Git extensions for headless runs.

### Commands
- `ghost ci status`: Displays CI environment details and available orchestration capabilities.

## Installation
```bash
ghost extension install extensions/ghost-ci-extension
```
