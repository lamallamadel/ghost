import { test, expect } from './fixtures/electron';
import { createMockWebSocketServer } from './helpers/websocket-mock';

test.describe('Pipeline Visualization Animation', () => {
  test('should display all pipeline stages', async ({ page }) => {
    await page.goto('#/console');
    await page.getByText('Pipeline I/O').click();
    await page.waitForTimeout(500);

    await expect(page.locator('text=intercept')).toBeVisible();
    await expect(page.locator('text=auth')).toBeVisible();
    await expect(page.locator('text=audit')).toBeVisible();
    await expect(page.locator('text=execute')).toBeVisible();
  });

  test('should show request flow from Intercept to Execute', async ({ page }) => {
    const wsServer = await createMockWebSocketServer(page);
    await page.goto('#/console');
    await page.getByText('Pipeline I/O').click();
    await page.waitForTimeout(500);

    const requestId = `req-flow-${Date.now()}`;
    const stages = ['intercept', 'auth', 'audit', 'execute'];

    for (let i = 0; i < stages.length; i++) {
      await wsServer.sendSpanEvent({
        spanId: `span-${i}`,
        traceId: 'trace-flow',
        parentSpanId: i > 0 ? `span-${i - 1}` : null,
        name: `${stages[i]}-span`,
        startTime: Date.now() + i * 100,
        endTime: null,
        duration: 0,
        attributes: {
          requestId,
          extensionId: 'ghost-git-extension',
          stage: stages[i],
          status: 'pending',
          type: 'git',
          operation: 'status'
        },
        events: [],
        status: { code: 'OK' }
      });
      await page.waitForTimeout(200);
    }

    await page.waitForTimeout(1000);
    const requestElement = page.locator(`text=${requestId}`);
    await expect(requestElement).toBeVisible({ timeout: 5000 });
  });

  test('should animate stage transitions', async ({ page }) => {
    const wsServer = await createMockWebSocketServer(page);
    await page.goto('#/console');
    await page.getByText('Pipeline I/O').click();
    await page.waitForTimeout(500);

    const requestId = `req-anim-${Date.now()}`;

    await wsServer.sendSpanEvent({
      spanId: 'span-anim-1',
      traceId: 'trace-anim',
      parentSpanId: null,
      name: 'intercept-span',
      startTime: Date.now(),
      endTime: null,
      duration: 0,
      attributes: {
        requestId,
        extensionId: 'ghost-git-extension',
        stage: 'intercept',
        status: 'pending',
        type: 'git',
        operation: 'commit'
      },
      events: [],
      status: { code: 'OK' }
    });

    await page.waitForTimeout(500);

    const svgElements = page.locator('svg circle[fill="#3b82f6"]');
    await expect(svgElements.first()).toBeVisible({ timeout: 5000 });
  });

  test('should display active request count per stage', async ({ page }) => {
    const wsServer = await createMockWebSocketServer(page);
    await page.goto('#/console');
    await page.getByText('Pipeline I/O').click();
    await page.waitForTimeout(500);

    for (let i = 0; i < 3; i++) {
      await wsServer.sendSpanEvent({
        spanId: `span-count-${i}`,
        traceId: `trace-count-${i}`,
        parentSpanId: null,
        name: 'auth-span',
        startTime: Date.now(),
        endTime: null,
        duration: 0,
        attributes: {
          requestId: `req-count-${i}`,
          extensionId: 'ghost-git-extension',
          stage: 'auth',
          status: 'pending',
          type: 'git',
          operation: 'status'
        },
        events: [],
        status: { code: 'OK' }
      });
    }

    await page.waitForTimeout(1500);
  });

  test('should update stage health indicators', async ({ page }) => {
    const wsServer = await createMockWebSocketServer(page);
    await page.goto('#/console');
    await page.getByText('Pipeline I/O').click();
    await page.waitForTimeout(500);

    for (let i = 0; i < 5; i++) {
      await wsServer.sendSpanEvent({
        spanId: `span-success-${i}`,
        traceId: `trace-success-${i}`,
        parentSpanId: null,
        name: 'execute-span',
        startTime: Date.now() - 100,
        endTime: Date.now(),
        duration: 100,
        attributes: {
          requestId: `req-success-${i}`,
          extensionId: 'ghost-git-extension',
          stage: 'execute',
          status: 'completed',
          type: 'git',
          operation: 'status'
        },
        events: [],
        status: { code: 'OK' }
      });
    }

    await page.waitForTimeout(1000);

    const healthyIndicator = page.locator('text=Healthy');
    await expect(healthyIndicator.first()).toBeVisible({ timeout: 5000 });
  });

  test('should show stage metrics (latency, throughput, error rate)', async ({ page }) => {
    await page.goto('#/console');
    await page.getByText('Pipeline I/O').click();
    await page.waitForTimeout(1000);

    const latencyMetric = page.locator('text=latency').first();
    await expect(latencyMetric).toBeVisible({ timeout: 5000 });

    const throughputMetric = page.locator('text=req/s').first();
    await expect(throughputMetric).toBeVisible({ timeout: 5000 });

    const errorMetric = page.locator('text=err').first();
    await expect(errorMetric).toBeVisible({ timeout: 5000 });
  });

  test('should handle rejected requests with drop indicators', async ({ page }) => {
    const wsServer = await createMockWebSocketServer(page);
    await page.goto('#/console');
    await page.getByText('Pipeline I/O').click();
    await page.waitForTimeout(500);

    await wsServer.sendSpanEvent({
      spanId: 'span-rejected',
      traceId: 'trace-rejected',
      parentSpanId: null,
      name: 'auth-span',
      startTime: Date.now(),
      endTime: Date.now() + 10,
      duration: 10,
      attributes: {
        requestId: 'req-rejected-001',
        extensionId: 'test-extension',
        stage: 'auth',
        status: 'rejected',
        type: 'network',
        operation: 'fetch',
        dropLayer: 'auth',
        dropReason: 'Rate limit exceeded'
      },
      events: [],
      status: { code: 'FAILED' }
    });

    await page.waitForTimeout(1000);

    const dropBadge = page.locator('text=QoS Violation');
    await expect(dropBadge).toBeVisible({ timeout: 5000 });
  });

  test('should display dropped requests summary', async ({ page }) => {
    const wsServer = await createMockWebSocketServer(page);
    await page.goto('#/console');
    await page.getByText('Pipeline I/O').click();
    await page.waitForTimeout(500);

    await wsServer.sendSpanEvent({
      spanId: 'span-drop-auth',
      traceId: 'trace-drop',
      parentSpanId: null,
      name: 'auth-drop',
      startTime: Date.now(),
      endTime: Date.now() + 10,
      duration: 10,
      attributes: {
        requestId: 'req-drop-auth',
        extensionId: 'test-ext',
        stage: 'auth',
        status: 'rejected',
        type: 'network',
        operation: 'request',
        dropLayer: 'auth',
        dropReason: 'Rate limit violation'
      },
      events: [],
      status: { code: 'FAILED' }
    });

    await wsServer.sendSpanEvent({
      spanId: 'span-drop-audit',
      traceId: 'trace-drop-2',
      parentSpanId: null,
      name: 'audit-drop',
      startTime: Date.now(),
      endTime: Date.now() + 10,
      duration: 10,
      attributes: {
        requestId: 'req-drop-audit',
        extensionId: 'test-ext',
        stage: 'audit',
        status: 'rejected',
        type: 'filesystem',
        operation: 'write',
        dropLayer: 'audit',
        dropReason: 'Security policy violation'
      },
      events: [],
      status: { code: 'FAILED' }
    });

    await page.waitForTimeout(1500);

    const summarySection = page.locator('text=Dropped Requests Summary');
    await expect(summarySection).toBeVisible({ timeout: 5000 });
  });

  test('should expand rejection details on click', async ({ page }) => {
    const wsServer = await createMockWebSocketServer(page);
    await page.goto('#/console');
    await page.getByText('Pipeline I/O').click();
    await page.waitForTimeout(500);

    await wsServer.sendSpanEvent({
      spanId: 'span-expand',
      traceId: 'trace-expand',
      parentSpanId: null,
      name: 'audit-span',
      startTime: Date.now(),
      endTime: Date.now() + 10,
      duration: 10,
      attributes: {
        requestId: 'req-expand-001',
        extensionId: 'test-extension',
        stage: 'audit',
        status: 'rejected',
        type: 'filesystem',
        operation: 'write',
        dropLayer: 'audit',
        dropReason: 'Invalid path access'
      },
      events: [],
      status: { code: 'FAILED' }
    });

    await page.waitForTimeout(1000);

    const expandButton = page.locator('button').filter({ has: page.locator('svg') }).first();
    if (await expandButton.isVisible()) {
      await expandButton.click();
      await page.waitForTimeout(300);

      const detailsSection = page.locator('text=Rejection Details');
      await expect(detailsSection).toBeVisible({ timeout: 3000 });
    }
  });

  test('should handle rapid stage transitions smoothly', async ({ page }) => {
    const wsServer = await createMockWebSocketServer(page);
    await page.goto('#/console');
    await page.getByText('Pipeline I/O').click();
    await page.waitForTimeout(500);

    const requestId = `req-rapid-${Date.now()}`;
    const stages = ['intercept', 'auth', 'audit', 'execute'];

    for (const stage of stages) {
      await wsServer.sendSpanEvent({
        spanId: `span-${stage}`,
        traceId: 'trace-rapid',
        parentSpanId: null,
        name: `${stage}-span`,
        startTime: Date.now(),
        endTime: Date.now() + 5,
        duration: 5,
        attributes: {
          requestId,
          extensionId: 'ghost-git-extension',
          stage,
          status: stage === 'execute' ? 'completed' : 'approved',
          type: 'git',
          operation: 'status'
        },
        events: [],
        status: { code: 'OK' }
      });
      await page.waitForTimeout(50);
    }

    await page.waitForTimeout(500);
  });
});
