# Extension Migration Tool Implementation

## Overview

Implemented `ghost extension migrate` command to automate migration of v0.x extensions to v1.0.0 SDK.

## Implementation Details

### Core Module: `core/extension-migrator.js`

**Features:**
- Analyzes v0.x extension code patterns
- Detects legacy patterns requiring migration
- Validates manifest compatibility with v1.0.0
- Generates migration plan with automated and manual steps
- Applies automated changes (with `--apply` flag)
- Creates comprehensive migration guide

### Code Pattern Detection

The migrator detects the following legacy patterns:

1. **module.exports pattern** - Identifies object, class, or function exports
2. **ExtensionRPCClient usage** - Detects legacy built-in RPC client
3. **Custom RPC clients** - Identifies custom RPC client implementations
4. **Direct fs module usage** - Detects `require('fs')` and file operations
5. **Direct http/https usage** - Detects `require('https')` and network calls
6. **Direct git execution** - Detects `child_process` with git commands
7. **Missing coreHandler injection** - Identifies RPC clients without dependency injection

### Manifest Validation

Validates v1.0.0 compatibility:

1. **Required fields** - Checks `id`, `name`, `version`, `main`, `capabilities`
2. **ID format** - Validates lowercase alphanumeric with hyphens
3. **Version format** - Validates semantic versioning
4. **Network rate limit** - Ensures `cir`, `bc`, and `be` parameters exist
5. **Filesystem patterns** - Validates read/write arrays
6. **Dependencies** - Recommends `@ghost/extension-sdk` package

### Migration Plan Generation

Creates structured plan with:

1. **Backup steps** - Lists files to backup
2. **File modifications** - Identifies files to modify
3. **File creation** - Lists new files to generate
4. **Manual changes** - Categorizes changes by priority (critical, high, medium)

### Automated Changes

When run with `--apply` flag:

1. **Backs up files** - Copies to `.migration-backup/` directory
2. **Updates package.json** - Adds `@ghost/extension-sdk` dependency
3. **Updates manifest.json** - Adds missing v1.0.0 fields (`be` parameter)
4. **Generates ExtensionWrapper** - Creates boilerplate with ExtensionSDK
5. **Creates MIGRATION_GUIDE.md** - Detailed manual change instructions

### Generated Files

#### ExtensionWrapper Template

```javascript
const { ExtensionSDK } = require('@ghost/extension-sdk');

class MyExtension {
    constructor(extensionId, coreHandler) {
        this.extensionId = extensionId;
        this.sdk = new ExtensionSDK(extensionId, { coreHandler });
    }

    async initialize() {
        console.log('Extension initialized');
    }

    async handleCommand(params) {
        // Command routing
    }

    // Helper methods with SDK
    async readFile(path) {
        return await this.sdk.requestFileRead({ path, encoding: 'utf8' });
    }
}

function createExtension(extensionId, coreHandler) {
    return new MyExtension(extensionId, coreHandler);
}

module.exports = { MyExtension, createExtension };
```

#### MIGRATION_GUIDE.md

Comprehensive guide including:
- Overview of changes
- List of modified/created files
- Manual changes required with priority levels
- Code pattern examples (before/after)
- Testing instructions
- Common migration patterns
- Rollback instructions

## CLI Integration

### Command

```bash
ghost extension migrate [path] [--apply] [--no-backup]
```

### Options

- `[path]` - Path to extension directory (default: current directory)
- `--apply` - Apply migration changes automatically
- `--no-backup` - Skip creating backup files

### Examples

```bash
# Analyze extension
ghost extension migrate

# Analyze specific extension
ghost extension migrate ./my-extension

# Apply migration with backup
ghost extension migrate --apply

# Apply migration without backup
ghost extension migrate --apply --no-backup
```

### Help Text Updates

Updated in multiple locations:
- `ghost extension help` - Added migrate command
- `ghost --help` - Added migrate to extension management section
- `ghost completion` - Added migrate to shell completion
- `ghost extension migrate` suggestions - Added to command suggestions

## Documentation

### Created Files

1. **docs/EXTENSION_MIGRATION.md** - Complete migration guide
   - v0.x → v1.0.0 overview
   - Migration tool usage
   - Step-by-step migration process
   - Common migration patterns
   - ExtensionSDK API reference
   - Troubleshooting guide

2. **core/examples/v0-extension-migration-sample.js** - Sample v0.x extension
   - Demonstrates all legacy patterns
   - Includes before/after examples
   - Testing instructions

3. **core/examples/v0-extension-migration-manifest.json** - Sample v0.x manifest
   - Missing `be` parameter
   - Comments explaining issues
   - Migration notes

### Updated Files

1. **README.md** - Added migration command to CLI commands and documentation links
2. **docs/DEVELOPER_TOOLKIT.md** - Added migration tool section with examples
3. **docs/QUICK_REFERENCE.md** - Added migrate command to CLI reference

## Migration Workflow

### Phase 1: Analysis (No Changes)

```bash
ghost extension migrate
```

Output:
- Code pattern analysis
- Manifest validation results
- Migration plan with steps
- Manual changes required

### Phase 2: Apply Automated Changes

```bash
ghost extension migrate --apply
```

Creates:
- `.migration-backup/` directory with original files
- Updated `package.json` with SDK dependency
- Updated `manifest.json` with v1.0.0 fields
- `extension-wrapper.js` with SDK boilerplate
- `MIGRATION_GUIDE.md` with instructions

### Phase 3: Manual Changes

Follow `MIGRATION_GUIDE.md`:
1. Update RPC client constructor with coreHandler
2. Replace direct fs operations with SDK methods
3. Replace direct network operations with SDK methods
4. Replace direct git operations with SDK methods
5. Update exports to factory pattern

### Phase 4: Validation

```bash
npm install
ghost extension validate
ghost extension install .
```

## Technical Architecture

### Class: ExtensionMigrator

**Methods:**

- `migrate(extensionPath, flags)` - Main entry point
- `analyzeCode(content, manifest)` - Detects legacy patterns
- `validateManifestV1(manifest)` - Validates v1.0.0 compatibility
- `generateMigrationPlan(analysis, manifest, path)` - Creates migration plan
- `applyMigration(plan, path, mainPath, manifest, flags)` - Applies changes
- `generateExtensionWrapper(manifest)` - Creates SDK wrapper template
- `generateMigrationGuide(plan, manifest)` - Creates guide document
- `printAnalysis(analysis)` - Formats analysis output
- `printManifestValidation(validation)` - Formats validation output
- `printMigrationPlan(plan)` - Formats plan output
- `toPascalCase(str)` - Utility for class name generation

### Color Output

Uses ANSI color codes for enhanced readability:
- 🟢 Green - Success indicators
- 🟡 Yellow - Warnings
- 🔴 Red - Errors
- 🔵 Cyan - Info
- ⚪ Dim - Additional context

### Error Handling

- Validates extension directory exists
- Checks for manifest.json
- Validates manifest JSON syntax
- Verifies main file exists
- Handles backup failures gracefully

## Example Output

```
Ghost Extension Migration Tool v1.0.0
────────────────────────────────────────────────────────

Analyzing extension at: /path/to/my-extension

✓ Loaded manifest for: My Extension
✓ Loaded main file: index.js

Step 1: Analyzing code patterns
Code Pattern Analysis:
  • Export pattern: class
  • Uses ExtensionRPCClient (legacy)
  ⚠ Missing coreHandler injection
  ⚠ Direct fs module usage detected
  ⚠ Direct git command execution detected

Legacy patterns found:
  1. [high] Direct fs module usage
     → Use ExtensionSDK.requestFileRead/Write methods
  2. [medium] Direct git command execution
     → Use ExtensionSDK.requestGitExec method
  3. [critical] RPC client without coreHandler injection
     → Update RPC client constructor to accept coreHandler parameter

Step 2: Validating manifest compatibility
  ✓ Manifest is v1.0.0 compatible

Required upgrades:
  1. capabilities.network.rateLimit.be
     Current: undefined
     Suggested: 50
     Reason: v1.0.0 requires "be" (excess burst) parameter
  2. dependencies["@ghost/extension-sdk"]
     Current: not present
     Suggested: ^1.0.0
     Reason: v1.0.0 extensions should use @ghost/extension-sdk package

Step 3: Generating migration plan
Migration steps:
  1. ● Add @ghost/extension-sdk dependency to package.json
     Type: file-modify | File: package.json
  2. ● Update manifest.json for v1.0.0 compatibility
     Type: file-modify | File: manifest.json
  3. ● Generate ExtensionWrapper with ExtensionSDK
     Type: file-create | File: extension-wrapper.js
  4. ● Update main entry point to use ExtensionWrapper
     Type: file-modify | File: index.js

Manual changes required: 3
  1. [critical] index.js: RPC client constructor needs coreHandler parameter
  2. [high] index.js: Direct I/O operations detected

Files to create: 1
Files to modify: 3
Files to backup: 2

Run with --apply flag to apply migration changes
Example: ghost extension migrate --apply
```

## Testing

### Manual Testing

1. Create test extension with v0.x patterns:
   ```bash
   mkdir test-ext
   cd test-ext
   cp core/examples/v0-extension-migration-sample.js index.js
   cp core/examples/v0-extension-migration-manifest.json manifest.json
   ```

2. Run migration analysis:
   ```bash
   ghost extension migrate
   ```

3. Apply migration:
   ```bash
   ghost extension migrate --apply
   ```

4. Review generated files:
   ```bash
   cat MIGRATION_GUIDE.md
   cat extension-wrapper.js
   cat manifest.json
   ```

5. Validate migrated extension:
   ```bash
   npm install
   ghost extension validate
   ```

### Integration with Existing Extensions

The ghost-git-extension serves as a reference v1.0.0 implementation:
- Uses ExtensionSDK properly
- Has coreHandler injection
- All I/O through SDK methods
- v1.0.0 compatible manifest

## Benefits

1. **Automated Detection** - Identifies all legacy patterns automatically
2. **Safe Migration** - Backs up files before changes
3. **Guided Process** - Detailed migration guide with examples
4. **Manifest Upgrades** - Automatically updates to v1.0.0 spec
5. **SDK Integration** - Generates proper SDK boilerplate
6. **Validation** - Checks v1.0.0 compatibility
7. **Documentation** - Creates comprehensive guide for manual steps

## Future Enhancements

Potential improvements:
1. Automated code transformation for simple patterns
2. Interactive mode with prompts
3. Dry-run mode with detailed preview
4. Support for TypeScript extensions
5. Git commit integration
6. Rollback command
7. Migration verification tests
8. Batch migration for multiple extensions

## Files Changed

### New Files
- `core/extension-migrator.js` - Main migration tool
- `docs/EXTENSION_MIGRATION.md` - Migration guide
- `core/examples/v0-extension-migration-sample.js` - Sample v0.x extension
- `core/examples/v0-extension-migration-manifest.json` - Sample v0.x manifest

### Modified Files
- `ghost.js` - Added migrate command handler, help text, completion
- `README.md` - Added migration command and documentation link
- `docs/DEVELOPER_TOOLKIT.md` - Added migration tool section
- `docs/QUICK_REFERENCE.md` - Added migrate command

## Summary

The extension migration tool provides a comprehensive solution for upgrading v0.x extensions to v1.0.0 SDK. It automates detection of legacy patterns, validates manifest compatibility, applies automated changes, and generates detailed migration guides for manual changes. This ensures a smooth transition path for extension developers while maintaining code quality and security standards.
