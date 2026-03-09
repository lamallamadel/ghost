# Ghost AI Manager

Centralized AI model management and usage tracking extension for the Ghost CLI ecosystem.

## Phase 3: Model Switching & Validation (Completed)
This final phase enabled dynamic control over the AI engine.

### New Features
- **Dynamic Provider Switching**: Change AI providers (Anthropic, OpenAI, etc.) instantly via CLI.
- **Model Selection**: Override default models for specific workflows or cost-saving measures.
- **Automatic Configuration Sync**: Seamlessly updates `ghostrc.json` using secure filesystem intents.
- **Connectivity Safeguards**: Warns if a switch is made to a provider without a valid API key.

### New Commands
- `ghost ai switch <provider> [--model <name>]`: Switches the global AI provider and optionally the model.

## Installation
```bash
ghost extension install extensions/ghost-ai-extension
```
