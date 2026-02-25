# Extension Tests

This directory contains comprehensive tests for Ghost CLI's extension system, covering extension loading, validation, isolation, and execution.

## Test Files

### `extension-loader.test.js`
**50 comprehensive unit tests** for the admission controller logic in `core/extension-loader.js`.

Tests cover:
- ✅ Manifest validation (all required fields)
- ✅ Type validation (string, object, array, boolean checks)
- ✅ Format validation (regex patterns for id, version, URLs)
- ✅ Capability validation (filesystem, network, git, hooks)
- ✅ Main file existence verification
- ✅ JSON parsing error handling
- ✅ Error logging verification
- ✅ Edge cases and graceful degradation

See [`EXTENSION_LOADER_TEST_COVERAGE.md`](./EXTENSION_LOADER_TEST_COVERAGE.md) for detailed coverage documentation.

### `git-extension.test.js`
End-to-end tests for the Ghost Git Extension, including:
- Extension initialization and RPC handling
- Git operations (status, diff, commit)
- Secret scanning and entropy calculation
- Version management (semver parsing, bumping)
- Conventional commit message parsing
- Gateway integration and authorization

### `isolation.test.js`
Tests for extension process isolation and fault tolerance:
- Extension crash handling and recovery
- Auto-restart after failures
- Concurrent extension execution
- Timeout handling
- Clean shutdown procedures
- Error event propagation

## Running Tests

Run all extension tests:
```bash
npm test
```

Run a specific test file:
```bash
node test/extensions/extension-loader.test.js
node test/extensions/git-extension.test.js
node test/extensions/isolation.test.js
```

## Test Philosophy

### Fail-Closed Security Model
All tests verify Ghost's fail-closed security approach:
- Invalid configurations are rejected (no defaults)
- Missing resources cause load failures
- Validation errors are logged explicitly
- Extensions cannot bypass security checks

### Comprehensive Coverage
Tests cover:
- ✅ Happy path (valid configurations)
- ✅ Error paths (invalid configurations)
- ✅ Edge cases (empty strings, null values, malformed JSON)
- ✅ Type mismatches (string vs number, object vs array)
- ✅ Format violations (regex patterns, enums)
- ✅ Security boundaries (URL validation, hook whitelisting)

### Test Output
Each test provides clear output:
```
▶ Test N: Description
✅ Expected behavior verified
```

Failed tests show:
```
❌ Test failed: Error message
[Stack trace]
```

## Extension Loader Validation Rules

The admission controller validates all aspects of extension manifests:

### Required Fields
- `id` - Lowercase alphanumeric with hyphens
- `name` - Non-empty string
- `version` - Semver format (X.Y.Z)
- `main` - Non-empty string, file must exist
- `capabilities` - Object (not null, not array)

### Capabilities Validation
- **Filesystem**: `read` and `write` must be arrays (if present)
- **Network**: `allowlist` must be array of valid URLs (protocol + domain only)
- **Network Rate Limit**: `cir` and `bc` must be positive integers, `be` must be non-negative
- **Git**: `read` and `write` must be booleans (if present)
- **Hooks**: Must be array of whitelisted hook names (if present)

### Fail Conditions
Extensions are rejected if:
- Required fields are missing or invalid
- Field types don't match expectations
- Format patterns are violated
- Main file doesn't exist
- JSON is malformed
- Capability declarations are invalid

## Test Maintenance

When adding new validation rules:
1. Add validation logic to `core/extension-loader.js`
2. Add corresponding tests to `extension-loader.test.js`
3. Update `EXTENSION_LOADER_TEST_COVERAGE.md` with new rules
4. Ensure error messages are descriptive and logged

## Related Documentation

- [`EXTENSION_LOADER_TEST_COVERAGE.md`](./EXTENSION_LOADER_TEST_COVERAGE.md) - Detailed test coverage
- [`../../core/manifest-schema.json`](../../core/manifest-schema.json) - Complete manifest schema
- [`../../docs/extension-api.md`](../../docs/extension-api.md) - Extension API documentation
- [`../../AGENTS.md`](../../AGENTS.md) - Agent development guide
