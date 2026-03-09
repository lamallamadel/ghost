# Ghost Dependency Master

Dependency management and visualization extension for the Ghost CLI ecosystem.

## Phase 1: Scaffolding & Dependency Graphing (Completed)
This phase established the infrastructure for mapping project and extension dependencies.

### Features
- **Visual Dependency Graph**: Generates Mermaid-formatted diagrams of the project's dependency tree.
- **Project Awareness**: Analyzes `package.json` to identify root dependencies.
- **Extension Mapping**: Identifies installed Ghost extensions and their relationships.

### Commands
- `ghost deps graph`: Generates and displays a Mermaid dependency graph in the console.

## Installation
```bash
ghost extension install extensions/ghost-deps-extension
```
