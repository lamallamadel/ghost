# Ghost Pipeline Orchestrator

CI/CD integration and headless automation engine for the Ghost CLI ecosystem.

## Phase 2: CI Gates & Validation (Completed)
This phase introduced automated quality gates for CI/CD environments.

### New Features
- **Automated Security Gates**: Automatically triggers a full repository audit and fails the pipeline if critical secrets are found.
- **Documentation Verification**: Ensures architectural diagrams and documentation are up to date.
- **Cross-Extension Orchestration**: Deep integration with Security and Docs extensions via Ghost RPC.
- **Exit Code Support**: Returns standard Unix exit codes (0 for success, 1 for failure) to integrate with CI job status.

### New Commands
- `ghost ci check [--ai]`: Runs all automated gates and returns a summary report.

## Installation
```bash
ghost extension install extensions/ghost-ci-extension
```
