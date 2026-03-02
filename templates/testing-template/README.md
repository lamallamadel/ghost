# Testing Template

Complete testing template with Vitest configuration, mock RPC client, integration tests, and coverage reporting.

## Features

- **Test Runner Integration**: Ready-to-use test execution
- **Mock RPC Client**: Test pipeline interactions without real calls
- **Coverage Reporting**: Multiple formats (HTML, JSON, text, LCOV)
- **Integration Tests**: Examples for testing extension functionality
- **Test Scenarios**: Pre-built success, error, and timeout scenarios
- **Coverage Thresholds**: Enforce minimum coverage requirements

## Installation

```bash
ghost extension install .
```

## Usage

### Run Tests

```bash
# Run all tests
ghost run-tests

# Run with coverage
ghost run-tests --coverage

# Watch mode
ghost run-tests --watch

# Specific pattern
ghost run-tests --pattern "**/*.integration.test.js"

# Custom reporter
ghost run-tests --reporter json
```

### Generate Coverage Reports

```bash
# HTML report (default)
ghost generate-coverage

# JSON format
ghost generate-coverage --format json

# Custom output directory
ghost generate-coverage --output ./reports/coverage

# With threshold enforcement
ghost generate-coverage --threshold 90
```

### Mock RPC Testing

```bash
# Test success scenario
ghost mock-test --scenario success

# Test error handling
ghost mock-test --scenario error

# Test timeout behavior
ghost mock-test --scenario timeout

# Multiple iterations
ghost mock-test --scenario success --iterations 10
```

## Mock RPC Client

The template includes a fully-functional mock RPC client for testing:

```javascript
// Use in your tests
const mockClient = extension.mockRPCClient;

// Successful call
const result = await mockClient.call('method.name', { param: 'value' });

// Simulate error
const errorResult = await mockClient.callWithError('method.name', {});

// Test timeout handling
const timeoutResult = await mockClient.callWithTimeout('method.name', {}, 5000);
```

## Writing Tests

### Unit Test Example

```javascript
// test/unit/extension.test.js
const assert = require('assert');
const MyExtension = require('../../index');

describe('MyExtension', () => {
    let extension;

    beforeEach(async () => {
        extension = new MyExtension();
        await extension.init({});
    });

    it('should initialize correctly', () => {
        assert.ok(extension.context);
    });

    it('should process data', async () => {
        const result = await extension.processData({ input: 'test' });
        assert.strictEqual(result.success, true);
    });
});
```

### Integration Test Example

```javascript
// test/integration/pipeline.test.js
const assert = require('assert');
const MyExtension = require('../../index');

describe('Pipeline Integration', () => {
    let extension;
    let mockCore;

    beforeEach(async () => {
        extension = new MyExtension();
        
        mockCore = {
            coreHandler: async (request) => {
                return {
                    jsonrpc: '2.0',
                    id: request.id,
                    result: { success: true }
                };
            }
        };
        
        await extension.init(mockCore);
    });

    it('should call pipeline through core handler', async () => {
        const result = await extension.context.coreHandler({
            method: 'test',
            params: {}
        });
        
        assert.strictEqual(result.result.success, true);
    });
});
```

## Test Configuration

### Vitest Config Example

Create `vitest.config.js`:

```javascript
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            exclude: [
                'node_modules/',
                'test/',
                '**/*.config.js'
            ],
            statements: 80,
            branches: 75,
            functions: 80,
            lines: 80
        }
    }
});
```

## Coverage Formats

### HTML Report

Interactive HTML report with file-by-file breakdown:
```bash
ghost generate-coverage --format html --output coverage/
# Open coverage/coverage.html in browser
```

### JSON Report

Machine-readable JSON for CI integration:
```bash
ghost generate-coverage --format json --output coverage/
```

### Text Report

Simple text output for console:
```bash
ghost generate-coverage --format text
```

### LCOV Report

For integration with code quality tools:
```bash
ghost generate-coverage --format lcov --output coverage/
```

## CI Integration

### GitHub Actions Example

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      
      - run: npm install
      - run: ghost run-tests --coverage
      - run: ghost generate-coverage --format lcov --threshold 80
      
      - uses: codecov/codecov-action@v3
        with:
          files: ./coverage/coverage.lcov
```

### GitLab CI Example

```yaml
test:
  stage: test
  script:
    - npm install
    - ghost run-tests --coverage
    - ghost generate-coverage --format json --threshold 85
  coverage: '/Lines\s*:\s*(\d+\.?\d*)%/'
  artifacts:
    reports:
      coverage_report:
        coverage_format: cobertura
        path: coverage/coverage.json
```

## Test Scenarios

### Success Scenario

Tests normal operation flow:
```bash
ghost mock-test --scenario success
```

### Error Scenario

Tests error handling:
```bash
ghost mock-test --scenario error
```

### Timeout Scenario

Tests timeout behavior:
```bash
ghost mock-test --scenario timeout
```

## Coverage Thresholds

Enforce minimum coverage:

```bash
# Fail if coverage below 80%
ghost generate-coverage --threshold 80

# Strict threshold (90%)
ghost generate-coverage --threshold 90
```

## Best Practices

1. **Write Tests First**: Use TDD approach
2. **Mock External Dependencies**: Use mock RPC client
3. **Test Edge Cases**: Include error scenarios
4. **Maintain Coverage**: Keep above 80%
5. **Integration Tests**: Test full workflows
6. **CI Integration**: Run tests automatically

## Testing Checklist

- [ ] Unit tests for all public methods
- [ ] Integration tests for pipelines
- [ ] Error handling tests
- [ ] Edge case coverage
- [ ] Mock RPC interactions
- [ ] Coverage above threshold
- [ ] CI pipeline configured

## Examples

### Example 1: TDD Workflow

```bash
# 1. Write failing test
# 2. Run tests
ghost run-tests --watch

# 3. Implement feature
# 4. Tests pass automatically
# 5. Check coverage
ghost generate-coverage
```

### Example 2: Pre-commit Hook

```bash
# .git/hooks/pre-commit
#!/bin/bash
ghost run-tests || exit 1
ghost generate-coverage --threshold 80 || exit 1
```

### Example 3: CI Pipeline

```bash
# Run full test suite with coverage
ghost run-tests --coverage --reporter json > test-results.json
ghost generate-coverage --format lcov --threshold 85
```

## Troubleshooting

### Tests Not Running

Check that test files match pattern:
```bash
ghost run-tests --pattern "**/*.test.js"
```

### Low Coverage

Identify uncovered code:
```bash
ghost generate-coverage --format html
# Open coverage/coverage.html
```

### Mock Client Issues

Ensure proper initialization:
```javascript
await extension.init({ coreHandler: mockCore.coreHandler });
```

## License

MIT
