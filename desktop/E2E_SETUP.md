# E2E Test Setup Instructions

## Prerequisites

- Node.js 18 or higher
- npm 9 or higher
- Sufficient disk space for Playwright browsers (~1GB)

## Quick Setup

### Windows (PowerShell)
```powershell
cd desktop
.\e2e-setup.ps1
```

### Linux/macOS (Bash)
```bash
cd desktop
chmod +x e2e-setup.sh
./e2e-setup.sh
```

### Manual Setup

1. Install dependencies:
```bash
npm install
```

2. Install Playwright browsers:
```bash
npx playwright install --with-deps
```

3. Build the application:
```bash
npm run build
```

4. Create required directories:
```bash
mkdir -p e2e/screenshots/baseline
mkdir -p test-results
mkdir -p playwright-report
```

## Running Tests

### Run all tests
```bash
npm run test:e2e
```

### Run with Playwright UI (interactive)
```bash
npm run test:e2e:ui
```

### Run in headed mode (see browser)
```bash
npm run test:e2e:headed
```

### Debug tests
```bash
npm run test:e2e:debug
```

### Run specific test file
```bash
npx playwright test websocket-telemetry.e2e.ts
```

### Run tests matching a pattern
```bash
npx playwright test --grep "pipeline"
```

### Update visual regression baselines
```bash
npx playwright test --update-snapshots
```

## Test Reports

After running tests, view the HTML report:
```bash
npx playwright show-report
```

Reports are generated in `playwright-report/` directory.

## Troubleshooting

### Electron app fails to launch
- Ensure you've run `npm run build` in the desktop directory
- Check that Vite dev server dependencies are installed
- Verify Electron is properly installed: `npx electron --version`

### WebSocket connection errors
- Tests use mocked WebSockets by default
- Real WebSocket server is not required for tests
- Check console output for mock initialization errors

### Visual regression test failures
- Screenshots may differ slightly across platforms
- Adjust `maxDiffPixels` and `threshold` in test files
- Update baselines with `--update-snapshots` if UI changes are intentional

### Timeout errors
- Increase timeout in `playwright.config.ts` if needed
- Some tests wait for animations to complete
- CI environments may be slower than local machines

### Memory issues during performance tests
- Performance tests generate large amounts of test data
- Reduce iteration counts in `performance-benchmarks.e2e.ts` if needed
- Monitor system resources during test execution

## CI/CD Integration

Tests automatically run in GitHub Actions on:
- Push to main/develop branches
- Pull requests targeting main/develop
- Changes in desktop/ directory

View workflow: `.github/workflows/desktop-e2e-tests.yml`

## Development Tips

1. **Use headed mode during development**: `npm run test:e2e:headed`
2. **Debug specific test**: Add `test.only()` and use debug mode
3. **Pause test execution**: Add `await page.pause()` in test code
4. **Inspect elements**: Use Playwright Inspector with `PWDEBUG=1`
5. **View trace files**: Failed tests generate traces in `test-results/`

## Test Structure

```
desktop/e2e/
├── fixtures/
│   └── electron.ts              # Electron app test fixtures
├── helpers/
│   ├── websocket-mock.ts        # WebSocket mocking utilities
│   └── screenshot-helpers.ts    # Visual regression helpers
├── utils/
│   ├── test-data-generator.ts   # Test data factories
│   └── performance-helpers.ts   # Performance measurement utils
├── websocket-telemetry.e2e.ts   # WebSocket integration tests
├── pipeline-visualization.e2e.ts # Pipeline animation tests
├── extension-manager.e2e.ts     # Extension manager tests
├── manual-override.e2e.ts       # Manual override workflow tests
├── visual-regression.e2e.ts     # Visual regression tests
├── performance-benchmarks.e2e.ts # Performance tests
├── integration-full-workflow.e2e.ts # Full integration tests
└── README.md                    # Detailed test documentation
```

## Contributing

When adding new tests:
1. Follow existing patterns in test files
2. Use helper utilities for common operations
3. Add meaningful test descriptions
4. Include proper timeouts for slow operations
5. Update documentation in `e2e/README.md`

## Support

For issues or questions:
1. Check test logs in `test-results/` directory
2. Review Playwright documentation: https://playwright.dev/
3. Check existing issues in repository
4. Create new issue with test failure details
