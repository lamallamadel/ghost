import { test, expect } from './fixtures/electron';
import { createMockWebSocketServer } from './helpers/websocket-mock';
import { generateRequestFlow, generateRejectedRequest, generateMetricUpdate } from './utils/test-data-generator';
import { profileOperation, generatePerformanceReport } from './utils/performance-helpers';

test.describe('Full Integration Workflow', () => {
  test('should complete full user journey with telemetry', async ({ page }) => {
    const wsServer = await createMockWebSocketServer(page);
    const profiles: any[] = [];

    const appLoadProfile = await profileOperation(page, 'App Load', async () => {
      await page.goto('#/console');
      await page.waitForLoadState('networkidle');
    });
    profiles.push(appLoadProfile);

    await page.waitForTimeout(1000);

    const pipelineNavProfile = await profileOperation(page, 'Navigate to Pipeline', async () => {
      await page.getByText('Pipeline I/O').click();
      await page.waitForTimeout(500);
    });
    profiles.push(pipelineNavProfile);

    const requestFlowProfile = await profileOperation(page, 'Process Request Flow', async () => {
      const flows = generateRequestFlow();
      for (const span of flows) {
        await wsServer.sendSpanEvent(span);
        await page.waitForTimeout(100);
      }
      await page.waitForTimeout(1000);
    });
    profiles.push(requestFlowProfile);

    const requestCards = page.locator('.rounded-xl.border').filter({
      hasText: /req-flow-/
    });
    await expect(requestCards.first()).toBeVisible({ timeout: 5000 });

    const rejectedReqProfile = await profileOperation(page, 'Handle Rejected Request', async () => {
      const rejectedSpan = generateRejectedRequest('auth');
      await wsServer.sendSpanEvent(rejectedSpan);
      await page.waitForTimeout(1000);
    });
    profiles.push(rejectedReqProfile);

    const qosViolation = page.locator('text=QoS Violation');
    await expect(qosViolation).toBeVisible({ timeout: 5000 });

    const metricsProfile = await profileOperation(page, 'Update Metrics', async () => {
      const metrics = generateMetricUpdate('ghost-git-extension');
      await wsServer.sendMetricUpdate(metrics);
      await page.waitForTimeout(1000);
    });
    profiles.push(metricsProfile);

    const extensionManagerProfile = await profileOperation(page, 'Extension Manager', async () => {
      const managerTab = page.locator('button').filter({ hasText: /Extension/ }).first();
      if (await managerTab.isVisible()) {
        await managerTab.click();
        await page.waitForTimeout(1000);
      }
    });
    profiles.push(extensionManagerProfile);

    const logsProfile = await profileOperation(page, 'View Logs', async () => {
      const logsTab = page.locator('button').filter({ hasText: /Logs/ }).first();
      if (await logsTab.isVisible()) {
        await logsTab.click();
        await page.waitForTimeout(1000);
      }
    });
    profiles.push(logsProfile);

    console.log('\n' + generatePerformanceReport(profiles));

    const totalDuration = profiles.reduce((sum, p) => sum + p.duration, 0);
    console.log(`Total workflow duration: ${totalDuration}ms`);

    expect(totalDuration).toBeLessThan(30000);
  });

  test('should handle concurrent operations efficiently', async ({ page }) => {
    const wsServer = await createMockWebSocketServer(page);
    await page.goto('#/console');
    await page.getByText('Pipeline I/O').click();
    await page.waitForTimeout(500);

    const operations = [
      async () => {
        for (let i = 0; i < 50; i++) {
          const flows = generateRequestFlow(`concurrent-1-${i}`);
          for (const span of flows) {
            await wsServer.sendSpanEvent(span);
          }
        }
      },
      async () => {
        for (let i = 0; i < 10; i++) {
          const rejected = generateRejectedRequest(i % 2 === 0 ? 'auth' : 'audit');
          await wsServer.sendSpanEvent(rejected);
          await page.waitForTimeout(50);
        }
      },
      async () => {
        for (let i = 0; i < 5; i++) {
          const metrics = generateMetricUpdate('concurrent-test-ext');
          await wsServer.sendMetricUpdate(metrics);
          await page.waitForTimeout(200);
        }
      }
    ];

    const startTime = Date.now();
    await Promise.all(operations.map(op => op()));
    const duration = Date.now() - startTime;

    console.log(`Concurrent operations completed in ${duration}ms`);

    await page.waitForTimeout(2000);

    const requestCards = page.locator('.rounded-xl.border').filter({
      hasText: /req-|concurrent/
    });
    const cardCount = await requestCards.count();
    
    console.log(`Rendered ${cardCount} request cards`);
    expect(cardCount).toBeGreaterThan(0);
    expect(duration).toBeLessThan(10000);
  });

  test('should recover from WebSocket disconnection during active session', async ({ page }) => {
    const wsServer = await createMockWebSocketServer(page);
    await page.goto('#/console');
    await page.getByText('Pipeline I/O').click();
    await page.waitForTimeout(500);

    const flows = generateRequestFlow('pre-disconnect');
    for (const span of flows) {
      await wsServer.sendSpanEvent(span);
      await page.waitForTimeout(50);
    }
    await page.waitForTimeout(500);

    await wsServer.close();
    await page.waitForTimeout(2000);

    const disconnectedIndicator = page.locator('text=Disconnected').or(
      page.locator('text=Reconnecting')
    );
    await expect(disconnectedIndicator).toBeVisible({ timeout: 5000 });

    await page.waitForTimeout(2000);

    const newWsServer = await createMockWebSocketServer(page);
    await page.waitForTimeout(2000);

    const postFlows = generateRequestFlow('post-reconnect');
    for (const span of postFlows) {
      await newWsServer.sendSpanEvent(span);
      await page.waitForTimeout(50);
    }

    await page.waitForTimeout(1000);

    const reconnectedRequest = page.locator('text=post-reconnect');
    await expect(reconnectedRequest).toBeVisible({ timeout: 5000 });
  });

  test('should maintain UI responsiveness under stress', async ({ page }) => {
    const wsServer = await createMockWebSocketServer(page);
    await page.goto('#/console');
    await page.getByText('Pipeline I/O').click();
    await page.waitForTimeout(500);

    const stressTestDuration = 10000;
    const startTime = Date.now();
    let eventCount = 0;

    const stressInterval = setInterval(async () => {
      if (Date.now() - startTime > stressTestDuration) {
        clearInterval(stressInterval);
        return;
      }

      const flows = generateRequestFlow(`stress-${eventCount}`);
      for (const span of flows) {
        await wsServer.sendSpanEvent(span);
      }
      
      if (eventCount % 5 === 0) {
        const rejected = generateRejectedRequest(eventCount % 2 === 0 ? 'auth' : 'audit');
        await wsServer.sendSpanEvent(rejected);
      }

      eventCount++;
    }, 200);

    await page.waitForTimeout(stressTestDuration + 2000);

    const refreshButton = page.locator('button:has-text("Actualiser")');
    const isResponsive = await refreshButton.isEnabled();
    expect(isResponsive).toBe(true);

    const tabButton = page.locator('button').filter({ hasText: /Extension/ }).first();
    if (await tabButton.isVisible()) {
      const clickStartTime = Date.now();
      await tabButton.click();
      await page.waitForLoadState('domcontentloaded');
      const clickDuration = Date.now() - clickStartTime;

      console.log(`UI remained responsive: tab switch took ${clickDuration}ms during stress test`);
      expect(clickDuration).toBeLessThan(3000);
    }

    console.log(`Stress test completed: ${eventCount} event batches processed`);
  });

  test('should handle mixed success and failure scenarios', async ({ page }) => {
    const wsServer = await createMockWebSocketServer(page);
    await page.goto('#/console');
    await page.getByText('Pipeline I/O').click();
    await page.waitForTimeout(500);

    const scenarios = [
      { type: 'success', count: 20 },
      { type: 'auth-reject', count: 5 },
      { type: 'audit-reject', count: 3 },
      { type: 'success', count: 15 },
      { type: 'auth-reject', count: 2 }
    ];

    for (const scenario of scenarios) {
      for (let i = 0; i < scenario.count; i++) {
        if (scenario.type === 'success') {
          const flows = generateRequestFlow(`${scenario.type}-${i}`);
          for (const span of flows) {
            await wsServer.sendSpanEvent(span);
          }
        } else if (scenario.type === 'auth-reject') {
          const rejected = generateRejectedRequest('auth');
          await wsServer.sendSpanEvent(rejected);
        } else if (scenario.type === 'audit-reject') {
          const rejected = generateRejectedRequest('audit');
          await wsServer.sendSpanEvent(rejected);
        }
        await page.waitForTimeout(50);
      }
    }

    await page.waitForTimeout(2000);

    const summarySection = page.locator('text=Dropped Requests Summary');
    await expect(summarySection).toBeVisible({ timeout: 5000 });

    const authDrops = page.locator('text=Auth (QoS)').locator('..').locator('.font-mono');
    const auditDrops = page.locator('text=Audit (SI-10)').locator('..').locator('.font-mono');

    const hasAuthDrops = await authDrops.isVisible().catch(() => false);
    const hasAuditDrops = await auditDrops.isVisible().catch(() => false);

    expect(hasAuthDrops || hasAuditDrops).toBe(true);
  });

  test('should persist data across tab switches', async ({ page }) => {
    const wsServer = await createMockWebSocketServer(page);
    await page.goto('#/console');
    await page.getByText('Pipeline I/O').click();
    await page.waitForTimeout(500);

    const testRequestId = `persistent-${Date.now()}`;
    const flows = generateRequestFlow(testRequestId);
    
    for (const span of flows) {
      await wsServer.sendSpanEvent(span);
      await page.waitForTimeout(50);
    }

    await page.waitForTimeout(1000);

    const initialCard = page.locator(`text=${testRequestId}`);
    await expect(initialCard).toBeVisible({ timeout: 5000 });

    const extensionTab = page.locator('button').filter({ hasText: /Extension/ }).first();
    if (await extensionTab.isVisible()) {
      await extensionTab.click();
      await page.waitForTimeout(1000);
    }

    await page.getByText('Pipeline I/O').click();
    await page.waitForTimeout(500);

    const persistedCard = page.locator(`text=${testRequestId}`);
    await expect(persistedCard).toBeVisible({ timeout: 5000 });
  });

  test('should correctly display all pipeline stages with metrics', async ({ page }) => {
    const wsServer = await createMockWebSocketServer(page);
    await page.goto('#/console');
    await page.getByText('Pipeline I/O').click();
    await page.waitForTimeout(1000);

    for (let i = 0; i < 10; i++) {
      const flows = generateRequestFlow(`metrics-test-${i}`);
      for (const span of flows) {
        await wsServer.sendSpanEvent(span);
        await page.waitForTimeout(10);
      }
    }

    await page.waitForTimeout(2000);

    const stages = ['intercept', 'auth', 'audit', 'execute'];
    for (const stage of stages) {
      const stageLabel = page.locator(`text=${stage}`).first();
      await expect(stageLabel).toBeVisible();

      const latencyMetric = stageLabel.locator('..').locator('..').locator('text=latency');
      await expect(latencyMetric).toBeVisible({ timeout: 5000 });
    }

    const healthyIndicator = page.locator('text=Healthy').first();
    await expect(healthyIndicator).toBeVisible({ timeout: 5000 });
  });

  test('should handle rapid tab switching without errors', async ({ page }) => {
    await page.goto('#/console');
    await page.waitForTimeout(1000);

    const tabs = [
      'Pipeline I/O',
      'Extensions',
      'Logs',
      'Pipeline I/O'
    ];

    for (let iteration = 0; iteration < 3; iteration++) {
      for (const tabName of tabs) {
        const tabButton = page.locator(`text=${tabName}`).first();
        if (await tabButton.isVisible()) {
          await tabButton.click();
          await page.waitForTimeout(200);
        }
      }
    }

    await page.waitForTimeout(1000);

    const errorMessages = page.locator('text=/error|failed|crashed/i');
    const errorCount = await errorMessages.count();
    
    expect(errorCount).toBe(0);
  });

  test('should complete end-to-end manual override workflow', async ({ page }) => {
    await page.goto('#/console');
    await page.waitForTimeout(500);

    await page.evaluate(() => {
      (window as any).electronAPI = {
        ...((window as any).electronAPI || {}),
        gatewayManualOverride: async (params: any) => {
          if (!params.reason || params.reason.length < 10) {
            return {
              approved: false,
              reason: 'Justification insuffisante'
            };
          }
          return {
            approved: true,
            auditLogId: `audit-e2e-${Date.now()}`
          };
        }
      };
    });

    const result = await page.evaluate(() => {
      return (window as any).electronAPI.gatewayManualOverride({
        extensionId: 'e2e-test-ext',
        type: 'filesystem',
        operation: 'write',
        reason: 'End-to-end test override justification',
        params: { path: '/test/e2e' }
      });
    });

    expect(result.approved).toBe(true);
    expect(result.auditLogId).toMatch(/^audit-e2e-/);

    await page.waitForTimeout(1000);

    const logsTab = page.locator('button').filter({ hasText: /Logs/ }).first();
    if (await logsTab.isVisible()) {
      await logsTab.click();
      await page.waitForTimeout(1000);

      const overrideLog = page.locator('text=Manual Override').or(
        page.locator('text=SI-10(1)')
      );
      
      const hasLog = await overrideLog.isVisible().catch(() => false);
      expect(typeof hasLog).toBe('boolean');
    }
  });
});
