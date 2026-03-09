# E2E Tests Quick Reference

## Test Commands

| Command | Description |
|---------|-------------|
| `npm run test:e2e` | Run all E2E tests |
| `npm run test:e2e:ui` | Run with Playwright UI |
| `npm run test:e2e:headed` | Run in headed mode |
| `npm run test:e2e:debug` | Debug tests |
| `npx playwright test <file>` | Run specific test file |
| `npx playwright test --grep "<pattern>"` | Run tests matching pattern |
| `npx playwright show-report` | View HTML report |
| `npx playwright test --update-snapshots` | Update visual baselines |

## Test Files

| File | Tests |
|------|-------|
| `websocket-telemetry.e2e.ts` | WebSocket connection, reconnection, span events, metrics |
| `pipeline-visualization.e2e.ts` | 4-stage pipeline, animations, health indicators, metrics |
| `extension-manager.e2e.ts` | Enable/disable extensions, metadata editing, restarts |
| `manual-override.e2e.ts` | Override dialog, justification validation, audit logs |
| `visual-regression.e2e.ts` | Screenshot comparisons, UI consistency, dark theme |
| `performance-benchmarks.e2e.ts` | Render times, 1000+ requests, memory usage, FPS |
| `integration-full-workflow.e2e.ts` | End-to-end user journeys, stress tests |

## Helper Utilities

### WebSocket Mock
```typescript
import { createMockWebSocketServer } from './helpers/websocket-mock';

const wsServer = await createMockWebSocketServer(page);
await wsServer.sendSpanEvent({ ... });
await wsServer.sendMetricUpdate({ ... });
```

### Test Data Generation
```typescript
import { generateSpanEvent, generateRequestFlow, generateRejectedRequest } from './utils/test-data-generator';

const span = generateSpanEvent({ attributes: { stage: 'auth' } });
const flows = generateRequestFlow('req-123');
const rejected = generateRejectedRequest('audit');
```

### Performance Measurement
```typescript
import { profileOperation, measureFPS, getMemoryUsage } from './utils/performance-helpers';

const profile = await profileOperation(page, 'Operation Name', async () => {
  // operation code
});

const fps = await measureFPS(page, 1000);
const memory = await getMemoryUsage(page);
```

### Visual Regression
```typescript
import { compareScreenshot, maskDynamicElements } from './helpers/screenshot-helpers';

await maskDynamicElements(page);
await compareScreenshot(page, 'view-name', {
  maxDiffPixels: 200,
  threshold: 0.2
});
```

## Common Test Patterns

### Navigate to Pipeline Tab
```typescript
await page.goto('#/console');
await page.getByText('Pipeline I/O').click();
await page.waitForTimeout(500);
```

### Send Request Flow
```typescript
const flows = generateRequestFlow();
for (const span of flows) {
  await wsServer.sendSpanEvent(span);
  await page.waitForTimeout(100);
}
```

### Check for Element Visibility
```typescript
const element = page.locator('text=Element Text');
await expect(element).toBeVisible({ timeout: 5000 });
```

### Wait for Animations
```typescript
await page.waitForTimeout(1000); // Wait for animations to complete
```

### Handle Optional Elements
```typescript
const button = page.locator('button:has-text("Click Me")');
if (await button.isVisible()) {
  await button.click();
} else {
  test.skip();
}
```

## Debugging Tips

1. **Add breakpoint**: `await page.pause()`
2. **Slow down tests**: `await page.waitForTimeout(1000)`
3. **Take screenshot**: `await page.screenshot({ path: 'debug.png' })`
4. **Log element**: `console.log(await element.textContent())`
5. **Inspect page**: Use DevTools in headed mode

## Performance Thresholds

| Metric | Threshold |
|--------|-----------|
| Dashboard load (DOM) | < 5s |
| Dashboard load (full) | < 10s |
| Tab switching | < 1s avg |
| 1000 requests processing | < 60s |
| Memory increase under load | < 200MB |
| Visualization render | < 200ms |
| WebSocket message rate | > 50 msg/s |

## Visual Regression Tolerances

| View | maxDiffPixels | threshold |
|------|---------------|-----------|
| Dashboard home | 200 | 0.2 |
| Pipeline visualization | 300 | 0.25 |
| Extension manager | 200 | 0.2 |
| Request cards | 100 | 0.2 |
| Toast notifications | 50 | 0.15 |

## Test Data Generators

```typescript
// Generate single span event
generateSpanEvent(overrides?)

// Generate request flow (all stages)
generateRequestFlow(requestId?)

// Generate rejected request
generateRejectedRequest(dropLayer: 'auth' | 'audit')

// Generate batch of spans
generateBatchSpans(count, options?)

// Generate metric update
generateMetricUpdate(extensionId?)

// Generate gateway state
generateGatewayState()
```

## CI/CD

Tests run automatically on:
- Push to main/develop
- Pull requests to main/develop
- Changes in desktop/ directory

Artifacts uploaded:
- `playwright-report-{os}` (HTML report)
- `test-screenshots-{os}` (failure screenshots)
- `performance-benchmarks-{os}` (results JSON)

## Troubleshooting

| Issue | Solution |
|-------|----------|
| App won't launch | Run `npm run build` |
| WebSocket errors | Tests use mocks, check mock init |
| Visual diffs | Update with `--update-snapshots` |
| Timeouts | Increase in `playwright.config.ts` |
| Memory issues | Reduce iteration counts |
| Flaky tests | Add more waits, check timing |

## Test Coverage Summary

- **WebSocket**: 10 tests covering connection lifecycle and data flow
- **Pipeline**: 10 tests covering visualization and animations
- **Extension Manager**: 10 tests covering CRUD operations
- **Manual Override**: 10 tests covering dialog workflow
- **Visual Regression**: 15 tests covering UI consistency
- **Performance**: 10 tests covering metrics and benchmarks
- **Integration**: 10 tests covering full workflows

**Total: 75+ comprehensive E2E tests**
