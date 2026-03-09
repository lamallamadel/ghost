# E2E Test Suite Setup Verification

Run these commands to verify the E2E test suite is properly set up:

## 1. Check File Structure

```bash
# Verify all test files exist
ls -la e2e/*.e2e.ts

# Expected output (8 files):
# - websocket-telemetry.e2e.ts
# - pipeline-visualization.e2e.ts
# - extension-manager.e2e.ts
# - manual-override.e2e.ts
# - visual-regression.e2e.ts
# - performance-benchmarks.e2e.ts
# - integration-full-workflow.e2e.ts

# Verify helper files
ls -la e2e/fixtures/
ls -la e2e/helpers/
ls -la e2e/utils/

# Expected helpers:
# - e2e/fixtures/electron.ts
# - e2e/helpers/websocket-mock.ts
# - e2e/helpers/screenshot-helpers.ts
# - e2e/utils/test-data-generator.ts
# - e2e/utils/performance-helpers.ts
```

## 2. Verify Configuration Files

```bash
# Check Playwright config
cat playwright.config.ts

# Check package.json for scripts
grep -A 4 '"test:e2e"' package.json

# Expected scripts:
# "test:e2e": "playwright test"
# "test:e2e:ui": "playwright test --ui"
# "test:e2e:headed": "playwright test --headed"
# "test:e2e:debug": "playwright test --debug"
```

## 3. Verify Dependencies

```bash
# Check if @playwright/test is installed
npm ls @playwright/test

# Check if playwright-core is installed
npm ls playwright-core

# Both should show version ^1.49.0
```

## 4. Test Playwright Installation

```bash
# Check Playwright version
npx playwright --version

# Should show: Version 1.49.x or higher
```

## 5. Verify Documentation

```bash
# Check if all documentation files exist
ls -la E2E*.md e2e/README.md e2e/QUICK_REFERENCE.md

# Expected files:
# - E2E_SETUP.md
# - E2E_TEST_SUITE_SUMMARY.md
# - E2E_IMPLEMENTATION_CHECKLIST.md
# - e2e/README.md
# - e2e/QUICK_REFERENCE.md
```

## 6. Verify Setup Scripts

```bash
# Check setup scripts exist and are executable
ls -la e2e-setup.sh e2e-setup.ps1

# Make setup script executable (Linux/macOS)
chmod +x e2e-setup.sh
```

## 7. Quick Validation Test

```bash
# Install dependencies (if not already done)
npm install

# Run TypeScript check on test files
npx tsc --noEmit e2e/**/*.ts

# This will show any TypeScript errors in test files
```

## 8. Verify CI/CD Workflow

```bash
# Check GitHub Actions workflow
cat ../.github/workflows/desktop-e2e-tests.yml

# Should contain workflow for Ubuntu, Windows, and macOS
```

## 9. Test Single File (Smoke Test)

```bash
# Install Playwright browsers first
npx playwright install chromium

# Try running a single test file (dry run)
npx playwright test websocket-telemetry.e2e.ts --list

# Should list 10 tests from the file
```

## 10. Full Setup Verification

```bash
# Run complete setup
npm install
npx playwright install --with-deps
npm run build

# Create screenshot directory
mkdir -p e2e/screenshots/baseline

# Run a quick test
npx playwright test websocket-telemetry.e2e.ts --headed

# Watch for:
# - Electron app launches
# - Tests execute
# - No critical errors
```

## Expected Output Summary

### File Count
- Test files: 7 (.e2e.ts files)
- Helper files: 3 (fixtures, helpers, utils)
- Utility files: 2 (test-data-generator, performance-helpers)
- Config files: 1 (playwright.config.ts)
- Documentation: 5 (MD files)
- Setup scripts: 2 (.sh and .ps1)
- **Total: 20+ files**

### Test Count
- WebSocket tests: 10
- Pipeline tests: 10
- Extension Manager tests: 10
- Manual Override tests: 10
- Visual Regression tests: 15
- Performance tests: 10
- Integration tests: 10
- **Total: 75+ tests**

### Dependencies
- @playwright/test: ✅
- playwright-core: ✅
- electron: ✅ (already installed)

### Scripts
- test:e2e: ✅
- test:e2e:ui: ✅
- test:e2e:headed: ✅
- test:e2e:debug: ✅

## Troubleshooting Verification Issues

### "Cannot find module '@playwright/test'"
```bash
npm install --save-dev @playwright/test playwright-core
```

### "playwright command not found"
```bash
npx playwright install
```

### "Electron app won't launch"
```bash
npm run build
```

### TypeScript errors in tests
```bash
# Check tsconfig.json includes e2e directory
# Ensure all imports are correct
npm run check
```

## Next Steps After Verification

1. ✅ Run full setup: `./e2e-setup.sh` or `.\e2e-setup.ps1`
2. ✅ Execute test suite: `npm run test:e2e`
3. ✅ View report: `npx playwright show-report`
4. ✅ Update baselines: `npx playwright test --update-snapshots`

## Success Criteria

All of these should be true:
- [ ] All 7 test files exist in `e2e/` directory
- [ ] All helper files exist in subdirectories
- [ ] Playwright config exists and is valid
- [ ] NPM scripts are defined in package.json
- [ ] Dependencies are installed (@playwright/test)
- [ ] Documentation files are present
- [ ] Setup scripts exist and are executable
- [ ] GitHub Actions workflow exists
- [ ] TypeScript compilation succeeds
- [ ] Single test file can run without errors

## Verification Complete ✅

If all checks pass, the E2E test suite is properly set up and ready to use!

Run `npm run test:e2e` to execute the full test suite.
