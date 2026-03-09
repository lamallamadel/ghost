# Ghost Docker-Hero

Container optimization and security assistant for the Ghost CLI ecosystem.

## Phase 3: Smart Generation (Completed)
This final phase introduced generative AI capabilities to create perfect Dockerfiles from scratch.

### New Features
- **Context-Aware Generation**: Analyzes project files (e.g., `package.json`) to understand the tech stack before generating.
- **AI-Powered Assembly**: Creates multi-stage, secure, and optimized Dockerfiles automatically.
- **Provider Support**: Compatible with multiple AI providers (Anthropic, OpenAI, etc.) configured via Ghost setup.

### New Commands
- `ghost docker generate [--out <file>]`: Analyzes the project and generates a production-ready `Dockerfile`.

## Installation
```bash
ghost marketplace install ghost-docker-hero
```
