# Ghost Test Master

AI-powered test automation and coverage extension for the Ghost CLI ecosystem.

## Phase 1: Core Test Runner (Completed)
This phase established the infrastructure for executing project tests via Ghost intents.

### Features
- **Automated Execution**: Runs project tests using `npm test` via the secure `process:spawn` intent.
- **Targeted Runs**: Supports running specific test files or suites by passing arguments.
- **SDK Integration**: Fully integrated with `@ghost/extension-sdk`.

### Commands
- `ghost test run [target]`: Executes tests for the entire project or a specific target.

## Installation
```bash
ghost extension install extensions/ghost-test-extension
```
