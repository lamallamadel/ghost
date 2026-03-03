# Extension Workflow E2E Test Suite

Comprehensive end-to-end testing for the complete Ghost extension development workflow, from template scaffolding to marketplace installation and version upgrades.

## Overview

This test suite validates the entire extension lifecycle:

1. **Template Scaffolding** - Generate extensions from gallery templates
2. **Manifest Editing** - Modify and validate extension manifests
3. **Glob Pattern Validation** - Test filesystem permission patterns
4. **Schema Validation** - Validate manifest structure and required fields
5. **Registry Simulation** - Mock package registry and metadata
6. **Extension Installation** - Install extensions via local path
7. **Version Upgrades** - Test extension update workflow
8. **Desktop UI** - Playwright tests for IntentPlayground and ManifestEditor
9. **Registry API** - Search, browse, and install from marketplace

## Test Files

### Core Test Suite

**`extension-workflow.test.js`** - Main Node.js test suite covering:
- Template scaffolding from api-integration and file-processor templates
- Manifest modification and validation
- Invalid glob pattern detection
- Schema validation for incomplete manifests
- Registry metadata creation and verification
- Extension installation and listing
- Version upgrade path (1.0.0 → 1.1.0)
- Registry search, browse, and checksum verification
- Template structure and code validation

### Desktop UI Tests

**`desktop-playground-workflow.spec.js`** - Playwright/Electron tests for:
- **ManifestEditor Component**
  - Display manifest editor with default template
  - Validate correct manifest structure
  - Detect invalid glob patterns
  - Detect missing required fields
  - Validate network capabilities
  - Export manifest to file
  
- **IntentPlayground Component**
  - Display intent playground interface
  - Execute filesystem read intents
  - Validate intent parameters
  - Display execution duration
  - Switch between intent types (filesystem, network, git)
  - Provide intent templates
  
- **Extension Manager Integration**
  - Navigate to extension manager tab
  - Display installed extensions
  - Show extension details
  - Toggle extension enabled/disabled
  
- **Registry Marketplace**
  - Navigate to marketplace view
  - Search for extensions
  - Display extension details
  - Install extensions
  
- **Version Upgrades**
  - Show update notifications
  - Trigger extension updates

### Test Fixtures

**`fixtures/template-fixtures.js`** - Reusable test data:
- `apiIntegrationTemplate` - Full API integration extension fixture
- `fileProcessorTemplate` - File processor extension fixture
- `gitWorkflowTemplate` - Git workflow hooks fixture
- `invalidFixtures` - Invalid manifests for error testing
- `registryMockData` - Mock registry with extension metadata
- `scaffoldTemplate()` - Helper to create extension from template
- `createSdkMock()` - Helper to mock @ghost/extension-sdk

## Running Tests

### Node.js Test Suite

```bash
# Run from project root
npm test

# Run specific E2E test
node test/e2e/extension-workflow.test.js
```

### Playwright Desktop Tests

```bash
# Run from desktop directory
cd desktop
npm run test:e2e

# Run with UI
npm run test:e2e:ui

# Run in headed mode
npm run test:e2e:headed

# Debug mode
npm run test:e2e:debug
```

## Test Phases

### Phase 1: Template Scaffolding
- Scaffold extensions from `api-integration` and `file-processor` templates
- Verify generated directory structure
- Validate manifest.json, index.js, package.json, README.md

### Phase 2: Manifest Editing & Validation
- Modify manifests with additional capabilities
- Validate with `ghost extension validate`
- Test invalid glob patterns: `**[invalid`
- Test incomplete manifests (missing version, main, capabilities)
- Verify validation error messages

### Phase 3: Registry Publication Simulation
- Create package metadata files
- Build registry index with extensions list
- Validate metadata structure (id, version, checksum, published)
- Verify registry JSON structure

### Phase 4: Marketplace Install Workflow
- Install extensions via `ghost extension install <path>`
- Verify installation in `~/.ghost/extensions/`
- List installed extensions
- Verify manifest and code files copied correctly

### Phase 5: Version Upgrade Path
- Create v1.1.0 of existing extension
- Validate upgraded version
- Reinstall/upgrade extension
- Verify new version in installed location

### Phase 6: Desktop Playground UI
- Test ManifestEditor for validation and editing
- Test IntentPlayground for intent execution
- Test Extension Manager for extension lifecycle
- Test Registry/Marketplace for browsing and installation

### Phase 7: Registry API Flows
- Simulate registry search by keyword
- Retrieve extension info by ID
- Browse extensions by category
- Verify package checksums (SHA256)

### Phase 8: Template Output Validation
- Validate template file structure
- Verify manifest content (capabilities, commands)
- Validate generated code (ExtensionSDK usage, class structure)
- Check for required methods (init, cleanup)

## Test Coverage

### Commands Tested
- `ghost extension init <name> --template <type>`
- `ghost extension validate [path]`
- `ghost extension install <path>`
- `ghost extension list`
- `ghost extension remove <id>`
- `ghost marketplace search <query>`
- `ghost marketplace install <id>`

### Validation Rules Tested
✅ Required fields: id, name, version, main, capabilities
✅ Semantic versioning format (X.Y.Z)
✅ Glob pattern syntax
✅ Network URL validation
✅ Rate limit parameters (cir, bc, be)
✅ File existence (main entry point)
✅ Capability permissions structure

### Templates Tested
✅ api-integration - REST/GraphQL client with auth
✅ file-processor - Batch file operations
✅ git-workflow - Git hooks (mock in fixtures)

### UI Components Tested
✅ ManifestEditor.tsx - Manifest validation UI
✅ IntentPlayground.tsx - Intent execution UI
✅ Extension Manager - Extension lifecycle management
✅ Registry/Marketplace - Browse and install

## Fixtures

### Template Fixtures
Pre-built extension templates with complete file structure:
- manifest.json with proper capabilities
- index.js with ExtensionSDK integration
- package.json with dependencies
- README.md with usage instructions

### Invalid Fixtures
Test cases for validation errors:
- `missingRequiredFields` - Incomplete manifest
- `invalidGlobPattern` - Malformed glob patterns
- `invalidNetworkUrl` - Invalid URL formats
- `missingRateLimitFields` - Incomplete rate limit config

### Registry Mock Data
Simulated registry with 3 extensions:
- api-integration-test (API category)
- file-processor-test (Utilities category)
- git-workflow-test (Git category)

Each with metadata: id, version, description, author, category, downloadUrl, checksum, size, published date, download count

## Test Utilities

### Helper Functions
- `sh(cmd, cwd, env)` - Execute shell command
- `trySh(cmd, cwd, env)` - Execute shell command with error handling
- `scaffoldTemplate(template, dir)` - Create extension from template
- `createSdkMock(dir)` - Mock @ghost/extension-sdk

### Test Environment
- Temporary directories for isolation
- Custom HOME directory to avoid polluting user's `.ghost/`
- Git repository initialization for testing
- Mock SDK to avoid external dependencies

## Output

### Test Report
Tests generate a JSON report with:
```json
{
  "timestamp": "2024-01-01T00:00:00.000Z",
  "summary": {
    "Template Scaffolding": "PASS",
    "Manifest Validation": "PASS",
    "...": "PASS"
  },
  "stats": {
    "passed": 15,
    "skipped": 1,
    "total": 16
  },
  "fixtures": {
    "apiIntegration": "/tmp/...",
    "fileProcessor": "/tmp/...",
    "registry": "/tmp/..."
  }
}
```

### Console Output
Organized by phase with emojis and progress indicators:
```
================================================================================
PHASE 1: Extension Scaffolding from Templates
================================================================================

✨ Step 1.1: Scaffold extension from api-integration template
  ✅ API integration template scaffolded

✨ Step 1.2: Scaffold extension from file-processor template
  ✅ File processor template scaffolded
```

## CI/CD Integration

### GitHub Actions
```yaml
- name: Run E2E Tests
  run: |
    npm test
    cd desktop && npm run test:e2e
```

### Test Artifacts
- Test reports (JSON)
- Playwright screenshots (on failure)
- Playwright videos (on failure)
- Extension fixtures (temporary)

## Troubleshooting

### Common Issues

**Playwright not launching Electron**
```bash
cd desktop
npm install
npx playwright install
```

**Template scaffolding fails**
- Check if templates exist in `core/templates/`
- Verify template wizard is functional
- Use fixtures as fallback

**Extension installation fails**
- Verify HOME directory is writable
- Check `.ghost/extensions/` directory exists
- Ensure manifest.json is valid

**Desktop tests timeout**
- Increase timeout in playwright.config.ts
- Check if Vite dev server is running
- Verify Electron launches correctly

## Future Enhancements

- [ ] Add WebSocket telemetry testing
- [ ] Test extension hot reload workflow
- [ ] Test extension dependency resolution
- [ ] Add performance benchmarks
- [ ] Test extension migration (v0.x → v1.0)
- [ ] Add visual regression testing
- [ ] Test CLI output formatting
- [ ] Add accessibility testing (a11y)

## Related Documentation

- [Extension API](../../docs/extension-api.md)
- [Extension Examples](../../docs/extension-examples.md)
- [Template Gallery](../../docs/TEMPLATE_GALLERY.md)
- [Developer Toolkit](../../docs/DEVELOPER_TOOLKIT.md)
- [Quick Reference](../../docs/QUICK_REFERENCE.md)
