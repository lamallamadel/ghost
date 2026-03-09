# Ghost Pipeline Orchestrator

CI/CD integration and headless automation engine for the Ghost CLI ecosystem.

## Phase 3: CI Reporting (Completed)
This phase added structured reporting for integration with CI/CD dashboards.

### New Features
- **JSON Reporting**: Generates `ci-reports/ghost-results.json` for consumption by external tools and scripts.
- **Markdown Summaries**: Generates `ci-reports/GHOST_SUMMARY.md` formatted for GitHub/GitLab job summaries.
- **Environment Metadata**: Captures and reports CI-specific metadata (SHA, Actor, Branch) in all reports.

### New Commands
- `ghost ci report`: Generates structured CI artifacts based on the latest checks.

## Installation
```bash
ghost extension install extensions/ghost-ci-extension
```
