# Ghost SQL-Sage

AI-powered database query analysis and schema optimization assistant for the Ghost CLI ecosystem.

## Phase 3: Migration Generation (Completed)
This final phase enabled the automated generation of SQL migration scripts to apply optimizations.

### New Features
- **AI Migration Synthesizer**: Automatically creates DDL scripts (CREATE INDEX, ALTER TABLE) based on audit findings.
- **Standards Compliance**: Supports standard SQL syntax compatible with major databases (PostgreSQL, MySQL).
- **Safety First**: Generates migrations in a dedicated `migrations/` folder for review before execution.

### New Commands
- `ghost sql generate [path]`: Generates a migration script to fix detected schema issues.

## Installation
```bash
ghost marketplace install ghost-sql-sage
```
