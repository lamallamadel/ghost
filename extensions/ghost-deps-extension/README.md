# Ghost Dependency Master

Dependency management and visualization extension for the Ghost CLI ecosystem.

## Phase 2: Security & License Audit (Completed)
This phase added compliance and security scanning for all project dependencies.

### New Features
- **License Compliance**: Scans dependencies to ensure they use approved licenses (MIT, Apache, etc.).
- **Vulnerability Integration**: Leverages `npm audit` via secure Ghost intents to detect known security threats.
- **Detailed Reporting**: Generates structured reports on the security posture of the project's dependency tree.

### New Commands
- `ghost deps audit`: Performs a full security and license audit of project dependencies.

## Installation
```bash
ghost extension install extensions/ghost-deps-extension
```
