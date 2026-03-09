# Ghost Documentation Bot

AI-powered documentation engine for the Ghost CLI ecosystem.

## Phase 1: Context Intelligence (Completed)
This phase established the foundation for project analysis and automated documentation.

### Features
- **ProjectAnalyzer**: Detects project stack (Node.js, Python, Go, Rust) and maps file structures.
- **AI README Generation**: Generates professional `README.md` files based on real project context.
- **Multi-Provider AI**: Support for Anthropic, Groq, OpenAI, and Gemini.

### Commands
- `ghost docs init`: Analyzes the project and generates a comprehensive `README.md`.

## Installation
```bash
ghost extension install extensions/ghost-docs-extension
```
