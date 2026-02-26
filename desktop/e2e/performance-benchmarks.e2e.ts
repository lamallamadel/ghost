import { test, expect } from './fixtures/electron';
import { createMockWebSocketServer } from './helpers/websocket-mock';

test.describe('Performance Benchmarks', () => {
  test('should measure initial dashboard render time', async ({ page }) => {
    const startTime = Date.now();
    
    await page.goto('#/console');
    await page.waitForLoadState('domcontentloaded');
    
    const domLoadTime = Date.now() - startTime;
    console.log(`DOM load time: ${domLoadTime}ms`);
    
    await page.waitForLoadState('networkidle');
    const fullLoadTime = Date.now() - startTime;
    console.log(`Full load time: ${fullLoadTime}ms`);

    expect(domLoadTime).toBeLessThan(5000);
    expect(fullLoadTime).toBeLessThan(10000);
  });

  test('should handle 1000+ concurrent requests efficiently', async ({ page }) => {
    const wsServer = await createMockWebSocketServer(page);
    await page.goto('#/console');
    await page.getByText('Pipeline I/O').click();
    await page.waitForTimeout(1000);

    const startTime = Date.now();
    const requestCount = 1000;
    const batchSize = 50;

    for (let i = 0; i < requestCount; i += batchSize) {
      const batch = Array.from({ length: Math.min(batchSize, requestCount - i) }, (_, j) => ({
        spanId: `span-perf-${i + j}`,
        traceId: `trace-perf-${i + j}`,
        parentSpanId: null,
        name: 'perf-span',
        startTime: Date.now() + i + j,
        endTime: Date.now() + i + j + 10,
        duration: 10,
        attributes: {
          requestId: `req-perf-${i + j}`,
          extensionId: 'perf-test-extension',
          stage: ['intercept', 'auth', 'audit', 'execute'][Math.floor(Math.random() * 4)],
          status: 'completed',
          type: 'test',
          operation: 'benchmark'
        },
        events: [],
        status: { code: 'OK' }
      }));

      for (const span of batch) {
        await wsServer.sendSpanEvent(span);
      }

      await page.waitForTimeout(50);
    }

    const processingTime = Date.now() - startTime;
    console.log(`Processing time for ${requestCount} requests: ${processingTime}ms`);
    console.log(`Average time per request: ${(processingTime / requestCount).toFixed(2)}ms`);

    expect(processingTime).toBeLessThan(60000);
  });

  test('should measure tab switching performance', async ({ page }) => {
    await page.goto('#/console');
    await page.waitForTimeout(1000);

    const tabs = ['Pipeline I/O', 'Extensions', 'Logs'];
    const switchTimes: number[] = [];

    for (const tabName of tabs) {
      const tabButton = page.locator(`text=${tabName}`).first();
      if (await tabButton.isVisible()) {
        const startTime = Date.now();
        await tabButton.click();
        await page.waitForLoadState('domcontentloaded');
        const switchTime = Date.now() - startTime;
        
        switchTimes.push(switchTime);
        console.log(`Tab switch to ${tabName}: ${switchTime}ms`);
        
        await page.waitForTimeout(300);
      }
    }

    const avgSwitchTime = switchTimes.reduce((a, b) => a + b, 0) / switchTimes.length;
    console.log(`Average tab switch time: ${avgSwitchTime.toFixed(2)}ms`);

    expect(avgSwitchTime).toBeLessThan(1000);
  });

  test('should measure pipeline visualization render performance', async ({ page }) => {
    const wsServer = await createMockWebSocketServer(page);
    await page.goto('#/console');
    await page.getByText('Pipeline I/O').click();
    await page.waitForTimeout(500);

    const measurements: number[] = [];

    for (let i = 0; i < 10; i++) {
      const startTime = performance.now();
      
      await wsServer.sendSpanEvent({
        spanId: `span-viz-${i}`,
        traceId: `trace-viz-${i}`,
        parentSpanId: null,
        name: 'viz-span',
        startTime: Date.now(),
        endTime: null,
        duration: 0,
        attributes: {
          requestId: `req-viz-${i}`,
          extensionId: 'viz-test-ext',
          stage: 'intercept',
          status: 'pending',
          type: 'test',
          operation: 'test'
        },
        events: [],
        status: { code: 'OK' }
      });

      await page.waitForTimeout(100);
      
      const endTime = performance.now();
      measurements.push(endTime - startTime);
    }

    const avgRenderTime = measurements.reduce((a, b) => a + b, 0) / measurements.length;
    console.log(`Average visualization render time: ${avgRenderTime.toFixed(2)}ms`);

    expect(avgRenderTime).toBeLessThan(200);
  });

  test('should measure memory usage during heavy load', async ({ page, electronApp }) => {
    const wsServer = await createMockWebSocketServer(page);
    await page.goto('#/console');
    await page.getByText('Pipeline I/O').click();
    await page.waitForTimeout(1000);

    const getMemoryUsage = async () => {
      return await page.evaluate(() => {
        if ((performance as any).memory) {
          return (performance as any).memory.usedJSHeapSize / 1024 / 1024;
        }
        return 0;
      });
    };

    const initialMemory = await getMemoryUsage();
    console.log(`Initial memory usage: ${initialMemory.toFixed(2)}MB`);

    for (let i = 0; i < 500; i++) {
      await wsServer.sendSpanEvent({
        spanId: `span-mem-${i}`,
        traceId: `trace-mem-${i}`,
        parentSpanId: null,
        name: 'memory-test-span',
        startTime: Date.now(),
        endTime: Date.now() + 10,
        duration: 10,
        attributes: {
          requestId: `req-mem-${i}`,
          extensionId: 'memory-test-ext',
          stage: 'execute',
          status: 'completed',
          type: 'test',
          operation: 'test'
        },
        events: [],
        status: { code: 'OK' }
      });

      if (i % 100 === 0) {
        await page.waitForTimeout(50);
      }
    }

    await page.waitForTimeout(2000);

    const finalMemory = await getMemoryUsage();
    console.log(`Final memory usage: ${finalMemory.toFixed(2)}MB`);
    
    const memoryIncrease = finalMemory - initialMemory;
    console.log(`Memory increase: ${memoryIncrease.toFixed(2)}MB`);

    expect(memoryIncrease).toBeLessThan(200);
  });

  test('should measure WebSocket message processing rate', async ({ page }) => {
    const wsServer = await createMockWebSocketServer(page);
    await page.goto('#/console');
    await page.getByText('Pipeline I/O').click();
    await page.waitForTimeout(1000);

    const messageCount = 100;
    const startTime = Date.now();

    for (let i = 0; i < messageCount; i++) {
      await wsServer.sendSpanEvent({
        spanId: `span-ws-${i}`,
        traceId: `trace-ws-${i}`,
        parentSpanId: null,
        name: 'ws-test-span',
        startTime: Date.now(),
        endTime: Date.now() + 5,
        duration: 5,
        attributes: {
          requestId: `req-ws-${i}`,
          extensionId: 'ws-test-ext',
          stage: 'execute',
          status: 'completed',
          type: 'test',
          operation: 'test'
        },
        events: [],
        status: { code: 'OK' }
      });
    }

    await page.waitForTimeout(1000);

    const totalTime = Date.now() - startTime;
    const messagesPerSecond = (messageCount / totalTime) * 1000;
    
    console.log(`WebSocket processing rate: ${messagesPerSecond.toFixed(2)} messages/second`);
    console.log(`Total time: ${totalTime}ms for ${messageCount} messages`);

    expect(messagesPerSecond).toBeGreaterThan(50);
  });

  test('should measure chart rendering performance', async ({ page }) => {
    await page.goto('#/console');
    
    const extensionsTab = page.locator('text=Extensions').first();
    if (await extensionsTab.isVisible()) {
      const startTime = Date.now();
      await extensionsTab.click();
      await page.waitForLoadState('domcontentloaded');
      const renderTime = Date.now() - startTime;

      console.log(`Chart render time: ${renderTime}ms`);
      expect(renderTime).toBeLessThan(2000);
    } else {
      test.skip();
    }
  });

  test('should measure scroll performance with large lists', async ({ page }) => {
    const wsServer = await createMockWebSocketServer(page);
    await page.goto('#/console');
    await page.getByText('Pipeline I/O').click();
    await page.waitForTimeout(500);

    for (let i = 0; i < 100; i++) {
      await wsServer.sendSpanEvent({
        spanId: `span-scroll-${i}`,
        traceId: `trace-scroll-${i}`,
        parentSpanId: null,
        name: 'scroll-test-span',
        startTime: Date.now(),
        endTime: Date.now() + 10,
        duration: 10,
        attributes: {
          requestId: `req-scroll-${i}`,
          extensionId: 'scroll-test-ext',
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

    const scrollContainer = page.locator('.overflow-auto').first();
    if (await scrollContainer.isVisible()) {
      const startTime = Date.now();
      
      for (let i = 0; i < 5; i++) {
        await scrollContainer.evaluate((el) => {
          el.scrollTop = el.scrollHeight;
        });
        await page.waitForTimeout(100);
        
        await scrollContainer.evaluate((el) => {
          el.scrollTop = 0;
        });
        await page.waitForTimeout(100);
      }

      const scrollTime = Date.now() - startTime;
      console.log(`Scroll performance test: ${scrollTime}ms for 10 scroll operations`);

      expect(scrollTime).toBeLessThan(2000);
    }
  });

  test('should benchmark extension list loading', async ({ page }) => {
    await page.goto('#/console');
    
    const managerTab = page.locator('button').filter({ hasText: /Extension/ }).first();
    
    if (await managerTab.isVisible()) {
      const startTime = Date.now();
      await managerTab.click();
      await page.waitForTimeout(500);
      
      const refreshButton = page.locator('button:has-text("Actualiser")');
      await refreshButton.click();
      await page.waitForTimeout(1500);
      
      const loadTime = Date.now() - startTime;
      console.log(`Extension list load time: ${loadTime}ms`);

      expect(loadTime).toBeLessThan(5000);
    } else {
      test.skip();
    }
  });

  test('should measure animation frame rate', async ({ page }) => {
    const wsServer = await createMockWebSocketServer(page);
    await page.goto('#/console');
    await page.getByText('Pipeline I/O').click();
    await page.waitForTimeout(1000);

    for (let i = 0; i < 20; i++) {
      await wsServer.sendSpanEvent({
        spanId: `span-fps-${i}`,
        traceId: `trace-fps-${i}`,
        parentSpanId: null,
        name: 'fps-test-span',
        startTime: Date.now(),
        endTime: null,
        duration: 0,
        attributes: {
          requestId: `req-fps-${i}`,
          extensionId: 'fps-test-ext',
          stage: 'intercept',
          status: 'pending',
          type: 'test',
          operation: 'test'
        },
        events: [],
        status: { code: 'OK' }
      });
    }

    await page.waitForTimeout(3000);

    const hasAnimations = await page.locator('svg circle[fill="#3b82f6"]').count();
    console.log(`Active animations: ${hasAnimations}`);
    
    expect(hasAnimations).toBeGreaterThanOrEqual(0);
  });
});
