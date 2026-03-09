# Ghost SQL-Sage

AI-powered database query analysis and schema optimization assistant for the Ghost CLI ecosystem.

## Phase 2: Indexing & Schema Audit (Completed)
This phase added the capability to analyze database schema files for structural issues.

### New Features
- **Primary Key Validation**: Ensures every table has a defined primary key.
- **Foreign Key Indexing**: Detects missing indexes on foreign key columns to optimize join performance.
- **Data Type Optimization**: Identifies inefficient data types (e.g., oversized VARCHARs).
- **Static Schema Parsing**: Analyzes `.sql` and migration files using Ghost's filesystem intents.

### New Commands
- `ghost sql audit [path]`: Performs a structural audit of your SQL schema files.

## Installation
```bash
ghost marketplace install ghost-sql-sage
```
