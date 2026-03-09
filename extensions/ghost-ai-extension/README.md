# Ghost AI Manager

Centralized AI model management and usage tracking extension for the Ghost CLI ecosystem.

## Phase 1: Scaffolding & Configuration Management (Completed)
This phase established the foundation for centralizing AI settings and model awareness.

### Features
- **Centralized Status**: Reports current AI provider, model, and API key status from `ghostrc.json`.
- **Model Directory**: Lists all officially supported models across Anthropic, Groq, OpenAI, and Gemini.
- **Secure Access**: Manages sensitive configuration via Ghost's RPC filesystem intents.

### Commands
- `ghost ai status`: Displays the current AI configuration and connection health.
- `ghost ai models`: Shows all supported AI models and providers.

## Installation
```bash
ghost extension install extensions/ghost-ai-extension
```
