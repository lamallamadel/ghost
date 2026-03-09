# Ghost SQL-Sage

AI-powered database query analysis and schema optimization assistant for the Ghost CLI ecosystem.

## Phase 1: Query Analysis (Completed)
This phase established the foundation for detecting SQL performance issues and ORM anti-patterns in source code.

### Features
- **N+1 Query Detection**: Identifies potential performance bottlenecks in loops using static analysis.
- **SQL Best Practices**: Scans for `SELECT *` usage and inefficient join patterns.
- **AI Deep-Dive**: Leverages specialized AI prompts to provide context-aware optimization recommendations.

### Commands
- `ghost sql analyze [file]`: Analyzes code for database-related performance and security issues.

## Installation
```bash
ghost marketplace install ghost-sql-sage
```
