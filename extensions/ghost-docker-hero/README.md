# Ghost Docker-Hero

Container optimization and security assistant for the Ghost CLI ecosystem.

## Phase 1: Security Scanning (Completed)
This phase established the static analysis engine for Dockerfiles.

### Features
- **Security Audit**: Detects high-risk practices like running as `root` or hardcoding secrets in `ENV` instructions.
- **Best Practices Check**: Verifies image pinning and basic layer hygiene.
- **Rule-Based Analysis**: Static analysis of Dockerfile instructions via Ghost filesystem intents.

### Commands
- `ghost docker scan [path]`: Analyzes a Dockerfile for security vulnerabilities and best practices.

## Installation
```bash
ghost marketplace install ghost-docker-hero
```
