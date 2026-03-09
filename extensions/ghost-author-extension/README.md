# Ghost Author Kit

Developer toolkit for scaffolding, validating, and publishing Ghost CLI extensions.

## Phase 2: Validation & Compliance (Completed)
This phase introduced strict validation rules to ensure extension quality and security.

### New Features
- **Manifest Validator**: Checks for required fields and standard structure.
- **Permission Auditing**: Detects invalid or excessive permission requests (e.g., write without read).
- **Collision Detection**: Prevents extensions from overriding reserved core commands.
- **Detailed Compliance Reporting**: Provides a structured report with errors and warnings.

### New Commands
- `ghost ext validate [path]`: Validates an extension's manifest against Ghost standards.

## Installation
```bash
ghost extension install extensions/ghost-author-extension
```
