# Ghost Test Master

AI-powered test automation and coverage extension for the Ghost CLI ecosystem.

## Phase 2: AI Test Generation (Completed)
This phase introduced generative AI capabilities to automate unit test creation.

### New Features
- **AI Test Generator**: Automatically analyzes any source file and creates a corresponding unit test file.
- **Framework Awareness**: Generates tests compatible with established project frameworks (Vitest/Jest).
- **Multi-Model Support**: Leverage different AI providers for high-quality test logic.

### New Commands
- `ghost test gen [file]`: Generates a `.test.js` file for the specified source file using AI.

## Installation
```bash
ghost extension install extensions/ghost-test-extension
```
