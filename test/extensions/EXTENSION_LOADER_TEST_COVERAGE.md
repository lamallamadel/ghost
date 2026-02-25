# Extension Loader Test Coverage

## Overview

Comprehensive unit test suite for `core/extension-loader.js` admission controller logic. This test suite validates the fail-closed security model for extension manifest validation and loading.

## Test Organization

### Valid Manifest Tests (Tests 1-2)
- ✅ Load valid extension with minimal required fields
- ✅ Load extension with complete manifest (all optional fields)

### Missing Required Fields (Tests 3-7)
- ✅ Reject manifest missing `id` field
- ✅ Reject manifest missing `name` field
- ✅ Reject manifest missing `version` field
- ✅ Reject manifest missing `main` field
- ✅ Reject manifest missing `capabilities` field

### Invalid Field Types (Tests 8-10b)
- ✅ Reject manifest with non-string `id`
- ✅ Reject manifest with non-string `name`
- ✅ Reject manifest with non-object `capabilities` (string)
- ✅ Reject manifest with null `capabilities`
- ✅ Reject manifest with array `capabilities`

### Invalid Field Formats (Tests 11-14)
- ✅ Reject `id` with uppercase characters
- ✅ Reject `id` with special characters (underscore, exclamation)
- ✅ Reject `version` not following semver (X.Y format)
- ✅ Reject `version` with non-numeric parts (X.Y.z)

### Main File Validation (Tests 15-16)
- ✅ Reject extension when main file does not exist
- ✅ Load extension with main file in nested subdirectory

### Filesystem Capability Validation (Tests 17-18)
- ✅ Reject `filesystem.read` as non-array (string)
- ✅ Reject `filesystem.write` as non-array (string)

### Network Capability Validation (Tests 19-25)
- ✅ Reject `network.allowlist` as non-array (string)
- ✅ Reject allowlist URL with path component
- ✅ Reject allowlist URL without protocol
- ✅ Reject `rateLimit.cir` with value ≤ 0
- ✅ Reject `rateLimit.bc` with value < 0
- ✅ Reject `rateLimit.be` with negative value
- ✅ Accept `rateLimit.be` with value = 0

### Git Capability Validation (Tests 26-27)
- ✅ Reject `git.read` as non-boolean (string)
- ✅ Reject `git.write` as non-boolean (number)

### Hooks Capability Validation (Tests 28-30)
- ✅ Reject `hooks` as non-array (string)
- ✅ Reject invalid hook name (not in whitelist)
- ✅ Accept all valid hook names: `pre-commit`, `post-commit`, `pre-push`, `post-checkout`, `commit-msg`, `pre-rebase`

### Malformed JSON (Tests 31-32)
- ✅ Reject manifest with invalid JSON syntax
- ✅ Reject manifest with trailing comma (invalid JSON)

### Multiple Extensions (Test 33)
- ✅ Load multiple valid extensions, skip invalid ones (fail-open for batch loading)

### Edge Cases (Tests 34-40)
- ✅ Skip directory without `manifest.json`
- ✅ Skip non-directory entries in extensions directory
- ✅ Handle non-existent extensions directory (creates it)
- ✅ Extension instantiation failure doesn't block metadata loading
- ✅ `getLoadedExtensions()` returns correct metadata
- ✅ `unload()` removes extension from loaded list
- ✅ Validation error messages are descriptive and logged

### Empty String Validation (Tests 41-44)
- ✅ Reject empty string `id`
- ✅ Reject empty string `name`
- ✅ Reject empty string `version`
- ✅ Reject empty string `main`

### Additional Edge Cases (Tests 45-50)
- ✅ Accept network `rateLimit` with only required fields (no `be`)
- ✅ Reject `rateLimit.cir` as string instead of number
- ✅ Accept localhost URL with port in allowlist
- ✅ Accept git capability with only `read` defined (write undefined)
- ✅ Accept empty `hooks` array
- ✅ Accept empty `filesystem.read` and `filesystem.write` arrays

## Test Statistics

- **Total Tests**: 50
- **Coverage Areas**:
  - Required field validation
  - Type validation
  - Format validation
  - Capability validation (filesystem, network, git, hooks)
  - JSON parsing
  - Main file existence
  - Error logging
  - Edge cases and graceful degradation

## Validation Rules Verified

### ID Field
- Required: ✅
- Type: string ✅
- Format: `^[a-z0-9-]+$` (lowercase alphanumeric with hyphens) ✅
- Not empty: ✅

### Name Field
- Required: ✅
- Type: string ✅
- Not empty: ✅

### Version Field
- Required: ✅
- Type: string ✅
- Format: `^\d+\.\d+\.\d+$` (semver X.Y.Z) ✅
- Not empty: ✅

### Main Field
- Required: ✅
- Type: string ✅
- File must exist: ✅
- Not empty: ✅

### Capabilities Field
- Required: ✅
- Type: object (not null, not array) ✅

#### Filesystem Capabilities
- `read`: array or undefined ✅
- `write`: array or undefined ✅

#### Network Capabilities
- `allowlist`: array or undefined ✅
- URL format: `^https?://[^/]+$` (protocol + domain only) ✅
- `rateLimit.cir`: positive integer (≥ 1) ✅
- `rateLimit.bc`: positive integer (≥ 1) ✅
- `rateLimit.be`: non-negative integer (≥ 0) or undefined ✅

#### Git Capabilities
- `read`: boolean or undefined ✅
- `write`: boolean or undefined ✅

#### Hooks Capabilities
- Type: array or undefined ✅
- Valid hook names: whitelist enforcement ✅
  - `pre-commit` ✅
  - `post-commit` ✅
  - `pre-push` ✅
  - `post-checkout` ✅
  - `commit-msg` ✅
  - `pre-rebase` ✅

## Fail-Closed Security Model

All tests verify the fail-closed security model:
1. **Invalid manifests are rejected** - Extensions with validation errors are not loaded
2. **Missing main files are rejected** - Extensions without executable code are not loaded
3. **Validation failures are logged** - All failures are written to console.error for visibility
4. **Batch loading continues** - Individual extension failures do not stop loading other extensions
5. **Explicit error messages** - Validation errors include detailed information about what failed

## Running Tests

```bash
node test/extensions/extension-loader.test.js
```

Or as part of the full test suite:

```bash
npm test
```

## Test Output Format

Each test outputs:
```
▶ Test N: Description of test
✅ Expected behavior verified
```

Failed tests output:
```
❌ Test failed: Error message
```

## Implementation Coverage

The test suite validates all logic in `core/extension-loader.js`:
- ✅ `discoverAndLoad()` - Directory scanning, manifest detection
- ✅ `loadExtension()` - JSON parsing, validation, instantiation
- ✅ `validateManifest()` - All required field validation
- ✅ `validateCapabilities()` - All capability validation rules
- ✅ `getLoadedExtensions()` - Metadata retrieval
- ✅ `unload()` - Extension cleanup

## Schema Compliance

All tests verify compliance with `core/manifest-schema.json`:
- Required fields enforcement ✅
- Type checking ✅
- Pattern validation (regex) ✅
- Enum validation (hooks) ✅
- Nested object validation ✅
- Array validation ✅
