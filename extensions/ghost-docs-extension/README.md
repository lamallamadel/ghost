# Ghost Documentation Bot

AI-powered documentation engine for the Ghost CLI ecosystem.

## Phase 2: Architecture & Diagrams (Completed)
This phase added the ability to visualize project structure and dependencies.

### New Features
- **Dependency Mapping**: Automatically parses source files to identify relationships between modules.
- **Mermaid Graph Generation**: Creates dynamic architecture diagrams in Mermaid format.
- **Architecture Report**: Generates `docs/ARCHITECTURE.md` containing the project's dependency graph.

### New Commands
- `ghost docs diagram`: Generates a dependency graph and saves it to the `docs/` directory.

## Installation
```bash
ghost extension install extensions/ghost-docs-extension
```
