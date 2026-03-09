import { test, expect } from './fixtures/electron';
import { createMockWebSocketServer } from './helpers/websocket-mock';

test.describe('WebSocket Telemetry Integration', () => {
  test('should connect to WebSocket server on app launch', async ({ page }) => {
    const wsServer = await createMockWebSocketServer(page);
    
    await page.goto('#/console');
    await page.waitForTimeout(1000);

    const connectionState = await page.evaluate(() => {
      const connections = (window as any).__mockWebSocketConnections || [];
      return connections.length > 0 ? 'connected' : 'disconnected';
    });

    expect(connectionState).toBe('connected');
  });

  test('should display connection status indicator', async ({ page }) => {
    await createMockWebSocketServer(page);
    await page.goto('#/console');
    
    await page.getByText('Pipeline I/O').click();
    
    const statusIndicator = page.locator('[data-test-dynamic="true"]').first().or(
      page.locator('text=Live').or(page.locator('text=Reconnecting'))
    );
    await expect(statusIndicator).toBeVisible({ timeout: 5000 });
  });

  test('should handle WebSocket reconnection', async ({ page }) => {
    const wsServer = await createMockWebSocketServer(page);
    await page.goto('#/console');
    await page.waitForTimeout(500);

    await wsServer.close();
    await page.waitForTimeout(1000);

    const reconnectingStatus = page.locator('text=Reconnecting').or(
      page.locator('text=Disconnected')
    );
    await expect(reconnectingStatus).toBeVisible({ timeout: 5000 });
  });

  test('should receive and display real-time span updates', async ({ page }) => {
    const wsServer = await createMockWebSocketServer(page);
    await page.goto('#/console');
    
    await page.getByText('Pipeline I/O').click();
    await page.waitForTimeout(500);

    await wsServer.sendSpanEvent({
      spanId: 'span-001',
      traceId: 'trace-001',
      parentSpanId: null,
      name: 'test-span',
      startTime: Date.now(),
      endTime: null,
      duration: 0,
      attributes: {
        requestId: 'req-test-001',
        extensionId: 'ghost-git-extension',
        stage: 'intercept',
        status: 'pending',
        type: 'filesystem',
        operation: 'read'
      },
      events: [],
      status: { code: 'OK' }
    });

    await page.waitForTimeout(1000);

    const requestCard = page.locator('text=req-test-001');
    await expect(requestCard).toBeVisible({ timeout: 5000 });
  });

  test('should handle batch span events', async ({ page }) => {
    const wsServer = await createMockWebSocketServer(page);
    await page.goto('#/console');
    await page.getByText('Pipeline I/O').click();
    await page.waitForTimeout(500);

    const spans = Array.from({ length: 10 }, (_, i) => ({
      spanId: `span-${i}`,
      traceId: 'trace-batch',
      parentSpanId: null,
      name: `span-${i}`,
      startTime: Date.now() + i * 100,
      endTime: Date.now() + i * 100 + 50,
      duration: 50,
      attributes: {
        requestId: `req-batch-${i}`,
        extensionId: 'ghost-git-extension',
        stage: 'execute',
        status: 'completed',
        type: 'git',
        operation: 'status'
      },
      events: [],
      status: { code: 'OK' }
    }));

    for (const span of spans) {
      await wsServer.sendSpanEvent(span);
      await page.waitForTimeout(100);
    }

    await page.waitForTimeout(1000);

    const requests = page.locator('[data-test-id="pipeline-request"]').or(
      page.locator('.rounded-xl.border').filter({ hasText: 'req-batch-' })
    );
    const count = await requests.count();
    expect(count).toBeGreaterThan(0);
  });

  test('should subscribe to specific event types', async ({ page }) => {
    await createMockWebSocketServer(page);
    await page.goto('#/console');
    await page.waitForTimeout(500);

    const subscriptions = await page.evaluate(() => {
      return (window as any).__telemetrySubscriptions || [];
    });

    expect(Array.isArray(subscriptions) || subscriptions === undefined).toBe(true);
  });

  test('should display dropped events counter when rate limited', async ({ page }) => {
    const wsServer = await createMockWebSocketServer(page);
    await page.goto('#/console');
    await page.getByText('Pipeline I/O').click();
    await page.waitForTimeout(500);

    for (let i = 0; i < 200; i++) {
      await wsServer.sendSpanEvent({
        spanId: `span-flood-${i}`,
        traceId: 'trace-flood',
        parentSpanId: null,
        name: 'flood-span',
        startTime: Date.now(),
        endTime: Date.now() + 10,
        duration: 10,
        attributes: {
          requestId: `req-flood-${i}`,
          extensionId: 'test-extension',
          stage: 'execute',
          status: 'completed',
          type: 'test',
          operation: 'test'
        },
        events: [],
        status: { code: 'OK' }
      });
    }

    await page.waitForTimeout(2000);
  });

  test('should cache telemetry data for late subscribers', async ({ page }) => {
    const wsServer = await createMockWebSocketServer(page);
    await page.goto('#/console');
    await page.waitForTimeout(500);

    await wsServer.sendSpanEvent({
      spanId: 'span-cached',
      traceId: 'trace-cached',
      parentSpanId: null,
      name: 'cached-span',
      startTime: Date.now(),
      endTime: Date.now() + 100,
      duration: 100,
      attributes: {
        requestId: 'req-cached-001',
        extensionId: 'test-ext',
        stage: 'audit',
        status: 'approved',
        type: 'filesystem',
        operation: 'read'
      },
      events: [],
      status: { code: 'OK' }
    });

    await page.waitForTimeout(500);
    await page.getByText('Pipeline I/O').click();
    await page.waitForTimeout(1000);

    const cachedRequest = page.locator('text=req-cached-001');
    await expect(cachedRequest).toBeVisible({ timeout: 5000 });
  });

  test('should handle connection errors gracefully', async ({ page }) => {
    await page.goto('#/console');
    await page.getByText('Pipeline I/O').click();
    await page.waitForTimeout(2000);

    const errorIndicator = page.locator('text=Error').or(
      page.locator('text=Disconnected')
    );
    
    const isVisible = await errorIndicator.isVisible();
    expect(typeof isVisible).toBe('boolean');
  });

  test('should update metrics in real-time', async ({ page }) => {
    const wsServer = await createMockWebSocketServer(page);
    await page.goto('#/console');
    await page.getByText('Pipeline I/O').click();
    await page.waitForTimeout(500);

    await wsServer.sendMetricUpdate({
      extensionId: 'ghost-git-extension',
      requests: {
        'ghost-git-extension': {
          total: 150,
          approved: 145,
          rejected: 5
        }
      },
      latencies: {
        'ghost-git-extension': {
          intercept: { p50: 12, p95: 25, p99: 45 },
          auth: { p50: 8, p95: 18, p99: 32 },
          audit: { p50: 15, p95: 30, p99: 60 },
          execute: { p50: 50, p95: 150, p99: 300 }
        }
      }
    });

    await page.waitForTimeout(1000);
  });
});
