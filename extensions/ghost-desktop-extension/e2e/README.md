# Ghost Desktop E2E Test Suite

Comprehensive Playwright E2E test suite for the Ghost Console desktop Electron application.

## Test Coverage

### 1. WebSocket Telemetry Integration (`websocket-telemetry.e2e.ts`)
- Connection establishment and reconnection handling
- Real-time span event updates
- Event subscription management
- Batch event processing
- Rate limiting and dropped events
- Data caching for late subscribers
- Connection error handling
- Real-time metric updates

### 2. Pipeline Visualization (`pipeline-visualization.e2e.ts`)
- Four-stage pipeline display (Intercept → Auth → Audit → Execute)
- Animated request flow transitions
- Active request counters per stage
- Stage health indicators (Healthy/Warning/Error)
- Stage metrics (latency, throughput, error rate)
- Dropped request handling with badges
- QoS and SI-10 violation detection
- Request rejection detail expansion
- Smooth handling of rapid transitions

### 3. Extension Manager (`extension-manager.e2e.ts`)
- Extension list loading and display
- Enable/disable extension toggles
- Extension metrics display
- Metadata editing (description, category, tags)
- Individual extension reload
- Gateway-wide reload
- Pending edits tracking
- Extension count display

### 4. Manual Override Dialog (`manual-override.e2e.ts`)
- Override dialog triggering
- Justification validation (minimum 10 characters)
- Override approval/rejection
- Audit log entry creation
- Operator information capture
- Request parameter capture
- Approval confirmation display
- Timestamp tracking
- Audit log verification

### 5. Visual Regression Testing (`visual-regression.e2e.ts`)
- Dashboard home view baseline
- Pipeline visualization layout
- Extension manager view
- Extension card design
- Logs view layout
- Sidebar collapsed/expanded states
- Tab navigation bar
- Stage health indicators
- Request card design
- Dropped requests summary
- Toast notifications
- Color scheme consistency
- Dark theme verification
- Glassmorphism effects
- Responsive layouts at multiple widths

### 6. Performance Benchmarks (`performance-benchmarks.e2e.ts`)
- Initial dashboard render time
- Handling 1000+ concurrent requests
- Tab switching performance
- Pipeline visualization render performance
- Memory usage under heavy load
- WebSocket message processing rate
- Chart rendering performance
- Scroll performance with large lists
- Extension list loading time
- Animation frame rate measurement

## Running Tests

### Run all E2E tests
```bash
npm run test:e2e
```

### Run tests in UI mode (interactive)
```bash
npm run test:e2e:ui
```

### Run tests in headed mode (see browser)
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

### Run tests matching pattern
```bash
npx playwright test --grep "pipeline"
```

## Test Structure

```
desktop/e2e/
├── fixtures/
│   └── electron.ts           # Electron app test fixtures
├── helpers/
│   ├── websocket-mock.ts     # WebSocket mocking utilities
│   └── screenshot-helpers.ts # Visual regression helpers
├── utils/
│   ├── test-data-generator.ts    # Test data factories
│   └── performance-helpers.ts    # Performance measurement utils
├── websocket-telemetry.e2e.ts
├── pipeline-visualization.e2e.ts
├── extension-manager.e2e.ts
├── manual-override.e2e.ts
├── visual-regression.e2e.ts
├── performance-benchmarks.e2e.ts
└── README.md
```

## Requirements

- Node.js 18+
- Electron app must be built (`npm run build`)
- Vite dev server running on port 5173

## Configuration

See `playwright.config.ts` for:
- Test directory and pattern matching
- Timeout settings
- Reporter configuration
- Screenshot and video recording options
- Parallel execution settings

## Visual Regression Testing

Screenshots are stored in:
- Baseline: `e2e/screenshots/baseline/`
- Comparison: Generated during test runs
- Diffs: Saved when tests fail

To update baselines:
```bash
npx playwright test --update-snapshots
```

## Performance Benchmarks

Performance metrics are logged to console during test runs:
- Render times (ms)
- Memory usage (MB)
- FPS (frames per second)
- Request processing rates

Thresholds:
- Dashboard render: < 5s (DOM load), < 10s (full load)
- 1000 requests processing: < 60s
- Tab switching: < 1s average
- Memory increase under load: < 200MB

## CI/CD Integration

Tests run in headless mode by default. Configure CI environment:
```bash
export CI=true
npx playwright test
```

Reports are generated in `playwright-report/` directory.

## Debugging Tips

1. Use `--headed` flag to see browser window
2. Use `--debug` flag for step-by-step debugging
3. Add `await page.pause()` in tests for interactive debugging
4. Check `test-results/` for failure screenshots and videos
5. Use Playwright Inspector: `PWDEBUG=1 npm run test:e2e`

## Contributing

When adding new tests:
1. Follow existing patterns in test files
2. Use helper utilities for common operations
3. Add meaningful test descriptions
4. Include timeout adjustments for slow operations
5. Update this README with new test coverage
