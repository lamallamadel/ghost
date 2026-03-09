# Ghost Author Kit

Developer toolkit for scaffolding, validating, and publishing Ghost CLI extensions.

## Phase 1: Scaffolding & Extension Templates (Completed)
This phase established the foundation for rapid extension development.

### Features
- **Extension Scaffolding**: Instantly creates a new extension directory with all required files.
- **Automated Manifest Generation**: Creates a compliant `manifest.json` based on the extension name.
- **Boilerplate Code**: Generates standard `index.js` and `package.json` integrated with `@ghost/extension-sdk`.

### Commands
- `ghost ext init <name>`: Scaffolds a new Ghost extension in the `extensions/` directory.

## Installation
```bash
ghost extension install extensions/ghost-author-extension
```
