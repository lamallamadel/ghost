# Ghost Cloud-Master

AI-powered infrastructure-as-code generator and cloud auditing assistant for the Ghost CLI ecosystem.

## Phase 1: Infrastructure Analysis (Completed)
This phase established the foundation for detecting cloud resource requirements from project source code.

### Features
- **Resource Detection**: Scans project files (`package.json`, source code) to identify compute, database, and storage needs.
- **AI Architecture Recommendations**: Leverages specialized AI prompts to suggest optimal AWS/GCP services based on detected needs.
- **Project Awareness**: Analyzes dependencies to understand cloud-specific SDK usage.

### Commands
- `ghost cloud detect`: Analyzes the project and provides a strategic infrastructure recommendation report.

## Installation
```bash
ghost marketplace install ghost-cloud-master
```
