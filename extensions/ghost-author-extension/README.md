# Ghost Author Kit

Developer toolkit for scaffolding, validating, and publishing Ghost CLI extensions.

## Phase 3: Publishing & Versioning (Completed)
This final phase automated the distribution and version management of extensions.

### New Features
- **Automated Versioning**: Supports `major`, `minor`, and `patch` bumps across manifest and package files.
- **Git Integration**: Automatically creates annotated Git tags for every release.
- **Pre-publication Validation**: Ensures an extension is fully compliant before allowing a version bump.
- **Publishing Prep**: Synchronizes all metadata files to ensure consistency across the registry and NPM.

### New Commands
- `ghost ext publish [path] [--bump patch|minor|major]`: Validates, bumps version, and tags the extension for release.

## Installation
```bash
ghost extension install extensions/ghost-author-extension
```
